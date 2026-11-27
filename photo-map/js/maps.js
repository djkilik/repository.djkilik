/*
 * 사진 발자국 — 지도 연결
 * 카카오맵 · 네이버 지도 · 구글 지도 · 기본 지도(OpenStreetMap, Leaflet)를 같은 방식으로 다뤄요.
 *
 * 모든 지도는 아래 기능을 가져요.
 *   init()                      지도 SDK를 불러와 지도를 만들어요
 *   render(points, route)       번호 핀과 이동 경로를 그려요
 *   fit(points)                 점들이 모두 보이게 맞춰요
 *   focus(point)                한 점으로 이동해요
 *   setSelected(id)             고른 핀을 강조해요
 *   resize()                    지도 영역 크기가 바뀌면 다시 맞춰요
 *   reverseGeocode(lat, lng)    (가능하면) 좌표로 주소를 찾아요
 */
(function (PM) {
  'use strict';

  const NAMES = { kakao: '카카오맵', naver: '네이버 지도', google: '구글 지도', osm: '기본 지도' };
  const KOREA = { lat: 36.35, lng: 127.85 };

  function loadScript(src, timeoutMs) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs || 15000);
      s.onload = () => { clearTimeout(timer); resolve(); };
      s.onerror = () => { clearTimeout(timer); reject(new Error('load-failed')); };
      document.head.appendChild(s);
    });
  }

  function waitFor(test, timeoutMs) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function tick() {
        let ok = false;
        try { ok = !!test(); } catch (e) { ok = false; }
        if (ok) return resolve();
        if (Date.now() - start > (timeoutMs || 5000)) return reject(new Error('timeout'));
        setTimeout(tick, 120);
      })();
    });
  }

  function pinElement(p) {
    const el = document.createElement('div');
    el.className = 'pf-pin ' + (p.label ? 'pf-pin--num' : 'pf-pin--dot');
    el.style.setProperty('--pin', p.color);
    if (p.label) el.textContent = p.label;
    if (p.title) el.title = p.title;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', p.title || '장소');
    el.dataset.id = p.id;
    return el;
  }

  function boundsOf(points) {
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const p of points) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    return { minLat, maxLat, minLng, maxLng };
  }

  // ───────── 주소 결과를 한 모양으로 맞추기 ─────────
  function joinUnique(parts) {
    const out = [];
    for (const p of parts) {
      const s = (p || '').trim();
      if (s && !out.includes(s)) out.push(s);
    }
    return out.join(' ');
  }

  function normKakao(r) {
    const road = r.road_address || null;
    const addr = r.address || null;
    const base = addr || road || {};
    const r1 = base.region_1depth_name || '';
    const r2 = base.region_2depth_name || '';
    const r3 = base.region_3depth_name || '';
    const full = (road && road.address_name) || (addr && addr.address_name) || joinUnique([r1, r2, r3]);
    const name = (road && road.building_name) ? road.building_name.trim() : '';
    return { full, name, short: joinUnique([r2, r3]) || full, region: joinUnique([r1, r2]), cc: 'kr' };
  }

  function normNaver(response) {
    const v2 = (response && response.v2) || {};
    const results = v2.results || [];
    const first = results.find((x) => x && x.region) || {};
    const reg = first.region || {};
    const r1 = (reg.area1 && reg.area1.name) || '';
    const r2 = (reg.area2 && reg.area2.name) || '';
    const r3 = (reg.area3 && reg.area3.name) || '';
    const addr = v2.address || {};
    let name = '';
    for (const x of results) {
      const add0 = x && x.land && x.land.addition0;
      if (add0 && add0.type === 'building' && add0.value) { name = add0.value; break; }
    }
    const full = addr.roadAddress || addr.jibunAddress || joinUnique([r1, r2, r3]);
    if (!full) return null;
    return { full, name, short: joinUnique([r2, r3]) || full, region: joinUnique([r1, r2]), cc: 'kr' };
  }

  function normGoogle(results) {
    const res = results[0];
    const comp = (type) => {
      for (const r of results) {
        const c = (r.address_components || []).find((x) => x.types.includes(type));
        if (c) return c.long_name;
      }
      return '';
    };
    const country = comp('country');
    const cc = ((results[0].address_components || []).find((x) => x.types.includes('country')) || {}).short_name || '';
    const r1 = comp('administrative_area_level_1');
    const r2 = comp('locality') || comp('sublocality_level_1') || comp('administrative_area_level_2');
    const r3 = comp('sublocality_level_2') || comp('sublocality_level_1') || comp('neighborhood');
    const full = String(res.formatted_address || '').replace(/^대한민국\s*/, '');
    const kr = cc.toUpperCase() === 'KR';
    return {
      full,
      name: '',
      short: joinUnique(kr ? [r2, r3] : [r2 || r1, r3]) || full,
      region: kr ? joinUnique([r1, r2]) : joinUnique([country, r2 || r1]),
      cc: cc.toLowerCase()
    };
  }

  // ───────── 공통 바탕 ─────────
  class BaseMap {
    constructor(el, opts) {
      this.el = el;
      this.opts = opts || {};
      this.items = new Map();
      this.selected = null;
      this.tilesOk = false;
    }
    setSelected(id) {
      if (this.selected && this.items.has(this.selected)) this.mark(this.selected, false);
      this.selected = id || null;
      if (this.selected && this.items.has(this.selected)) this.mark(this.selected, true);
    }
    mark(id, on) {
      const it = this.items.get(id);
      if (!it) return;
      it.el.classList.toggle('is-active', on);
      this.raise(it, on);
    }
    raise() {}
    select(id) {
      if (this.opts.onSelect) this.opts.onSelect(id);
    }
    tilesLoaded() {
      if (this.tilesOk) return;
      this.tilesOk = true;
      if (this.opts.onTiles) this.opts.onTiles();
    }
    canGeocode() { return false; }
  }

  // ───────── 기본 지도: OpenStreetMap + Leaflet ─────────
  class OsmMap extends BaseMap {
    async init() {
      if (!window.L) throw new Error('leaflet-missing');
      this.map = L.map(this.el, { zoomControl: false, worldCopyJump: true, attributionControl: true })
        .setView([KOREA.lat, KOREA.lng], 7);
      L.control.zoom({ position: 'bottomright', zoomInTitle: '확대', zoomOutTitle: '축소' }).addTo(this.map);
      this.map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 기여자',
        referrerPolicy: 'strict-origin-when-cross-origin'
      });
      tiles.on('tileload', () => this.tilesLoaded());
      tiles.addTo(this.map);
      this.layer = L.layerGroup().addTo(this.map);
    }
    render(points, route) {
      this.layer.clearLayers();
      this.items.clear();
      if (route && route.path.length > 1) {
        L.polyline(route.path, { color: route.color, weight: 4, opacity: 0.85, lineJoin: 'round', lineCap: 'round', interactive: false })
          .addTo(this.layer);
      }
      for (const p of points) {
        const el = pinElement(p);
        const size = p.label ? 30 : 16;
        const icon = L.divIcon({ html: el, className: 'pf-leaflet-icon', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
        const m = L.marker([p.lat, p.lng], { icon, keyboard: false, riseOnHover: true }).addTo(this.layer);
        m.on('click', () => this.select(p.id));
        this.items.set(p.id, { el, m });
      }
      if (this.selected) this.setSelected(this.selected);
    }
    raise(it, on) { it.m.setZIndexOffset(on ? 1000 : 0); }
    fit(points) {
      if (!points.length) { this.map.setView([KOREA.lat, KOREA.lng], 7); return; }
      if (points.length === 1) { this.map.setView([points[0].lat, points[0].lng], 15); return; }
      const b = boundsOf(points);
      this.map.fitBounds([[b.minLat, b.minLng], [b.maxLat, b.maxLng]], { padding: [56, 56], maxZoom: 16 });
    }
    focus(p) {
      const z = this.map.getZoom() < 13 ? 15 : this.map.getZoom();
      this.map.setView([p.lat, p.lng], z, { animate: true });
    }
    resize() { this.map.invalidateSize(); }
    destroy() { try { this.map.remove(); } catch (e) { /* 이미 없음 */ } }
  }

  // ───────── 카카오맵 (다음 지도) ─────────
  class KakaoMap extends BaseMap {
    async init() {
      if (!(window.kakao && window.kakao.maps && window.kakao.maps.Map)) {
        await loadScript('https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&libraries=services&appkey=' + encodeURIComponent(this.opts.key));
        if (!(window.kakao && window.kakao.maps && window.kakao.maps.load)) throw new Error('kakao-sdk');
        await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('kakao-load-timeout')), 12000);
          window.kakao.maps.load(() => { clearTimeout(t); resolve(); });
        });
      }
      const K = window.kakao.maps;
      this.map = new K.Map(this.el, { center: new K.LatLng(KOREA.lat, KOREA.lng), level: 13 });
      this.map.addControl(new K.ZoomControl(), K.ControlPosition.BOTTOMRIGHT);
      K.event.addListener(this.map, 'tilesloaded', () => this.tilesLoaded());
      this.geocoder = K.services ? new K.services.Geocoder() : null;
      this.line = null;
    }
    clear() {
      for (const it of this.items.values()) it.ov.setMap(null);
      this.items.clear();
      if (this.line) { this.line.setMap(null); this.line = null; }
    }
    render(points, route) {
      const K = window.kakao.maps;
      this.clear();
      if (route && route.path.length > 1) {
        this.line = new K.Polyline({
          path: route.path.map(([a, b]) => new K.LatLng(a, b)),
          strokeWeight: 4, strokeColor: route.color, strokeOpacity: 0.85, strokeStyle: 'solid'
        });
        this.line.setMap(this.map);
      }
      for (const p of points) {
        const el = pinElement(p);
        el.addEventListener('click', (e) => { e.stopPropagation(); this.select(p.id); });
        const ov = new K.CustomOverlay({
          position: new K.LatLng(p.lat, p.lng), content: el,
          xAnchor: 0.5, yAnchor: 0.5, clickable: true, zIndex: 1
        });
        ov.setMap(this.map);
        this.items.set(p.id, { el, ov });
      }
      if (this.selected) this.setSelected(this.selected);
    }
    raise(it, on) { it.ov.setZIndex(on ? 10 : 1); }
    fit(points) {
      const K = window.kakao.maps;
      if (!points.length) { this.map.setLevel(13); this.map.setCenter(new K.LatLng(KOREA.lat, KOREA.lng)); return; }
      if (points.length === 1) { this.map.setLevel(4); this.map.setCenter(new K.LatLng(points[0].lat, points[0].lng)); return; }
      const b = new K.LatLngBounds();
      for (const p of points) b.extend(new K.LatLng(p.lat, p.lng));
      this.map.setBounds(b, 64, 56, 64, 56);
    }
    focus(p) {
      const K = window.kakao.maps;
      if (this.map.getLevel() > 7) this.map.setLevel(4);
      this.map.panTo(new K.LatLng(p.lat, p.lng));
    }
    resize() { if (this.map) this.map.relayout(); }
    destroy() { this.clear(); this.el.innerHTML = ''; }
    canGeocode(lat, lng) { return !!this.geocoder && inKorea(lat, lng); }
    reverseGeocode(lat, lng) {
      return new Promise((resolve, reject) => {
        const S = window.kakao.maps.services.Status;
        this.geocoder.coord2Address(lng, lat, (result, status) => {
          if (status === S.OK && result && result[0]) resolve(normKakao(result[0]));
          else if (status === S.ZERO_RESULT) resolve(null);
          else reject(new Error('kakao-geocode'));
        });
      });
    }
  }

  // ───────── 네이버 지도 ─────────
  class NaverMap extends BaseMap {
    async init() {
      if (!(window.naver && window.naver.maps && window.naver.maps.Map)) {
        // 인증에 실패하면 네이버 지도 API가 이 함수를 불러요.
        window.navermap_authFailure = () => { if (this.opts.onAuthFail) this.opts.onAuthFail(); };
        await loadScript('https://oapi.map.naver.com/openapi/v3/maps.js?submodules=geocoder&ncpKeyId=' + encodeURIComponent(this.opts.key));
        if (!(window.naver && window.naver.maps && window.naver.maps.Map)) throw new Error('naver-sdk');
      }
      const N = window.naver.maps;
      this.map = new N.Map(this.el, {
        center: new N.LatLng(KOREA.lat, KOREA.lng),
        zoom: 7,
        zoomControl: true,
        zoomControlOptions: { position: N.Position.RIGHT_BOTTOM },
        mapDataControl: false,
        scaleControl: true
      });
      N.Event.addListener(this.map, 'tilesloaded', () => this.tilesLoaded());
      this.line = null;
    }
    clear() {
      for (const it of this.items.values()) it.mk.setMap(null);
      this.items.clear();
      if (this.line) { this.line.setMap(null); this.line = null; }
    }
    render(points, route) {
      const N = window.naver.maps;
      this.clear();
      if (route && route.path.length > 1) {
        this.line = new N.Polyline({
          map: this.map,
          path: route.path.map(([a, b]) => new N.LatLng(a, b)),
          strokeColor: route.color, strokeWeight: 4, strokeOpacity: 0.85,
          strokeLineCap: 'round', strokeLineJoin: 'round', clickable: false
        });
      }
      for (const p of points) {
        const el = pinElement(p);
        const s = p.label ? 30 : 16;
        const mk = new N.Marker({
          map: this.map,
          position: new N.LatLng(p.lat, p.lng),
          title: p.title || '',
          icon: { content: el, size: new N.Size(s, s), anchor: new N.Point(s / 2, s / 2) },
          zIndex: 1
        });
        N.Event.addListener(mk, 'click', () => this.select(p.id));
        this.items.set(p.id, { el, mk });
      }
      if (this.selected) this.setSelected(this.selected);
    }
    raise(it, on) { it.mk.setZIndex(on ? 100 : 1); }
    fit(points) {
      const N = window.naver.maps;
      if (!points.length) { this.map.setCenter(new N.LatLng(KOREA.lat, KOREA.lng)); this.map.setZoom(7); return; }
      if (points.length === 1) { this.map.setCenter(new N.LatLng(points[0].lat, points[0].lng)); this.map.setZoom(16); return; }
      const b = boundsOf(points);
      const bounds = new N.LatLngBounds(new N.LatLng(b.minLat, b.minLng), new N.LatLng(b.maxLat, b.maxLng));
      this.map.fitBounds(bounds, { top: 64, right: 56, bottom: 64, left: 56 });
    }
    focus(p) {
      const N = window.naver.maps;
      if (this.map.getZoom() < 12) this.map.setZoom(15);
      this.map.panTo(new N.LatLng(p.lat, p.lng));
    }
    resize() {
      const N = window.naver.maps;
      if (this.map && this.el.clientWidth && this.el.clientHeight) {
        this.map.setSize(new N.Size(this.el.clientWidth, this.el.clientHeight));
      }
    }
    destroy() {
      this.clear();
      try { if (this.map && this.map.destroy) this.map.destroy(); } catch (e) { /* 무시 */ }
      this.el.innerHTML = '';
    }
    canGeocode(lat, lng) { return inKorea(lat, lng); }
    async reverseGeocode(lat, lng) {
      const N = window.naver.maps;
      await waitFor(() => N.Service && N.Service.reverseGeocode, 6000);
      return new Promise((resolve, reject) => {
        N.Service.reverseGeocode({
          coords: new N.LatLng(lat, lng),
          orders: [N.Service.OrderType.ROAD_ADDR, N.Service.OrderType.ADDR].join(',')
        }, (status, response) => {
          if (status !== N.Service.Status.OK) return reject(new Error('naver-geocode'));
          resolve(normNaver(response));
        });
      });
    }
  }

  // ───────── 구글 지도 ─────────
  class GoogleMap extends BaseMap {
    async init() {
      if (!(window.google && window.google.maps && window.google.maps.Map)) {
        // 키 인증에 실패하면 구글 지도 API가 이 함수를 불러요.
        window.gm_authFailure = () => { if (this.opts.onAuthFail) this.opts.onAuthFail(); };
        await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('google-timeout')), 20000);
          window.__pfGoogleReady = () => { clearTimeout(t); resolve(); };
          loadScript('https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(this.opts.key) +
            '&language=ko&region=KR&loading=async&callback=__pfGoogleReady', 20000)
            .catch((e) => { clearTimeout(t); reject(e); });
        });
      }
      const G = window.google.maps;
      const lib = G.importLibrary ? await G.importLibrary('maps') : G;
      const geo = G.importLibrary ? await G.importLibrary('geocoding') : G;
      this.G = G;
      this.map = new lib.Map(this.el, {
        center: KOREA, zoom: 7,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        clickableIcons: false, gestureHandling: 'greedy'
      });
      this.map.addListener('tilesloaded', () => this.tilesLoaded());
      this.geocoder = new geo.Geocoder();
      this.Pin = makeGooglePin(lib.OverlayView || G.OverlayView, G);
      this.Polyline = lib.Polyline || G.Polyline;
      this.line = null;
    }
    clear() {
      for (const it of this.items.values()) it.ov.setMap(null);
      this.items.clear();
      if (this.line) { this.line.setMap(null); this.line = null; }
    }
    render(points, route) {
      this.clear();
      if (route && route.path.length > 1) {
        this.line = new this.Polyline({
          map: this.map,
          path: route.path.map(([a, b]) => ({ lat: a, lng: b })),
          strokeColor: route.color, strokeOpacity: 0.85, strokeWeight: 4, clickable: false
        });
      }
      for (const p of points) {
        const el = pinElement(p);
        el.classList.add('pf-pin--abs');
        el.addEventListener('click', (e) => { e.stopPropagation(); this.select(p.id); });
        const ov = new this.Pin(p, el);
        ov.setMap(this.map);
        this.items.set(p.id, { el, ov });
      }
      if (this.selected) this.setSelected(this.selected);
    }
    raise(it, on) { it.el.style.zIndex = on ? '10' : ''; }
    fit(points) {
      if (!points.length) { this.map.setCenter(KOREA); this.map.setZoom(7); return; }
      if (points.length === 1) { this.map.setCenter({ lat: points[0].lat, lng: points[0].lng }); this.map.setZoom(16); return; }
      const b = boundsOf(points);
      this.map.fitBounds(new this.G.LatLngBounds({ lat: b.minLat, lng: b.minLng }, { lat: b.maxLat, lng: b.maxLng }), 60);
    }
    focus(p) {
      if (this.map.getZoom() < 12) this.map.setZoom(15);
      this.map.panTo({ lat: p.lat, lng: p.lng });
    }
    resize() { /* 구글 지도는 크기 변화를 스스로 따라가요 */ }
    destroy() { this.clear(); this.el.innerHTML = ''; }
    canGeocode() { return !!this.geocoder; }
    async reverseGeocode(lat, lng) {
      try {
        const { results } = await this.geocoder.geocode({ location: { lat, lng }, language: 'ko' });
        return results && results.length ? normGoogle(results) : null;
      } catch (e) {
        if (e && (e.code === 'ZERO_RESULTS' || /ZERO_RESULTS/.test(String(e.message)))) return null;
        throw e;
      }
    }
  }

  function makeGooglePin(OverlayView, G) {
    return class Pin extends OverlayView {
      constructor(p, el) {
        super();
        this.pos = new G.LatLng(p.lat, p.lng);
        this.el = el;
      }
      onAdd() {
        if (OverlayView.preventMapHitsAndGesturesFrom) OverlayView.preventMapHitsAndGesturesFrom(this.el);
        this.getPanes().overlayMouseTarget.appendChild(this.el);
      }
      draw() {
        const proj = this.getProjection();
        if (!proj) return; // 지도가 사라지는 중이거나 아직 준비되지 않았어요
        const pt = proj.fromLatLngToDivPixel(this.pos);
        if (pt) {
          this.el.style.left = pt.x + 'px';
          this.el.style.top = pt.y + 'px';
        }
      }
      onRemove() { this.el.remove(); }
    };
  }

  // 대한민국 근처인지 (카카오·네이버 주소 찾기는 국내만 돼요)
  function inKorea(lat, lng) {
    return lat >= 32.8 && lat <= 38.9 && lng >= 124 && lng <= 132.2;
  }

  // ───────── 지도 앱으로 열기 링크 ─────────
  function links(lat, lng, name) {
    const la = lat.toFixed(6), ln = lng.toFixed(6);
    const label = String(name || '사진 찍은 곳').replace(/[,/\\#?]/g, ' ').replace(/\s+/g, ' ').trim() || '사진 찍은 곳';
    const enc = encodeURIComponent(label);
    // 카카오맵 공식 바로가기 형식: https://map.kakao.com/link/map/이름,위도,경도
    const kakao = `https://map.kakao.com/link/map/${enc},${la},${ln}`;
    // 구글 지도 공식 URL 형식: https://www.google.com/maps/search/?api=1&query=위도,경도
    const google = `https://www.google.com/maps/search/?api=1&query=${la}%2C${ln}`;
    let naver, naverApp = false;
    const appname = encodeURIComponent(location.protocol.startsWith('http') ? location.origin + location.pathname : 'photo-footprints');
    if (/Android/i.test(navigator.userAgent)) {
      // 네이버 지도 앱 URL Scheme (안드로이드 인텐트, 앱이 없으면 플레이 스토어로 가요)
      naver = `intent://place?lat=${la}&lng=${ln}&name=${enc}&appname=${appname}#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end`;
      naverApp = true;
    } else if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      naver = `nmap://place?lat=${la}&lng=${ln}&name=${enc}&appname=${appname}`;
      naverApp = true;
    } else {
      // PC 웹: 공식 문서는 없지만 네이버 클라우드 포럼에서 안내한 형식이에요.
      naver = `https://map.naver.com/?lng=${ln}&lat=${la}&title=${enc}`;
    }
    return { kakao, naver, google, naverApp };
  }

  PM.maps = {
    NAMES,
    inKorea,
    links,
    loaded(provider) {
      if (provider === 'kakao') return !!(window.kakao && window.kakao.maps && window.kakao.maps.Map);
      if (provider === 'naver') return !!(window.naver && window.naver.maps && window.naver.maps.Map);
      if (provider === 'google') return !!(window.google && window.google.maps && window.google.maps.Map);
      return true;
    },
    async create(provider, el, opts) {
      const Cls = { osm: OsmMap, kakao: KakaoMap, naver: NaverMap, google: GoogleMap }[provider] || OsmMap;
      const m = new Cls(el, opts);
      m.id = provider;
      await m.init();
      return m;
    }
  };
})(window.PM = window.PM || {});
