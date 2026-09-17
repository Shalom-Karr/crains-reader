import { parseTarget, fetchArticle, describeError } from './article.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const u = new URL(request.url);
    if (u.pathname !== '/api/article') return json(404, { error: 'Not found' });
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
    try {
      return json(200, await fetchArticle(parseTarget(u.searchParams.get('url'))));
    } catch (err) {
      const { status, message } = describeError(err);
      return json(status, { error: message });
    }
  },
};
