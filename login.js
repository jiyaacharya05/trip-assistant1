/* Full-page sign-in for Trip Assistant: Google OAuth and passwordless email
   (6-digit OTP). Uses only the public Supabase URL and anon/publishable key. */
(() => {
  const $ = id => document.getElementById(id);

  // Where to return after sign-in. Only same-origin pages are allowed.
  function safeNext() {
    const raw = new URLSearchParams(location.search).get('next') || 'index.html';
    try {
      const url = new URL(raw, location.href);
      if (url.origin !== location.origin || /login\.html$/i.test(url.pathname)) return 'index.html';
      return url.pathname + url.search + url.hash;
    } catch { return 'index.html'; }
  }
  // Shared demo account for class testing. It is a real Supabase user that
  // you create once in the dashboard (see SUPABASE_SETUP.md). Anyone who
  // opens this page can see it, so never store real data in it.
  const DEMO_EMAIL = window.TRIP_DEMO_EMAIL || 'demo@tripassistant.app';
  const DEMO_PASSWORD = window.TRIP_DEMO_PASSWORD || 'TripDemo@2026';
  const next = safeNext();
  $('demoEmail').textContent = DEMO_EMAIL;
  $('demoPassword').textContent = DEMO_PASSWORD;
  $('backLink').href = next;
  $('continueLink').href = next;

  function show(el, type, text) {
    el.className = 'status show ' + type;
    el.textContent = text;
  }
  function hide(el) { el.className = 'status'; el.textContent = ''; }
  function step(name) {
    for (const id of ['stepStart', 'stepCode', 'stepDone']) $(id).hidden = id !== name;
  }

  const configured = window.SUPABASE_URL?.startsWith('https://') && window.SUPABASE_ANON_KEY
    && !String(window.SUPABASE_URL).includes('YOUR_PROJECT_REF') && !String(window.SUPABASE_ANON_KEY).includes('YOUR_SUPABASE');
  if (!configured || !window.supabase?.createClient) {
    show($('status'), 'error', !window.supabase?.createClient
      ? 'The sign-in service could not load. Check your internet connection and refresh the page.'
      : 'Sign-in is not set up yet: add the Supabase project URL and anon key to supabase-config.js.');
    $('googleBtn').disabled = true; $('sendBtn').disabled = true; $('demoBtn').disabled = true;
    return;
  }
  const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  // Errors returned by Google/Supabase after a redirect.
  const returned = new URLSearchParams(location.hash.slice(1) || location.search);
  if (returned.get('error_description') || returned.get('error')) {
    show($('status'), 'error', 'Google sign-in did not finish: ' + (returned.get('error_description') || returned.get('error')).replace(/\+/g, ' '));
  }

  // Name shown in the header: profile name, then Google name, then email prefix.
  function bestName(user, profileName) {
    const meta = user?.user_metadata || {};
    return [profileName, meta.full_name, meta.name, (user?.email || '').split('@')[0]]
      .map(v => String(v || '').trim()).find(Boolean) || '';
  }
  async function ensureProfile(user) {
    try {
      const { data } = await client.from('profiles').select('name,email').eq('id', user.id).maybeSingle();
      const current = String(data?.name || '').trim();
      const name = bestName(user, current);
      if (current || !name) return name;              // never replace a valid name, never write a blank one
      const row = { id: user.id, name };
      if (user.email) row.email = user.email;
      const { error } = await client.from('profiles').upsert(row, { onConflict: 'id' });
      if (error) console.warn('Profile could not be saved:', error.message);
      return name;
    } catch (err) {
      console.warn('Profile check failed:', err);
      return bestName(user, '');
    }
  }

  let finishing = false;
  async function finish(user) {
    if (finishing || !user) return;
    finishing = true;
    const name = await ensureProfile(user);
    $('doneTitle').textContent = name ? `Welcome, ${name.split(/\s+/)[0]}!` : 'Welcome!';
    step('stepDone');
    setTimeout(() => location.replace(next), 900);
  }

  client.auth.onAuthStateChange((event, session) => {
    if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) finish(session.user);
  });
  client.auth.getSession().then(({ data }) => { if (data.session?.user) finish(data.session.user); });

  // Google
  $('googleBtn').addEventListener('click', async () => {
    hide($('status'));
    $('googleBtn').disabled = true;
    const redirectTo = new URL('login.html?next=' + encodeURIComponent(next), location.href).href;
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) {
      $('googleBtn').disabled = false;
      show($('status'), 'error', 'Google sign-in could not start: ' + error.message);
    }
  });

  // Demo account: email + password, no email is sent.
  $('demoBtn').addEventListener('click', async () => {
    hide($('status'));
    const btn = $('demoBtn');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const { data, error } = await client.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
      if (error) throw error;
      await finish(data.user);
    } catch (err) {
      const msg = String(err?.message || '');
      show($('status'), 'error', /invalid login credentials/i.test(msg)
        ? 'The demo account is not set up in Supabase yet. In Supabase open Authentication → Users → Add user, enter the demo email and password shown below, tick “Auto Confirm User”, and save.'
        : /email not confirmed/i.test(msg)
          ? 'The demo account exists but is not confirmed. In Supabase open Authentication → Users, open the demo user and confirm it.'
          : friendly(err, 'Demo sign-in failed. Please try again.'));
      btn.disabled = false; btn.textContent = 'Sign in with demo account';
    }
  });

  // Email: step 1, send the code
  let email = '', cooldownTimer = null;
  function startCooldown(seconds = 30) {
    const btn = $('resendBtn');
    let left = seconds;
    btn.disabled = true;
    btn.textContent = `Resend code (${left}s)`;
    clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) { clearInterval(cooldownTimer); btn.disabled = false; btn.textContent = 'Resend code'; }
      else btn.textContent = `Resend code (${left}s)`;
    }, 1000);
  }
  async function sendCode(address) {
    const { error } = await client.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
    if (error) throw error;
  }
  function friendly(err, fallback) {
    const msg = String(err?.message || '');
    if (/rate limit|security purposes|too many/i.test(msg)) return 'Too many code requests. Please wait a minute and try again.';
    if (/expired|invalid|token/i.test(msg)) return 'That code is incorrect or has expired. Check the latest email, or resend a new code.';
    if (/fetch|network|Failed to/i.test(msg)) return 'Could not reach the sign-in service. Check your internet connection and try again.';
    return msg || fallback;
  }
  $('emailForm').addEventListener('submit', async e => {
    e.preventDefault();
    hide($('status'));
    const value = $('authEmail').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { show($('status'), 'error', 'Enter a valid email address you can open.'); return; }
    const btn = $('sendBtn');
    btn.disabled = true; btn.textContent = 'Sending code…';
    try {
      await sendCode(value);
      email = value;
      try { sessionStorage.setItem('ta_login_email', email); } catch {}
      $('sentTo').textContent = email;
      step('stepCode');
      show($('codeStatus'), 'success', `Code sent to ${email}. It can take a minute to arrive.`);
      $('authCode').value = ''; $('authCode').focus();
      startCooldown();
    } catch (err) {
      show($('status'), 'error', friendly(err, 'Could not send the code. Please try again.'));
    } finally {
      btn.disabled = false; btn.textContent = 'Send me a 6-digit code';
    }
  });

  // Email: step 2, verify the code
  $('authCode').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
  $('codeForm').addEventListener('submit', async e => {
    e.preventDefault();
    const token = $('authCode').value.trim();
    if (!/^\d{6}$/.test(token)) { show($('codeStatus'), 'error', 'Enter the 6-digit code from the email.'); return; }
    const btn = $('verifyBtn');
    btn.disabled = true; btn.textContent = 'Verifying…';
    try {
      const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' });
      if (error) throw error;
      try { sessionStorage.removeItem('ta_login_email'); } catch {}
      show($('codeStatus'), 'success', 'Email verified.');
      await finish(data.user || data.session?.user);
    } catch (err) {
      show($('codeStatus'), 'error', friendly(err, 'That code could not be verified. Please try again.'));
      btn.disabled = false; btn.textContent = 'Verify and continue';
    }
  });
  $('resendBtn').addEventListener('click', async () => {
    try {
      await sendCode(email);
      show($('codeStatus'), 'success', `A new code was sent to ${email}.`);
      startCooldown();
    } catch (err) { show($('codeStatus'), 'error', friendly(err, 'Could not resend the code.')); }
  });
  $('changeEmailBtn').addEventListener('click', () => {
    try { sessionStorage.removeItem('ta_login_email'); } catch {}
    step('stepStart'); hide($('status')); $('authEmail').focus();
  });

  // If the page was refreshed while waiting for a code, keep the code step.
  try {
    const saved = sessionStorage.getItem('ta_login_email');
    if (saved) { email = saved; $('sentTo').textContent = email; $('authEmail').value = email; step('stepCode'); }
  } catch {}
})();
