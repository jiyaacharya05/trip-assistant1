/* Trip Assistant server: serves the static site, forwards Myra's chat to
   the Supabase Edge Function from the server side (same-origin /api/myra) and
   builds Myra itineraries with Google Gemini (same-origin /api/myra-plan).
   No dependencies; Node 18+. The Gemini key is read only from the server
   environment (GEMINI_API_KEY, set in Google AI Studio) and never sent to the
   browser. The Supabase URL and publishable key are already public. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = fs.existsSync(path.join(__dirname, 'dist', 'index.html')) ? path.join(__dirname, 'dist') : __dirname;
function normalizeSupabaseUrl(url) {
  if (!url) return 'https://nndvrripxawpxyqbrvsm.supabase.co';
  const match = String(url).match(/supabase\.com\/dashboard\/project\/([a-z0-9_-]+)/i);
  if (match) return `https://${match[1]}.supabase.co`;
  return String(url).replace(/\/+$/, '');
}
const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const SUPABASE_KEY = (process.env.SUPABASE_ANON_KEY || 'sb_publishable_nT9C6_S0qenCMCNT5sV3tw_numZd1JP').trim().replace(/^[^\w]+|[^\w]+$/g, '');
const GEMINI_KEY = String(process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
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
    headers.Authorization = req.headers.authorization || ('Bearer ' + SUPABASE_KEY);
    const r = await fetch(FUNCTION_URL, { method: 'POST', headers, body: raw || '{}', signal: controller.signal });
    const text = await r.text();
    sendJson(res, r.status, text || '{}');
  } catch (err) {
    const timeout = err && err.name === 'AbortError';
    console.error('[Myra proxy]', timeout ? 'timeout' : err);
    sendJson(res, 504, { ok: false, code: timeout ? 'timeout' : 'proxy_error', error: timeout ? 'Myra’s server did not answer within 25 seconds. Please try again.' : 'The app server could not reach Myra’s backend. Please try again.' });
  } finally { clearTimeout(timer); }
}

/* ---------- Myra itinerary with Google Gemini ---------- */
// Same approximate display rates the site uses (1 INR = rate units of currency).
const RATES = { INR: 1, USD: 0.012, EUR: 0.011, GBP: 0.0094, AUD: 0.018, CAD: 0.016, NZD: 0.02, AED: 0.044, SAR: 0.045, QAR: 0.044, SGD: 0.016, MYR: 0.05, THB: 0.44, IDR: 185, JPY: 1.78, KRW: 16.6, CNY: 0.086, HKD: 0.094, CHF: 0.01, ZAR: 0.22 };
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const clean = (v, max = 160) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

function planPrompt(trip, currency, changeRequest, currentPlan) {
  const rate = RATES[currency] || 1;
  const budgetLocal = Math.round(num(trip.budget_inr) * rate);
  const dates = [];
  const start = new Date(String(trip.start_date) + 'T00:00:00Z'), end = new Date(String(trip.end_date) + 'T00:00:00Z');
  for (let d = new Date(start); d <= end && dates.length < 14; d.setUTCDate(d.getUTCDate() + 1)) dates.push(d.toISOString().slice(0, 10));
  return `You are Myra, the trip planner of a travel website. Build a realistic day-by-day itinerary.
Destination: ${clean(trip.destination, 80)}
Dates: ${dates.join(', ')} (${dates.length} day${dates.length === 1 ? '' : 's'}, ${Math.max(0, dates.length - 1)} night(s))
Travellers: ${clean(trip.travellers_type, 30) || 'solo'}, ${num(trip.travellers_count) || 1} person(s)
Interests: ${clean(trip.interests, 120) || 'top sights and local food'}
Pace: ${clean(trip.pace, 20) || 'normal'} (relaxed = 2 sights/day, normal = 3, packed = 4)
Total budget for the whole group: ${budgetLocal} ${currency}
${changeRequest ? `Change requested by the traveller: ${clean(changeRequest, 300)}\nPrevious plan (keep what was not asked to change): ${clean(JSON.stringify(currentPlan || {}), 3000)}` : ''}
Rules:
- Use only real, well-known places and real local dishes of ${clean(trip.destination, 80)}.
- Every day has sights AND exactly 2 food stops (lunch and dinner) featuring a famous local dish or food place.
- "wiki_title" must be the exact English Wikipedia article title for that sight, or for the dish (for food stops use the dish article, e.g. "Meat pie (Australia and New Zealand)", "Pavlova", "Barramundi").
- All money values are in ${currency} for the whole group, realistic for ${new Date().getUTCFullYear()}. Sight cost 0 if free.
- Give approximate latitude/longitude for every sight and food stop.
- Choose one well-located mid-range hotel that fits the budget; stay_per_night is per room per night.
- The total (stay + sights + food + daily allowance for transport/snacks) MUST be at or below ${budgetLocal} ${currency}. If the budget is too small, still plan the cheapest sensible trip and say so in "summary".
Return JSON only with this shape:
{"summary":"2 sentences","hotel":{"name":"","area":"","stay_per_night":0},"rooms":1,"days":[{"day":1,"date":"YYYY-MM-DD","title":"","stops":[{"time":"09:00","name":"","area":"","reason":"one sentence","cost":0,"wiki_title":"","lat":0,"lng":0,"offbeat":false}],"food_stops":[{"time":"13:00","meal":"Lunch","name":"dish @ place","area":"","reason":"what it is","cost":0,"wiki_title":"","veg":false,"lat":0,"lng":0}],"daily_allowance":0}],"destination_wiki_title":"","must_try_foods":[{"name":"","wiki_title":""}]}`;
}

function toPlan(raw, trip, currency) {
  const rate = RATES[currency] || 1;
  const inr = v => Math.round(num(v) / rate);
  const days = (Array.isArray(raw.days) ? raw.days : []).slice(0, 14).map((d, i) => {
    const stops = (Array.isArray(d.stops) ? d.stops : []).slice(0, 6).map(s => ({ kind: 'sight', time: clean(s.time, 10), name: clean(s.name, 90), area: clean(s.area, 60), reason: clean(s.reason, 240), cost_inr: inr(s.cost), cost_source: 'Gemini estimate', wiki_title: clean(s.wiki_title, 120), lat: Number(s.lat) || null, lng: Number(s.lng) || null, offbeat: Boolean(s.offbeat) })).filter(s => s.name);
    const food = (Array.isArray(d.food_stops) ? d.food_stops : []).slice(0, 3).map(s => ({ kind: 'food', time: clean(s.time, 10), meal: clean(s.meal, 20) || 'Local food', name: clean(s.name, 90), area: clean(s.area, 60), reason: clean(s.reason, 240), cost_inr: inr(s.cost), cost_source: 'Gemini estimate', wiki_title: clean(s.wiki_title, 120), veg: typeof s.veg === 'boolean' ? s.veg : undefined, lat: Number(s.lat) || null, lng: Number(s.lng) || null })).filter(s => s.name);
    const allowance = inr(d.daily_allowance);
    const est = stops.reduce((n, s) => n + s.cost_inr, 0) + food.reduce((n, s) => n + s.cost_inr, 0) + allowance;
    return { day: i + 1, date: clean(d.date, 10) || undefined, title: clean(d.title, 80), stops, food_stops: food, daily_allowance_inr: allowance, est_cost_inr: est };
  }).filter(d => d.stops.length || d.food_stops.length);
  const nights = Math.max(0, days.length - 1);
  const rooms = Math.max(1, Math.round(num(raw.rooms) || 1));
  const perNight = inr(raw.hotel?.stay_per_night);
  const stayTotal = perNight * rooms * nights;
  const sightseeing = days.reduce((n, d) => n + d.stops.reduce((m, s) => m + s.cost_inr, 0), 0);
  const food = days.reduce((n, d) => n + d.food_stops.reduce((m, s) => m + s.cost_inr, 0), 0);
  const allowance = days.reduce((n, d) => n + d.daily_allowance_inr, 0);
  const hotelName = clean(raw.hotel?.name, 90);
  return {
    summary: clean(raw.summary, 500), pace: clean(trip.pace, 20), rooms, nights, stay_total_inr: stayTotal,
    stay_suggestion: hotelName ? { name: hotelName, area: clean(raw.hotel?.area, 60), price_per_night_inr: perNight } : null,
    days, destination_wiki_title: clean(raw.destination_wiki_title, 120),
    must_try_foods: (Array.isArray(raw.must_try_foods) ? raw.must_try_foods : []).slice(0, 6).map(f => ({ name: clean(f.name, 60), wiki_title: clean(f.wiki_title, 120) })).filter(f => f.name),
    cost_breakdown_inr: { stay: stayTotal, sightseeing, food, daily_allowance: allowance },
    total_cost_inr: stayTotal + sightseeing + food + allowance,
    planner: 'gemini', currency,
  };
}

async function geminiPlan(req, res) {
  if (!GEMINI_KEY) return sendJson(res, 200, { ok: false, code: 'no_gemini_key', error: 'GEMINI_API_KEY is not set on the server.' });
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 200000) return sendJson(res, 413, { ok: false, error: 'Request too large.' }); }
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { return sendJson(res, 400, { ok: false, error: 'Invalid JSON.' }); }
  const trip = body.trip || {};
  const currency = RATES[String(body.currency || '').toUpperCase()] ? String(body.currency).toUpperCase() : 'INR';
  if (!trip.destination || !trip.start_date || !trip.end_date) return sendJson(res, 400, { ok: false, error: 'Destination and dates are required.' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: planPrompt(trip, currency, body.change_request, body.current_plan) }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.6, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { console.error('[Myra Gemini]', r.status, data?.error?.message); return sendJson(res, 200, { ok: false, code: 'gemini_error', error: data?.error?.message || `Gemini returned ${r.status}` }); }
    const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    const plan = toPlan(parsed, trip, currency);
    if (!plan.days.length) return sendJson(res, 200, { ok: false, code: 'empty_plan', error: 'Gemini did not return any days.' });
    sendJson(res, 200, { ok: true, plan });
  } catch (err) {
    const timeout = err && err.name === 'AbortError';
    console.error('[Myra Gemini]', timeout ? 'timeout' : err);
    sendJson(res, 200, { ok: false, code: timeout ? 'timeout' : 'gemini_error', error: timeout ? 'Gemini took too long to answer.' : 'Could not build the itinerary with Gemini.' });
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
  const route = req.url.split('?')[0];
  if (route === '/api/myra-plan') {
    if (req.method === 'POST') return geminiPlan(req, res);
    return sendJson(res, 200, { ok: true, gemini: Boolean(GEMINI_KEY), model: GEMINI_MODEL });
  }
  if (route === '/api/myra') {
    if (req.method === 'POST') return proxyMyra(req, res);
    return sendJson(res, 405, { ok: false, error: 'POST required' });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res);
}).listen(PORT, '0.0.0.0', () => console.log(`Trip Assistant server running at http://0.0.0.0:${PORT} (serving ${ROOT})`));
