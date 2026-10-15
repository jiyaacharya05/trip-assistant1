/* Supabase integration for the existing static travel-booking-style page. */
(() => {
  const configured = window.SUPABASE_URL?.startsWith('https://') && !window.SUPABASE_URL.includes('YOUR_PROJECT_REF') && window.SUPABASE_ANON_KEY && !window.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
  const status = document.getElementById('supabaseSetupNotice');
  if (!configured || !window.supabase?.createClient) {
    if (status) status.hidden = false;
    window.tripBackend = { configured:false, getUser:()=>null, getProfile:()=>null, profile:null, async invoke(){throw new Error('Supabase is not configured yet. Set the project URL and anon key in supabase-config.js.')} };
    window.login=()=>modal('Supabase setup required','<p>Add your Supabase project URL and anon key to <code>supabase-config.js</code>, then sign in with Google or an email code.</p>');
    window.showTrips=()=>modal('My Trips','<p>Connect Supabase to save and load your trips.</p>');
    window.confirmBooking=()=>toast('Connect Supabase before saving a booking.');
    window.saveItem=()=>toast('Connect Supabase before saving wishlist items.');
    window.showWishlist=()=>modal('Your Wishlist','<p>Connect Supabase to save wishlist items to your account.</p>');
    window.updateUser=()=>{const el=document.getElementById('loginBtn');if(el)el.textContent='◉ Login or Create Account ▾'};
    return;
  }
  const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, { auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true} });
  // Restore the last selected locale immediately; the signed-in profile remains authoritative.
  try {
    const saved=JSON.parse(localStorage.getItem('trip-assistant-locale')||'null');
    const country=expandedCountries.find(item=>item[0]===saved?.country);
    const code=expandedCurrencies[saved?.code]?saved.code:null;
    if(code){const entry=country||expandedCountries[0];activeLocale={...activeLocale,...expandedCurrencies[code],country:entry[0],flag:entry[1],code};}
  } catch {}
  let currentUser=null, profile=null, reviewChannel=null, wishItems=[],pendingHotelBooking=null;
  const anonName=()=>currentUser?.user_metadata?.full_name||currentUser?.user_metadata?.name||'';
  const esc2=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const configError=()=>!configured;
  async function refreshProfile(){
    if(!currentUser){ profile=null; window.dispatchEvent(new CustomEvent('supabase-profile',{detail:{user:null,profile:null}})); return null; }
    const {data,error}=await client.from('profiles').select('*').eq('id',currentUser.id).maybeSingle();
    if(error) throw error;
    profile=data||{id:currentUser.id,email:currentUser.email||'',name:anonName(),mobile:''};
    if(profile.preferred_currency&&typeof activeLocale==='object'){const option=expandedCurrencies?.[profile.preferred_currency];if(option)activeLocale={...activeLocale,...option,code:profile.preferred_currency,country:profile.preferred_country||activeLocale.country};}
    try{paintLocale()}catch{}
    window.dispatchEvent(new CustomEvent('supabase-profile',{detail:{user:currentUser,profile}}));
    const panel=document.getElementById('myra-panel');
    panel?.contentWindow?.postMessage({type:'myra-auth',profile:{name:profile.name||anonName(),email:profile.email||currentUser.email,authenticated:true}},location.origin);
    return profile;
  }
  function authFrame(title, content){
    modal(title, `<div class="myra-auth-grid"><aside class="myra-auth-visual" aria-label="Sunset over the ocean"><img class="myra-auth-photo" src="assets/login-ocean-sunset.jpg" alt="Sunset over the ocean"><div class="myra-auth-brand">Trip Assistant</div><div class="myra-auth-caption"><span>TRAVEL, YOUR WAY</span><h2>Find your<br>kind of getaway.</h2><p>Thoughtful trip ideas, saved in one place.</p></div></aside><section class="myra-auth-content">${content}</section></div>`);
    document.querySelector('#modalRoot .modal')?.classList.add('myra-auth-modal');
  }
  function askLogin(message='Sign in to save trips and bookings.'){
    authFrame('Login or Create Account', `<div class="myra-auth-kicker">WELCOME TO TRIP ASSISTANT</div><h2>Let’s get you going.</h2><p class="myra-auth-intro">Sign in or create an account to keep your trips together.</p>${message?`<p class="myra-auth-message">${esc2(message)}</p>`:''}<button class="myra-google-button" type="button" onclick="window.tripBackend.googleSignIn()"><span class="myra-google-g" aria-hidden="true">G</span><span>Continue with Google</span></button><div class="myra-auth-divider"><span>OR CONTINUE WITH EMAIL</span></div><form id="otpRequestForm" class="myra-auth-form"><label for="authEmail">Email address</label><input id="authEmail" required type="email" autocomplete="email" placeholder="you@example.com"><button class="myra-auth-submit">Send me a 6-digit code</button></form><div style="margin-top:20px;padding:14px 15px;border:1px dashed #b9cde2;border-radius:10px;background:#f7fbff"><strong style="display:block;font-size:12px;letter-spacing:1px;color:#1686db;margin-bottom:6px">DEMO ACCOUNT</strong><p style="margin:0 0 10px;font-size:13px;line-height:1.55;color:#4a5a6d">Email <code>demo@tripassistant.app</code><br>Password <code>TripDemo@2026</code></p><button id="demoSignInBtn" class="myra-auth-submit" type="button" style="width:100%;margin-top:0;background:#fff;border:1px solid #1686db;color:#1686db">Sign in with demo account</button><p id="demoSignInStatus" role="status" aria-live="polite" style="display:none;margin:10px 0 0;font-size:12px;line-height:1.5;color:#a3302f"></p></div><p class="myra-auth-footnote">New to Trip Assistant? Your account is created when you verify your email. No password or SMS needed.</p><p class="myra-auth-terms">By continuing, you agree to use Trip Assistant. Myra helps with your travel planning.</p>`);
    document.getElementById('demoSignInBtn')?.addEventListener('click',async e=>{
      const btn=e.currentTarget,status=document.getElementById('demoSignInStatus');
      btn.disabled=true;btn.textContent='Signing in…';status.style.display='none';
      try{
        const {data,error}=await client.auth.signInWithPassword({email:'demo@tripassistant.app',password:'TripDemo@2026'});
        if(error)throw error;
        closeModal();
        toast('Signed in successfully. Your account is ready.');
      }catch(err){
        status.textContent=/invalid login credentials/i.test(err?.message||'')
          ? 'Demo account is not set up yet. In Supabase, add demo@tripassistant.app with password TripDemo@2026 and enable Auto Confirm User.'
          : (err?.message||'Demo sign-in failed. Please try again.');
        status.style.display='block';btn.disabled=false;btn.textContent='Sign in with demo account';
      }
    });
    document.getElementById('otpRequestForm')?.addEventListener('submit',async e=>{
      e.preventDefault(); const email=document.getElementById('authEmail').value.trim();
      const button=e.currentTarget.querySelector('button');button.disabled=true;button.textContent='Sending code…';
      try{await requestCode(email);showOtpVerification(email)}catch(err){button.disabled=false;button.textContent='Send me a 6-digit code';toast(err.message||'Could not send the code. Please try again.')}
    });
  }
  function showOtpVerification(email){
    authFrame('Verify your email', `<div class="myra-auth-kicker">ONE QUICK STEP</div><h2>Check your inbox.</h2><p class="myra-auth-intro">We sent a 6-digit code to <strong>${esc2(email)}</strong>. Enter it here to sign in or finish creating your account.</p><form id="otpVerifyForm" class="myra-auth-form"><label for="authCode">6-digit email code</label><input id="verifyEmail" type="hidden" value="${esc2(email)}"><input id="authCode" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="000000"><button class="myra-auth-submit">Verify and continue</button></form><div class="myra-auth-actions"><button id="resendOtp" class="myra-link-button" type="button">Resend code</button><button id="changeAuthEmail" class="myra-link-button" type="button">Use another email</button></div><p class="myra-auth-footnote">The code is sent by Supabase Auth to your email. It expires according to your project’s email OTP setting.</p>`);
    document.getElementById('otpVerifyForm')?.addEventListener('submit',verifyCode);
    document.getElementById('resendOtp')?.addEventListener('click',async e=>{e.currentTarget.disabled=true;try{await requestCode(email);toast('A new code is on its way.')}catch(err){toast(err.message||'Could not resend the code.')}finally{e.currentTarget.disabled=false}});
    document.getElementById('changeAuthEmail')?.addEventListener('click',()=>askLogin());
  }
  async function verifyCode(e){
    e.preventDefault();const email=document.getElementById('verifyEmail')?.value.trim();const token=document.getElementById('authCode')?.value.trim();const button=e.currentTarget.querySelector('button');button.disabled=true;button.textContent='Verifying…';
    try{const {error}=await client.auth.verifyOtp({email,token,type:'email'});if(error)throw error;closeModal();toast('Email verified. Welcome to TripAssistant!')}
    catch(err){button.disabled=false;button.textContent='Verify and continue';toast(err.message||'That code could not be verified. Check it and try again.')}
  }
  async function ensureProfile(){
    if(!currentUser)return null;
    let p=await refreshProfile();
    if(p && p.name && p.mobile) return p;
    const suggested=esc2(p?.name||anonName());
    modal('Complete your profile',`<p>Tell Myra what to call you. Your mobile number is saved only as a profile field; no SMS code is sent.</p><form id="profileForm"><label>Your name</label><input id="profileName" required minlength="2" maxlength="80" value="${suggested}" placeholder="Your name"><label>Mobile number</label><input id="profileMobile" required type="tel" minlength="7" maxlength="20" autocomplete="tel" placeholder="Mobile number"><button class="blue">SAVE PROFILE</button></form>`);
    document.getElementById('profileForm')?.addEventListener('submit',async e=>{e.preventDefault();const name=document.getElementById('profileName').value.trim(),mobile=document.getElementById('profileMobile').value.trim();try{const {error}=await client.from('profiles').upsert({id:currentUser.id,name,email:currentUser.email||'',mobile},{onConflict:'id'});if(error)throw error;await refreshProfile();closeModal();toast(`Welcome, ${name.split(/\s+/)[0]}!`);await loadTrips();}catch(err){toast(err.message||'Could not save profile.')}});
    return p;
  }
  async function signInGoogle(){const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.href}});if(error)toast(error.message)}
  async function requestCode(email){const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:true}});if(error)throw error;return true}
  async function invoke(action,payload={}){
    const {data,error}=await client.functions.invoke('myra-chat',{body:{action,...payload}});
    if(error)throw error;
    if(data?.error && !data?.fallback) throw new Error(data.error);
    return data;
  }
  const bookingWrites=new Map();
  const bookingSignature=(details,total)=>{
    const d=details||{},norm=v=>String(v??'').trim().toLowerCase();
    return JSON.stringify([norm(d.service||d.hotel||d.name),norm(d.category),norm(d.from),norm(d.to),norm(d.destination),norm(d.date||d.check_in),norm(d.check_out||d.return_date||d.returnDate),norm(d.room),norm(d.name||d.guest),Math.round(Number(total)||0)]);
  };
  async function startStripeCheckout(details,totalInr,itineraryId=null,idempotencyKey=null,currencyCode=null){
    if(!currentUser){askLogin('Please sign in before paying for a booking.');throw new Error('Sign-in required');}
    const amount=Math.round(Number(totalInr)||0);
    if(amount<1)throw new Error('The payment amount must be greater than ₹0.');
    const key=idempotencyKey||details?.idempotency_key||((crypto.randomUUID&&crypto.randomUUID())||'ta-'+Date.now());
    const safeDetails={...(details||{}),idempotency_key:key,status:'Payment pending',payment_status:'pending',payment_provider:'Stripe'};
    for(const field of Object.keys(safeDetails))if(/card|cvc|cvv|password|bank.?account|upi.?pin|payment.?token/i.test(field))delete safeDetails[field];
    // AI Studio embeds the app in a cross-origin frame. Create a new tab while
    // the user gesture is active, then direct that tab to Stripe after the API call.
    let checkoutTab=null;try{checkoutTab=window.open('about:blank','_blank')}catch{}
    try{
      const {data,error}=await client.functions.invoke('stripe-payments',{body:{action:'create_checkout',details:safeDetails,total_inr:amount,currency:String(currencyCode||safeDetails.currency||activeLocale?.code||'INR').toUpperCase(),itinerary_id:itineraryId,idempotency_key:key}});
      if(error){let message=error.message;try{const detail=await error.context?.json();message=detail?.error||message}catch{}throw new Error(message)}
      if(data?.error)throw new Error(data.error);
      if(data?.paid){try{if(checkoutTab&&!checkoutTab.closed)checkoutTab.close()}catch{}await loadTrips();toast('This booking is already paid. It is available in My Trips.');return data;}
      if(!data?.url)throw new Error('Stripe did not return a checkout link.');
      const checkoutUrl=new URL(data.url);
      if(checkoutUrl.protocol!=='https:'||checkoutUrl.hostname!=='checkout.stripe.com')throw new Error('Stripe returned an unexpected checkout address.');
      if(checkoutTab&&!checkoutTab.closed){checkoutTab.location.href=checkoutUrl.href;return data;}
      modal('Continue to secure payment',`<p>Your secure checkout is ready. Open Stripe in a new tab to complete payment.</p><a class="blue" style="display:inline-flex;align-items:center;justify-content:center;margin-top:14px;text-decoration:none" href="${esc2(checkoutUrl.href)}" target="_blank" rel="noopener noreferrer">CONTINUE TO STRIPE</a>`);
      return data;
    }catch(error){try{if(checkoutTab&&!checkoutTab.closed)checkoutTab.close()}catch{}throw error;}
  }
  async function verifyStripeCheckout(sessionId){
    if(!currentUser||!sessionId)return null;
    const {data,error}=await client.functions.invoke('stripe-payments',{body:{action:'verify_checkout',session_id:sessionId}});
    if(error){let message=error.message;try{const detail=await error.context?.json();message=detail?.error||message}catch{}throw new Error(message)}
    if(data?.error)throw new Error(data.error);
    return data;
  }
  async function loadTrips(){
    if(!currentUser)return {bookings:[],itineraries:[],requests:[]};
    const [b,i,r,w]=await Promise.all([
      client.from('bookings').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false}),
      client.from('itineraries').select('id,trip_request_id,itinerary_json,itinerary_summary,ai_explanation,review_status,created_at').eq('user_id',currentUser.id).order('created_at',{ascending:false}),
      client.from('trip_requests').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false}),
      client.from('wishlists').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false})
    ]);
    for(const x of [b,i,r,w])if(x.error)throw x.error;
    trips=(b.data||[]).map(x=>({id:x.id,booking_ref:x.booking_ref,...(x.details_json||{}),total:x.total_inr,created_at:x.created_at,status:(x.details_json||{}).status||'Confirmed'}));
    wishItems=(w.data||[]).map(x=>x.listing_json);
    wishlist=wishItems;
    const result={bookings:b.data||[],itineraries:i.data||[],requests:r.data||[]};
    window.dispatchEvent(new CustomEvent('supabase-trips',{detail:result}));
    return result;
  }
  async function saveWishlist(item){
    if(!currentUser){askLogin('Sign in to keep your wishlist with your account.');return false;}
    const listingKey=[item.name,item.category,item.to].join('|');
    if(wishItems.some(x=>[x.name,x.category,x.to].join('|')===listingKey))return false;
    const {error}=await client.from('wishlists').insert({user_id:currentUser.id,listing_key:listingKey,listing_json:item});if(error)throw error;await loadTrips();return true;
  }
  async function removeWishlist(item){if(!currentUser)return;const key=[item.name,item.category,item.to].join('|');const {error}=await client.from('wishlists').delete().eq('user_id',currentUser.id).eq('listing_key',key);if(error)throw error;await loadTrips()}
  async function removeWishlistAt(index){const item=wishItems[index];if(!item)return;try{await removeWishlist(item);showWishlist()}catch(err){toast(err.message||'Could not remove this saved item.')}}
  function showWishlist(){
    const cards=wishItems.map((item,index)=>{
      const image=item.img||item.image||item.photos?.[0]||'';
      const category=item.category||'Travel';
      const location=item.to||item.city||'';
      const price=Number(item.price||0);
      return `<article style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;background:#f5f8fc;border-radius:10px;padding:12px;margin:12px 0"><button type="button" aria-label="Open ${esc2(item.name||'saved listing')} details" onclick="window.tripBackend.openWishlistItem(${index})" style="display:flex;align-items:center;gap:14px;text-align:left;padding:0;background:transparent;color:inherit;min-width:0"><span style="display:block;flex:0 0 112px;width:112px;height:88px;border-radius:8px;overflow:hidden;background:linear-gradient(135deg,#d6e9f8,#f6d6b9)">${image?`<img src="${esc2(image)}" alt="${esc2(item.name||'Saved travel listing')}" loading="lazy" style="display:block;width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`:''}</span><span style="min-width:0"><strong style="display:block;font-size:16px;line-height:1.35;color:#233448">${esc2(item.name||'Saved listing')}</strong><small style="display:block;margin-top:6px;color:#65758a">${esc2(category)}${location?` · ${esc2(location)}`:''}${price?` · ${money(price)}`:''}</small><small style="display:block;margin-top:7px;color:#1686db;font-weight:700">VIEW DETAILS ↗</small></span></button><button type="button" class="text-btn" onclick="window.tripBackend.removeWishlistAt(${index})" aria-label="Remove ${esc2(item.name||'saved listing')} from wishlist">REMOVE</button></article>`;
    }).join('');
    modal('Your Wishlist',cards||'<p>Your wishlist is empty. Save a result to start.</p>');
  }
  function openWishlistItem(index){
    const item=wishItems[index];if(!item)return;
    const category=item.category||'Hotels';
    const destination=item.to||item.city||'';
    const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))&&String(value)>=new Date().toISOString().slice(0,10);
    const nextDay=()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+1);return d.toISOString().slice(0,10)};
    const startDate=validDate(item.date)?item.date:nextDay();
    let endDate=validDate(item.returnDate)?item.returnDate:(validDate(item.check_out)?item.check_out:'');
    if(!endDate||endDate<=startDate){const d=new Date(`${startDate}T00:00:00`);d.setDate(d.getDate()+2);endDate=d.toISOString().slice(0,10)}
    setCategory(category);
    state.from=item.from||state.from||'Delhi';state.to=destination;state.date=startDate;state.returnDate=endDate;
    state.adults=Math.max(1,Number(item.adults)||state.adults||1);state.children=Math.max(0,Number(item.children)||state.children||0);
    if(item.trip)state.trip=item.trip;if(item.cabin)state.cabin=item.cabin;if(item.fare)state.fare=item.fare;
    renderFields();
    const fromInput=document.getElementById('from'),toInput=document.getElementById('to'),depart=document.getElementById('depart'),ret=document.getElementById('return');
    if(fromInput)fromInput.value=state.from;if(toInput)toInput.value=destination;if(depart)depart.value=startDate;if(ret)ret.value=endDate;
    closeModal();
    search();
    const result=(state.results||[]).find(row=>row.name===item.name)||(item.name?(state.results||[]).find(row=>String(row.name||'').toLowerCase().includes(String(item.name).split(' · ')[0].toLowerCase())):null);
    if(!result){toast(`I couldn't reopen ${item.name||'this listing'} from the current sample inventory.`);return}
    if(typeof details==='function')details(result.id);
  }
  function listenReviews(){
    reviewChannel?.unsubscribe(); if(!currentUser)return;
    reviewChannel=client.channel('myra-review-'+currentUser.id).on('postgres_changes',{event:'*',schema:'public',table:'itineraries',filter:`user_id=eq.${currentUser.id}`},async payload=>{
      await loadTrips();document.getElementById('myra-panel')?.contentWindow?.postMessage({type:'myra-review-update',itinerary:payload.new},location.origin);
      if(window.__myTripsOpen)showTrips();
    }).subscribe();
  }
  window.tripBackend={configured:true,client,getUser:()=>currentUser,getProfile:()=>profile,googleSignIn:signInGoogle,requestCode,verifyCode,askLogin,invoke,startStripeCheckout,verifyStripeCheckout,loadTrips,saveWishlist,removeWishlist,removeWishlistAt,openWishlistItem,ensureProfile,async updateProfile(name,mobile){if(!currentUser)throw new Error('Sign in to edit your profile.');const {error}=await client.from('profiles').update({name,mobile,email:currentUser.email||''}).eq('id',currentUser.id);if(error)throw error;await refreshProfile();return profile;},async signOut(){await client.auth.signOut();closeModal()},saveLocale:async(country,currency)=>{if(!currentUser)return false;const {error}=await client.from('profiles').update({preferred_country:country,preferred_currency:currency}).eq('id',currentUser.id);if(error)throw error;await refreshProfile();return true;},getRecentRequest:async()=>{if(!currentUser)return null;const cutoff=new Date(Date.now()-86400000).toISOString();const {data}=await client.from('trip_requests').select('*').eq('user_id',currentUser.id).eq('status','in_progress').gte('updated_at',cutoff).order('updated_at',{ascending:false}).limit(5);return (data||[]).find(r=>!(r.destination&&r.start_date&&r.end_date&&Number(r.budget_inr)>0&&r.travellers_type&&r.interests&&r.pace))||null;}};
  window.login=async function(){
    if(!currentUser){askLogin();return;}
    const name=profile?.name||anonName()||'';const mobile=profile?.mobile||'';
    authFrame('Account settings', `<div class="myra-auth-kicker">YOUR TRIPASSISTANT ACCOUNT</div><h2>Account settings</h2><p class="myra-auth-intro">Update the details Myra uses to personalize your trip planning.</p><form id="accountSettingsForm" class="myra-auth-form"><label for="settingsName">Your name</label><input id="settingsName" required minlength="2" maxlength="80" autocomplete="name" value="${esc2(name)}"><label for="settingsEmail">Email address</label><input id="settingsEmail" type="email" value="${esc2(currentUser.email||'')}" disabled><label for="settingsMobile">Mobile number</label><input id="settingsMobile" type="tel" minlength="7" maxlength="20" autocomplete="tel" value="${esc2(mobile)}" placeholder="Optional — no SMS code"><button class="myra-auth-submit">Save account details</button></form><button class="myra-settings-secondary" type="button" onclick="locale()">Country &amp; currency</button><button class="myra-link-button myra-signout-button" type="button" onclick="window.tripBackend.signOut()">Sign out</button>`);
    document.getElementById('accountSettingsForm')?.addEventListener('submit',async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;button.textContent='Saving…';try{await window.tripBackend.updateProfile(document.getElementById('settingsName').value.trim(),document.getElementById('settingsMobile').value.trim());closeModal();toast('Your account details are saved.')}catch(err){button.disabled=false;button.textContent='Save account details';toast(err.message||'Could not save your settings.')}});
  };
  window.updateUser=function(){const el=document.getElementById('loginBtn');if(el)el.textContent=currentUser?'◉ Hi, '+(profile?.name||anonName()||'there').split(/\s+/)[0]+' ▾':'◉ Login or Create Account ▾'};
  window.showTrips=async function(){
    if(!currentUser){askLogin('Sign in to see trips and bookings saved to your account.');return;}
    window.__myTripsOpen=true;modal('My Trips','<p>Loading your saved trips…</p>');
    try{
      const data=await loadTrips();
      const showDate=value=>{if(!value)return '';const parsed=new Date(value);return Number.isNaN(parsed.getTime())?String(value):parsed.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});};
      const renderDays=plan=>(plan.days||[]).map(day=>'<li><b>Day '+esc2(day.day)+'</b> · '+esc2(day.stay||'Explore the destination')+'<br>'+((day.activities||[]).map(esc2).join(' · '))+(day.reasons?.length?'<br><small>'+day.reasons.map(esc2).join(' · ')+'</small>':'')+'</li>').join('');
      const plans=data.itineraries.map(it=>{
        const req=data.requests.find(r=>r.id===it.trip_request_id)||{},plan=it.itinerary_json||{};
        const why=it.review_status==='Approved'?'<div class="notice"><b>Why this plan</b><br>'+esc2(it.ai_explanation||'')+'</div>':it.review_status==='Rejected'?'':'<div class="notice"><b>Why this plan</b><br>Being reviewed by our team</div>';
        return '<article class="summary"><h3>'+esc2(req.destination||'Saved trip')+'</h3><p>'+esc2(showDate(req.start_date))+' – '+esc2(showDate(req.end_date))+' · Budget ₹'+Number(req.budget_inr||0).toLocaleString('en-IN')+'</p><p>'+esc2(it.itinerary_summary||'')+'</p><ul>'+renderDays(plan)+'</ul><b>Estimated total: ₹'+Number(plan.total_cost_inr||0).toLocaleString('en-IN')+'</b>'+why+'</article>';
      }).join('');
      const seenBookingSignatures=new Set();const uniqueBookings=data.bookings.filter(b=>{const key=bookingSignature(b.details_json||{},b.total_inr);if(seenBookingSignatures.has(key))return false;seenBookingSignatures.add(key);return true});const bookings=uniqueBookings.map(b=>{
        const d=b.details_json||{},related=data.itineraries.find(it=>it.id===b.itinerary_id),plan=related?.itinerary_json||{};
        const req=related?data.requests.find(r=>r.id===related.trip_request_id)||{}:{};
        const title=d.service||d.hotel||d.name||d.destination||d.to||'Travel booking';
        const paidCurrency=String(d.currency||'INR').toUpperCase();
        const zeroDecimal=['JPY','KRW'].includes(paidCurrency);
        const minorUnits=Number(d.stripe_amount_minor);
        const factor=Number(expandedCurrencies?.[paidCurrency]?.factor)||1;
        const paidAmount=Number.isFinite(minorUnits)&&minorUnits>0?minorUnits/(zeroDecimal?1:100):Number(b.total_inr||0)*factor;
        const paidTotal=new Intl.NumberFormat(paidCurrency==='INR'?'en-IN':'en-US',{style:'currency',currency:paidCurrency,minimumFractionDigits:zeroDecimal||paidCurrency==='INR'?0:2,maximumFractionDigits:zeroDecimal||paidCurrency==='INR'?0:2}).format(paidAmount);
        const route=[d.from,d.to].filter(Boolean).map(esc2).join(' → ');
        const destination=d.destination||(!route?d.to:'');
        const begin=d.check_in||d.date||d.start_date,finish=d.check_out||d.return_date||d.returnDate||d.end_date;
        const dateLine=[showDate(begin),showDate(finish)].filter(Boolean).join(' – ');
        const party=d.travellers||d.traveller_count||d.guests||d.passengers;
        const details=[
          ['Booking reference',b.booking_ref||'—'],
          ['Destination / route',destination?esc2(destination):(route||'—')],
          ['Travel dates',dateLine||'—'],
          ['Category',d.category||'—'],
          ['Travellers',party?(Array.isArray(party)?party.length+' traveller(s)':esc2(party)+' traveller(s)'):'—'],
          ['Lead traveller',d.name||d.guest||'—'],
          ['Payment method',d.payment_provider==='Stripe'?'Stripe Checkout':d.payment_method||'—'],
          ['Payment currency',paidCurrency],
          ['Payment status',d.payment_status==='paid'?'Paid':d.payment_status==='pending'?'Pending':d.payment_status||'—']
        ];
        const detailRows=details.map(item=>'<div style="display:flex;justify-content:space-between;gap:16px;padding:7px 0;border-bottom:1px solid #e8edf3"><span style="color:#68778a">'+item[0]+'</span><b style="text-align:right">'+(item[1]==='—'?'—':esc2(item[1]))+'</b></div>').join('');
        const status=d.status||'Confirmed';
        const tripPlan=related?'<details style="margin-top:14px"><summary style="cursor:pointer;color:#0878d1;font-weight:700">View linked itinerary</summary><p>'+esc2(related.itinerary_summary||req.destination||'')+'</p><ul>'+renderDays(plan)+'</ul></details>':'';
        return '<article class="summary" style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap"><div><span style="display:inline-block;color:#137a52;background:#e8f7ef;border-radius:20px;padding:5px 10px;font-size:11px;font-weight:700;letter-spacing:.04em">'+(d.payment_status==='paid'?'PAYMENT CONFIRMED · STRIPE':d.payment_status==='pending'?'PAYMENT PENDING · STRIPE':'BOOKING')+'</span><h3 style="margin:10px 0 4px">'+esc2(title)+'</h3><p style="margin:0;color:#667085">'+(route||esc2(destination||''))+(dateLine?' · '+esc2(dateLine):'')+'</p></div><div style="text-align:right"><b style="color:#137a52">'+esc2(status)+'</b><div style="font-size:18px;font-weight:800;margin-top:8px">'+esc2(paidTotal)+'</div><small>Booking total</small></div></div><div style="margin-top:14px">'+detailRows+'</div>'+tripPlan+'</article>';
      }).join('');
      const cutoff=Date.now()-86400000,partial=data.requests.find(r=>r.status==='in_progress'&&Date.parse(r.updated_at||r.created_at)>=cutoff);
      const content=(partial?'<div class="notice">Continue your '+esc2(partial.destination||'')+' plan? <button class="text-btn" onclick="document.getElementById(\'myra-launcher\').click()">CONTINUE WITH MYRA</button></div>':'')+
        (bookings?'<h3 style="margin:18px 0 10px">Booked trips</h3>'+bookings:'')+
        (plans?'<h3 style="margin:22px 0 10px">Saved itineraries</h3>'+plans:'')+
        (bookings||plans?'':'<p>No booked trips or saved plans yet. Start planning with Myra or book a demo option.</p>');
      modal('My Trips',content);
    }catch(err){modal('My Trips','<p>Could not load your trips. '+esc2(err.message)+'</p>')}
  };
  window.cancelTrip=async function(i){const b=trips[i];if(!b)return;modal('Cancel Booking',`<p>Cancel ${esc2(b.service||'this booking')}?</p><div class="notice">This demo does not process refunds or contact a travel provider.</div><button class="blue" onclick="window.tripBackend.cancelBooking(${JSON.stringify(b.id)})">CONFIRM CANCELLATION</button>`)};
  window.tripBackend.cancelBooking=async id=>{const {data,error}=await client.from('bookings').select('details_json').eq('id',id).eq('user_id',currentUser.id).single();if(error)throw error;const {error:e}=await client.from('bookings').update({details_json:{...data.details_json,status:'Cancelled'}}).eq('id',id).eq('user_id',currentUser.id);if(e)throw e;await loadTrips();showTrips()};
  window.confirmBooking=async function(){const p=state?.pending;if(!p)return;try{if(!currentUser){askLogin('Sign in before paying for this booking.');return;}const category=p.s?.category||'',isStay=['Hotels','Villas & Homestays'].includes(category),details={service:p.r?.name,category,destination:p.s?.to,from:isStay?undefined:p.s?.from,to:p.s?.to,date:p.s?.date,check_in:isStay?p.s?.date:undefined,check_out:isStay?p.s?.returnDate:undefined,nights:isStay?Math.max(1,Math.round((new Date(p.s?.returnDate)-new Date(p.s?.date))/86400000)):undefined,travellers:p.travellers||((p.s?.adults||1)+(p.s?.children||0)),name:profile?.name||p.name||'',email:currentUser.email||'',seats:p.seats?.map((ss,i)=>'Segment '+(i+1)+': '+(ss.join(', ')||'Auto-assigned')).join(' | '),status:'Payment pending'};await startStripeCheckout(details,p.total,null,p.bookingAttemptId)}catch(err){if(err.message!=='Sign-in required')toast(err.message||'Could not open Stripe Checkout.')}};
  const oldSaveItem=window.saveItem;
  window.saveItem=async function(id){const r=state.results[id],item={...r,category:state.search.category,to:state.search.to,from:state.search.from,date:state.search.date,returnDate:state.search.returnDate,adults:state.search.adults,children:state.search.children,trip:state.search.trip,cabin:state.search.cabin,fare:state.search.fare};try{const added=await saveWishlist(item);toast(added?'Saved to your account wishlist.':'Already in your wishlist.')}catch(err){toast(err.message)}};
  window.showWishlist=showWishlist;
  window.tripBackend.savePlan=async(trip,plan,tripRequestId,itineraryId)=>invoke('save_plan',{trip,plan,trip_request_id:tripRequestId,itinerary_id:itineraryId});
  window.saveLocalePreference=async function(){
    const countryName=document.getElementById('localeCountry')?.value||'India';
    const code=document.getElementById('localeCurrency')?.value||'INR';
    const entry=expandedCountries.find(item=>item[0]===countryName)||expandedCountries[0];
    const currency=expandedCurrencies[code]||expandedCurrencies.INR;
    activeLocale={country:countryName,flag:entry[1],code,...currency};
    try{localStorage.setItem('trip-assistant-locale',JSON.stringify({country:countryName,code}));}catch{}
    // Apply the choice immediately so a profile/network error cannot leave the
    // old currency visible. Authenticated users also save it to their profile.
    closeModal();
    renderResults();
    paintLocale();
    if(currentUser){
      try{
        await window.tripBackend.saveLocale(countryName,code);
        toast(`Prices now display in ${code}; preference saved to your profile.`);
      }catch(err){
        console.warn('Currency preference could not be saved:',err);
        toast(`Prices now display in ${code}; profile sync failed, but the selection is active for this session.`);
      }
      return;
    }
    toast(`Prices now display in ${code} for this session.`);
  };
  window.tripBackend.listenReviews=listenReviews;
  let stripeReturnHandled='';
  async function handleStripeReturn(){
    const params=new URLSearchParams(location.search),status=params.get('stripe_checkout'),sessionId=params.get('session_id');
    if(status==='cancelled'){history.replaceState({},'',location.pathname+location.hash);toast('Checkout cancelled. No payment was taken.');return;}
    if(status!=='success'||!sessionId||!currentUser||stripeReturnHandled===sessionId)return;
    stripeReturnHandled=sessionId;
    try{const result=await verifyStripeCheckout(sessionId);await loadTrips();if(result?.paid)toast('Payment confirmed by Stripe. Booking '+result.booking_ref+' is in My Trips.');else toast(result?.message||'Stripe is still confirming this payment.')}
    catch(error){console.error('Stripe return verification failed:',error);toast(error.message||'We could not verify this payment yet. Check My Trips in a moment.')}
    finally{history.replaceState({},'',location.pathname+location.hash)}
  }
  client.auth.onAuthStateChange(async(_event,session)=>{
    if(_event==='SIGNED_IN')closeModal();
    currentUser=session?.user||null;
    try{await refreshProfile();if(currentUser){listenReviews();await loadTrips();if(_event==='SIGNED_IN')await ensureProfile();if(pendingHotelBooking){const pending=pendingHotelBooking;pendingHotelBooking=null;try{await startStripeCheckout(pending.details,pending.total_inr,pending.itinerary_id||null,pending.idempotency_key);pending.source?.postMessage({type:'stripe-checkout-started'},location.origin)}catch(err){console.error(err);toast(err.message||'Could not start Stripe Checkout.')}}await handleStripeReturn()}else{reviewChannel?.unsubscribe();trips=[];wishlist=[];wishItems=[];}}
    catch(err){console.error(err);toast('Account data could not be loaded. Check your Supabase setup.')}
    if(typeof updateUser==='function')updateUser();
  });
  client.auth.getSession().then(async({data})=>{currentUser=data.session?.user||null;if(currentUser){await refreshProfile();listenReviews();await loadTrips();if(!profile?.name||!profile?.mobile)await ensureProfile();await handleStripeReturn()}else if(new URLSearchParams(location.search).get('stripe_checkout')==='cancelled'){await handleStripeReturn()}updateUser()}).catch(console.error);
  document.getElementById('loginBtn')?.addEventListener('click',e=>{e.preventDefault();window.login()});
  function sendMyraBootstrap(target=document.getElementById('myra-panel')?.contentWindow){
    if(!target)return;
    target.postMessage({type:'myra-auth',profile:profile?{name:profile.name||anonName(),email:profile.email||currentUser?.email,authenticated:!!currentUser}:{name:'',authenticated:false}},location.origin);
    target.postMessage({type:'myra-context',context:{from:state.from,to:state.to,category:state.category,start_date:state.date,end_date:state.returnDate,hasSearched:!!state.search}},location.origin);
  }
  window.addEventListener('message',async e=>{
    if(e.origin!==location.origin)return;
    const d=e.data||{};
    if(d.type==='myra-ready')sendMyraBootstrap(e.source);

    if(d.type==='myra-booking'){
      if(!currentUser){pendingHotelBooking={details:d.details,total_inr:d.total_inr,itinerary_id:d.itinerary_id,idempotency_key:d.idempotency_key,source:e.source};askLogin('Sign in before paying for this hotel booking.');return;}
      try{await startStripeCheckout(d.details,d.total_inr,d.itinerary_id||null,d.idempotency_key);e.source?.postMessage({type:'stripe-checkout-started'},location.origin)}
      catch(err){if(err.message!=='Sign-in required')toast(err.message||'Could not start Stripe Checkout.')}
    }
  });
})();
