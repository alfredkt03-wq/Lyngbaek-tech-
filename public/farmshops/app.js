/* Farm shop / raw milk finder. Data comes from the endpoint named in <body data-api>. */
(function () {
  'use strict';

  var MODE = document.body.getAttribute('data-mode') || 'all'; // 'all' or 'milk'
  var API = document.body.getAttribute('data-api') || '/api/farmshops';
  var COUNTRY = document.body.getAttribute('data-country') || 'England';
  var CENTER = (document.body.getAttribute('data-center') || '52.8,-1.6').split(',').map(Number);
  var ZOOM = Number(document.body.getAttribute('data-zoom') || 6);
  var PAGE = 30;
  var FLUID = { yes: 'Raw milk sold', likely: 'Raw milk likely', unknown: 'Raw milk unconfirmed', no: 'No fluid raw milk' };
  var KINDS = {
    farm_shop: { label: 'Farm shop', color: '#3f7a52' },
    farm: { label: 'Farm (food business register)', color: '#8a8f3a' },
    raw_milk: { label: 'Raw milk producer', color: '#b5651d' },
    milk_vending: { label: 'Milk vending machine', color: '#3d5a80' },
    stockist: { label: 'Shop or delivery point', color: '#7a6a3a' },
    cheese: { label: 'Raw milk cheese producer', color: '#8a6d9b' }
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function httpUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
  function miles(a, b) {
    var R = 3958.8, r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  var state = { all: [], list: [], q: '', region: '', kind: MODE === 'milk' ? 'milk_any' : 'all', organic: false, near: null, shown: PAGE };
  var map = null, cluster = null, markerOf = {};

  // ---------- rendering ----------

  function where(s) {
    var parts = [s.address, s.town || s.area, s.postcode].filter(Boolean);
    return parts.join(', ');
  }

  function popup(s) {
    return '<div class="popup"><h4>' + esc(s.name) + '</h4><p>' + esc(KINDS[s.kind].label) + '</p>' +
      (where(s) ? '<p>' + esc(where(s)) + '</p>' : '') +
      (s.approx ? '<p><i>Approximate location</i></p>' : '') + '</div>';
  }

  // Milk status for every listing. Only what a source states is shown: nothing here claims "pasteurised" or "raw" without data behind it.
  function milkOf(s) {
    if (s.kind === 'raw_milk' && !s.fluid) return { raw: 'Raw: yes', note: 'Registered with the Food Standards Agency to sell raw drinking milk.' };
    if (s.fluid === 'yes') return { raw: 'Raw: yes', note: 'Raw drinking milk sold, per the source listing.' };
    if (s.fluid === 'likely') return { raw: 'Raw: likely', note: 'Source suggests raw milk. Confirm with the seller.' };
    if (s.fluid === 'no') return { raw: 'Raw milk: not sold', note: 'Listed for cheese or other products, not fluid raw milk.' };
    if (s.fluid === 'unknown') return { raw: 'Raw: unconfirmed', note: 'Raw or low-temperature pasteurised is not recorded. Ask the seller.' };
    return { raw: 'Raw milk: not recorded', note: 'Raw or low-temperature pasteurised is not recorded. Ask the seller.' };
  }

  function card(s) {
    var k = KINDS[s.kind] || KINDS.farm_shop;
    var badges = '<span class="badge' + (s.kind === 'farm_shop' ? '' : ' milk') + '">' + esc(k.label) + '</span>';
    if (s.organic) badges += '<span class="badge eco">Organic</span>';
    if (s.species) badges += '<span class="badge">' + esc(s.species) + '</span>';
    var mk = milkOf(s);
    badges += '<span class="badge' + (/yes/.test(mk.raw) ? ' eco' : '') + '">' + esc(mk.raw) + '</span>';
    var links = [];
    var tel = String(s.phone || '').replace(/[^\d+]/g, '');
    if (tel) links.push('<a href="tel:' + esc(tel) + '">Call ' + esc(s.phone) + '</a>');
    if (httpUrl(s.website)) links.push('<a href="' + esc(s.website) + '" target="_blank" rel="noopener nofollow">Website ↗</a>');
    if (/^https:\/\/getrawmilk\.com\//.test(s.sourceUrl || '')) links.push('<a href="' + esc(s.sourceUrl) + '" target="_blank" rel="noopener nofollow">Listing on getrawmilk.com ↗</a>');
    links.push('<a href="https://www.google.com/maps/search/?api=1&query=' + s.lat + ',' + s.lon + '" target="_blank" rel="noopener">' + (s.approx ? 'View area on Google Maps' : 'View on Google Maps') + ' ↗</a>');
    if (!s.approx) links.push('<a href="https://www.google.com/maps/dir/?api=1&destination=' + s.lat + ',' + s.lon + '" target="_blank" rel="noopener">Directions ↗</a>');
    var dist = s._d != null ? ' · ' + s._d.toFixed(s._d < 10 ? 1 : 0) + ' miles away' : '';
    return '<article class="shop"><h3>' + esc(s.name) + '</h3><div class="badges">' + badges + '</div>' +
      '<p class="meta"><b>Milk:</b> ' + esc(mk.note) + '</p>' +
      (s.description ? '<p>' + esc(s.description) + '</p>' : '') +
      '<p class="addr">' + esc(where(s) || (s.region || COUNTRY)) + '</p>' +
      (s.hours ? '<p class="meta">Opening hours (from OpenStreetMap): ' + esc(s.hours) + '</p>' : '') +
      '<p class="meta">' + esc(s.region || '') + dist + '</p>' +
      (s.approx ? '<p class="meta">' + esc(s.sources && s.sources.indexOf('getrawmilk') !== -1 ? 'Approximate location: placed by town. Contact the seller to confirm the address, and where and when you can buy.' : 'Approximate location: the Food Standards Agency lists only the town and postcode area. Contact the producer to confirm where and when you can buy.') + '</p>' : '') +
      '<div class="links">' + links.join('') + '</div></article>';
  }

  function renderList() {
    var el = $('list'), n = state.list.length;
    $('rcount').textContent = n + (n === 1 ? ' result' : ' results');
    if (!n) {
      el.innerHTML = '<p class="empty">Nothing matches. Try a town or the first half of a postcode (for example “BA”), or clear a filter.</p>';
      $('more').hidden = true;
      return;
    }
    el.innerHTML = state.list.slice(0, state.shown).map(card).join('');
    $('more').hidden = state.shown >= n;
  }

  function renderMap() {
    if (!map || !cluster) return;
    cluster.clearLayers();
    var layers = [];
    state.list.forEach(function (s) { if (markerOf[s.id]) layers.push(markerOf[s.id]); });
    cluster.addLayers(layers);
    if (layers.length && (state.q || state.region || state.near)) {
      var b = cluster.getBounds();
      if (b.isValid()) map.fitBounds(b, { maxZoom: 12, padding: [24, 24] });
    }
  }

  // ---------- filtering ----------

  function apply() {
    var tokens = norm(state.q).split(' ').filter(Boolean);
    var pc = state.q.replace(/\s+/g, '').toUpperCase();
    var res = state.all.filter(function (s) {
      if (state.kind === 'milk_any' ? (s.kind === 'farm_shop' || s.kind === 'farm') : (state.kind !== 'all' && s.kind !== state.kind)) return false;
      if (state.region && s.region !== state.region) return false;
      if (state.organic && !s.organic) return false;
      if (!tokens.length) return true;
      if (tokens.every(function (t) { return s._h.indexOf(t) !== -1; })) return true;
      return pc.length >= 2 && s._pc.indexOf(pc) === 0;
    });
    if (state.near) {
      res.forEach(function (s) { s._d = miles(state.near, s); });
      res.sort(function (a, b) { return a._d - b._d; });
    } else {
      res.forEach(function (s) { s._d = null; });
      res.sort(function (a, b) { return a.name.localeCompare(b.name, 'en'); });
    }
    state.list = res;
    state.shown = PAGE;
    renderList();
    renderMap();
    var u = new URLSearchParams();
    if (state.q) u.set('q', state.q);
    if (state.region) u.set('region', state.region);
    var qs = u.toString();
    try { history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '')); } catch (e) { /* ignore */ }
  }

  // ---------- setup ----------

  function initMap() {
    if (!window.L || !$('map')) return;
    map = L.map('map', { scrollWheelZoom: false }).setView(CENTER, ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    cluster = L.markerClusterGroup ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 }) : L.layerGroup();
    if (!cluster.addLayers) cluster.addLayers = function (a) { a.forEach(function (m) { cluster.addLayer(m); }); };
    if (!cluster.getBounds) cluster.getBounds = function () { return L.featureGroup(cluster.getLayers()).getBounds(); };
    map.addLayer(cluster);
  }

  function prepare(data) {
    state.all = data.shops.filter(function (s) { return typeof s.lat === 'number' && KINDS[s.kind]; });
    state.all.forEach(function (s) {
      s._h = norm([s.name, s.address, s.town, s.area, s.region, s.postcode, s.description].join(' '));
      s._pc = String(s.postcode || '').replace(/\s+/g, '').toUpperCase();
      if (map) {
        markerOf[s.id] = L.circleMarker([s.lat, s.lon], {
          radius: s.approx ? 8 : 6, color: '#173c29', weight: 1, fillColor: KINDS[s.kind].color, fillOpacity: s.approx ? 0.55 : 0.9
        }).bindPopup(function () { return popup(s); });
      }
    });
    var regions = {};
    state.all.forEach(function (s) { if (s.region) regions[s.region] = 1; });
    $('region').innerHTML = '<option value="">All of ' + esc(COUNTRY) + '</option>' +
      Object.keys(regions).sort().map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('');
    var n = state.all.filter(function (s) { return MODE === 'milk' ? (s.kind !== 'farm_shop' && s.kind !== 'farm') : true; }).length;
    $('total').textContent = MODE === 'milk'
      ? 'Search among ' + n + ' raw milk sources in ' + COUNTRY + '.'
      : 'Search among ' + state.all.length + ' farm shops, farms, raw milk producers and milk vending machines in ' + COUNTRY + '.';
    if (data.generatedAt && $('updated')) {
      $('updated').textContent = 'Data last built ' + new Date(data.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + '.';
    }
    var p = new URLSearchParams(location.search);
    if (p.get('q')) { state.q = p.get('q'); $('q').value = state.q; }
    if (p.get('region') && regions[p.get('region')]) { state.region = p.get('region'); $('region').value = state.region; }
    apply();
  }

  function load(attempt) {
    attempt = attempt || 0;
    fetch(API).then(function (r) {
      if (r.status === 503 && attempt < 12) {
        $('list').innerHTML = '<p class="status">The farm shop data is being prepared on the server. This page will retry automatically.</p>';
        setTimeout(function () { load(attempt + 1); }, 15000);
        return null;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) { if (data) prepare(data); })
      .catch(function () {
        $('list').innerHTML = '<p class="status">Could not load the data. Please try again later.</p>';
      });
  }

  function bind() {
    var t;
    $('q').addEventListener('input', function (e) {
      clearTimeout(t);
      t = setTimeout(function () { state.q = e.target.value; apply(); }, 150);
    });
    $('region').addEventListener('change', function (e) { state.region = e.target.value; apply(); });
    if ($('kind')) $('kind').addEventListener('change', function (e) { state.kind = e.target.value; apply(); });
    if ($('organic')) $('organic').addEventListener('change', function (e) { state.organic = e.target.checked; apply(); });
    $('more').querySelector('button').addEventListener('click', function () { state.shown += PAGE; renderList(); });
    $('near').addEventListener('click', function () {
      var b = $('near');
      if (state.near) { state.near = null; b.textContent = 'Near me'; apply(); return; }
      if (!navigator.geolocation) { b.textContent = 'Location not available'; return; }
      b.textContent = 'Locating…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        state.near = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        b.textContent = 'Near me: on (click to clear)';
        apply();
        if (map) map.setView([state.near.lat, state.near.lon], 10);
      }, function () { b.textContent = 'Location blocked'; }, { timeout: 10000 });
    });
  }

  initMap();
  bind();
  load(0);
})();
