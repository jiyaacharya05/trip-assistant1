/* Trip Assistant photo assignment.
   Gives every hotel, villa, holiday package, tour and homepage card its own photos from
   assets/photo-pool.js (Pexels, free to use). Assignment is deterministic and no photo is
   used twice anywhere on the site: homepage, result cards, detail galleries or "view all". */
(function () {
  'use strict';
  var P = window.TRIP_PHOTO_POOL;
  if (!P) return;
  var G = P.groups, C = P.cities;
  var url = function (id) { return 'https://images.pexels.com/photos/' + id + '/pexels-photo-' + id + '.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800&fit=crop'; };
  var used = new Set();
  // Take n unused IDs, trying each list in order.
  function take(lists, n) {
    var out = [];
    for (var l = 0; l < lists.length && out.length < n; l++) {
      var list = lists[l] || [];
      for (var i = 0; i < list.length && out.length < n; i++) {
        if (!used.has(list[i])) { used.add(list[i]); out.push(list[i]); }
      }
    }
    return out;
  }
  var ALIASES = { bangalore: 'bengaluru', bengaluru: 'bengaluru', bombay: 'mumbai', 'new delhi': 'delhi', madras: 'chennai', calcutta: 'kolkata', kodagu: 'coorg', madikeri: 'coorg', udhagamandalam: 'ooty', ootacamund: 'ooty', cochin: 'kochi', 'fort kochi': 'kochi', alleppey: 'kerala', munnar: 'kerala', kullu: 'manali' };
  function cityKey(text) {
    var t = String(text || '').toLowerCase();
    var keys = Object.keys(ALIASES).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < keys.length; i++) if (t.indexOf(keys[i]) !== -1) return ALIASES[keys[i]];
    var cities = Object.keys(C);
    for (var j = 0; j < cities.length; j++) if (t.indexOf(cities[j]) !== -1) return cities[j];
    return '';
  }

  /* 1. Homepage cards (matched by their alt text). */
  var HOME_RULES = [
    [/flights offer/i, ['FLIGHT']], [/hotels offer/i, ['EXT']], [/holidays offer/i, ['POOL']], [/bank offers offer/i, ['ROOM']],
    [/hotel store illustration/i, ['EXT']], [/beach destinations/i, ['@goa']], [/mountain escapes/i, ['@manali']],
    [/tamil nadu/i, ['@ooty']], [/coastal paradise/i, ['@gokarna']], [/rajasthan/i, ['@udaipur']], [/perspective on the hills/i, ['@coorg']]
  ];
  var homeAssigned = new WeakMap();
  function homePhotoFor(alt) {
    var city = cityKey(alt), lists = null;
    for (var i = 0; i < HOME_RULES.length; i++) if (HOME_RULES[i][0].test(alt)) { lists = HOME_RULES[i][1]; break; }
    if (!lists && city) lists = ['@' + city];
    if (!lists) return '';
    var ids = take(lists.map(function (k) { return k[0] === '@' ? C[k.slice(1)] : G[k]; }).concat([G.GENERIC]), 1);
    return ids[0] ? url(ids[0]) : '';
  }
  // Pre-allocate homepage photos so they never collide with listings.
  var HOME_KEYS = ['Flights offer', 'Hotels offer', 'Holidays offer', 'Bank Offers offer', 'store1', 'store2', 'store3', 'store4',
    'Stays in & Around Delhi', 'Stays in & Around Mumbai', 'Stays in & Around Bengaluru', 'Beautiful Beach Destinations', 'Dreamy Mountain Escapes',
    'Shimla’s Best Kept Secret', 'Tamil Nadu’s Charming Hill Town', 'A Quiet Slice of Coastal Paradise', 'A Royal Escape in Rajasthan', 'A New Perspective on the Hills'];
  var homeUrls = {};
  HOME_KEYS.forEach(function (k) { homeUrls[k] = homePhotoFor(/^store/.test(k) ? 'Hotel store illustration' : k); });
  var storeIndex = 0;
  function fixHomeImage(img) {
    if (!img || homeAssigned.has(img) || img.closest('#myra-panel,#resultList,.result-card,.gallery-grid,.modal')) return;
    var alt = String(img.getAttribute('alt') || '').trim();
    if (!alt) return;
    var key = /hotel store illustration/i.test(alt) ? 'store' + (++storeIndex) : HOME_KEYS.filter(function (k) { return k.toLowerCase() === alt.toLowerCase().replace(/'/g, '’'); })[0];
    var src = key && homeUrls[key];
    if (!src) return;
    homeAssigned.set(img, true);
    img.removeAttribute('srcset');
    img.src = src;
  }
  function fixHome(root) { (root || document).querySelectorAll && (root || document).querySelectorAll('img[alt]').forEach(fixHomeImage); }

  /* 2. Villas, holiday packages and tours: one set per city (each city has one of each). */
  var cityOrder = Object.keys(C), perCity = {};
  function citySets(key) {
    if (perCity[key]) return perCity[key];
    var city = C[key] || [];
    perCity[key] = {
      villa: take([G.VEXT], 1).concat(take([G.VINT], 2), take([G.VEXT], 1), take([G.VIEW, G.POOL, G.VINT], 1)).map(url),
      holiday: take([city, G.GENERIC], 5).map(url),
      tour: take([city], 3).concat(take([G.FOOD], 1), take([city, G.GENERIC], 1)).map(url)
    };
    return perCity[key];
  }
  cityOrder.forEach(citySets);

  /* 3. Catalogue hotels: exterior first, then rooms, bathroom and facilities. */
  var hotelPhotos = {};
  function allocateHotel(h) {
    var key = h.id || h.name;
    if (hotelPhotos[key]) return hotelPhotos[key];
    var amen = [G.LOBBY, G.POOL, G.REST, G.VIEW];
    var n = Object.keys(hotelPhotos).length;
    var ids = take([G.EXT, G.VEXT], 1).concat(
      take([G.ROOM, G.VINT], 1), take([G.BATH], 1), take(amen.slice(n % 4).concat(amen.slice(0, n % 4)), 1),
      take(amen.slice((n + 2) % 4).concat(amen.slice(0, (n + 2) % 4)), 1), take([G.ROOM, G.VINT, G.VIEW], 1));
    hotelPhotos[key] = ids.map(url);
    return hotelPhotos[key];
  }
  var hotelsDone = false;
  function allocateCatalogue() {
    if (hotelsDone || !Array.isArray(window.HOTELS)) return;
    hotelsDone = true;
    window.HOTELS.slice().sort(function (a, b) { return (a.city + a.name).localeCompare(b.city + b.name); }).forEach(function (h) { h.photos = allocateHotel(h).slice(); });
  }
  allocateCatalogue();

  /* 4. Unknown destinations: unique leftovers, kept per search key for this visit. */
  var extra = {};
  function leftovers(key, kind) {
    var k = kind + '|' + key;
    if (!extra[k]) {
      var lists = kind === 'villa' ? [G.VEXT, G.VINT] : kind === 'hotel' ? [G.EXT, G.ROOM, G.BATH, G.LOBBY] : [G.GENERIC, G.VIEW, G.FOOD];
      extra[k] = take(lists, 5).map(url);
    }
    return extra[k];
  }

  function photosForRow(category, row, destination) {
    var key = cityKey(row.destination || row.city || destination) ;
    if (category === 'Hotels') {
      if (row.catalogue_id || row.name) {
        var h = (window.HOTELS || []).filter(function (x) { return x.id === row.catalogue_id || x.name === row.name; })[0];
        if (h) return allocateHotel(h);
      }
      return leftovers((row.name || '') + '|' + destination, 'hotel');
    }
    var kind = category === 'Villas & Homestays' ? 'villa' : category === 'Holiday Packages' ? 'holiday' : 'tour';
    return key ? citySets(key)[kind] : leftovers((row.name || '') + '|' + destination, kind);
  }

  var CATS = ['Hotels', 'Villas & Homestays', 'Holiday Packages', 'Tours & Attractions'];
  function applyToResults() {
    var st = window.state || (typeof state !== 'undefined' ? state : null);
    if (!st || !st.search || CATS.indexOf(st.search.category) === -1 || !Array.isArray(st.results)) return;
    var cat = st.search.category, dest = st.search.to;
    st.results.forEach(function (r) {
      var photos = photosForRow(cat, r, dest);
      if (!photos || !photos.length) return;
      r.photos = photos.slice();
      r.img = photos[0];
      r.noCuratedPhotos = false;
      r.holidayNeedsDestinationImages = false;
    });
  }
  function syncCards() {
    var st = window.state || (typeof state !== 'undefined' ? state : null);
    if (!st || !st.search || CATS.indexOf(st.search.category) === -1) return;
    var byName = {};
    (st.results || []).forEach(function (r) { byName[String(r.name || '').trim()] = r; });
    document.querySelectorAll('#resultList .result-card').forEach(function (card) {
      var name = (card.querySelector('h3') || {}).textContent || '';
      var r = byName[name.trim()], img = card.querySelector('img');
      if (!r || !img || !r.img) return;
      img.removeAttribute('srcset');
      img.classList.remove('photo-unavailable');
      if (img.getAttribute('src') !== r.img) img.src = r.img;
      img.alt = r.name + ' photo';
      img.loading = 'lazy';
    });
  }

  function currentRender() {
    try { if (typeof renderResults === 'function') return renderResults; } catch (e) { /* ignore */ }
    return typeof window.renderResults === 'function' ? window.renderResults : null;
  }
  // Other scripts (some loaded later) keep replacing renderResults, so re-wrap whenever it changes.
  function install() {
    var previous = currentRender();
    if (!previous || previous.__photoWrapped) return;
    var wrapped = function () { allocateCatalogue(); applyToResults(); var out = previous.apply(this, arguments); syncCards(); return out; };
    wrapped.__photoWrapped = true;
    try { renderResults = wrapped; } catch (e) { /* not a global binding */ }
    if (typeof window.renderResults === 'function' || !currentRender()) window.renderResults = wrapped;
  }

  function start() {
    install();
    setInterval(function () { allocateCatalogue(); install(); }, 400);
    fixHome(document);
    new MutationObserver(function (list) {
      list.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) { if (n.tagName === 'IMG') fixHomeImage(n); else fixHome(n); } }); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.TripPhotoAssign = { cityKey: cityKey, citySets: citySets, hotelPhotos: hotelPhotos, used: used };
})();
