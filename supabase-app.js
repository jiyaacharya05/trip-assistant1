/* Supabase integration for the existing static travel-booking-style page. */
(() => {
  const configured = window.SUPABASE_URL?.startsWith('https://') && !window.SUPABASE_URL.includes('YOUR_PROJECT_REF') && window.SUPABASE_ANON_KEY && !window.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
  const status = document.getElementById('supabaseSetupNotice');
  if (!configured || !window.supabase?.createClient) {
    if (status) status.hidden = false;
    window.tripBackend = { configured:false, getUser:()=>null, getProfile:()=>null, profile:null, async invoke(){throw new Error('Supabase is not configured yet. Set the project URL and anon key in supabase-config.js.')} };
    window.login=()=>{location.href='login.html?next='+encodeURIComponent(location.pathname+location.search+location.hash)};
    window.showTrips=()=>modal('My Trips','<p>Connect Supabase to save and load your trips.</p>');
    window.confirmBooking=()=>toast('Connect Supabase before saving a booking.');
    window.saveItem=()=>toast('Connect Supabase before saving wishlist items.');
    window.showWishlist=()=>modal('Your Wishlist','<p>Connect Supabase to save wishlist items to your account.</p>');
    window.updateUser=()=>{const el=document.getElementById('loginBtn');if(el)el.textContent='◉ Login or Create Account ▾'};
    return;
  }
  const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, { auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true} });
  let currentUser=null, currentSession=null, profile=null, reviewChannel=null, wishItems=[],pendingHotelBooking=null;
  const anonName=()=>currentUser?.user_metadata?.full_name||currentUser?.user_metadata?.name||'';
  /* Display name: Supabase profile name, then Google metadata, then the email prefix. */
  const bestName=()=>[profile?.name,currentUser?.user_metadata?.full_name,currentUser?.user_metadata?.name,(currentUser?.email||'').split('@')[0]].map(v=>String(v||'').trim()).find(Boolean)||'';
  const loginUrl=()=>'login.html?next='+encodeURIComponent(location.pathname+location.search+location.hash);
  const esc2=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const configError=()=>!configured;
  async function refreshProfile(){
    if(!currentUser){ profile=null; window.dispatchEvent(new CustomEvent('supabase-profile',{detail:{user:null,profile:null}})); return null; }
    const {data,error}=await client.from('profiles').select('*').eq('id',currentUser.id).maybeSingle();
    if(error) throw error;
    profile=data||{id:currentUser.id,email:currentUser.email||'',name:'',mobile:''};
    if(!String(profile.name||'').trim()){
      const name=bestName();
      if(name){const row={id:currentUser.id,name};if(currentUser.email)row.email=currentUser.email;
        const {error:upsertError}=await client.from('profiles').upsert(row,{onConflict:'id'});
        if(upsertError)console.warn('Profile name could not be saved:',upsertError.message);else profile={...profile,name};}
    }
    if(profile.preferred_currency&&typeof activeLocale==='object'){const option=expandedCurrencies?.[profile.preferred_currency];if(option)activeLocale={...activeLocale,...option,code:profile.preferred_currency,country:profile.preferred_country||activeLocale.country};}
    window.dispatchEvent(new CustomEvent('supabase-profile',{detail:{user:currentUser,profile}}));
    const panel=document.getElementById('myra-panel');
    panel?.contentWindow?.postMessage({type:'myra-auth',profile:{name:bestName(),email:profile.email||currentUser.email,authenticated:true}},location.origin);
    return profile;
  }
  function authFrame(title, content){
    modal(title, `<div class="myra-auth-grid"><aside class="myra-auth-visual" aria-label="Sunset over the ocean"><img class="myra-auth-photo" src="assets/login-ocean-sunset.jpg" alt=""><div class="myra-auth-brand">Trip Assistant</div><div class="myra-auth-caption"><span>TRAVEL, YOUR WAY</span><h2>Find your<br>kind of getaway.</h2><p>Thoughtful trip ideas, saved in one place.</p></div></aside><section class="myra-auth-content">${content}</section></div>`);
    document.querySelector('#modalRoot .modal')?.classList.add('myra-auth-modal');
  }
  function askLogin(message='Sign in to save trips and bookings.'){
    authFrame('Login or Create Account', `<div class="myra-auth-kicker">WELCOME TO TRIP ASSISTANT</div><h2>Let’s get you going.</h2><p class="myra-auth-intro">Sign in or create an account to keep your trips together.</p>${message?`<p class="myra-auth-message">${esc2(message)}</p>`:''}<button class="myra-google-button" type="button" onclick="window.tripBackend.googleSignIn()"><span class="myra-google-g" aria-hidden="true">G</span><span>Continue with Google</span></button><div class="myra-auth-divider"><span>OR CONTINUE WITH EMAIL</span></div><form id="otpRequestForm" class="myra-auth-form"><label for="authEmail">Email address</label><input id="authEmail" required type="email" autocomplete="email" placeholder="you@example.com"><button class="myra-auth-submit">Send me a 6-digit code</button></form><p class="myra-auth-footnote">New to Trip Assistant? Your account is created when you verify your email. No password or SMS needed.</p><p class="myra-auth-terms">By continuing, you agree to use Trip Assistant. Myra helps with your travel planning.</p>`);
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
    const suggested=esc2(bestName());
    modal('Complete your profile',`<p>Tell Myra what to call you. Your mobile number is saved only as a profile field; no SMS code is sent.</p><form id="profileForm"><label>Your name</label><input id="profileName" required minlength="2" maxlength="80" value="${suggested}" placeholder="Your name"><label>Mobile number</label><input id="profileMobile" required type="tel" minlength="7" maxlength="20" autocomplete="tel" placeholder="Mobile number"><button class="blue">SAVE PROFILE</button></form>`);
    document.getElementById('profileForm')?.addEventListener('submit',async e=>{e.preventDefault();const name=document.getElementById('profileName').value.trim(),mobile=document.getElementById('profileMobile').value.trim();try{const {error}=await client.from('profiles').upsert({id:currentUser.id,name,email:currentUser.email||'',mobile},{onConflict:'id'});if(error)throw error;await refreshProfile();closeModal();toast(`Welcome, ${name.split(/\s+/)[0]}!`);await loadTrips();}catch(err){toast(err.message||'Could not save profile.')}});
    return p;
  }
  async function signInGoogle(){const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.href}});if(error)toast(error.message)}
  async function requestCode(email){const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:true}});if(error)throw error;return true}
  /* Calls the myra-chat Edge Function. Failures are thrown as MyraBackendError
     with a plain-language message and a code, so the chat never shows a
     made-up answer when the backend fails. */
  class MyraBackendError extends Error{constructor(message,code,status){super(message);this.name='MyraBackendError';this.code=code;this.status=status}}
  /* Direct fetch with a 30-second timeout. It does not wait on the Supabase
     auth lock, so a stuck session refresh can never freeze Myra. */
  async function invoke(action,payload={}){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),30000);
    const headers={'Content-Type':'application/json',apikey:window.SUPABASE_ANON_KEY};
    if(currentSession?.access_token)headers.Authorization='Bearer '+currentSession.access_token;
    let res;
    try{res=await fetch(window.SUPABASE_URL.replace(/\/$/,'')+'/functions/v1/myra-chat',{method:'POST',headers,body:JSON.stringify({action,...payload}),signal:controller.signal})}
    catch(err){
      if(err?.name==='AbortError')throw new MyraBackendError('Myra’s server did not answer within 30 seconds. Please try again.','timeout');
      throw new MyraBackendError('Myra could not reach the server. Check your internet connection. If this keeps happening, the myra-chat Edge Function may not be deployed in Supabase.','network');
    }
    finally{clearTimeout(timer)}
    let body=null;try{body=await res.json()}catch{}
    if(!res.ok){
      if(res.status===404)throw new MyraBackendError('Myra’s backend (the myra-chat Edge Function) is not deployed in Supabase yet.','not_deployed',404);
      if(res.status===401||res.status===403)throw new MyraBackendError(body?.error||'Supabase rejected the request. Turn OFF “Verify JWT” for the myra-chat Edge Function, then try again.','auth',res.status);
      throw new MyraBackendError(body?.error||body?.message||`Myra’s backend returned an error (${res.status}). Please try again.`,body?.code||'server',res.status);
    }
    if(!body)throw new MyraBackendError('Myra’s backend sent an empty reply. Please try again.','server',res.status);
    if(body.fallback)throw new MyraBackendError('Myra’s AI service did not respond. Please try again.','ai_unavailable',200);
    if(body.ok===false||body.error)throw new MyraBackendError(body.error||'The request could not be completed.',body.code||'server',200);
    return body;
  }

  async function saveBooking(details,total,itineraryId=null){
    if(!currentUser){askLogin('Please sign in before confirming a booking.');throw new Error('Sign-in required');}
    const data=await invoke('create_booking',{details,total_inr:Math.max(0,Math.round(Number(total)||0)),itinerary_id:itineraryId});
    await loadTrips();return data.booking;
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
  function listenReviews(){
    reviewChannel?.unsubscribe(); if(!currentUser)return;
    reviewChannel=client.channel('myra-review-'+currentUser.id).on('postgres_changes',{event:'*',schema:'public',table:'itineraries',filter:`user_id=eq.${currentUser.id}`},async payload=>{
      await loadTrips();document.getElementById('myra-panel')?.contentWindow?.postMessage({type:'myra-review-update',itinerary:payload.new},location.origin);
      if(window.__myTripsOpen)showTrips();
    }).subscribe();
  }
  window.tripBackend={configured:true,client,getUser:()=>currentUser,getProfile:()=>profile,googleSignIn:signInGoogle,requestCode,verifyCode,askLogin,invoke,saveBooking,loadTrips,saveWishlist,removeWishlist,ensureProfile,async updateProfile(name,mobile){if(!currentUser)throw new Error('Sign in to edit your profile.');name=String(name||'').trim();if(!name)throw new Error('Please enter your name.');const changes={name,mobile:String(mobile||'').trim()};if(currentUser.email)changes.email=currentUser.email;const {error}=await client.from('profiles').update(changes).eq('id',currentUser.id);if(error)throw error;await refreshProfile();return profile;},async signOut(){await client.auth.signOut();closeModal()},saveLocale:async(country,currency)=>{if(!currentUser)return false;const {error}=await client.from('profiles').update({preferred_country:country,preferred_currency:currency}).eq('id',currentUser.id);if(error)throw error;await refreshProfile();return true;},getPastPreferences:async()=>{if(!currentUser)return null;const {data:reqs}=await client.from('trip_requests').select('id,destination,interests,created_at').eq('user_id',currentUser.id).eq('status','complete').order('created_at',{ascending:false}).limit(5);if(!reqs?.length)return null;const {data:its}=await client.from('itineraries').select('trip_request_id,itinerary_json').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(5);for(const r of reqs){const it=its?.find(x=>x.trip_request_id===r.id);const text=(r.interests+' '+JSON.stringify(it?.itinerary_json||{})).toLowerCase();if(/offbeat|less-crowded|quiet|not crowded|hidden gem/.test(text))return `Last time you liked offbeat places around ${r.destination}. Want something similar?`; }return null;},getRecentRequest:async()=>{if(!currentUser)return null;const cutoff=new Date(Date.now()-86400000).toISOString();const {data}=await client.from('trip_requests').select('*').eq('user_id',currentUser.id).eq('status','in_progress').gte('updated_at',cutoff).order('updated_at',{ascending:false}).limit(1).maybeSingle();return data||null;}};
  window.login=async function(){
    if(!currentUser){location.href=loginUrl();return;}
    const name=bestName();const mobile=profile?.mobile||'';
    authFrame('Account settings', `<div class="myra-auth-kicker">YOUR TRIPASSISTANT ACCOUNT</div><h2>Account settings</h2><p class="myra-auth-intro">Update the details Myra uses to personalize your trip planning.</p><form id="accountSettingsForm" class="myra-auth-form"><label for="settingsName">Your name</label><input id="settingsName" required minlength="2" maxlength="80" autocomplete="name" value="${esc2(name)}"><label for="settingsEmail">Email address</label><input id="settingsEmail" type="email" value="${esc2(currentUser.email||'')}" disabled><label for="settingsMobile">Mobile number</label><input id="settingsMobile" type="tel" minlength="7" maxlength="20" autocomplete="tel" value="${esc2(mobile)}" placeholder="Optional — no SMS code"><button class="myra-auth-submit">Save account details</button></form><button class="myra-settings-secondary" type="button" onclick="locale()">Country &amp; currency</button><button class="myra-link-button myra-signout-button" type="button" onclick="window.tripBackend.signOut()">Sign out</button>`);
    document.getElementById('accountSettingsForm')?.addEventListener('submit',async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;button.textContent='Saving…';try{await window.tripBackend.updateProfile(document.getElementById('settingsName').value.trim(),document.getElementById('settingsMobile').value.trim());closeModal();toast('Your account details are saved.')}catch(err){button.disabled=false;button.textContent='Save account details';toast(err.message||'Could not save your settings.')}});
  };
  window.updateUser=function(){const el=document.getElementById('loginBtn');if(el)el.textContent=currentUser?'◉ Hi, '+(bestName()||'there').split(/\s+/)[0]+' ▾':'◉ Login or Create Account ▾'};
  window.showTrips=async function(){
    if(!currentUser){askLogin('Sign in to see trips and bookings saved to your account.');return;}
    window.__myTripsOpen=true;modal('My Trips','<p>Loading your saved trips…</p>');
    try{const data=await loadTrips();const plans=data.itineraries.map(it=>{const req=data.requests.find(r=>r.id===it.trip_request_id)||{},plan=it.itinerary_json||{};const days=(plan.days||[]).map(d=>`<li><b>Day ${d.day}</b> · ${esc2(d.stay)}<br>${(d.activities||[]).map(esc2).join(' · ')}<br><small>${(d.reasons||[]).map(esc2).join(' · ')}</small></li>`).join('');const why=it.review_status==='Approved'?`<div class="notice"><b>Why this plan</b><br>${esc2(it.ai_explanation||'')}</div>`:it.review_status==='Rejected'?'':`<div class="notice"><b>Why this plan</b><br>Being reviewed by our team</div>`;return `<div class="summary"><h3>${esc2(req.destination||'Saved trip')}</h3><p>${esc2(req.start_date||'')} – ${esc2(req.end_date||'')} · Budget ₹${Number(req.budget_inr||0).toLocaleString('en-IN')}</p><p>${esc2(it.itinerary_summary)}</p><ul>${days}</ul><b>Total: ₹${Number(plan.total_cost_inr||0).toLocaleString('en-IN')}</b>${why}</div>`}).join('');const bookings=data.bookings.map(b=>{const d=b.details_json||{};return `<div class="summary"><h3>${esc2(d.service||d.hotel||d.name||'Travel booking')}</h3><p>${esc2(d.from||'')} ${d.to?'→ '+esc2(d.to):''} · ${esc2(d.date||'')}</p><p>${esc2(b.booking_ref)} · ₹${Number(b.total_inr).toLocaleString('en-IN')}</p><b>${esc2(d.status||'Confirmed')}</b></div>`}).join('');const cutoff=Date.now()-86400000;const partial=data.requests.find(r=>r.status==='in_progress'&&Date.parse(r.updated_at||r.created_at)>=cutoff);modal('My Trips',`${partial?`<div class="notice">Continue your ${esc2(partial.destination)} plan? <button class="text-btn" onclick="document.getElementById('myra-launcher').click()">CONTINUE WITH MYRA</button></div>`:''}${plans}${bookings}${plans||bookings?'':'<p>No saved trips yet. Start planning with Myra or book a demo option.</p>'}`)}catch(err){modal('My Trips',`<p>Could not load your trips. ${esc2(err.message)}</p>`)}
  };
  window.cancelTrip=async function(i){const b=trips[i];if(!b)return;modal('Cancel Booking',`<p>Cancel ${esc2(b.service||'this booking')}?</p><div class="notice">This demo does not process refunds or contact a travel provider.</div><button class="blue" onclick="window.tripBackend.cancelBooking(${JSON.stringify(b.id)})">CONFIRM CANCELLATION</button>`)};
  window.tripBackend.cancelBooking=async id=>{const {data,error}=await client.from('bookings').select('details_json').eq('id',id).eq('user_id',currentUser.id).single();if(error)throw error;const {error:e}=await client.from('bookings').update({details_json:{...data.details_json,status:'Cancelled'}}).eq('id',id).eq('user_id',currentUser.id);if(e)throw e;await loadTrips();showTrips()};
  const originalConfirm = window.confirmBooking;
  window.confirmBooking=async function(){const p=state?.pending;if(!p)return;try{if(!currentUser){askLogin('Sign in to save and confirm this booking.');return;}const seats=p.seats?.map((ss,i)=>'Segment '+(i+1)+': '+(ss.join(', ')||'Auto-assigned (demo)')).join(' | ');const details={service:p.r?.name,category:p.s?.category,from:p.s?.from,to:p.s?.to,date:p.s?.date,total:p.total,status:'Confirmed',name:profile?.name||'',email:currentUser.email||'',seats};const b=await saveBooking(details,p.total);modal('✓ Booking Saved',`<div class="summary"><h3>${esc2(b.booking_ref)}</h3><p>${esc2(details.service)} · ${esc2(details.to)}</p><p>${esc2(details.date)} · ₹${Number(p.total).toLocaleString('en-IN')}</p><p>Saved to your Supabase account.</p></div><button class="text-btn" onclick="showTrips()">MY TRIPS</button>`);state.pending=null;}catch(err){if(err.message!=='Sign-in required')toast(err.message||'Could not save booking.')}};
  const oldSaveItem=window.saveItem;
  window.saveItem=async function(id){const r=state.results[id],item={...r,category:state.search.category,to:state.search.to,from:state.search.from,date:state.search.date};try{const added=await saveWishlist(item);toast(added?'Saved to your account wishlist.':'Already in your wishlist.')}catch(err){toast(err.message)}};
  window.showWishlist=function(){modal('Your Wishlist',wishItems.length?wishItems.map((r,i)=>`<div class="summary"><h3>${esc2(r.name)}</h3><p>${esc2(r.category)} · ${esc2(r.to)} · ₹${Number(r.price||0).toLocaleString('en-IN')}</p><button class="text-btn" onclick="window.tripBackend.removeWishlist(${JSON.stringify(r)}).then(showWishlist)">REMOVE</button><button class="text-btn" onclick="closeModal();setCategory('${esc2(r.category)}');state.to=${JSON.stringify(r.to)};renderFields();search()">SEARCH AGAIN</button></div>`).join(''):'<p>Your wishlist is empty. Save a result to start planning.</p>')};
  window.tripBackend.savePlan=async(trip,plan,tripRequestId,itineraryId)=>invoke('save_plan',{trip,plan,trip_request_id:tripRequestId,itinerary_id:itineraryId});
  window.saveLocalePreference=async function(){
    const countryName=document.getElementById('localeCountry')?.value||'India';
    const code=document.getElementById('localeCurrency')?.value||'INR';
    const entry=expandedCountries.find(item=>item[0]===countryName)||expandedCountries[0];
    const currency=expandedCurrencies[code]||expandedCurrencies.INR;
    activeLocale={country:countryName,flag:entry[1],code,...currency};
    try{if(currentUser)await window.tripBackend.saveLocale(countryName,code);closeModal();renderResults();toast(`Prices now display in ${code}.`)}
    catch(err){toast(err.message||'Could not save your currency preference.')}};
  window.tripBackend.listenReviews=listenReviews;
  client.auth.onAuthStateChange((_event,session)=>{
    currentSession=session||null;currentUser=session?.user||null;
    // Run Supabase calls after the auth callback returns (avoids the supabase-js auth-lock deadlock).
    setTimeout(()=>onAuthChange(_event),0);
  });
  async function onAuthChange(_event){
    try{await refreshProfile();if(currentUser){listenReviews();await loadTrips();if(_event==='SIGNED_IN')await ensureProfile();if(pendingHotelBooking){const pending=pendingHotelBooking;pendingHotelBooking=null;try{const booking=await saveBooking(pending.details,pending.total_inr,pending.itinerary_id||null);pending.source?.postMessage({type:'hotel-booking-saved',booking_ref:booking.booking_ref},location.origin);toast('Hotel booking saved to My Trips.')}catch(err){console.error(err);toast('Could not save the hotel booking.')}}}else{reviewChannel?.unsubscribe();trips=[];wishlist=[];wishItems=[];}}
    catch(err){console.error(err);toast('Account data could not be loaded. Check your Supabase setup.')}
    if(typeof updateUser==='function')updateUser();
  }
  client.auth.getSession().then(async({data})=>{currentSession=data.session||null;currentUser=data.session?.user||null;if(currentUser){await refreshProfile();listenReviews();await loadTrips();if(!profile?.name||!profile?.mobile)await ensureProfile()}updateUser()}).catch(console.error);
  document.getElementById('loginBtn')?.addEventListener('click',e=>{e.preventDefault();window.login()});
  function sendMyraBootstrap(target=document.getElementById('myra-panel')?.contentWindow){
    if(!target)return;
    target.postMessage({type:'myra-auth',profile:profile?{name:bestName(),email:profile.email||currentUser?.email,authenticated:!!currentUser}:{name:'',authenticated:false}},location.origin);
    target.postMessage({type:'myra-context',context:{from:state.from,to:state.to,category:state.category,start_date:state.date,end_date:state.returnDate,hasSearched:!!state.search}},location.origin);
  }
  window.addEventListener('message',async e=>{
    if(e.origin!==location.origin)return;
    const d=e.data||{};
    if(d.type==='myra-ready')sendMyraBootstrap(e.source);

    if(d.type==='myra-booking'){
      if(!currentUser){pendingHotelBooking={details:d.details,total_inr:d.total_inr,itinerary_id:d.itinerary_id,source:e.source};askLogin('Sign in before saving this hotel booking.');return;}
      try{const booking=await saveBooking(d.details,d.total_inr,d.itinerary_id||null);e.source?.postMessage({type:'hotel-booking-saved',booking_ref:booking.booking_ref},location.origin);toast('Booking saved to your account.')}catch(err){if(err.message!=='Sign-in required')toast(err.message)}
    }
  });
})();
