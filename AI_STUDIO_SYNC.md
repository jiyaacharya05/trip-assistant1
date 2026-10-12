# Sync this repo into Google AI Studio

Google AI Studio can push to GitHub but cannot pull from it. To bring the
latest GitHub code into the AI Studio app, paste this into AI Studio Chat:

```
Replace these files in this app with the exact latest versions from GitHub (public repo jiyaacharya05/trip-assistant1, branch main). Use your terminal:

curl -fsSL -o myra.html        https://raw.githubusercontent.com/jiyaacharya05/trip-assistant1/main/myra.html
curl -fsSL -o supabase-app.js  https://raw.githubusercontent.com/jiyaacharya05/trip-assistant1/main/supabase-app.js
curl -fsSL -o login.html       https://raw.githubusercontent.com/jiyaacharya05/trip-assistant1/main/login.html
curl -fsSL -o login.js         https://raw.githubusercontent.com/jiyaacharya05/trip-assistant1/main/login.js
curl -fsSL -o assets/login-ocean-sunset.jpg https://raw.githubusercontent.com/jiyaacharya05/trip-assistant1/main/assets/login-ocean-sunset.jpg

Rules: do not edit these files after downloading. Keep server.js, index.html and supabase-config.js. Update the ?v= on supabase-app.js in index.html and myra.html to a new value, rebuild dist/ (node build.js), and reload the Preview.
Then, SIGNED IN with the demo account, open Myra and send "Is October a good month for the Kerala backwaters?". Report exactly what Myra shows and every console line starting with [Myra].
If curl cannot reach raw.githubusercontent.com, tell me the exact error and stop.
```

Do not use "Force push" from AI Studio until Myra works there: it would overwrite the fixed GitHub code.
