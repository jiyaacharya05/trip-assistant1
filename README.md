# Trip Assistant

Independent travel planning demo with Flights, Hotels, Villas & Homestays, Holiday Packages, Tours & Attractions, and the Myra assistant.

## Run locally

The website is served from the repository root. All images are in `assets/`.

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in your browser.

## Myra itineraries with Google Gemini

`server.js` exposes `POST /api/myra-plan`, which asks Google Gemini (`gemini-2.5-flash`) for a day-by-day plan with sights, local food stops, Wikipedia photo titles and costs in the destination's currency (for example A$ for Sydney). Set `GEMINI_API_KEY` in the server environment (Google AI Studio provides it to the app). If the key is missing, Myra falls back to the Supabase `myra-chat` planner.

Run with `node server.js` to use it locally.

## Supabase setup

Read `SUPABASE_SETUP.md` for configuration, SQL, and Edge Function steps. Keep provider keys and service-role credentials in Supabase secrets; never place secrets in browser code.

The interface uses sample inventory and is a demo. It does not make real bookings or payments.
