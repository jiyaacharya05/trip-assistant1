/* Trip Assistant server: serves the static site and forwards Myra's chat to
   the Supabase Edge Function from the server side (same-origin /api/myra).
   No dependencies; Node 18+. Only public values are used here (the Supabase
   URL and publishable key are already public in supabase-config.js). */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = fs.existsSync(path.join(__dirname, 'dist', 'index.html')) ? path.join(__dirname, 'dist') : __dirname;
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://nndvrripxawpxyqbrvsm.supabase.co').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_nT9C6_S0qenCMCNT5sV3tw_numZd1JP';
const FUNCTION_URL = process.env.MYRA_FUNCTION_URL || `${SUPABASE_URL}/functions/v1/myra-chat`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };
const NO_CACHE = { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache', Expires: '0' };

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...NO_CACHE });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function proxyMyra(req, res) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 100000) return sendJson(res, 413, { ok: false, error: 'Message too long.' }); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;
    const r = await fetch(FUNCTION_URL, { method: 'POST', headers, body: raw || '{}', signal: controller.signal });
    const text = await r.text();
    sendJson(res, r.status, text || '{}');
  } catch (err) {
    const timeout = err && err.name === 'AbortError';
    console.error('[Myra proxy]', timeout ? 'timeout' : err);
    sendJson(res, 504, { ok: false, code: timeout ? 'timeout' : 'proxy_error', error: timeout ? 'Myra’s server did not answer within 25 seconds. Please try again.' : 'The app server could not reach Myra’s backend. Please try again.' });
  } finally { clearTimeout(timer); }
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    const target = !err && st.isFile() ? file : (!path.extname(urlPath) ? path.join(ROOT, 'index.html') : null);
    if (!target) { res.writeHead(404, NO_CACHE); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream', ...NO_CACHE });
    fs.createReadStream(target).pipe(res);
  });
}

http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/api/myra') {
    if (req.method === 'POST') return proxyMyra(req, res);
    return sendJson(res, 405, { ok: false, error: 'POST required' });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res);
}).listen(PORT, '0.0.0.0', () => console.log(`Trip Assistant server running at http://0.0.0.0:${PORT} (serving ${ROOT})`));
