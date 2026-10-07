# Trip Assistant

Independent travel planning demo with Flights, Hotels, Villas & Homestays, Holiday Packages, Tours & Attractions, and the Myra assistant.

## Run locally

The ready-to-serve website is in `dist/`:

```bash
cd dist
python3 -m http.server 8000
```

Open `http://localhost:8000` in your browser.

## Supabase setup

Read `SUPABASE_SETUP.md` for configuration, SQL, and Edge Function steps. Keep provider keys and service-role credentials in Supabase secrets; never place secrets in browser code.

The interface uses sample inventory and is a demo. It does not make real bookings or payments.
