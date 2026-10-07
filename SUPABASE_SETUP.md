# Supabase and TripAssistant setup

The site remains a static HTML/CSS/JS app. Authentication, user-owned records, itinerary generation, and bookings run through Supabase. The browser uses only the Supabase project URL and public anon key. Groq, service-role, and n8n credentials stay on the server side.

## 1. Create the Supabase project and schema

1. Create a Supabase project and note its project URL and anon/public key.
2. Open **SQL Editor → New query**, paste and run [`supabase/migrations/202610050001_myra_trip_planner.sql`](supabase/migrations/202610050001_myra_trip_planner.sql).
3. The migration creates `profiles`, `trip_requests`, `itineraries`, `bookings`, `catalogue_hotels`, and `wishlists`; seeds 36 clearly illustrative catalogue stays; enables RLS; and adds itinerary rows to Realtime. The itinerary `persona` column is withheld from authenticated browser queries.
4. In **Project Settings → API**, do not put the `service_role` key in the site. Supabase injects the service key into Edge Functions.

## 2. Configure Google and email-code sign-in

1. In Google Cloud Console, create/select a project and configure the OAuth consent screen.
2. Create an **OAuth client ID → Web application**. Add your site origin (for local testing, `http://localhost:8000`) under **Authorized JavaScript origins**.
3. Add `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback` as an **Authorized redirect URI**. Copy the Google client ID and secret.
4. In Supabase, open **Authentication → Sign In / Providers → Google**, enable Google, and enter that client ID and secret.
5. In **Authentication → URL Configuration**, set the Site URL to your deployed site and add redirect URLs for the deployed origin and `http://localhost:8000/**`.
6. Under **Authentication → Sign In / Providers → Email**, enable email sign-in, set the OTP length to **6**, and set the email OTP expiry to 10 minutes. Do not enable phone/SMS sign-in.
7. Open **Authentication → Email Templates → Confirm signup**. Use the welcome template below. It sends a thank-you message and the 6-digit verification code to a new registrant.
8. Open **Authentication → Email Templates → Magic Link**. Replace the link-based content with the sign-in-code template below, so returning users also receive a 6-digit code.
9. For delivery to Gmail addresses outside your Supabase team, configure a custom SMTP sender in **Authentication → Emails → SMTP Settings**. Use a transactional sender such as Resend, or your Gmail SMTP credentials if you specifically want the message sent from your own Gmail. Keep SMTP credentials in Supabase settings only; never put them in `supabase-config.js`.

### Confirm signup email

In Supabase, open **Authentication → Email Templates → Confirm signup**. Set the subject to **Welcome to TripAssistant — verify your email**. Choose **Source** in the editor and paste this HTML as the body:

```html
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef4fa;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:#17263b">
  <tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
      <tr><td>
        <img src="https://upload.wikimedia.org/wikipedia/commons/c/c4/Sunset_over_the_ocean_in_the_evening.jpg" width="600" alt="Sunset over the ocean" style="display:block;width:100%;height:190px;object-fit:cover;border:0">
      </td></tr>
      <tr><td style="padding:30px 34px 34px">
        <p style="margin:0 0 8px;color:#1686d9;font-size:13px;font-weight:bold;letter-spacing:1.5px">TRIPASSISTANT</p>
        <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;color:#152b45">Thanks for joining us!</h1>
        <p style="margin:0 0 14px;font-size:16px;line-height:1.6">Welcome to TripAssistant. We’re glad you’re here.</p>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6">Enter this 6-digit code on the sign-up screen to verify your email and finish creating your account:</p>
        <p style="margin:18px 0;padding:15px 12px;text-align:center;background:#edf6ff;border-radius:10px;color:#087bd0;font-size:32px;font-weight:bold;letter-spacing:9px">{{ .Token }}</p>
        <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6">If you didn’t request a TripAssistant account, you can ignore this email.</p>
      </td></tr>
      <tr><td style="padding:15px 34px;background:#f7f9fc;color:#8290a1;font-size:12px">TripAssistant · Plan your next journey with Myra. Photo: Karthika Manikandan, CC BY 4.0.</td></tr>
    </table>
  </td></tr>
</table>
```

### Returning-user sign-in email

Set the **Magic Link** subject to **Your TripAssistant sign-in code**, choose **Source**, and paste:

```html
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef4fa;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:#17263b">
  <tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#fff;border-radius:16px;overflow:hidden">
    <tr><td><img src="https://upload.wikimedia.org/wikipedia/commons/c/c4/Sunset_over_the_ocean_in_the_evening.jpg" width="600" alt="Sunset over the ocean" style="display:block;width:100%;height:170px;object-fit:cover;border:0"></td></tr>
    <tr><td style="padding:30px 34px"><p style="margin:0 0 8px;color:#1686d9;font-size:13px;font-weight:bold;letter-spacing:1.5px">TRIPASSISTANT</p><h1 style="margin:0 0 14px;font-size:25px;color:#152b45">Your sign-in code</h1><p style="font-size:15px;line-height:1.6">Enter this 6-digit code on TripAssistant to securely sign in:</p><p style="margin:18px 0;padding:15px 12px;text-align:center;background:#edf6ff;border-radius:10px;color:#087bd0;font-size:32px;font-weight:bold;letter-spacing:9px">{{ .Token }}</p><p style="color:#64748b;font-size:13px">If you didn’t request this code, you can ignore this email.</p></td></tr>
    <tr><td style="padding:15px 34px;background:#f7f9fc;color:#8290a1;font-size:12px">TripAssistant · Plan your next journey with Myra. Photo: Karthika Manikandan, CC BY 4.0.</td></tr>
  </table></td></tr>
</table>
```

The image is served directly from Wikimedia Commons. Some email apps hide remote images until the recipient taps “Display images”; the code and email remain usable if that happens. The photo is by Karthika Manikandan under CC BY 4.0; the footer includes attribution.

The site verifies the entered code with Supabase Auth. Keep `{{ .Token }}` in both templates; a template containing only `{{ .ConfirmationURL }}` sends a clickable link instead of the code expected by the form.

## 3. Configure Groq and n8n, then deploy the function

1. Create a Groq API key with access to `openai/gpt-oss-20b`.
2. Create an n8n workflow with a **Webhook** trigger using POST. Add a human-review step. After approval, update only that itinerary row with `review_status = Approved` and the reviewed `ai_explanation`; on rejection, set `review_status = Rejected` and leave the explanation empty.
3. In n8n, keep Supabase credentials in n8n credentials. Use the service-role key only inside that trusted workflow to update review fields. Never send it to a browser or expose it in workflow output.
4. From this directory, install/login to the Supabase CLI if needed, then run:

   ```sh
   supabase login
   supabase link --project-ref <SUPABASE_PROJECT_REF>
   supabase db push
   supabase secrets set GROQ_API_KEY=<GROQ_API_KEY> N8N_WEBHOOK_URL=<N8N_WEBHOOK_URL>
   supabase functions deploy myra-chat
   ```

   The function uses the Supabase-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` environment values. `verify_jwt = false` is intentional so a guest can chat and draft a plan; the function validates any provided user token and requires a valid signed-in user for saving plans and bookings.
5. In the n8n webhook, the POST body includes `itinerary_id`, the internal persona label, destination, dates, budget, summary, and profile name/email. The UI does not display the persona. The Edge Function runs the webhook call in the background and does not wait for it.

## 4. Connect the static website

1. Edit [`supabase-config.js`](supabase-config.js): set `SUPABASE_URL` to `https://<SUPABASE_PROJECT_REF>.supabase.co` and `SUPABASE_ANON_KEY` to the Supabase **anon/public** key.
2. Keep the file next to `index.html` and `myra.html`; deploy all three plus `supabase-app.js` and the `supabase/` source directory.
3. For local preview, run `python -m http.server 8000` from this directory and open `http://localhost:8000`.
4. Test Google sign-in, email code sign-in, name/mobile profile completion, trip saving, a sample booking, My Trips, and a review update. Change an itinerary to Approved in n8n and confirm the explanation appears in Myra and My Trips without reloading.

## What is connected

- Myra supports guest chat and draft planning. Guests are prompted to sign in before saving or booking.
- Signed-in partial trip details are saved as `in_progress` and can be continued for 24 hours.
- Saving a plan writes the trip request and itinerary, then submits the review payload to n8n. The explanation stays hidden while pending and is shown only after the row is Approved.
- Bookings, profile, and wishlist entries are stored per user in Supabase. Currency preference is saved on the profile when signed in.
- The catalogue entries are sample properties for the demo, not live listings. Myra only uses exact names from the catalogue and says when fewer than five entries are available.
