/* One map for the UK (/api/farmshops) and Ireland (/api/farmshops-ie). */
(function () {
  'use strict';
  var SOURCES = [{ url: '/api/farmshops', country: 'UK' }, { url: '/api/farmshops-ie', country: 'Ireland' }];
  var KINDS = {
    farm_shop: { label: 'Farm shop', color: '#3f7a52' },
    farm: { label: 'Farm (food business register)', color: '#8a8f3a' },
    raw_milk: { label: 'Raw milk producer', color: '#b5651d' },
    milk_vending: { label: 'Milk vending machine', color: '#3d5a80' },
    stockist: { label: 'Shop or delivery point (raw milk)', color: '#7a6a3a' },
    cheese: { label: 'Raw milk cheese', color: '#8a6d9b' }
  };
  // The UK and Ireland only: the map cannot be zoomed out or panned beyond this box.
  var BOUNDS = L_bounds();
  function L_bounds() { return window.L ? L.latLngBounds([49.8, -10.8], [60.95, 1.9]) : null; }
  var PREC = { exact: 'exact point', street: 'on the street', townland: 'townland, within about 1 km', listed: 'map point given by the listing', postcode: 'postcode centre (within about 100 m)', area: 'postcode area, approximate', town: 'town centre, approximate' };
  var FLUID = { yes: 'Raw milk sold', likely: 'Raw milk likely', unknown: 'Raw milk unconfirmed', no: 'No fluid raw milk' };
  var animal = '', selRing = null, regions = null, regionLayer = null, origin = null, originMark = null, places = [], labelLayer = null, all = [], on = {}, q = '', country = '', map, cluster, markerOf = {}, dataOf = {}, pending = SOURCES.length, failed = [];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function httpUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }

  // Milk status for every listing. Only what a source states is shown: nothing here claims "pasteurised" or "raw" without data behind it.
  function milkOf(s) {
    if (s.kind === 'raw_milk' && !s.fluid) return { raw: 'Raw: yes', note: 'Registered with the Food Standards Agency to sell raw drinking milk.' };
    if (s.fluid === 'yes') return { raw: 'Raw: yes', note: 'Raw drinking milk sold, per the source listing.' };
    if (s.fluid === 'likely') return { raw: 'Raw: likely', note: 'Source suggests raw milk. Confirm with the seller.' };
    if (s.fluid === 'no') return { raw: 'Raw milk: not sold', note: 'Listed for cheese or other products, not fluid raw milk.' };
    if (s.fluid === 'unknown') return { raw: 'Raw: unconfirmed', note: 'Raw or low-temperature pasteurised is not recorded. Ask the seller.' };
    return { raw: 'Raw milk: not recorded', note: 'Raw or low-temperature pasteurised is not recorded. Ask the seller.' };
  }

  // Where "Directions" points. An exact pin uses its coordinates. Anything town-level or street-level searches the business by name and address
  // instead, because a coordinate in a townland sends people to an empty field (the pin lands on the area, not the shop).
  function mapsDest(s) {
    var p = s.precision || (s.approx ? 'town' : 'exact');
    if (p === 'exact' || p === 'postcode' || p === 'listed') return s.lat + ',' + s.lon;
    var region = /^I:/.test(s.id || '') || s._c === 'Ireland' ? 'Ireland' : (s.country || 'United Kingdom');
    return encodeURIComponent([s.name, s.address, s.town || s.area, s.region ? 'County ' + s.region : '', region].filter(Boolean).join(', '));
  }

  function popup(s) {
    var where = [s.address, s.town || s.area, s.postcode].filter(Boolean).join(', ');
    var links = [];
    if (httpUrl(s.website)) links.push('<a href="' + esc(s.website) + '" target="_blank" rel="noopener nofollow">Website ↗</a>');
    if (/^https:\/\/getrawmilk\.com\//.test(s.sourceUrl || '')) links.push('<a href="' + esc(s.sourceUrl) + '" target="_blank" rel="noopener nofollow">Source listing ↗</a>');
    links.push('<a href="https://www.google.com/maps/dir/?api=1&destination=' + mapsDest(s) + '" target="_blank" rel="noopener">Directions ↗</a>');
    return '<div class="popup"><h4>' + esc(s.name) + '</h4><p>' + esc(KINDS[s.kind].label) + ' · ' + esc(milkOf(s).raw) + '</p><p>' + esc(milkOf(s).note) + '</p>' +
      (animalsOf(s).length ? '<div class="tags">' + animalsOf(s).map(function (a) { return '<span>' + esc(a) + '</span>'; }).join('') + '</div>' : '') +
      (where ? '<p>' + esc(where) + '</p>' : '') + (s.description && s.sources && s.sources.indexOf('getrawmilk') !== -1 ? '<p>' + esc(s.description) + '</p>' : '') +
      '<p><i>Location: ' + esc(PREC[s.precision || (s.approx ? 'town' : 'exact')] || 'approximate') + '</i></p>' + '<p>' + links.join(' · ') + '</p></div>';
  }

  function renderTypes() {
    var counts = {};
    all.forEach(function (s) { counts[s.kind] = (counts[s.kind] || 0) + 1; });
    $('types').innerHTML = Object.keys(KINDS).filter(function (k) { return counts[k]; }).map(function (k) {
      return '<li><label style="--dot:' + KINDS[k].color + '"><input type="checkbox" data-kind="' + k + '"' + (on[k] === false ? '' : ' checked') + '><i></i>' +
        esc(KINDS[k].label) + ' <span class="n">' + counts[k] + '</span></label></li>';
    }).join('');
  }

  // Animals a listing names (from its species field). Listings without one are hidden while an animal is chosen.
  var ANIMALS = [['cow', 'Cows'], ['goat', 'Goats'], ['sheep', 'Sheep'], ['buffalo', 'Buffalo']];
  function animalsOf(s) {
    if (s._an) return s._an;
    var t = String(s.species || '').toLowerCase();
    s._an = ANIMALS.map(function (a) { return a[0]; }).filter(function (a) { return t.indexOf(a) !== -1 || (a === 'cow' && /cattle|jersey|ayrshire|friesian|guernsey/.test(t)); });
    return s._an;
  }
  function renderAnimals() {
    var el = $('animals'); if (!el) return;
    var c = {}; all.forEach(function (s) { if (!country || s._c === country) animalsOf(s).forEach(function (a) { c[a] = (c[a] || 0) + 1; }); });
    el.innerHTML = '<button type="button" data-an="" aria-pressed="' + (!animal) + '">Any</button>' + ANIMALS.filter(function (a) { return c[a[0]]; }).map(function (a) {
      return '<button type="button" data-an="' + a[0] + '" aria-pressed="' + (animal === a[0]) + '">' + a[1] + '<span class="n">' + c[a[0]] + '</span></button>';
    }).join('');
  }

  function visible() {
    var tokens = norm(q).split(' ').filter(Boolean), pc = q.replace(/\s+/g, '').toUpperCase();
    return all.filter(function (s) {
      if (on[s.kind] === false) return false;
      if (country && s._c !== country) return false;
      if (animal && animalsOf(s).indexOf(animal) === -1) return false;
      if (!tokens.length) return true;
      return tokens.every(function (t) { return s._h.indexOf(t) !== -1; }) || (pc.length >= 2 && s._pc.indexOf(pc) === 0);
    });
  }

  // Region map: England's regions and Ireland's counties, shaded by how many listings each has. Click one to zoom to it.
  function inRing(lat, lon, r) {
    var c = false;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
      var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function inFeature(lat, lon, f) {
    var g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (var i = 0; i < polys.length; i++) if (inRing(lat, lon, polys[i][0])) return true;
    return false;
  }
  function shadeRegions(list) {
    if (!regions || !map) return;
    regions.features.forEach(function (f) { f._n = 0; });
    list.forEach(function (s) {
      for (var i = 0; i < regions.features.length; i++) { var f = regions.features[i]; if (f._bb && f._bb.contains([s.lat, s.lon]) && inFeature(s.lat, s.lon, f)) { f._n++; break; } }
    });
    var max = 1; regions.features.forEach(function (f) { if (f._n > max) max = f._n; });
    if (regionLayer) map.removeLayer(regionLayer);
    regionLayer = L.geoJSON(regions, {
      pane: 'regions',
      style: function (f) {
        var t = f._n ? 0.1 + 0.38 * Math.sqrt(f._n / max) : 0;
        return { color: '#173c29', weight: 1, opacity: 0.55, fillColor: '#2f6b4a', fillOpacity: t };
      },
      onEachFeature: function (f, l) {
        l.bindTooltip(esc(f.properties.name) + ' <b>' + f._n + '</b>', { sticky: true, className: 'rtip', direction: 'top' });
        l.on('mouseover', function () { l.setStyle({ weight: 2.5, opacity: 1 }); });
        l.on('mouseout', function () { regionLayer.resetStyle(l); });
        l.on('click', function () { map.fitBounds(l.getBounds(), { padding: [20, 20] }); });
      }
    }).addTo(map);
    toggleRegions();
  }
  function toggleRegions() {
    if (!regionLayer) return;
    var show = map.getZoom() < 8.5;
    regionLayer.eachLayer(function (l) { l.setStyle(show ? {} : { fillOpacity: 0, opacity: 0 }); if (show) regionLayer.resetStyle(l); l.options.interactive = show; if (l._path) l._path.style.pointerEvents = show ? '' : 'none'; });
  }

  function render(fit) {
    if (!map) return;
    var list = visible();
    cluster.clearLayers();
    cluster.addLayers(list.map(function (s) { return markerOf[s.id]; }));
    $('mcount').textContent = list.length + (list.length === 1 ? ' place' : ' places') + ' shown of ' + all.length + '.';
    if (fit && list.length) { var b = cluster.getBounds(); if (b.isValid()) map.fitBounds(b, { maxZoom: 12, padding: [24, 24] }); }
    listInView();
    shadeRegions(list);
  }

  // Shows all of the UK and Ireland, and locks the map to that view: no zooming out or panning beyond it.
  function lockView() {
    map.setMaxBounds(null);
    map.setMinZoom(0);
    map.fitBounds(BOUNDS, { animate: false });
    map.setMinZoom(map.getZoom());
    map.setMaxBounds(map.getBounds().pad(0.04));
  }

  // Place and shop names drawn on the map. Shop names come first and win any overlap; town names fill the gaps.
  function updateLabels() {
    if (!map || !labelLayer) return;
    labelLayer.clearLayers();
    var z = map.getZoom(), size = map.getSize(), taken = [], made = 0;
    var soft = []; // pins and cluster badges: small towns avoid them, big cities are drawn on top of them
    function free(x, y, w, h, big) {
      if (x + w < 0 || y + h < 0 || x - w > size.x || y - h > size.y) return false;
      var all = big ? taken : taken.concat(soft);
      for (var i = 0; i < all.length; i++) { var t = all[i]; if (x < t[0] + t[2] && x + w > t[0] && y < t[1] + t[3] && y + h > t[1]) return false; }
      taken.push([x, y, w, h]); return true;
    }
    function label(ll, text, cls, dx, dy, rw) {
      // rw: right-aligned in a box of that width, so a name left of its pin ends right next to it
      var at = dx == null ? '' : ' style="left:' + Math.round(dx) + 'px;top:' + Math.round(dy) + 'px' + (rw ? ';width:' + Math.round(rw) + 'px;text-align:right' : '') + '"';
      L.marker(ll, { icon: L.divIcon({ className: 'lbl ' + cls, html: '<span' + at + '>' + esc(text) + '</span>', iconSize: [0, 0] }), interactive: false, keyboard: false, pane: 'names' }).addTo(labelLayer);
    }
    var b = map.getBounds().pad(0.1), shown = [];
    visible().filter(function (s) { return b.contains([s.lat, s.lon]); }).slice(0, 600).forEach(function (s) {
      var m = markerOf[s.id];
      if (!m || (map.hasLayer && !map.hasLayer(m))) return; // still inside a cluster
      var pt = map.latLngToContainerPoint([s.lat, s.lon]);
      soft.push([pt.x - 8, pt.y - 8, 16, 16]); // keep town names off the pins
      shown.push([s, pt]);
    });
    // Cluster badges: work out where each one is from the data (the drawn badges may still be animating),
    // so town names are placed beside them, never under them.
    try {
      var seenC = {};
      visible().forEach(function (st) {
        var m = markerOf[st.id], par = m && cluster.getVisibleParent ? cluster.getVisibleParent(m) : null;
        if (!par || par === m || seenC[L.stamp(par)]) return;
        seenC[L.stamp(par)] = 1;
        var cp = map.latLngToContainerPoint(par.getLatLng()), n = par.getChildCount ? par.getChildCount() : 2, d = (n < 10 ? 28 : n < 100 ? 34 : 42) + 6;
        taken.push([cp.x - d / 2, cp.y - d / 2, d, d]);
      });
    } catch (e) { /* cluster layer not ready */ }
    try {
      var cr2 = map.getContainer().getBoundingClientRect();
      Array.prototype.forEach.call(map.getContainer().parentNode.querySelectorAll('.tag, .jump, .rkey, .leaflet-control'), function (el) {
        var r = el.getBoundingClientRect();
        if (r.width) taken.push([r.left - cr2.left - 4, r.top - cr2.top - 4, r.width + 8, r.height + 8]);
      });
    } catch (e) { /* no layout available */ }
    var min = z < 6.5 ? 400000 : z < 7 ? 150000 : z < 7.5 ? 80000 : z < 8 ? 45000 : z < 9 ? 22000 : z < 10 ? 11000 : z < 11 ? 6000 : z < 12 ? 2500 : 0;
    var cand = [];
    for (var i = 0; i < places.length && cand.length < 400; i++) {
      var p0 = places[i];
      if (p0[3] * (p0[4] === 'I' ? 2.5 : 1) < min) continue; // Irish towns are smaller, so they count for more
      if (b.contains([p0[1], p0[2]])) cand.push(p0);
    }
    // Reserve the exact spots of the biggest towns first, so no name is ever drawn over another town's position.
    cand.slice(0, 80).forEach(function (p0) { var d = map.latLngToContainerPoint([p0[1], p0[2]]); taken.push([d.x - 4, d.y - 4, 8, 8]); });
    for (var ci = 0; ci < cand.length && made < 260; ci++) {
      var p = cand[ci];
      var pt2 = map.latLngToContainerPoint([p[1], p[2]]), big = (p[4] === 'E' && p[3] >= 450000) || (p[4] === 'I' && p[3] >= 80000) || (p[4] !== 'E' && p[4] !== 'I' && p[3] >= 150000);
      var w2 = p[0].length * (big ? 12 : 6.8) + 12, h2 = big ? 20 : 16;
      // right, left, above, below, then the corners
      var spots = [[8, -h2 / 2], [-w2 - 8, -h2 / 2], [-w2 / 2, -h2 - 6], [-w2 / 2, 6],
        [10, -h2 - 6], [-w2 - 10, -h2 - 6], [10, 6], [-w2 - 10, 6]], placed = false; // always beside the dot that marks the exact spot
      var size = map.getSize();
      for (var k = 0; k < spots.length && !placed; k++) {
        var lx = pt2.x + spots[k][0], ly = pt2.y + spots[k][1];
        if (lx < 4 || ly < 4 || lx + w2 > size.x - 4 || ly + h2 > size.y - 4) continue; // keep names fully on screen
        if (free(lx, ly, w2, h2, big)) { label([p[1], p[2]], p[0], big ? 'plc big' : 'plc', spots[k][0], spots[k][1]); placed = true; made++; }
      }
    }
    if (z >= 9) { // farm and shop names, from regional zoom; crowded areas show fewer until you zoom in
      shown.forEach(function (e) {
        var s = e[0], pt = e[1], w = Math.min(s.name.length, 28) * 7.2 + 14, sz = map.getSize(), txt = s.name.length > 30 ? s.name.slice(0, 29) + '…' : s.name;
        // right of the pin if it fits on screen, otherwise left of it; never cut off at the edge
        if (pt.x < 0 || pt.y < 0 || pt.x > sz.x || pt.y > sz.y) return; // pin is off screen
        if (pt.x + 9 + w < sz.x - 4 && free(pt.x + 9, pt.y - 9, w, 18)) label([s.lat, s.lon], txt, 'shl');
        else if (pt.x - 9 - w > 4 && free(pt.x - 9 - w, pt.y - 9, w, 18)) label([s.lat, s.lon], txt, 'shl', -9 - w, -9, w);
      });
    }
  }

  function listInView() {
    if (!map || !$('inview')) return;
    var b = map.getBounds(), list = visible().filter(function (s) { return b.contains([s.lat, s.lon]); });
    $('inviewn').textContent = list.length + (list.length === 1 ? ' place' : ' places') + ' on the map';
    if (origin) list.forEach(function (s) { s._d = origin.distanceTo([s.lat, s.lon]); });
    list.sort(function (a, z) { return origin ? a._d - z._d : a.name.localeCompare(z.name, 'en'); });
    $('inview').innerHTML = list.length ? list.slice(0, 60).map(function (s) {
      return '<li><button type="button" data-id="' + esc(s.id) + '"><b>' + esc(s.name) + '</b><small><i style="background:' + KINDS[s.kind].color + '"></i>' +
        esc(KINDS[s.kind].label + ' · ' + milkOf(s).raw + (s.town || s.area ? ' · ' + (s.town || s.area) : '') + (origin ? ' · ' + (s._d / 1609.34 < 10 ? (s._d / 1609.34).toFixed(1) : Math.round(s._d / 1609.34)) + ' mi' : '')) + '</small></button></li>';
    }).join('') + (list.length > 60 ? '<li class="none">Zoom in to see the other ' + (list.length - 60) + '.</li>' : '') : '<li class="none">Nothing in this part of the map. Zoom out or move the map.</li>';
  }

  // Place finder: type a town, village or postcode, or use your location. The list then sorts by distance.
  function goTo(lat, lon, label) {
    origin = L.latLng(lat, lon);
    if (originMark) map.removeLayer(originMark);
    originMark = L.circleMarker(origin, { radius: 6, color: '#fff', weight: 2, fillColor: '#1d4ed8', fillOpacity: 1, interactive: false }).addTo(map);
    map.setView(origin, 11, { animate: false });
    var near = all.filter(function (s) { return origin.distanceTo([s.lat, s.lon]) <= 25000; }).length;
    $('pfmsg').textContent = label + ': ' + near + (near === 1 ? ' place' : ' places') + ' within 15 miles. Nearest first in the list.';
    listInView(); updateLabels();
  }
  function setupFinder() {
    var inp = $('pf'), list = $('pfl'), seq = 0;
    function hide() { list.hidden = true; list.innerHTML = ''; }
    function suggest() {
      var v = norm(inp.value).trim(); if (v.length < 2) return hide();
      var hit = [], i;
      for (i = 0; i < places.length && hit.length < 8; i++) if (norm(places[i][0]).indexOf(v) === 0) hit.push(places[i]);
      for (i = 0; i < places.length && hit.length < 8; i++) if (hit.indexOf(places[i]) < 0 && norm(places[i][0]).indexOf(v) > 0) hit.push(places[i]);
      var rg = { E: 'England', I: 'Ireland', W: 'Wales', S: 'Scotland', N: 'Northern Ireland' };
      list.innerHTML = hit.map(function (p, k) { return '<li><button type="button" data-k="' + k + '">' + esc(p[0]) + '<small>' + rg[p[4]] + '</small></button></li>'; }).join('');
      list._hit = hit; list.hidden = !hit.length;
    }
    inp.addEventListener('input', suggest);
    list.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-k]'); if (!b) return;
      var p = list._hit[+b.getAttribute('data-k')]; inp.value = p[0]; hide(); goTo(p[1], p[2], p[0]);
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') return hide();
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var v = inp.value.trim(), first = list._hit && list._hit[0];
      if (/^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/.test(v)) { // UK postcode
        var my = ++seq;
        fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(v.replace(/\s+/g, ''))).then(function (r) { return r.json(); }).then(function (d) {
          if (my !== seq) return;
          if (d && d.result) { hide(); goTo(d.result.latitude, d.result.longitude, v.toUpperCase()); } else $('pfmsg').textContent = 'No match for that postcode.';
        }).catch(function () { $('pfmsg').textContent = 'Postcode lookup is unavailable. Try a town name.'; });
      } else if (first) { inp.value = first[0]; hide(); goTo(first[1], first[2], first[0]); }
      else $('pfmsg').textContent = 'No place by that name. Try a nearby town.';
    });
    document.addEventListener('click', function (e) { if (!e.target.closest || !e.target.closest('.find')) hide(); });
    $('near').addEventListener('click', function () {
      if (!navigator.geolocation) { $('pfmsg').textContent = 'Your browser cannot share its location.'; return; }
      $('pfmsg').textContent = 'Finding you…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        var ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
        if (!map.options.maxBounds || !map.options.maxBounds.contains(ll)) { $('pfmsg').textContent = 'You are outside the UK and Ireland, so there is nothing to show near you.'; return; }
        goTo(ll.lat, ll.lng, 'Your location');
      }, function () { $('pfmsg').textContent = 'Location was blocked. Type a town or postcode instead.'; }, { timeout: 10000 });
    });
  }

  function add(data, c) {
    (data.shops || []).forEach(function (s) {
      if (typeof s.lat !== 'number' || typeof s.lon !== 'number' || !KINDS[s.kind]) return;
      s._c = c;
      s._h = norm([s.name, s.address, s.town, s.area, s.region, s.postcode, c].join(' '));
      s._pc = String(s.postcode || '').replace(/\s+/g, '').toUpperCase();
      s.id = c.charAt(0) + ':' + s.id;
      if (map) markerOf[s.id] = L.circleMarker([s.lat, s.lon], {
        radius: s.approx ? 10 : 6, color: s.approx ? KINDS[s.kind].color : '#fff', weight: s.approx ? 2 : 2.5, dashArray: s.approx ? '3 3' : null, fillColor: KINDS[s.kind].color, fillOpacity: s.approx ? 0.25 : 1
      }).bindPopup(function () { return popup(s); });
      dataOf[s.id] = s;
      all.push(s);
    });
  }

  function fetchSource(src, attempt) {
    return fetch(src.url).then(function (r) {
      if (r.status === 503 && attempt < 12) {
        $('mstatus').textContent = 'Some data is still being prepared on the server. The map will update by itself.';
        return new Promise(function (res) { setTimeout(res, 15000); }).then(function () { return fetchSource(src, attempt + 1); });
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function done() {
    if (--pending > 0) return;
    renderTypes();
    renderAnimals();
    $('mstatus').textContent = failed.length ? 'Could not load data for: ' + failed.join(', ') + '.' : '';
    render(true);
  }

  function init() {
    if (!window.L) { $('mcount').textContent = 'The map library did not load. Check your connection and reload.'; return; }
    map = L.map('bigmap', { scrollWheelZoom: true, zoomControl: false, zoomSnap: 0.5, zoomDelta: 1, wheelPxPerZoomLevel: 28, wheelDebounceTime: 20, zoomAnimation: true, maxBoundsViscosity: 1 }).setView([53.6, -4.5], 5);
    var BASE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', FALLBACK = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
    var tiles = L.tileLayer(BASE, {
      maxZoom: 19, subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);
    var tOk = 0, tBad = 0; // if the road style cannot be loaded, fall back to the plain one
    tiles.on('tileload', function () { tOk++; });
    tiles.on('tileerror', function () { if (++tBad > 6 && !tOk && tiles.setUrl) { tiles.setUrl(FALLBACK); tBad = -999; } });
    if (L.control.scale) L.control.scale({ position: 'bottomright', maxWidth: 110, imperial: true, metric: true }).addTo(map);
    cluster = L.markerClusterGroup ? L.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 40, disableClusteringAtZoom: 14, spiderfyOnMaxZoom: true, chunkedLoading: true,
      iconCreateFunction: function (c) {
        var n = c.getChildCount(), d = n < 10 ? 28 : n < 100 ? 34 : 42;
        return L.divIcon({ html: '<div class="fcluster" style="width:' + d + 'px;height:' + d + 'px">' + n + '</div>', className: '', iconSize: [d, d] });
      }
    }) : L.layerGroup();
    if (!cluster.addLayers) cluster.addLayers = function (a) { a.forEach(function (m) { cluster.addLayer(m); }); };
    if (!cluster.getBounds) cluster.getBounds = function () { return L.featureGroup(cluster.getLayers()).getBounds(); };
    map.addLayer(cluster);
    map.createPane('names').style.zIndex = 450; // town and farm names sit above the pins and cluster badges
    labelLayer = L.layerGroup().addTo(map);
    lockView();
    var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { map.invalidateSize(); lockView(); }, 150); });
    L.control.zoom({ position: 'topright' }).addTo(map);
    map.createPane('regions').style.zIndex = 350;
    map.on('moveend', listInView);
    map.on('zoomend', toggleRegions);
    fetch('regions.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (g) {
      if (!g || !Array.isArray(g.features)) return; regions = g; regions.features.forEach(function (f) { f._bb = L.geoJSON(f).getBounds(); }); render(false);
    }).catch(function () {});
    map.on('moveend zoomend', updateLabels);
    if (cluster.on) cluster.on('animationend', updateLabels);
    map.on('layeradd layerremove', function (e) { if (e.layer === cluster) updateLabels(); });
    fetch('places.json').then(function (r) { return r.ok ? r.json() : []; }).then(function (a) { places = a; updateLabels(); }).catch(function () {});
    document.querySelector('.jump').addEventListener('click', function (e) {
      var c = e.target.getAttribute && e.target.getAttribute('data-go');
      if (c == null) return;
      country = c; $('country').value = c; renderAnimals(); render(false);
      var box = { UK: [[49.85, -8.3], [60.9, 1.85]], Ireland: [[51.35, -10.6], [55.45, -5.95]] }[c];
      if (box) map.fitBounds(box, { animate: false }); else lockView();
    });
    $('inview').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-id]');
      var s = b && dataOf[b.getAttribute('data-id')];
      if (!s) return;
      map.setView([s.lat, s.lon], Math.max(map.getZoom(), 15));
      L.popup({ offset: [0, -6] }).setLatLng([s.lat, s.lon]).setContent(popup(s)).openOn(map);
    });
    setupFinder();
    var ring = null;
    function unring() { if (ring) { map.removeLayer(ring); ring = null; } }
    $('inview').addEventListener('mouseover', function (e) {
      var b = e.target.closest && e.target.closest('button[data-id]'), s = b && dataOf[b.getAttribute('data-id')];
      unring(); if (s) ring = L.circleMarker([s.lat, s.lon], { radius: 14, color: '#173c29', weight: 2, fillOpacity: 0, interactive: false }).addTo(map);
    });
    $('inview').addEventListener('mouseleave', unring);
    var t;
    $('q').addEventListener('input', function (e) { clearTimeout(t); t = setTimeout(function () { q = e.target.value; render(true); }, 200); });
    $('country').addEventListener('change', function (e) { country = e.target.value; renderAnimals(); render(true); });
    if ($('animals')) $('animals').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-an]'); if (!b) return;
      animal = b.getAttribute('data-an'); renderAnimals(); render(false);
    });
    // Ring the pin whose popup is open, so it stands out among its neighbours.
    map.on('popupopen', function (e) {
      if (selRing) map.removeLayer(selRing);
      selRing = L.circleMarker(e.popup.getLatLng(), { radius: 13, color: '#173c29', weight: 2.5, fillOpacity: 0, interactive: false }).addTo(map);
    });
    map.on('popupclose', function () { if (selRing) { map.removeLayer(selRing); selRing = null; } });
    $('types').addEventListener('change', function (e) { var k = e.target.getAttribute('data-kind'); if (k) { on[k] = e.target.checked; render(false); } });
    SOURCES.forEach(function (src) {
      fetchSource(src, 0).then(function (d) { add(d, src.country); }).catch(function () { failed.push(src.country); }).then(done);
    });
  }
  init();
})();
