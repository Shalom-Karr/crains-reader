const MARKER = 'Fusion.globalContent=';
const FETCH_TIMEOUT_MS = 20000;
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Public domain → Arc XP site id. Articles are fetched from the site's Arc origin
// (crain-<site>-prod.web.arc-cdn.net), which is not behind Crain's Akamai bot filter.
const SITES = {
  'crainscleveland.com': 'crains-cleveland',
  'crainsdetroit.com': 'crains-detroit',
  'crainsnewyork.com': 'crains-new-york',
  'chicagobusiness.com': 'chicago-business',
  'crainsgrandrapids.com': 'crains-grand-rapids',
  'adage.com': 'adage',
};

export class ArticleError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function parseTarget(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new ArticleError(400, 'Enter a full article URL starting with https://');
  }
  if (!/^https?:$/.test(url.protocol)) throw new ArticleError(400, 'URL must start with http:// or https://');
  const domain = url.hostname.replace(/^www\./, '');
  const site = SITES[domain];
  if (!site) throw new ArticleError(400, `${url.hostname} is not a supported Crain's site`);
  return { url, site, domain };
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

export async function fetchArticle({ url, site, domain }) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`https://crain-${site}-prod.web.arc-cdn.net${url.pathname}`, { headers: FETCH_HEADERS, redirect: 'follow', signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
  if (res.status !== 200) throw new ArticleError(502, `Site returned HTTP ${res.status}`);
  const html = await res.text();
  const at = html.indexOf(MARKER);
  if (at < 0) throw new ArticleError(422, 'No Arc XP article data found on this page');
  const raw = extractJsonObject(html, at + MARKER.length);
  if (!raw) throw new ArticleError(422, 'Could not parse the embedded article data');
  const gc = JSON.parse(raw);
  if (!Array.isArray(gc.content_elements)) {
    throw new ArticleError(422, gc.type ? `This is a ${gc.type} page, not an article` : 'This page is not a single article');
  }

  const elements = [];
  let skipped = 0;
  for (const el of gc.content_elements) {
    const n = normalizeElement(el);
    if (n) elements.push(n); else skipped++;
  }
  const promo = gc.promo_items && gc.promo_items.basic;
  const section = gc.taxonomy && gc.taxonomy.primary_section && gc.taxonomy.primary_section.name;
  return {
    id: gc._id,
    url: gc.canonical_url ? new URL(gc.canonical_url, `https://www.${domain}`).href : url.href,
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

export function describeError(err) {
  if (err instanceof ArticleError) return { status: err.status, message: err.message };
  if (err.name === 'AbortError') return { status: 504, message: `Timed out after ${FETCH_TIMEOUT_MS / 1000}s fetching the page` };
  return { status: 500, message: err.cause && err.cause.code ? `${err.message} (${err.cause.code})` : err.message };
}
