/* One map for England (/api/farmshops) and Ireland (/api/farmshops-ie). */
(function () {
  'use strict';
  var SOURCES = [{ url: '/api/farmshops', country: 'England' }, { url: '/api/farmshops-ie', country: 'Ireland' }];
  var KINDS = {
    farm_shop: { label: 'Farm shop', color: '#3f7a52' },
    farm: { label: 'Farm (food business register)', color: '#8a8f3a' },
    raw_milk: { label: 'Raw milk producer', color: '#b5651d' },
    milk_vending: { label: 'Milk vending machine', color: '#3d5a80' },
    stockist: { label: 'Shop or delivery point (raw milk)', color: '#7a6a3a' },
    cheese: { label: 'Raw milk cheese producer', color: '#8a6d9b' }
  };
  var FLUID = { yes: 'Raw milk sold', likely: 'Raw milk likely', unknown: 'Raw milk unconfirmed', no: 'No fluid raw milk' };
  var all = [], on = {}, q = '', country = '', map, cluster, markerOf = {}, dataOf = {}, pending = SOURCES.length, failed = [];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function httpUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }

  function popup(s) {
    var where = [s.address, s.town || s.area, s.postcode].filter(Boolean).join(', ');
    var links = [];
    if (httpUrl(s.website)) links.push('<a href="' + esc(s.website) + '" target="_blank" rel="noopener nofollow">Website ↗</a>');
    if (/^https:\/\/getrawmilk\.com\//.test(s.sourceUrl || '')) links.push('<a href="' + esc(s.sourceUrl) + '" target="_blank" rel="noopener nofollow">Source listing ↗</a>');
    links.push('<a href="https://www.google.com/maps/dir/?api=1&destination=' + s.lat + ',' + s.lon + '" target="_blank" rel="noopener">Directions ↗</a>');
    return '<div class="popup"><h4>' + esc(s.name) + '</h4><p>' + esc(KINDS[s.kind].label) + (FLUID[s.fluid] ? ' · ' + esc(FLUID[s.fluid]) : '') + '</p>' +
      (where ? '<p>' + esc(where) + '</p>' : '') + (s.description && s.sources && s.sources.indexOf('getrawmilk') !== -1 ? '<p>' + esc(s.description) + '</p>' : '') +
      (s.approx ? '<p><i>Approximate location</i></p>' : '') + '<p>' + links.join(' · ') + '</p></div>';
  }

  function renderTypes() {
    var counts = {};
    all.forEach(function (s) { counts[s.kind] = (counts[s.kind] || 0) + 1; });
    $('types').innerHTML = Object.keys(KINDS).filter(function (k) { return counts[k]; }).map(function (k) {
      return '<li><label style="--dot:' + KINDS[k].color + '"><input type="checkbox" data-kind="' + k + '"' + (on[k] === false ? '' : ' checked') + '><i></i>' +
        esc(KINDS[k].label) + ' <span class="n">' + counts[k] + '</span></label></li>';
    }).join('');
  }

  function visible() {
    var tokens = norm(q).split(' ').filter(Boolean), pc = q.replace(/\s+/g, '').toUpperCase();
    return all.filter(function (s) {
      if (on[s.kind] === false) return false;
      if (country && s._c !== country) return false;
      if (!tokens.length) return true;
      return tokens.every(function (t) { return s._h.indexOf(t) !== -1; }) || (pc.length >= 2 && s._pc.indexOf(pc) === 0);
    });
  }

  function render(fit) {
    if (!map) return;
    var list = visible();
    cluster.clearLayers();
    cluster.addLayers(list.map(function (s) { return markerOf[s.id]; }));
    $('mcount').textContent = list.length + (list.length === 1 ? ' place' : ' places') + ' shown of ' + all.length + '.';
    if (fit && list.length) { var b = cluster.getBounds(); if (b.isValid()) map.fitBounds(b, { maxZoom: 12, padding: [24, 24] }); }
    listInView();
  }

  function listInView() {
    if (!map || !$('inview')) return;
    var b = map.getBounds(), list = visible().filter(function (s) { return b.contains([s.lat, s.lon]); });
    $('inviewn').textContent = list.length + (list.length === 1 ? ' place' : ' places') + ' on the map';
    list.sort(function (a, z) { return a.name.localeCompare(z.name, 'en'); });
    $('inview').innerHTML = list.length ? list.slice(0, 60).map(function (s) {
      return '<li><button type="button" data-id="' + esc(s.id) + '"><b>' + esc(s.name) + '</b><small><i style="background:' + KINDS[s.kind].color + '"></i>' +
        esc(KINDS[s.kind].label + (s.town || s.area ? ' · ' + (s.town || s.area) : '')) + '</small></button></li>';
    }).join('') + (list.length > 60 ? '<li class="none">Zoom in to see the other ' + (list.length - 60) + '.</li>' : '') : '<li class="none">Nothing in this part of the map. Zoom out or move the map.</li>';
  }

  function add(data, c) {
    (data.shops || []).forEach(function (s) {
      if (typeof s.lat !== 'number' || typeof s.lon !== 'number' || !KINDS[s.kind]) return;
      s._c = c;
      s._h = norm([s.name, s.address, s.town, s.area, s.region, s.postcode, c].join(' '));
      s._pc = String(s.postcode || '').replace(/\s+/g, '').toUpperCase();
      s.id = c.charAt(0) + ':' + s.id;
      if (map) markerOf[s.id] = L.circleMarker([s.lat, s.lon], {
        radius: s.approx ? 9 : 7, color: '#f3f0e7', weight: 2, fillColor: KINDS[s.kind].color, fillOpacity: s.approx ? 0.6 : 1
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
    $('mstatus').textContent = failed.length ? 'Could not load data for: ' + failed.join(', ') + '.' : '';
    render(true);
  }

  function init() {
    if (!window.L) { $('mcount').textContent = 'The map library did not load. Check your connection and reload.'; return; }
    map = L.map('bigmap', { scrollWheelZoom: true, zoomControl: false }).setView([53.6, -4.5], 5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);
    cluster = L.markerClusterGroup ? L.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 48, chunkedLoading: true,
      iconCreateFunction: function (c) {
        var n = c.getChildCount(), d = n < 10 ? 32 : n < 100 ? 38 : 46;
        return L.divIcon({ html: '<div class="fcluster" style="width:' + d + 'px;height:' + d + 'px">' + n + '</div>', className: '', iconSize: [d, d] });
      }
    }) : L.layerGroup();
    if (!cluster.addLayers) cluster.addLayers = function (a) { a.forEach(function (m) { cluster.addLayer(m); }); };
    if (!cluster.getBounds) cluster.getBounds = function () { return L.featureGroup(cluster.getLayers()).getBounds(); };
    map.addLayer(cluster);
    L.control.zoom({ position: 'topright' }).addTo(map);
    map.on('moveend', listInView);
    document.querySelector('.jump').addEventListener('click', function (e) {
      var c = e.target.getAttribute && e.target.getAttribute('data-go');
      if (c == null) return;
      country = c; $('country').value = c; render(true);
    });
    $('inview').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-id]');
      var s = b && dataOf[b.getAttribute('data-id')];
      if (!s) return;
      map.setView([s.lat, s.lon], Math.max(map.getZoom(), 15));
      L.popup({ offset: [0, -6] }).setLatLng([s.lat, s.lon]).setContent(popup(s)).openOn(map);
    });
    var t;
    $('q').addEventListener('input', function (e) { clearTimeout(t); t = setTimeout(function () { q = e.target.value; render(true); }, 200); });
    $('country').addEventListener('change', function (e) { country = e.target.value; render(true); });
    $('types').addEventListener('change', function (e) { var k = e.target.getAttribute('data-kind'); if (k) { on[k] = e.target.checked; render(false); } });
    SOURCES.forEach(function (src) {
      fetchSource(src, 0).then(function (d) { add(d, src.country); }).catch(function () { failed.push(src.country); }).then(done);
    });
  }
  init();
})();
