# Sync this repo into Google AI Studio

Google AI Studio can push to GitHub but cannot pull from it. Paste this into AI Studio Chat to copy the latest GitHub code into the app:

```
Sync this app with my GitHub repo. The GitHub version is the fixed, tested one; make this app's files match it exactly.

git clone --depth 1 https://github.com/jiyaacharya05/trip-assistant1.git /tmp/ta-sync
(if /tmp/ta-sync already exists, delete it first)

Copy these from /tmp/ta-sync into this app, replacing what is here:
index.html, myra.html, login.html, login.js, supabase-app.js, supabase-config.js, server.js, the whole assets/ folder and the whole supabase/ folder.

Rules:
1. Do NOT edit any copied file afterwards. No reformatting, merging or "improvements".
2. server.js from GitHub replaces the old one. It has no dependencies: it serves the site (from dist/ if dist/index.html exists, otherwise the app folder), adds POST /api/myra, which forwards Myra's chat to the Supabase Edge Function from the server, and adds POST /api/myra-plan, which builds Myra's itinerary with Google Gemini using the server-side GEMINI_API_KEY. Make sure package.json runs "node server.js" for dev and start, and keep the Gemini API key configured for this app.
3. Keep build.js and package.json. Rebuild dist/ (node build.js) so dist/ has the same files, then restart the server and reload the Preview.
If git clone cannot reach github.com, tell me the exact error and stop.

Test INSIDE the Preview, signed in with the demo account:
a) "Is October a good month for the Kerala backwaters?"
b) "Plan a 3-day trip to Goa for 2 friends, 12 to 14 December, budget ₹20,000, relaxed pace."
c) "Plan a 3-day trip to Sydney from 10 Dec to 12 Dec" — Myra must ask the budget in A$ (AUD) and the itinerary must show destination and food photos.
Report what Myra shows and every console line starting with [Myra] (they say "via /api/myra" or "directly to Supabase").
```

Do not use "Force push" from AI Studio until Myra works there: it would overwrite the fixed GitHub code.
