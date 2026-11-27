/*
 * 사진 발자국 — 좌표로 주소 찾기
 * 지금 쓰는 지도(카카오·네이버·구글)로 찾고, 안 되면 OpenStreetMap Nominatim으로 찾아요.
 * Nominatim 이용 정책에 따라 1초에 한 번보다 느리게 요청하고, 찾은 주소는 저장해 두고 다시 묻지 않아요.
 */
(function (PM) {
  'use strict';

  const U = PM.util;
  const NEAR_M = 40;            // 이 거리 안에서 찾은 주소는 함께 써요
  const OSM_GAP_MS = 1100;      // Nominatim: 1초에 1번 이하
  const SDK_GAP_MS = 150;

  const cache = new Map();      // key → 주소
  const buckets = new Map();    // 근처 주소를 빨리 찾기 위한 칸
  const failed = new Set();     // 이번에 찾지 못한 좌표 (다시 묻지 않아요)
  const queued = new Set();
  let queue = [];
  let running = false;
  let paused = false;
  let netErrors = 0;
  let getMap = () => null;
  const listeners = new Set();
  const stats = { done: 0, total: 0 };

  const keyOf = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const bucketOf = (lat, lng) => `${Math.floor(lat * 400)}:${Math.floor(lng * 400)}`;

  function index(entry) {
    cache.set(entry.key, entry);
    const b = bucketOf(entry.lat, entry.lng);
    let arr = buckets.get(b);
    if (!arr) buckets.set(b, (arr = []));
    arr.push(entry);
  }

  function get(lat, lng) {
    const exact = cache.get(keyOf(lat, lng));
    if (exact) return exact;
    const bi = Math.floor(lat * 400), bj = Math.floor(lng * 400);
    let best = null, bestD = NEAR_M;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const arr = buckets.get(`${bi + di}:${bj + dj}`);
        if (!arr) continue;
        for (const e of arr) {
          const d = U.distance({ lat, lng }, e);
          if (d <= bestD) { bestD = d; best = e; }
        }
      }
    }
    return best;
  }

  function status(lat, lng) {
    if (get(lat, lng)) return 'done';
    const k = keyOf(lat, lng);
    if (failed.has(k)) return 'failed';
    if (queued.has(k)) return 'pending';
    return 'none';
  }

  // ───────── OpenStreetMap Nominatim ─────────
  function normOsm(j) {
    const a = j.address || {};
    const cc = String(a.country_code || '').toLowerCase();
    const r1 = a.province || a.state || a.city || a.region || '';
    const r2 = [a.city, a.county, a.borough, a.city_district, a.town, a.municipality].find((x) => x && x !== r1) || '';
    const r3 = [a.suburb, a.quarter, a.neighbourhood, a.village, a.hamlet].find((x) => x && x !== r2) || '';
    const road = a.road ? (a.house_number ? `${a.road} ${a.house_number}` : a.road) : '';
    const join = (arr) => arr.filter((x, i) => x && arr.indexOf(x) === i).join(' ');
    let name = (j.name || '').trim();
    if (name && (name === a.road || name === r3 || name === r2)) name = '';
    if (cc === 'kr') {
      const full = join([r1, r2, road || r3]);
      return { full, name, short: join([r2, r3]) || full, region: join([r1, r2]), cc };
    }
    const city = a.city || a.town || a.village || a.county || r1;
    const full = join([a.country, r1, city, r3, road]);
    return { full, name, short: join([city, r3]) || full, region: join([a.country, city]), cc };
  }

  async function nominatim(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=ko&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, referrerPolicy: 'strict-origin-when-cross-origin' });
    if (!res.ok) {
      const err = new Error('nominatim-' + res.status);
      err.status = res.status;
      throw err;
    }
    const j = await res.json();
    if (!j || j.error) return null;
    return normOsm(j);
  }

  async function lookup(job) {
    const map = getMap();
    if (map && map.reverseGeocode && map.canGeocode(job.lat, job.lng)) {
      try {
        const r = await map.reverseGeocode(job.lat, job.lng);
        if (r) return { r, src: map.id };
      } catch (e) { /* 아래 Nominatim으로 */ }
    }
    const r = await nominatim(job.lat, job.lng);
    return { r, src: 'osm' };
  }

  async function run() {
    if (running) return;
    running = true;
    while (queue.length && !paused) {
      const job = queue.shift();
      let used = 'osm';
      try {
        const { r, src } = await lookup(job);
        used = src;
        netErrors = 0;
        if (r && r.full) {
          const entry = Object.assign({ key: job.key, lat: job.lat, lng: job.lng, src, at: Date.now() }, r);
          index(entry);
          if (PM.store) PM.store.put('geo', entry).catch(() => {});
        } else {
          failed.add(job.key);
        }
      } catch (e) {
        failed.add(job.key);
        netErrors++;
        if (e && (e.status === 429 || e.status === 403)) paused = true;
      }
      queued.delete(job.key);
      stats.done++;
      emit(job.key);
      if (netErrors >= 3) {
        paused = true;
        emit(null, 'offline');
      }
      if (queue.length) await U.sleep(used === 'osm' ? OSM_GAP_MS : SDK_GAP_MS);
    }
    running = false;
    if (!queue.length) { stats.done = 0; stats.total = 0; }
    emit(null, paused ? 'paused' : 'idle');
  }

  function emit(key, state) {
    for (const fn of listeners) {
      try { fn(key, state); } catch (e) { /* 무시 */ }
    }
  }

  PM.geo = {
    keyOf,
    get,
    status,
    stats: () => ({ done: stats.done, total: stats.total, running, paused }),
    onUpdate(fn) { listeners.add(fn); },
    setMapGetter(fn) { getMap = fn; },
    load(entries) { for (const e of entries || []) if (e && e.key && Number.isFinite(e.lat)) index(e); },
    addLocal(entry) { index(entry); },
    // 예시 데이터용 주소를 지워요 (저장된 진짜 주소는 그대로)
    dropSample() {
      const keep = Array.from(cache.values()).filter((e) => !e.sample);
      cache.clear();
      buckets.clear();
      for (const e of keep) index(e);
    },
    dump() { return Array.from(cache.values()).filter((e) => !e.sample); },
    // points: [{lat, lng}], 앞쪽이 먼저 처리돼요
    request(points, { front = false } = {}) {
      const jobs = [];
      for (const p of points) {
        const key = keyOf(p.lat, p.lng);
        if (queued.has(key) || failed.has(key) || get(p.lat, p.lng)) continue;
        queued.add(key);
        jobs.push({ key, lat: p.lat, lng: p.lng });
      }
      if (!jobs.length) return 0;
      queue = front ? jobs.concat(queue) : queue.concat(jobs);
      stats.total += jobs.length;
      run();
      return jobs.length;
    },
    retry() {
      failed.clear();
      paused = false;
      netErrors = 0;
    },
    stop() {
      for (const j of queue) queued.delete(j.key);
      queue = [];
      stats.done = 0;
      stats.total = 0;
    },
    clearAll() {
      this.stop();
      cache.clear();
      buckets.clear();
      failed.clear();
    }
  };
})(window.PM = window.PM || {});
