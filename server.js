import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { parseTarget, fetchArticle, describeError } from './article.js';

const PORT = Number(process.env.PORT) || 3030;
const HOST = '127.0.0.1';
const INDEX = path.join(import.meta.dirname, 'index.html');

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
    const raw = u.searchParams.get('url') || '';
    const t0 = Date.now();
    try {
      const article = await fetchArticle(parseTarget(raw));
      console.log(`${new Date().toISOString()} OK  ${Date.now() - t0}ms ${article.elements.length} elements  ${raw}`);
      sendJson(res, 200, article);
    } catch (err) {
      const { status, message } = describeError(err);
      console.log(`${new Date().toISOString()} ERR ${status} ${message}  ${raw}`);
      sendJson(res, status, { error: message });
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}).listen(PORT, HOST, () => {
  console.log(`Crain's Reader listening on http://${HOST}:${PORT}`);
});
