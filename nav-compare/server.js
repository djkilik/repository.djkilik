// 3사 네비 경로 비교 서버 (TMAP · 네이버 · 카카오)
// 외부 의존성 없이 Node.js 18+ 만으로 실행됩니다.  →  node server.js
//
// API 키는 브라우저에 노출되지 않도록 서버에서만 사용합니다.
// 키가 없는 서비스는 자동으로 "데모 모드"(가상 경로)로 동작합니다.

const http = require('http');
const fs = require('fs');
const path = require('path');

loadDotEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 3000);
const KEYS = {
  tmap: process.env.TMAP_APP_KEY || '',
  naverId: process.env.NAVER_CLIENT_ID || '',
  naverSecret: process.env.NAVER_CLIENT_SECRET || '',
  kakao: process.env.KAKAO_REST_API_KEY || '',
};
// 네이버 클라우드 Maps 신규 도메인. 구 상품을 쓰는 경우 .env 에서
// https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving 으로 바꾸세요.
const NAVER_URL = process.env.NAVER_DIRECTIONS_URL || 'https://maps.apigw.ntruss.com/map-direction/v1/driving';

const has = {
  tmap: !!KEYS.tmap,
  naver: !!(KEYS.naverId && KEYS.naverSecret),
  kakao: !!KEYS.kakao,
};

// ───────────────────────── 경로 API ─────────────────────────

// TMAP 자동차 경로안내 (SK open API)
async function routeTmap(s, e) {
  const res = await fetchJson('https://apis.openapi.sk.com/tmap/routes?version=1', {
    method: 'POST',
    headers: { appKey: KEYS.tmap, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      startX: String(s.x), startY: String(s.y), endX: String(e.x), endY: String(e.y),
      reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO',
      searchOption: '0', // 0: 추천(교통최적)
      trafficInfo: 'N',
    }),
  });
  const features = res.features || [];
  const props = (features.find(f => f.properties && f.properties.totalTime != null) || {}).properties;
  if (!props) throw new Error('TMAP 응답에 경로 요약이 없습니다');
  const pathPts = [];
  for (const f of features) {
    if (f.geometry && f.geometry.type === 'LineString') {
      for (const [x, y] of f.geometry.coordinates) pathPts.push([y, x]);
    }
  }
  return {
    durationSec: props.totalTime,
    distanceM: props.totalDistance,
    tollWon: props.totalFare ?? null,
    taxiWon: props.taxiFare ?? null,
    path: pathPts,
  };
}

// 네이버 클라우드 Maps Directions 5 (driving)
async function routeNaver(s, e) {
  const url = `${NAVER_URL}?start=${s.x},${s.y}&goal=${e.x},${e.y}&option=traoptimal`;
  const res = await fetchJson(url, {
    headers: {
      'x-ncp-apigw-api-key-id': KEYS.naverId,
      'x-ncp-apigw-api-key': KEYS.naverSecret,
    },
  });
  if (res.code !== 0) throw new Error(res.message || `네이버 오류 code=${res.code}`);
  const r = res.route && res.route.traoptimal && res.route.traoptimal[0];
  if (!r) throw new Error('네이버 응답에 경로가 없습니다');
  return {
    durationSec: Math.round(r.summary.duration / 1000), // ms → s
    distanceM: r.summary.distance,
    tollWon: r.summary.tollFare ?? null,
    taxiWon: r.summary.taxiFare ?? null,
    fuelWon: r.summary.fuelPrice ?? null,
    path: (r.path || []).map(([x, y]) => [y, x]),
  };
}

// 카카오모빌리티 자동차 길찾기
async function routeKakao(s, e) {
  const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${s.x},${s.y}&destination=${e.x},${e.y}&priority=RECOMMEND`;
  const res = await fetchJson(url, { headers: { Authorization: `KakaoAK ${KEYS.kakao}` } });
  const r = res.routes && res.routes[0];
  if (!r) throw new Error('카카오 응답에 경로가 없습니다');
  if (r.result_code !== 0) throw new Error(r.result_msg || `카카오 오류 code=${r.result_code}`);
  const pathPts = [];
  for (const sec of r.sections || []) {
    for (const road of sec.roads || []) {
      const v = road.vertexes || [];
      for (let i = 0; i + 1 < v.length; i += 2) pathPts.push([v[i + 1], v[i]]);
    }
  }
  return {
    durationSec: r.summary.duration,
    distanceM: r.summary.distance,
    tollWon: r.summary.fare ? r.summary.fare.toll : null,
    taxiWon: r.summary.fare ? r.summary.fare.taxi : null,
    path: pathPts,
  };
}

// ───────────────────────── 장소 검색 ─────────────────────────

async function searchPlaces(q, near) {
  if (has.kakao) {
    let url = `https://dapi.kakao.com/v2/local/search/keyword.json?size=10&query=${encodeURIComponent(q)}`;
    if (near) url += `&x=${near.x}&y=${near.y}&sort=accuracy`;
    const res = await fetchJson(url, { headers: { Authorization: `KakaoAK ${KEYS.kakao}` } });
    return (res.documents || []).map(d => ({
      name: d.place_name,
      address: d.road_address_name || d.address_name,
      x: Number(d.x), y: Number(d.y),
    }));
  }
  if (has.tmap) {
    const url = `https://apis.openapi.sk.com/tmap/pois?version=1&count=10&reqCoordType=WGS84GEO&resCoordType=WGS84GEO&searchKeyword=${encodeURIComponent(q)}`;
    const res = await fetchJson(url, { headers: { appKey: KEYS.tmap, Accept: 'application/json' } });
    const pois = (res.searchPoiInfo && res.searchPoiInfo.pois && res.searchPoiInfo.pois.poi) || [];
    return pois.map(p => ({
      name: p.name,
      address: [p.upperAddrName, p.middleAddrName, p.lowerAddrName, p.roadName].filter(Boolean).join(' '),
      x: Number(p.frontLon || p.noorLon), y: Number(p.frontLat || p.noorLat),
    }));
  }
  // 데모용 장소 목록
  return DEMO_PLACES.filter(p => (p.name + p.address).includes(q.trim()) || !q.trim());
}

const DEMO_PLACES = [
  { name: '서울역', address: '서울 용산구 한강대로 405', x: 126.9707, y: 37.5547 },
  { name: '강남역', address: '서울 강남구 강남대로 396', x: 127.0276, y: 37.4979 },
  { name: '인천국제공항 제1여객터미널', address: '인천 중구 공항로 272', x: 126.4505, y: 37.4492 },
  { name: '판교역', address: '경기 성남시 분당구 판교역로 160', x: 127.1112, y: 37.3948 },
  { name: '수원화성', address: '경기 수원시 팔달구 정조로 825', x: 127.0186, y: 37.2871 },
  { name: '잠실 롯데월드타워', address: '서울 송파구 올림픽로 300', x: 127.1025, y: 37.5126 },
  { name: '일산 킨텍스', address: '경기 고양시 일산서구 킨텍스로 217-60', x: 126.7453, y: 37.6688 },
  { name: '대전역', address: '대전 동구 중앙로 215', x: 127.4346, y: 36.3324 },
];

// ───────────────────────── 데모 경로 ─────────────────────────

function demoRoute(provider, s, e) {
  const seed = hash(`${provider}|${s.x.toFixed(4)},${s.y.toFixed(4)}|${e.x.toFixed(4)},${e.y.toFixed(4)}`);
  const rnd = mulberry32(seed);
  const straight = haversine(s, e);
  const bend = { tmap: 0.12, naver: -0.10, kakao: 0.03 }[provider];
  const pathPts = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const lat = s.y + (e.y - s.y) * t;
    const lng = s.x + (e.x - s.x) * t;
    const off = Math.sin(Math.PI * t) * bend;
    pathPts.push([lat + (e.x - s.x) * off, lng - (e.y - s.y) * off]);
  }
  const distanceM = Math.round(straight * (1.25 + rnd() * 0.15));
  const speedKmh = 38 + rnd() * 22;
  const durationSec = Math.round(distanceM / (speedKmh / 3.6));
  const tollWon = distanceM > 15000 ? Math.round((distanceM / 1000) * (30 + rnd() * 40) / 100) * 100 : 0;
  return { durationSec, distanceM, tollWon, taxiWon: Math.round((4800 + distanceM * 1.1) / 100) * 100, path: pathPts };
}

// ───────────────────────── HTTP 서버 ─────────────────────────

const ROUTERS = { tmap: routeTmap, naver: routeNaver, kakao: routeKakao };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  try {
    if (u.pathname === '/api/config') {
      return sendJson(res, { providers: has });
    }
    if (u.pathname === '/api/search') {
      const q = u.searchParams.get('q') || '';
      const nx = Number(u.searchParams.get('x')), ny = Number(u.searchParams.get('y'));
      const near = Number.isFinite(nx) && Number.isFinite(ny) && nx && ny ? { x: nx, y: ny } : null;
      return sendJson(res, { demo: !has.kakao && !has.tmap, places: await searchPlaces(q, near) });
    }
    if (u.pathname === '/api/routes') {
      const s = { x: Number(u.searchParams.get('sx')), y: Number(u.searchParams.get('sy')) };
      const e = { x: Number(u.searchParams.get('ex')), y: Number(u.searchParams.get('ey')) };
      if (![s.x, s.y, e.x, e.y].every(Number.isFinite)) return sendJson(res, { error: '좌표가 올바르지 않습니다' }, 400);
      // 키가 하나도 없을 때만 데모(가상) 경로를 보여줍니다.
      // 일부만 있으면 가짜 데이터를 실제 결과와 섞지 않고, 키 없는 곳은 비교에서 뺍니다.
      const anyReal = has.tmap || has.naver || has.kakao;
      const results = await Promise.all(Object.keys(ROUTERS).map(async p => {
        const t0 = Date.now();
        if (!has[p]) {
          if (!anyReal) return { provider: p, ok: true, demo: true, ...demoRoute(p, s, e) };
          return { provider: p, ok: false, skipped: true, error: 'API 키 미등록' };
        }
        try {
          return { provider: p, ok: true, demo: false, ...(await ROUTERS[p](s, e)), ms: Date.now() - t0 };
        } catch (err) {
          return { provider: p, ok: false, demo: false, error: String(err.message || err) };
        }
      }));
      return sendJson(res, { results });
    }
    return serveStatic(u.pathname, res);
  } catch (err) {
    return sendJson(res, { error: String(err.message || err) }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`네비 비교 앱 실행 중 → http://localhost:${PORT}`);
  const anyKey = Object.values(has).some(Boolean);
  for (const [p, ok] of Object.entries(has)) {
    console.log(`  ${p.padEnd(6)} ${ok ? '실제 API' : anyKey ? '키 없음 → 비교에서 제외' : '키 없음 → 데모(가상) 경로'}`);
  }
});

// ───────────────────────── 유틸 ─────────────────────────

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    let r;
    try {
      r = await fetch(url, { ...opts, signal: ctrl.signal });
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('응답 시간 초과 (10초)');
      throw new Error(`서버에 연결하지 못했습니다 (${new URL(url).host}). 인터넷 연결을 확인하세요.`);
    }
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* JSON이 아닌 응답 */ }
    if (!r.ok || !data) {
      const detail = (data && (data.message || data.msg || (data.error && (data.error.message || data.error.msg)) || (data.errorMessage))) || text.slice(0, 200);
      const hint = r.status === 401 || r.status === 403 ? '키가 틀렸거나, 이 API 사용 권한이 꺼져 있습니다'
        : r.status === 429 ? '사용량 한도를 넘었습니다'
        : '요청이 실패했습니다';
      throw new Error(`${hint} (HTTP ${r.status}: ${detail})`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function sendJson(res, obj, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
function serveStatic(p, res) {
  const root = path.join(__dirname, 'public');
  const file = path.normalize(path.join(root, p === '/' ? 'index.html' : p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function haversine(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.y - a.y) * rad, dLng = (b.x - a.x) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.y * rad) * Math.cos(b.y * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
