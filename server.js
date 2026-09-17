const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3030;
const HOST = '127.0.0.1';
const INDEX = path.join(__dirname, 'index.html');
const MARKER = 'Fusion.globalContent=';
const FETCH_TIMEOUT_MS = 20000;
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function extractJsonObject(s, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (inStr) {
      if (esc) esc = false;
      else if (c === 92) esc = true;
      else if (c === 34) inStr = false;
      continue;
    }
    if (c === 34) inStr = true;
    else if (c === 123) depth++;
    else if (c === 125 && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

function sanitize(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

function names(credits) {
  return ((credits && credits.by) || []).map(b => b.name).filter(Boolean);
}

function normalizeElement(el) {
  switch (el.type) {
    case 'text':
      return { type: 'text', html: sanitize(el.content) };
    case 'header':
      return { type: 'header', level: el.level || 2, html: sanitize(el.content) };
    case 'list':
      return { type: 'list', ordered: el.list_type === 'ordered', items: (el.items || []).map(i => sanitize(i.content)) };
    case 'quote':
      return { type: 'quote', items: (el.content_elements || []).map(i => sanitize(i.content)), citation: el.citation && el.citation.content };
    case 'image':
      return { type: 'image', url: el.url, caption: el.caption || '', credit: names(el.credits).join(', ') };
    case 'interstitial_link':
      return { type: 'text', html: `<a href="${String(el.url || '').replace(/"/g, '&quot;')}">${sanitize(el.content)}</a>` };
    case 'divider':
      return { type: 'divider' };
    default:
      return null;
  }
}

async function fetchArticle(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow', signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
  if (res.status !== 200) throw httpError(502, `Site returned HTTP ${res.status}`);
  const html = await res.text();
  const at = html.indexOf(MARKER);
  if (at < 0) throw httpError(422, 'No Arc XP article data found on this page');
  const raw = extractJsonObject(html, at + MARKER.length);
  if (!raw) throw httpError(422, 'Could not parse the embedded article data');
  const gc = JSON.parse(raw);
  if (!Array.isArray(gc.content_elements)) throw httpError(422, gc.type ? `This is a ${gc.type} page, not an article` : 'This page is not a single article');

  const elements = [];
  let skipped = 0;
  for (const el of gc.content_elements) {
    const n = normalizeElement(el);
    if (n) elements.push(n); else skipped++;
  }
  const origin = new URL(res.url).origin;
  const promo = gc.promo_items && gc.promo_items.basic;
  const section = gc.taxonomy && gc.taxonomy.primary_section && gc.taxonomy.primary_section.name;
  return {
    id: gc._id,
    url: gc.canonical_url ? new URL(gc.canonical_url, origin).href : res.url,
    headline: (gc.headlines && gc.headlines.basic) || '',
    subheadline: (gc.subheadlines && gc.subheadlines.basic) || '',
    byline: names(gc.credits),
    date: gc.display_date || gc.publish_date || null,
    section: section || '',
    image: promo && promo.type === 'image' && promo.url
      ? { url: promo.url, caption: promo.caption || '', credit: names(promo.credits).join(', ') }
      : null,
    elements,
    skipped,
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${HOST}:${PORT}`);

  if (u.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(INDEX).pipe(res);
    return;
  }

  if (u.pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (u.pathname === '/api/article') {
    let target;
    try {
      target = new URL((u.searchParams.get('url') || '').trim());
    } catch {
      return sendJson(res, 400, { error: 'Enter a full article URL starting with https://' });
    }
    if (!/^https?:$/.test(target.protocol)) return sendJson(res, 400, { error: 'URL must start with http:// or https://' });

    const t0 = Date.now();
    try {
      const article = await fetchArticle(target.href);
      console.log(`${new Date().toISOString()} OK  ${Date.now() - t0}ms ${article.elements.length} elements  ${target.href}`);
      sendJson(res, 200, article);
    } catch (err) {
      const timedOut = err.name === 'AbortError';
      const status = err.status || (timedOut ? 504 : 500);
      const message = timedOut
        ? `Timed out after ${FETCH_TIMEOUT_MS / 1000}s fetching the page`
        : err.cause && err.cause.code ? `${err.message} (${err.cause.code})` : err.message;
      console.log(`${new Date().toISOString()} ERR ${status} ${message}  ${target.href}`);
      sendJson(res, status, { error: message });
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}).listen(PORT, HOST, () => {
  console.log(`Crain's Reader listening on http://${HOST}:${PORT}`);
});
