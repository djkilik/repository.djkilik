/*
 * 사진 발자국 — 화면과 동작
 */
(function (PM) {
  'use strict';

  const U = PM.util;
  const { $, $$, esc } = U;
  const NAMES = PM.maps.NAMES;
  const OSM_AUTO_LIMIT = 30;   // OpenStreetMap 주소를 한 번에 자동으로 찾는 최대 장소 수
  // 저장·백업 기록 검사 규칙 (화면에 넣는 값이 HTML을 깨뜨리지 못하게 해요)
  const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
  const TAKEN_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  const THUMB_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
  const GEO_KEY_RE = /^-?\d{1,3}\.\d{4},-?\d{1,3}\.\d{4}$/;
  const DAY_COLORS = ['#e4572e', '#2667ff', '#c98200', '#8e44ad', '#0f9d76', '#d81b60', '#4f7f12', '#0081a7', '#a65a2e', '#5b5bd6'];
  const DATE_SRC_LABEL = {
    'exif-modified': '수정 시각 기준',
    xmp: '메타데이터 기준',
    filename: '파일 이름 기준',
    'filename-date': '파일 이름 기준 · 시각 모름',
    modified: '파일 수정일 기준',
    unknown: '날짜 모름'
  };

  // 처음 화면의 "예시로 둘러보기"에서만 쓰는 예시 기록이에요. (실제 사진이 아니에요)
  const SAMPLE = [
    ['2025-05-03 10:05:12', 37.57965, 126.97700, '경복궁', '서울특별시', '종로구', '세종로'],
    ['2025-05-03 10:24:40', 37.57990, 126.97685],
    ['2025-05-03 10:48:03', 37.58020, 126.97720],
    ['2025-05-03 11:30:20', 37.57250, 126.97690, '광화문광장', '서울특별시', '종로구', '세종로'],
    ['2025-05-03 12:20:00', null, null],
    ['2025-05-03 13:10:30', 37.58260, 126.98310, '북촌한옥마을', '서울특별시', '종로구', '가회동'],
    ['2025-05-03 13:35:10', 37.58235, 126.98455],
    ['2025-05-03 18:40:00', 37.55117, 126.98823, 'N서울타워', '서울특별시', '용산구', '용산동2가'],
    ['2025-05-03 19:05:22', 37.55130, 126.98800],
    ['2025-05-04 09:10:05', 35.15870, 129.16040, '해운대해수욕장', '부산광역시', '해운대구', '우동'],
    ['2025-05-04 09:40:44', 35.15905, 129.15880],
    ['2025-05-04 20:15:00', 35.15320, 129.11870, '광안리해수욕장', '부산광역시', '수영구', '광안동'],
    ['2025-05-04 20:31:15', 35.15340, 129.11820],
    ['2025-08-15 06:10:00', 33.45800, 126.94250, '성산일출봉', '제주특별자치도', '서귀포시', '성산읍 성산리'],
    ['2025-08-15 06:25:30', 33.45850, 126.94200],
    ['2025-08-15 15:30:00', 33.39400, 126.23970, '협재해수욕장', '제주특별자치도', '제주시', '한림읍 협재리'],
    ['2025-08-15 16:02:10', 33.39350, 126.24010]
  ];

  const S = {
    photos: [],
    files: new Map(),          // 이번에 불러온 사진 원본 (크게 보기용, 저장하지 않아요)
    days: [],                  // 최신 날짜가 위
    dayMap: new Map(),
    visits: new Map(),
    locatedDays: [],           // 위치가 있는 날 (오래된 날부터)
    view: { mode: 'all', day: null, visit: null },
    screen: 'empty',
    detail: null,              // { kind: 'visit'|'unlocated', id|day }
    tab: 'days',
    sample: false,
    settings: PM.store.loadSettings(),
    map: null,
    provider: 'osm',
    mapToken: 0,
    triedKeys: {},
    authFailed: {},
    importing: false,
    lb: null,
    lbUrl: null,
    toastTimer: 0,
    tileTimer: 0,
    abroadShown: false,
    osmAuto: 0,
    listScroll: null
  };

  // ───────── 기록 정리: 날짜별 → 장소별로 묶기 ─────────
  function rebuild() {
    const radius = S.settings.radius || 300;
    const sorted = S.photos.slice().sort((a, b) =>
      a.taken < b.taken ? -1 : a.taken > b.taken ? 1 : (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const days = new Map();
    let cur = null;
    for (const p of sorted) {
      const key = p.taken.slice(0, 10);
      let d = days.get(key);
      if (!d) days.set(key, (d = { key, visits: [], unlocated: [], count: 0 }));
      d.count++;
      if (p.lat == null || p.lng == null) { d.unlocated.push(p); continue; }
      if (cur && cur.day === key && U.distance(cur, p) <= radius && U.minutesBetween(cur.end, p.taken) <= 120) {
        cur.photos.push(p);
        cur.end = p.taken;
        const n = cur.photos.length;
        cur.lat += (p.lat - cur.lat) / n;
        cur.lng += (p.lng - cur.lng) / n;
      } else {
        cur = { id: 'v' + p.id, day: key, start: p.taken, end: p.taken, lat: p.lat, lng: p.lng, photos: [p] };
        d.visits.push(cur);
      }
    }
    const chron = Array.from(days.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
    chron.forEach((d, i) => { d.color = DAY_COLORS[i % DAY_COLORS.length]; });
    S.days = chron.slice().reverse();
    S.dayMap.clear();
    S.visits.clear();
    for (const d of S.days) {
      S.dayMap.set(d.key, d);
      d.visits.forEach((v, i) => { v.n = i + 1; v.color = d.color; S.visits.set(v.id, v); });
    }
    S.locatedDays = chron.filter((d) => d.visits.length).map((d) => d.key);

    if (S.view.visit && !S.visits.has(S.view.visit)) S.view.visit = null;
    if (S.view.mode === 'day' && !(S.dayMap.get(S.view.day) || { visits: [] }).visits.length) {
      S.view = { mode: 'all', day: null, visit: null };
    }
  }

  // 속성 값으로 요소 찾기 (값에 따옴표가 있어도 안전하게)
  const bySel = (name, value) => `[${name}="${CSS.escape(String(value))}"]`;

  // ───────── 장소 이름과 주소 ─────────
  function geoOf(v) { return PM.geo.get(v.lat, v.lng); }

  function placeTitle(v, g) {
    if (g === undefined) g = geoOf(v);
    if (g) return g.name || g.short || g.full;
    if (S.settings.autoAddress && !S.sample && PM.geo.status(v.lat, v.lng) === 'pending') return '주소 찾는 중…';
    return U.coordText(v.lat, v.lng);
  }

  function addrText(v, g) {
    if (g === undefined) g = geoOf(v);
    if (g) return g.full;
    if (!S.settings.autoAddress) return '주소 자동 찾기가 꺼져 있어요';
    const st = PM.geo.status(v.lat, v.lng);
    if (st === 'pending') return '주소 찾는 중…';
    if (st === 'failed') return '주소를 찾지 못했어요';
    return '주소 정보 없음';
  }

  function visitSub(v, g) {
    if (g === undefined) g = geoOf(v);
    const parts = [U.timeRange(v.start, v.end)];
    if (g && g.name && g.short && g.short !== g.name) parts.push(g.short);
    parts.push(`사진 ${v.photos.length}장`);
    return parts.join(' · ');
  }

  function thumbHTML(p, cls, tint) {
    if (p && p.thumb) return `<img class="${esc(cls)}" src="${esc(p.thumb)}" alt="" loading="lazy" decoding="async">`;
    const heic = p && PM.exif.isHeic(p.name);
    return `<span class="${esc(cls)} thumb-ph" style="--ph:${esc(tint || 'var(--muted)')}" aria-hidden="true"><svg class="ic"><use href="#i-image"/></svg>${heic ? '<small>HEIC</small>' : ''}</span>`;
  }

  function dateSrcBadge(p) {
    const label = DATE_SRC_LABEL[p.dateSrc];
    return label ? ` <span class="date-src">${esc(label)}</span>` : '';
  }

  // ───────── 화면 그리기 ─────────
  function showScreen(name) {
    if (!S.photos.length) name = 'empty';
    const prev = S.screen;
    const side = $('#side');
    if (prev === 'list' && name !== 'list') S.listScroll = side.scrollTop;
    S.screen = name;
    $('#viewEmpty').hidden = name !== 'empty';
    $('#viewList').hidden = name !== 'list';
    $('#viewDetail').hidden = name !== 'detail';
    // 화면이 바뀌면 맨 위부터 보여줘요. (자세히 → 목록은 보던 자리로)
    if (prev !== name) side.scrollTop = (name === 'list' && prev === 'detail' && S.listScroll != null) ? S.listScroll : 0;
  }

  function renderAll() {
    renderSummary();
    renderDays();
    if (S.tab === 'places') renderPlaces();
    if (S.screen === 'detail' && S.detail) {
      if (S.detail.kind === 'visit' && S.visits.has(S.detail.id)) renderDetail(S.visits.get(S.detail.id));
      else if (S.detail.kind === 'unlocated' && S.dayMap.has(S.detail.day) && S.dayMap.get(S.detail.day).unlocated.length) renderUnlocated(S.detail.day);
      else { S.detail = null; showScreen('list'); }
    } else if (S.screen === 'detail') {
      showScreen('list');
    }
    showScreen(S.screen === 'empty' ? 'list' : S.screen);
    updateDayNav();
  }

  function renderSummary() {
    const el = $('#summary');
    if (!S.photos.length) { el.innerHTML = ''; return; }
    const keys = S.days.map((d) => d.key);
    const first = keys[keys.length - 1], last = keys[0];
    const located = S.photos.reduce((n, p) => n + (p.lat != null ? 1 : 0), 0);
    const range = first === last ? U.fmtDayLong(first) : `${U.fmtDayShort(first)} – ${U.fmtDayShort(last)}`;
    const noLoc = S.photos.length - located;
    el.innerHTML = `
      <p class="sum-range">${esc(range)}</p>
      <dl class="sum-stats">
        <div><dt>다녀온 날</dt><dd>${S.locatedDays.length}일</dd></div>
        <div><dt>장소</dt><dd>${S.visits.size}곳</dd></div>
        <div><dt>사진</dt><dd>${S.photos.length}장</dd></div>
      </dl>
      ${noLoc ? `<p class="sum-note">위치 정보가 없는 사진 ${noLoc}장은 날짜에만 표시했어요.</p>` : ''}
      <p class="sum-geo" id="geoStatus" hidden></p>`;
    updateGeoStatus();
  }

  function renderDays() {
    const el = $('#panelDays');
    if (!S.days.length) { el.innerHTML = ''; return; }
    let html = '';
    let month = '';
    for (const d of S.days) {
      const m = d.key.slice(0, 7);
      if (m !== month) {
        if (month) html += '</section>';
        month = m;
        html += `<section class="month" aria-label="${esc(U.fmtMonth(m))}"><h3 class="month-head">${esc(U.fmtMonth(m))}</h3>`;
      }
      html += dayHTML(d);
    }
    html += '</section>';
    if (hasOsmAddress()) html += '<p class="attr list-attr">주소 정보 © OpenStreetMap 기여자</p>';
    el.innerHTML = html;
  }

  function dayHTML(d) {
    const selected = S.view.mode === 'day' && S.view.day === d.key;
    const meta = (d.visits.length ? `장소 ${d.visits.length}곳 · ` : '') + `사진 ${d.count}장`;
    const visits = d.visits.length
      ? `<ol class="visits">${d.visits.map((v) => visitHTML(v, d)).join('')}</ol>`
      : '';
    const unloc = d.unlocated.length
      ? `<button class="unlocated" type="button" data-act="unloc" data-day="${esc(d.key)}"><svg class="ic" aria-hidden="true"><use href="#i-image"/></svg><span>위치 정보 없는 사진 ${d.unlocated.length}장</span></button>`
      : '';
    return `<article class="day${selected ? ' is-selected' : ''}" data-day="${esc(d.key)}" style="--day:${esc(d.color)}">
      <button class="day-head" type="button" data-act="day" data-day="${esc(d.key)}"${d.visits.length ? '' : ' aria-disabled="true"'}>
        <span class="day-date"><span class="day-dot" aria-hidden="true"></span>${esc(U.fmtDayLong(d.key))}</span>
        <span class="day-meta">${meta}</span>
      </button>
      ${visits}${unloc}
    </article>`;
  }

  function visitHTML(v, d) {
    const g = geoOf(v);
    const rep = v.photos.find((p) => p.thumb) || v.photos[0];
    const active = S.view.visit === v.id;
    return `<li><button class="visit${active ? ' is-active' : ''}" type="button" data-act="visit" data-id="${esc(v.id)}">
      <span class="visit-n" aria-hidden="true">${v.n}</span>
      <span class="visit-body">
        <span class="visit-title" data-label="${esc(v.id)}">${esc(placeTitle(v, g))}</span>
        <span class="visit-sub" data-sub="${esc(v.id)}">${esc(visitSub(v, g))}</span>
      </span>
      ${thumbHTML(rep, 'visit-thumb', d.color)}
    </button></li>`;
  }

  function renderPlaces() {
    const el = $('#panelPlaces');
    if (!S.visits.size) { el.innerHTML = '<p class="panel-empty">위치 정보가 있는 사진이 아직 없어요.</p>'; return; }
    if (!S.settings.autoAddress && !S.sample) {
      el.innerHTML = '<p class="panel-empty">주소 자동 찾기가 꺼져 있어요. 설정에서 켜면 지역별로 묶어서 볼 수 있어요.</p>';
      return;
    }
    const regions = new Map();
    let waiting = 0, missing = 0;
    for (const v of S.visits.values()) {
      const g = geoOf(v);
      if (!g) {
        if (PM.geo.status(v.lat, v.lng) === 'failed') missing++; else waiting++;
        continue;
      }
      const name = g.region || g.short || '기타';
      let r = regions.get(name);
      if (!r) regions.set(name, (r = { name, days: new Map(), photos: 0 }));
      r.photos += v.photos.length;
      if (!r.days.has(v.day)) r.days.set(v.day, v.id);
    }
    const list = Array.from(regions.values()).sort((a, b) =>
      b.days.size - a.days.size || b.photos - a.photos || a.name.localeCompare(b.name, 'ko'));
    let html = '';
    const left = osmLeft();
    const queuedNow = waiting - left;
    if (queuedNow > 0) html += `<p class="panel-note">주소를 찾는 중인 장소 ${queuedNow}곳은 잠시 뒤에 나타나요.</p>`;
    if (left > 0) {
      html += `<div class="panel-note panel-action"><p>아직 주소를 찾지 않은 장소가 ${left}곳 있어요. 날짜를 누르면 그날 장소의 주소를 찾아요.</p>` +
        `<button class="btn btn-mini" type="button" data-act="geo-all">남은 주소 모두 찾기</button>` +
        `<p class="hint">기본 지도에서는 OpenStreetMap 이용 정책에 따라 1초에 한 곳씩 찾아요. 카카오·네이버·구글 지도 키를 넣으면 더 빨라요.</p></div>`;
    }
    if (missing) html += `<p class="panel-note">주소를 찾지 못한 장소가 ${missing}곳 있어요.</p>`;
    html += list.map((r) => {
      const chips = Array.from(r.days.entries())
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([day, vid]) => {
          const d = S.dayMap.get(day);
          return `<button class="chip" type="button" data-act="visit" data-id="${esc(vid)}" style="--day:${esc(d ? d.color : 'var(--accent)')}">${esc(U.fmtDayShort(day))}</button>`;
        }).join('');
      return `<article class="region">
        <div class="region-head"><h3>${esc(r.name)}</h3><span>${r.days.size}일 · 사진 ${r.photos}장</span></div>
        <div class="chips">${chips}</div>
      </article>`;
    }).join('');
    if (list.length && hasOsmAddress()) html += '<p class="attr list-attr">주소 정보 © OpenStreetMap 기여자</p>';
    el.innerHTML = html || '<p class="panel-empty">아직 주소를 찾은 장소가 없어요.</p>';
  }

  function renderDetail(v) {
    const d = S.dayMap.get(v.day);
    const g = geoOf(v);
    const idx = d.visits.indexOf(v);
    const prev = d.visits[idx - 1], next = d.visits[idx + 1];
    const L = PM.maps.links(v.lat, v.lng, g ? (g.name || g.short) : '');
    const cams = Array.from(new Set(v.photos.map((p) => [p.make, p.model].filter(Boolean).join(' ')).filter(Boolean)));
    const oddDate = v.photos.find((p) => DATE_SRC_LABEL[p.dateSrc]);
    const coord = U.coordText(v.lat, v.lng);
    const ext = (href) => /^https?:/.test(href) ? ' target="_blank" rel="noopener"' : '';
    S.detail = { kind: 'visit', id: v.id };
    $('#viewDetail').innerHTML = `
      <div class="detail" style="--day:${esc(d.color)}">
        <div class="detail-top">
          <button class="btn btn-ghost" type="button" data-act="back"><svg class="ic" aria-hidden="true"><use href="#i-left"/></svg><span>목록</span></button>
          <div class="detail-steps">
            <button class="btn btn-icon" type="button" data-act="visit" data-id="${esc(prev ? prev.id : '')}" ${prev ? '' : 'disabled'} aria-label="이전 장소" title="이전 장소"><svg class="ic" aria-hidden="true"><use href="#i-left"/></svg></button>
            <span>${idx + 1} / ${d.visits.length}</span>
            <button class="btn btn-icon" type="button" data-act="visit" data-id="${esc(next ? next.id : '')}" ${next ? '' : 'disabled'} aria-label="다음 장소" title="다음 장소"><svg class="ic" aria-hidden="true"><use href="#i-right"/></svg></button>
          </div>
        </div>
        <div class="detail-head">
          <span class="visit-n" aria-hidden="true">${v.n}</span>
          <div>
            <h2 class="detail-title" data-label="${esc(v.id)}">${esc(placeTitle(v, g))}</h2>
            <p class="detail-when"><svg class="ic" aria-hidden="true"><use href="#i-calendar"/></svg><span>${esc(U.fmtDayLong(v.day))}</span> <b>${esc(U.timeRange(v.start, v.end))}</b></p>
          </div>
        </div>
        <dl class="facts">
          <div><dt>주소</dt><dd data-addr="${esc(v.id)}">${esc(addrText(v, g))}</dd></div>
          <div><dt>좌표</dt><dd><span class="mono">${coord}</span><button class="btn btn-mini" type="button" data-act="copy" data-text="${esc(coord)}">복사</button></dd></div>
          <div><dt>사진</dt><dd>${v.photos.length}장${cams.length ? ` · ${esc(cams.join(', '))}` : ''}${oddDate ? dateSrcBadge(oddDate) : ''}</dd></div>
        </dl>
        <div>
          <p class="section-label">지도 앱에서 열기</p>
          <div class="maplinks" style="margin-top:8px">
            <a class="btn maplink" href="${esc(L.kakao)}"${ext(L.kakao)}><span><span class="maplink-dot" style="background:#fee500"></span>카카오맵</span></a>
            <a class="btn maplink" href="${esc(L.naver)}"${ext(L.naver)}><span><span class="maplink-dot" style="background:#03c75a"></span>네이버지도</span>${L.naverApp ? '<small>앱으로 열려요</small>' : ''}</a>
            <a class="btn maplink" href="${esc(L.google)}"${ext(L.google)}><span><span class="maplink-dot" style="background:#4285f4"></span>구글지도</span></a>
          </div>
        </div>
        <div>
          <p class="section-label">이곳에서 찍은 사진</p>
          <div class="grid" style="margin-top:8px">
            ${v.photos.map((p, i) => `<button class="grid-item" type="button" data-act="photo" data-ctx="v:${esc(v.id)}" data-i="${i}" aria-label="${esc(p.name)} 크게 보기">${thumbHTML(p, 'grid-img', d.color)}<span class="grid-time">${esc(U.fmtTime(p.taken))}</span></button>`).join('')}
          </div>
        </div>
        ${g && g.src === 'osm' ? '<p class="attr">주소 정보 © OpenStreetMap 기여자 (Nominatim)</p>' : ''}
        ${S.sample ? '<p class="attr">예시 데이터예요. 실제 사진이 아니에요.</p>' : ''}
      </div>`;
  }

  function renderUnlocated(dayKey) {
    const d = S.dayMap.get(dayKey);
    S.detail = { kind: 'unlocated', day: dayKey };
    $('#viewDetail').innerHTML = `
      <div class="detail" style="--day:${esc(d.color)}">
        <div class="detail-top">
          <button class="btn btn-ghost" type="button" data-act="back"><svg class="ic" aria-hidden="true"><use href="#i-left"/></svg><span>목록</span></button>
        </div>
        <div>
          <h2 class="detail-title">위치 정보가 없는 사진</h2>
          <p class="detail-when"><svg class="ic" aria-hidden="true"><use href="#i-calendar"/></svg><span>${esc(U.fmtDayLong(dayKey))}</span> <b>${d.unlocated.length}장</b></p>
        </div>
        <p class="hint">이 사진들에는 촬영 위치가 들어 있지 않아서 지도에 표시하지 못했어요. 촬영 날짜와 시각만 보여드려요.</p>
        <div class="grid">
          ${d.unlocated.map((p, i) => `<button class="grid-item" type="button" data-act="photo" data-ctx="u:${esc(dayKey)}" data-i="${i}" aria-label="${esc(p.name)} 크게 보기">${thumbHTML(p, 'grid-img', d.color)}<span class="grid-time">${esc(U.fmtTime(p.taken))}</span></button>`).join('')}
        </div>
        <button class="link" type="button" data-act="tips" style="justify-self:start">사진에 위치가 안 나올 때 해결 방법</button>
      </div>`;
  }

  function markListSelection() {
    for (const el of $$('#panelDays .day')) {
      el.classList.toggle('is-selected', S.view.mode === 'day' && el.dataset.day === S.view.day);
    }
    for (const el of $$('#panelDays .visit')) {
      el.classList.toggle('is-active', el.dataset.id === S.view.visit);
    }
  }

  function scrollToDay(key) {
    const el = $(`#panelDays .day${bySel('data-day', key)}`);
    if (el && S.screen === 'list' && S.tab === 'days') el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // ───────── 지도 ─────────
  function mapOptions(provider, key) {
    return {
      key,
      onSelect: (id) => selectVisit(id),
      onTiles: () => { clearTimeout(S.tileTimer); hideMapMsg(); },
      onAuthFail: () => {
        S.authFailed[provider] = true;
        mapFailed(provider);
        if (S.map && S.map.id === provider) switchMap('osm');
      }
    };
  }

  async function initMap(provider) {
    const token = ++S.mapToken;
    const el = $('#map');
    clearTimeout(S.tileTimer);
    hideMapMsg();
    if (S.map) { try { S.map.destroy(); } catch (e) { /* 무시 */ } S.map = null; }
    el.innerHTML = '';
    el.className = 'map';

    let target = provider;
    const key = (S.settings.keys[provider] || '').trim();
    if (target !== 'osm' && (!key || S.authFailed[target])) target = 'osm';
    if (target !== 'osm') S.triedKeys[target] = key;

    let m = null;
    try {
      m = await PM.maps.create(target, el, mapOptions(target, key));
      if (S.authFailed[target]) throw new Error('auth');
    } catch (e) {
      console.warn('지도를 불러오지 못했어요:', target, e);
      if (m) { try { m.destroy(); } catch (e2) { /* 무시 */ } m = null; }
      if (target === 'osm') { showMapMsg('지도를 불러오지 못했어요. 새로고침해 보세요.'); return; }
      mapFailed(target);
      el.innerHTML = '';
      el.className = 'map';
      target = 'osm';
      m = await PM.maps.create('osm', el, mapOptions('osm'));
    }
    if (token !== S.mapToken) { try { m.destroy(); } catch (e) { /* 무시 */ } return; }
    S.map = m;
    S.provider = target;
    $('#providerSelect').value = target;
    watchTiles(target);
  }

  async function switchMap(provider) {
    await initMap(provider);
    drawMap(true);
  }

  function mapFailed(provider) {
    const msg = {
      kakao: '카카오맵을 불러오지 못했어요. JavaScript 키, 사이트 주소(도메인) 등록, 카카오맵 사용 설정(ON)을 확인해 주세요.',
      naver: '네이버 지도 인증에 실패했어요. Client ID와 Web 서비스 URL 등록을 확인해 주세요.',
      google: '구글 지도 인증에 실패했어요. API 키, 웹사이트 제한, 결제 계정 연결을 확인해 주세요.'
    }[provider] || '지도를 불러오지 못했어요.';
    notice('mapfail', msg + ' 지금은 기본 지도로 보여드려요.', { tone: 'warn', actions: [{ label: '설정 열기', act: 'settings' }] });
  }

  function watchTiles(provider) {
    clearTimeout(S.tileTimer);
    S.tileTimer = setTimeout(() => {
      if (!S.map || S.map.id !== provider || S.map.tilesOk) return;
      if (location.protocol === 'file:') {
        showMapMsg('파일을 바로 열면 지도 그림을 받을 수 없어요. GitHub Pages 같은 웹 주소로 열어 주세요.');
      } else if (provider === 'osm') {
        showMapMsg('지도 그림을 불러오지 못하고 있어요. 인터넷 연결을 확인해 주세요.');
      } else {
        showMapMsg(`${NAMES[provider]} 그림이 보이지 않나요? 키와 사이트 주소 등록을 확인해 주세요.`, true);
      }
    }, 12000);
  }

  function showMapMsg(text, withSettings) {
    const el = $('#mapMsg');
    el.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-warn"/></svg><p>${esc(text)}</p>` +
      (withSettings ? '<button class="btn btn-mini" type="button" data-act="settings">설정</button>' : '') +
      '<button class="notice-close" type="button" data-act="mapmsg-close" aria-label="닫기"><svg class="ic" aria-hidden="true"><use href="#i-close"/></svg></button>';
    el.hidden = false;
  }
  function hideMapMsg() { $('#mapMsg').hidden = true; }

  function mapData() {
    const v = S.view;
    if (v.mode === 'day') {
      const d = S.dayMap.get(v.day);
      if (d && d.visits.length) {
        return {
          points: d.visits.map((x) => ({
            id: x.id, lat: x.lat, lng: x.lng, label: String(x.n), color: d.color,
            title: `${x.n}. ${U.fmtTime(x.start)} ${placeTitle(x)}`
          })),
          route: d.visits.length > 1 ? { path: d.visits.map((x) => [x.lat, x.lng]), color: d.color } : null
        };
      }
    }
    const points = [];
    for (const d of S.days) {
      for (const x of d.visits) {
        points.push({ id: x.id, lat: x.lat, lng: x.lng, label: '', color: d.color, title: `${U.fmtDayMid(d.key)} ${U.fmtTime(x.start)} ${placeTitle(x)}` });
      }
    }
    return { points, route: null };
  }

  function drawMap(fit) {
    updateDayNav();
    if (!S.map) return;
    const { points, route } = mapData();
    try {
      S.map.render(points, route);
      S.map.setSelected(S.view.visit);
      if (fit) S.map.fit(points);
    } catch (e) {
      console.warn('지도에 그리지 못했어요:', e);
    }
    if (!S.abroadShown && (S.provider === 'kakao' || S.provider === 'naver') && points.some((p) => !PM.maps.inKorea(p.lat, p.lng))) {
      S.abroadShown = true;
      notice('abroad', `${NAMES[S.provider]}는 국내 지도가 자세해요. 해외에서 찍은 사진은 구글 지도나 기본 지도로 보면 더 잘 보여요.`);
    }
  }

  function updateDayNav() {
    const v = S.view;
    const inDay = v.mode === 'day' && S.dayMap.has(v.day) && S.dayMap.get(v.day).visits.length > 0;
    $('#daynav').hidden = !inDay;
    $('#btnAll').hidden = !inDay;
    if (!inDay) return;
    const d = S.dayMap.get(v.day);
    $('#daynav').style.setProperty('--day', d.color);
    $('#dayLabel').innerHTML = `<span class="dl-long">${esc(U.fmtDayMid(v.day))}</span><span class="dl-short">${esc(U.fmtDayTiny(v.day))}</span>`;
    const i = S.locatedDays.indexOf(v.day);
    $('#dayPrev').disabled = i <= 0;
    $('#dayNext').disabled = i < 0 || i >= S.locatedDays.length - 1;
  }

  // ───────── 고르기 ─────────
  function selectDay(key) {
    const d = S.dayMap.get(key);
    if (!d || !d.visits.length) return;
    S.view = { mode: 'day', day: key, visit: null };
    S.detail = null;
    showScreen('list');
    drawMap(true);
    markListSelection();
    scrollToDay(key);
    queueAddresses(key);
  }

  function selectVisit(id) {
    const v = S.visits.get(id);
    if (!v) return;
    const dayChanged = !(S.view.mode === 'day' && S.view.day === v.day);
    S.view = { mode: 'day', day: v.day, visit: id };
    if (dayChanged) {
      drawMap(true);
    } else if (S.map) {
      S.map.setSelected(id);
      S.map.focus(v);
    }
    updateDayNav();
    renderDetail(v);
    showScreen('detail');
    markListSelection();
    $('#side').scrollTop = 0;
    queueAddresses(v.day);
  }

  function backToList() {
    S.view.visit = null;
    S.detail = null;
    if (S.map) S.map.setSelected(null);
    showScreen('list');
    markListSelection();
    if (S.view.mode === 'day') scrollToDay(S.view.day);
  }

  function showAll() {
    S.view = { mode: 'all', day: null, visit: null };
    S.detail = null;
    showScreen('list');
    drawMap(true);
    markListSelection();
  }

  function stepDay(delta) {
    const i = S.locatedDays.indexOf(S.view.day);
    const key = S.locatedDays[i + delta];
    if (key) selectDay(key);
  }

  // ───────── 주소 찾기 ─────────
  // 이 장소의 주소를 OpenStreetMap(Nominatim)으로 찾아야 하는지
  function usesOsm(v) {
    const m = S.map;
    return !(m && m.canGeocode && m.canGeocode(v.lat, v.lng));
  }

  // 카카오·네이버·구글로 찾을 때는 모두 찾고,
  // OpenStreetMap으로 찾을 때는 이용 정책(대량 조회 자제)에 따라
  // 고른 날짜 + 최근 장소 30곳까지만 자동으로 찾아요. 나머지는 버튼을 눌러야 찾아요.
  function queueAddresses(priorityDay, opts) {
    if (!S.settings.autoAddress || S.sample) return;
    const all = !!(opts && opts.all);
    const first = [], rest = [], osm = [];
    for (const d of S.days) {
      for (const v of d.visits) {
        if (d.key === priorityDay) first.push(v);
        else if (!usesOsm(v) || all) rest.push(v);
        else if (PM.geo.status(v.lat, v.lng) === 'none') osm.push(v);
      }
    }
    if (first.length) PM.geo.request(first, { front: true });
    if (rest.length) PM.geo.request(rest);
    const room = OSM_AUTO_LIMIT - S.osmAuto;
    if (!all && room > 0 && osm.length) S.osmAuto += PM.geo.request(osm.slice(0, room));
    updateGeoStatus();
  }

  function osmLeft() {
    let n = 0;
    for (const v of S.visits.values()) if (usesOsm(v) && PM.geo.status(v.lat, v.lng) === 'none') n++;
    return n;
  }

  function hasOsmAddress() {
    for (const v of S.visits.values()) {
      const g = geoOf(v);
      if (g && g.src === 'osm') return true;
    }
    return false;
  }

  const refreshPlaces = U.debounce(() => { if (S.tab === 'places') renderPlaces(); }, 500);

  function onGeoUpdate(key, state) {
    if (key) {
      const [la, ln] = key.split(',').map(Number);
      for (const v of S.visits.values()) {
        if (Math.abs(v.lat - la) < 0.0015 && Math.abs(v.lng - ln) < 0.0018) updateVisitText(v);
      }
      const panel = $('#panelDays');
      if (panel.firstChild && !panel.querySelector('.list-attr') && hasOsmAddress()) {
        panel.insertAdjacentHTML('beforeend', '<p class="attr list-attr">주소 정보 © OpenStreetMap 기여자</p>');
      }
      refreshPlaces();
    }
    updateGeoStatus(state);
  }

  function updateVisitText(v) {
    const g = geoOf(v);
    const title = placeTitle(v, g);
    for (const el of $$(bySel('data-label', v.id))) el.textContent = title;
    for (const el of $$(bySel('data-sub', v.id))) el.textContent = visitSub(v, g);
    const addr = $(bySel('data-addr', v.id));
    if (addr) addr.textContent = addrText(v, g);
  }

  function updateGeoStatus(state) {
    const el = $('#geoStatus');
    if (!el) return;
    const st = PM.geo.stats();
    if ((state === 'offline' || state === 'paused' || st.paused) && S.settings.autoAddress && !S.sample) {
      el.hidden = false;
      el.innerHTML = '주소 찾기가 멈췄어요. <button class="link" type="button" data-act="retry-geo">다시 시도</button>';
      return;
    }
    if (st.running && st.total) {
      el.hidden = false;
      el.textContent = `주소 찾는 중 ${Math.min(st.done, st.total)} / ${st.total}`;
      return;
    }
    el.hidden = true;
  }

  // ───────── 사진 불러오기 ─────────
  // 저장된 기록이나 백업 파일의 기록이 안전한 모양인지 확인해요.
  // id는 영문·숫자·_·- 만, 날짜는 정해진 형식만, 좌표는 숫자 범위 안만 받아요.
  function validRecord(p) {
    return !!p && typeof p === 'object' &&
      typeof p.id === 'string' && ID_RE.test(p.id) &&
      typeof p.taken === 'string' && TAKEN_RE.test(p.taken) &&
      (p.lat == null
        ? p.lng == null
        : (Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180));
  }

  function sanitizeRecord(p) {
    const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
    return {
      id: String(p.id).slice(0, 80),
      name: String(p.name || '이름 없는 사진').slice(0, 255),
      size: num(p.size),
      type: String(p.type || '').slice(0, 60),
      lastModified: num(p.lastModified),
      taken: p.taken,
      dateSrc: String(p.dateSrc || 'exif').slice(0, 24),
      offset: String(p.offset || '').slice(0, 12),
      lat: p.lat == null ? null : Number(p.lat),
      lng: p.lng == null ? null : Number(p.lng),
      alt: Number.isFinite(p.alt) ? p.alt : null,
      make: String(p.make || '').slice(0, 80),
      model: String(p.model || '').slice(0, 80),
      orientation: num(p.orientation) || 1,
      // 미리보기는 문자열 전체가 base64 그림 주소일 때만 받아요. (앞부분만 맞는 값은 버려요)
      thumb: typeof p.thumb === 'string' && THUMB_RE.test(p.thumb) ? p.thumb : null,
      addedAt: num(p.addedAt) || Date.now()
    };
  }

  // ───────── 사진 고르기 (아이폰 대비) ─────────
  // 사진을 고르거나 읽는 도중에 페이지가 새로 열렸는지 알아내려고, 이 탭에만 잠깐 표시를 남겨요.
  const PENDING_KEY = 'photo-footprints.pending';
  function setPending(phase, n) {
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ phase, n: n || 0, t: Date.now() })); } catch (e) { /* 저장 못 해도 괜찮아요 */ }
  }
  function takePending() {
    try {
      const v = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
      sessionStorage.removeItem(PENDING_KEY);
      return v;
    } catch (e) {
      return null;
    }
  }
  function clearPending() {
    try { sessionStorage.removeItem(PENDING_KEY); } catch (e) { /* 무시 */ }
  }

  function openPicker(id) {
    closeDialogs();
    if (U.isTouch()) {
      setPending('picking');
      $('#side').scrollTop = 0;
      notice('waiting', '사진을 고른 뒤 "추가"를 누르면 바로 읽기 시작해요. 아이폰은 사진을 많이 고르면 사진을 준비하는 데 1분 넘게 걸릴 수 있어요. 처음에는 10장 정도로 시험해 보세요.');
    }
    $(id).click();
  }

  async function importFiles(list) {
    const all = Array.from(list || []);
    if (all.length === 1 && /\.json$/i.test(all[0].name)) { importBackup(all[0]); return; }
    const files = all.filter(PM.exif.isImage);
    if (!files.length) {
      toast(all.length ? '사진 파일이 없어요. JPG, HEIC, PNG 같은 사진을 골라 주세요.' : '고른 파일이 없어요.');
      return;
    }
    if (S.importing) { toast('사진을 읽고 있어요. 끝난 뒤에 다시 해 주세요.'); return; }
    S.importing = true;
    setPending('reading', files.length);
    $('#side').scrollTop = 0;
    toast(`사진 ${files.length}장을 받았어요. 읽는 중이에요…`, 3000);
    $('#btnAdd').disabled = true;
    if (S.sample) clearSample(false);

    const known = new Map(S.photos.map((p) => [p.id, p]));
    const added = [];
    const updated = [];
    let dup = 0, failed = 0, done = 0;
    const queue = files.slice();
    progress(0, files.length, '사진 읽는 중');

    // 20장마다 저장해요. 중간에 페이지가 새로 열려도 읽은 만큼은 남아요.
    const toSave = [];
    let saveChain = Promise.resolve();
    let saveFailed = false;
    const flushSave = () => {
      if (!toSave.length) return;
      const batch = toSave.splice(0);
      saveChain = saveChain.then(() => PM.store.put('photos', batch)).catch(() => { saveFailed = true; });
    };

    async function worker() {
      while (queue.length) {
        const f = queue.shift();
        try {
          const rec = await PM.exif.read(f);
          const old = known.get(rec.id);
          if (old) {
            dup++;
            S.files.set(rec.id, f);
            if (!old.thumb && rec.thumb) { old.thumb = rec.thumb; updated.push(old); toSave.push(old); }
          } else {
            known.set(rec.id, rec);
            added.push(rec);
            toSave.push(rec);
            S.files.set(rec.id, f);
          }
          if (toSave.length >= 20) flushSave();
        } catch (e) {
          failed++;
          console.warn('사진을 읽지 못했어요:', f.name, e);
        }
        done++;
        progress(done, files.length, '사진 읽는 중');
      }
    }
    // 아이폰은 메모리 여유가 적어서 한 장씩, 다른 휴대폰은 두 장씩, PC는 네 장씩 읽어요.
    const workers = Math.min(U.isIOS() ? 1 : (U.isTouch() ? 2 : 4), files.length);
    await Promise.all(Array.from({ length: workers }, worker));

    flushSave();
    await saveChain;
    if (saveFailed) {
      notice('savefail', '기록을 이 기기에 저장하지 못했어요. 저장 공간이 부족할 수 있어요. 지금 보이는 기록은 창을 닫으면 사라질 수 있어요.', { tone: 'warn' });
    }
    if (added.length || updated.length) {
      S.photos.push(...added);
      PM.store.askPersist();
    }
    clearPending();
    dismissNotice('reloaded');
    progressDone();
    S.importing = false;
    $('#btnAdd').disabled = false;

    // 새로 들어온 사진이 하루치면 그날을, 아니면 전체를 보여줘요.
    rebuild();
    const addedLoc = added.filter((p) => p.lat != null);
    const addedDays = Array.from(new Set(addedLoc.map((p) => p.taken.slice(0, 10))));
    S.view = addedDays.length === 1 ? { mode: 'day', day: addedDays[0], visit: null } : { mode: 'all', day: null, visit: null };
    S.detail = null;
    renderAll();
    drawMap(true);
    if (S.view.mode === 'day') scrollToDay(S.view.day);

    const parts = [];
    if (added.length) parts.push(`사진 ${added.length}장을 더했어요`);
    if (added.length) parts.push(`위치 있음 ${addedLoc.length}장`);
    if (dup) parts.push(`이미 있는 사진 ${dup}장은 건너뛰었어요`);
    if (failed) parts.push(`읽지 못한 파일 ${failed}개`);
    toast(parts.join(' · ') || '새로 더한 사진이 없어요.', 4200);

    const noLoc = added.length - addedLoc.length;
    if (added.length >= 3 && noLoc / added.length >= 0.5) {
      notice('nogps', `방금 불러온 사진 ${added.length}장 중 ${noLoc}장에 위치 정보가 없어요. 휴대폰에서 사진을 고를 때 위치가 빠졌을 수 있어요.`, {
        tone: 'warn', actions: [{ label: '해결 방법 보기', act: 'tips' }]
      });
    }
    queueAddresses(S.view.day);
  }

  // 끌어다 놓은 파일과 폴더 펼치기
  function filesFromDrop(dt) {
    const entries = [];
    for (const item of Array.from(dt.items || [])) {
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) entries.push(entry);
    }
    if (!entries.length) return Promise.resolve(Array.from(dt.files || []));
    const out = [];
    async function walk(entry) {
      if (entry.isFile) {
        const f = await new Promise((res) => entry.file(res, () => res(null)));
        if (f) out.push(f);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        for (;;) {
          const batch = await new Promise((res) => reader.readEntries(res, () => res([])));
          if (!batch.length) break;
          for (const e of batch) await walk(e);
        }
      }
    }
    return (async () => {
      for (const e of entries) await walk(e);
      return out;
    })();
  }

  // ───────── 예시 데이터 ─────────
  function loadSample() {
    if (S.photos.length && !S.sample) return;
    let place = null;
    S.photos = SAMPLE.map((row, i) => {
      if (row[3]) place = { name: row[3], r1: row[4], r2: row[5], r3: row[6] };
      return {
        id: 'sample-' + i,
        name: `예시 사진 ${String(i + 1).padStart(2, '0')}.jpg`,
        size: 0, type: 'image/jpeg', lastModified: 0,
        taken: row[0], dateSrc: 'exif', offset: '+09:00',
        lat: row[1], lng: row[2], alt: null,
        make: '', model: '', orientation: 1, thumb: null,
        sample: true, place: row[1] == null ? null : place
      };
    });
    S.sample = true;
    rebuild();
    for (const v of S.visits.values()) {
      const pl = v.photos[0].place;
      if (!pl) continue;
      PM.geo.addLocal({
        key: PM.geo.keyOf(v.lat, v.lng), lat: v.lat, lng: v.lng,
        full: `${pl.r1} ${pl.r2} ${pl.r3}`, name: pl.name, short: `${pl.r2} ${pl.r3}`,
        region: `${pl.r1} ${pl.r2}`, cc: 'kr', src: 'sample', sample: true
      });
    }
    notice('sample', '예시 데이터를 보고 있어요. 내 사진을 불러오면 예시는 사라져요.', {
      actions: [{ label: '내 사진 불러오기', act: 'add' }, { label: '예시 닫기', act: 'sample-close' }]
    });
    S.view = { mode: 'all', day: null, visit: null };
    S.detail = null;
    renderAll();
    drawMap(true);
  }

  function clearSample(render) {
    S.photos = S.photos.filter((p) => !p.sample);
    S.sample = false;
    PM.geo.dropSample();
    dismissNotice('sample');
    if (render !== false) {
      S.view = { mode: 'all', day: null, visit: null };
      S.detail = null;
      rebuild();
      renderAll();
      drawMap(true);
    }
  }

  // ───────── 내보내기 / 백업 / 지우기 ─────────
  function exportCSV() {
    const real = !S.sample;
    if (!S.photos.length) { toast('내보낼 기록이 없어요.'); return; }
    const rows = [['날짜', '요일', '시작', '끝', '장소', '주소', '위도', '경도', '사진 수', '파일 이름']];
    for (const d of S.days.slice().reverse()) {
      const wd = U.weekday(d.key);
      for (const v of d.visits) {
        const g = geoOf(v);
        rows.push([d.key, wd, U.fmtTime(v.start), U.fmtTime(v.end), g ? (g.name || g.short) : '', g ? g.full : '',
          v.lat.toFixed(6), v.lng.toFixed(6), v.photos.length, v.photos.map((p) => p.name).join(' ')]);
      }
      for (const p of d.unlocated) {
        rows.push([d.key, wd, U.fmtTime(p.taken), '', '(위치 정보 없음)', '', '', '', 1, p.name]);
      }
    }
    const csv = '﻿' + rows.map((r) => r.map(U.csvCell).join(',')).join('\r\n');
    U.download(`사진발자국_${real ? '' : '예시_'}${U.todayKey()}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    toast('표(CSV) 파일을 저장했어요. 엑셀에서 열 수 있어요.');
  }

  function exportBackup() {
    const photos = S.photos.filter((p) => !p.sample);
    if (!photos.length) { toast('백업할 기록이 없어요.'); return; }
    const data = {
      app: 'photo-footprints', version: 1, exportedAt: new Date().toISOString(),
      photos, geo: PM.geo.dump()
    };
    U.download(`사진발자국_백업_${U.todayKey()}.json`, new Blob([JSON.stringify(data)], { type: 'application/json' }));
    toast(`사진 기록 ${photos.length}장을 백업 파일로 저장했어요.`);
  }

  async function importBackup(file) {
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (e) {
      toast('백업 파일을 읽지 못했어요.');
      return;
    }
    if (!data || data.app !== 'photo-footprints' || !Array.isArray(data.photos)) {
      toast('사진 발자국 백업 파일이 아니에요.');
      return;
    }
    if (S.sample) clearSample(false);
    const known = new Set(S.photos.map((p) => p.id));
    const valid = data.photos.filter(validRecord);
    const rejected = data.photos.length - valid.length;
    const add = valid.map(sanitizeRecord).filter((p) => !known.has(p.id));
    const geo = (Array.isArray(data.geo) ? data.geo : [])
      .filter((g) => g && typeof g.key === 'string' && GEO_KEY_RE.test(g.key) &&
        Number.isFinite(g.lat) && Number.isFinite(g.lng) && Math.abs(g.lat) <= 90 && Math.abs(g.lng) <= 180 &&
        typeof g.full === 'string')
      .map((g) => ({
        key: g.key.slice(0, 40), lat: g.lat, lng: g.lng, full: g.full.slice(0, 300),
        name: String(g.name || '').slice(0, 120), short: String(g.short || '').slice(0, 160),
        region: String(g.region || '').slice(0, 160), cc: String(g.cc || '').slice(0, 4),
        src: String(g.src || 'backup').slice(0, 12), at: Number(g.at) || Date.now()
      }))
      .filter((g) => !PM.geo.get(g.lat, g.lng));
    S.photos.push(...add);
    PM.geo.load(geo);
    try {
      await PM.store.put('photos', add);
      await PM.store.put('geo', geo);
      PM.store.askPersist();
    } catch (e) {
      notice('savefail', '백업 기록을 이 기기에 저장하지 못했어요.', { tone: 'warn' });
    }
    S.view = { mode: 'all', day: null, visit: null };
    S.detail = null;
    rebuild();
    renderAll();
    drawMap(true);
    const dupCount = valid.length - add.length;
    toast(`백업에서 사진 기록 ${add.length}장을 합쳤어요.` + (dupCount ? ` (이미 있는 ${dupCount}장 제외)` : ''), 4200);
    if (rejected) {
      notice('badbackup', `백업 파일에서 형식이 올바르지 않은 기록 ${rejected}개는 안전을 위해 불러오지 않았어요.`, { tone: 'warn' });
    }
    queueAddresses();
  }

  async function clearAll() {
    try {
      await PM.store.clear('photos');
      await PM.store.clear('geo');
    } catch (e) {
      toast('기록을 지우지 못했어요.');
      return;
    }
    PM.geo.clearAll();
    S.photos = [];
    S.files.clear();
    S.sample = false;
    S.view = { mode: 'all', day: null, visit: null };
    S.detail = null;
    rebuild();
    renderAll();
    drawMap(true);
    $('#settingsDialog').close();
    toast('이 기기에 저장된 기록을 지웠어요. 사진 원본 파일은 그대로 있어요.', 4200);
  }

  async function updateStorageInfo() {
    const n = S.photos.filter((p) => !p.sample).length;
    const g = PM.geo.dump().length;
    const usage = await PM.store.usage();
    const where = PM.store.persistent ? '이 기기(브라우저)에' : '이번 창에만';
    $('#storageInfo').textContent = n
      ? `${where} 사진 기록 ${n}장과 주소 ${g}곳이 저장되어 있어요${usage ? ` (약 ${U.bytes(usage)})` : ''}. 사진 원본은 저장하지 않아요.`
      : '아직 저장된 기록이 없어요.';
    $('#clearText').textContent = `정말 지울까요? 사진 기록 ${n}장과 주소 기록이 이 기기에서 지워져요. 사진 원본 파일은 지워지지 않아요. 지우기 전에 "백업 파일 저장"을 해 두면 나중에 다시 불러올 수 있어요.`;
  }

  // ───────── 사진 크게 보기 ─────────
  function photoList(ctx) {
    if (!ctx) return [];
    if (ctx.startsWith('v:')) { const v = S.visits.get(ctx.slice(2)); return v ? v.photos : []; }
    if (ctx.startsWith('u:')) { const d = S.dayMap.get(ctx.slice(2)); return d ? d.unlocated : []; }
    return [];
  }

  function openLightbox(list, index) {
    if (!list.length) return;
    S.lb = { list, index: Math.max(0, Math.min(index, list.length - 1)), opener: document.activeElement };
    $('#lightbox').hidden = false;
    showLightbox();
    $('#lbClose').focus({ preventScroll: true });
  }

  function showLightbox() {
    const { list, index } = S.lb;
    const p = list[index];
    const img = $('#lbImg');
    if (S.lbUrl) { URL.revokeObjectURL(S.lbUrl); S.lbUrl = null; }
    img.onerror = null;
    img.hidden = false;
    let note = '';
    const file = S.files.get(p.id);
    if (file) {
      S.lbUrl = URL.createObjectURL(file);
      img.onerror = () => {
        img.onerror = null;
        if (p.thumb) img.src = p.thumb; else img.hidden = true;
        const n = $('#lbCap .lb-note');
        const txt = '이 브라우저는 이 형식(HEIC 등)의 사진을 크게 보여주지 못해요.';
        if (n) n.textContent = txt; else $('#lbCap').insertAdjacentHTML('beforeend', `<span class="lb-note">${esc(txt)}</span>`);
      };
      img.src = S.lbUrl;
    } else if (p.thumb) {
      img.src = p.thumb;
      note = '저장해 둔 작은 미리보기예요. 원본을 크게 보려면 사진을 다시 불러와 주세요.';
    } else {
      img.removeAttribute('src');
      img.hidden = true;
      note = p.sample ? '예시 데이터라 실제 사진이 없어요.' : '미리보기가 없는 사진이에요.';
    }
    img.alt = p.name;
    const cam = [p.make, p.model].filter(Boolean).join(' ');
    const where = p.lat != null ? U.coordText(p.lat, p.lng) : '위치 정보 없음';
    const tz = p.offset ? ` (UTC${p.offset})` : '';
    $('#lbCap').innerHTML =
      `<b>${esc(U.fmtDayLong(p.taken.slice(0, 10)))} ${esc(U.fmtTime(p.taken))}${esc(tz)}</b>${dateSrcBadge(p)}<br>` +
      `${esc(p.name)}${cam ? ' · ' + esc(cam) : ''} · ${esc(where)}` +
      (note ? `<span class="lb-note">${esc(note)}</span>` : '');
    $('#lbPrev').disabled = index <= 0;
    $('#lbNext').disabled = index >= list.length - 1;
  }

  function closeLightbox() {
    if (!S.lb) return;
    $('#lightbox').hidden = true;
    if (S.lbUrl) { URL.revokeObjectURL(S.lbUrl); S.lbUrl = null; }
    $('#lbImg').removeAttribute('src');
    const opener = S.lb.opener;
    S.lb = null;
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }

  function stepLightbox(delta) {
    if (!S.lb) return;
    const i = S.lb.index + delta;
    if (i < 0 || i >= S.lb.list.length) return;
    S.lb.index = i;
    showLightbox();
  }

  // ───────── 알림 / 진행 / 토스트 ─────────
  function notice(id, text, opts) {
    const { tone = 'info', actions = [] } = opts || {};
    let el = $(`#notices ${bySel('data-notice', id)}`);
    if (!el) {
      el = document.createElement('div');
      el.dataset.notice = id;
      $('#notices').appendChild(el);
    }
    el.className = 'notice' + (tone === 'warn' ? ' warn' : '');
    el.setAttribute('role', tone === 'warn' ? 'alert' : 'status');
    el.innerHTML =
      `<svg class="ic" aria-hidden="true"><use href="#${tone === 'warn' ? 'i-warn' : 'i-info'}"/></svg>` +
      `<div class="notice-body"><p>${esc(text)}</p>` +
      (actions.length ? `<div class="notice-actions">${actions.map((a) => `<button class="btn btn-mini" type="button" data-act="${esc(a.act)}">${esc(a.label)}</button>`).join('')}</div>` : '') +
      `</div><button class="notice-close" type="button" data-act="notice-close" data-id="${esc(id)}" aria-label="알림 닫기"><svg class="ic" aria-hidden="true"><use href="#i-close"/></svg></button>`;
  }
  function dismissNotice(id) {
    const el = $(`#notices ${bySel('data-notice', id)}`);
    if (el) el.remove();
  }

  function progress(done, total, label) {
    $('#progress').hidden = false;
    $('#progressLabel').textContent = label;
    $('#progressCount').textContent = `${done} / ${total}`;
    $('#progressBar').style.width = (total ? Math.round((done / total) * 100) : 0) + '%';
  }
  function progressDone() { $('#progress').hidden = true; }

  function toast(text, ms) {
    const el = $('#toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(() => { el.hidden = true; }, ms || 2600);
  }

  // ───────── 설정 ─────────
  function originText() {
    return location.protocol.startsWith('http') ? location.origin : '(웹 주소로 열면 여기에 표시돼요)';
  }

  function checkedProvider() {
    const r = $('#settingsForm').querySelector('input[name="provider"]:checked');
    return r ? r.value : 'osm';
  }

  function syncKeyboxes() {
    const p = checkedProvider();
    for (const box of $$('#settingsForm .keybox')) box.hidden = box.dataset.provider !== p;
  }

  function openSettings(focusProvider) {
    const s = S.settings;
    const want = focusProvider || s.provider;
    for (const r of $$('#settingsForm input[name="provider"]')) r.checked = r.value === want;
    $('#keyKakao').value = s.keys.kakao || '';
    $('#keyNaver').value = s.keys.naver || '';
    $('#keyGoogle').value = s.keys.google || '';
    $('#optAddress').checked = !!s.autoAddress;
    $('#optRadius').value = String(s.radius);
    $('#clearConfirm').hidden = true;
    syncKeyboxes();
    updateStorageInfo();
    closeDialogs();
    $('#settingsDialog').showModal();
    const input = { kakao: '#keyKakao', naver: '#keyNaver', google: '#keyGoogle' }[focusProvider];
    if (input) setTimeout(() => $(input).focus(), 60);
  }

  async function saveSettings() {
    const s = S.settings;
    const before = JSON.parse(JSON.stringify(s));
    const provider = checkedProvider();
    const keys = {
      kakao: $('#keyKakao').value.trim(),
      naver: $('#keyNaver').value.trim(),
      google: $('#keyGoogle').value.trim()
    };
    if (provider !== 'osm' && !keys[provider]) {
      toast(`${NAMES[provider]}를 쓰려면 키를 넣어 주세요.`);
      $({ kakao: '#keyKakao', naver: '#keyNaver', google: '#keyGoogle' }[provider]).focus();
      return;
    }
    s.provider = provider;
    s.keys = keys;
    s.autoAddress = $('#optAddress').checked;
    s.radius = Number($('#optRadius').value) || 300;
    PM.store.saveSettings(s);
    $('#settingsDialog').close();

    // 이미 불러온 지도 SDK의 키를 바꾸면 새로고침해야 적용돼요.
    const sdkPresent = { kakao: !!window.kakao, naver: !!window.naver, google: !!(window.google && window.google.maps) }[provider];
    if (provider !== 'osm' && sdkPresent && S.triedKeys[provider] && S.triedKeys[provider] !== keys[provider]) {
      toast('새 키를 적용하려고 페이지를 다시 열어요.');
      setTimeout(() => location.reload(), 700);
      return;
    }
    if (before.keys[provider] !== keys[provider]) S.authFailed[provider] = false;

    const radiusChanged = before.radius !== s.radius;
    if (radiusChanged) { rebuild(); renderAll(); }
    if (provider !== S.provider || before.keys[provider] !== keys[provider]) {
      dismissNotice('mapfail');
      await switchMap(provider);
    } else if (radiusChanged) {
      drawMap(true);
    }
    if (!before.autoAddress && s.autoAddress) { PM.geo.retry(); queueAddresses(S.view.day); }
    if (before.autoAddress && !s.autoAddress) PM.geo.stop();
    renderAll();
    toast('설정을 저장했어요.');
  }

  function closeDialogs() {
    for (const d of $$('dialog[open]')) d.close();
  }

  function openAdd(showTips) {
    closeDialogs();
    $('#tips').open = !!showTips;
    $('#addDialog').showModal();
    if (showTips) setTimeout(() => $('#tips').scrollIntoView({ block: 'start' }), 60);
  }

  // ───────── 이벤트 ─────────
  function onClick(e) {
    const t = e.target.closest('[data-act], [data-close]');
    if (!t) return;
    if (t.hasAttribute('data-close')) {
      const dlg = t.closest('dialog');
      if (dlg) dlg.close();
      return;
    }
    const act = t.dataset.act;
    switch (act) {
      case 'pick-photos': openPicker('#filePhotos'); break;
      case 'pick-folder': openPicker('#fileFolder'); break;
      case 'pick-any': openPicker('#fileAny'); break;
      case 'pick-backup': closeDialogs(); $('#fileBackup').click(); break;
      case 'add': openAdd(false); break;
      case 'tips': openAdd(true); break;
      case 'sample': loadSample(); break;
      case 'sample-close': clearSample(); break;
      case 'day': if (t.getAttribute('aria-disabled') !== 'true') selectDay(t.dataset.day); break;
      case 'visit': if (t.dataset.id) selectVisit(t.dataset.id); break;
      case 'unloc':
        renderUnlocated(t.dataset.day);
        showScreen('detail');
        $('#side').scrollTop = 0;
        break;
      case 'back': backToList(); break;
      case 'photo': openLightbox(photoList(t.dataset.ctx), Number(t.dataset.i) || 0); break;
      case 'copy':
        U.copy(t.dataset.text).then((ok) => toast(ok ? '좌표를 복사했어요.' : '복사하지 못했어요. 직접 선택해서 복사해 주세요.'));
        break;
      case 'copy-origin':
        U.copy(originText()).then((ok) => toast(ok ? '사이트 주소를 복사했어요.' : '복사하지 못했어요.'));
        break;
      case 'settings': openSettings(S.settings.provider); break;
      case 'notice-close': dismissNotice(t.dataset.id); break;
      case 'mapmsg-close': hideMapMsg(); break;
      case 'retry-geo': PM.geo.retry(); queueAddresses(S.view.day); break;
      case 'geo-all': queueAddresses(S.view.day, { all: true }); toast('남은 장소의 주소를 차례로 찾고 있어요.'); renderPlaces(); break;
      case 'export-csv': exportCSV(); break;
      case 'export-backup': exportBackup(); break;
      case 'clear-ask': $('#clearConfirm').hidden = false; break;
      case 'clear-cancel': $('#clearConfirm').hidden = true; break;
      case 'clear-do': clearAll(); break;
      default: break;
    }
  }

  function bindUI() {
    document.documentElement.classList.toggle('touch', U.isTouch());
    document.addEventListener('click', onClick);

    $('#btnAdd').addEventListener('click', () => openAdd(false));
    $('#btnSettings').addEventListener('click', () => openSettings());
    $('#btnAll').addEventListener('click', showAll);
    $('#dayPrev').addEventListener('click', () => stepDay(-1));
    $('#dayNext').addEventListener('click', () => stepDay(1));

    $('#tabDays').addEventListener('click', () => setTab('days'));
    $('#tabPlaces').addEventListener('click', () => setTab('places'));

    for (const id of ['#filePhotos', '#fileAny', '#fileFolder']) {
      const input = $(id);
      input.addEventListener('change', () => {
        const files = Array.from(input.files || []);
        dismissNotice('waiting');
        if (!files.length) {
          clearPending();
          toast('고른 사진을 받지 못했어요. 장수를 줄여서 다시 골라 보세요.', 5000);
          return;
        }
        // 다 읽은 뒤에 선택 칸을 비워요. (같은 사진을 다시 고를 수 있게)
        Promise.resolve(importFiles(files)).finally(() => { input.value = ''; });
      });
      input.addEventListener('cancel', () => { dismissNotice('waiting'); clearPending(); });
    }
    $('#fileBackup').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) importBackup(f);
    });

    $('#providerSelect').addEventListener('change', async (e) => {
      const p = e.target.value;
      if (p !== 'osm' && !S.settings.keys[p]) {
        e.target.value = S.provider;
        openSettings(p);
        return;
      }
      S.settings.provider = p;
      PM.store.saveSettings(S.settings);
      dismissNotice('mapfail');
      await switchMap(p);
      queueAddresses(S.view.day);
    });

    $('#settingsForm').addEventListener('change', (e) => {
      if (e.target.name === 'provider') syncKeyboxes();
    });
    $('#settingsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      saveSettings();
    });

    $('#btnMapSize').addEventListener('click', () => {
      const large = $('#app').classList.toggle('map-large');
      const btn = $('#btnMapSize');
      btn.setAttribute('aria-label', large ? '지도 작게 보기' : '지도 크게 보기');
      btn.title = large ? '지도 작게 보기' : '지도 크게 보기';
      btn.querySelector('use').setAttribute('href', large ? '#i-shrink' : '#i-expand');
    });

    // 사진 크게 보기
    $('#lbClose').addEventListener('click', closeLightbox);
    $('#lbPrev').addEventListener('click', () => stepLightbox(-1));
    $('#lbNext').addEventListener('click', () => stepLightbox(1));
    $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });
    document.addEventListener('keydown', (e) => {
      if (S.lb) {
        if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
        else if (e.key === 'ArrowLeft') stepLightbox(-1);
        else if (e.key === 'ArrowRight') stepLightbox(1);
      }
    });
    let touchX = null;
    $('#lightbox').addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    $('#lightbox').addEventListener('touchend', (e) => {
      if (touchX == null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 50) stepLightbox(dx < 0 ? 1 : -1);
    });

    // 끌어다 놓기
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; $('#drop').hidden = false; });
    window.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    window.addEventListener('dragleave', (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) $('#drop').hidden = true;
    });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      $('#drop').hidden = true;
      filesFromDrop(e.dataTransfer).then(importFiles);
    });

    // 지도 영역 크기가 바뀌면 지도도 맞춰요.
    if ('ResizeObserver' in window) {
      let raf = 0;
      new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => { if (S.map) S.map.resize(); });
      }).observe($('#mapwrap'));
    }
  }

  function setTab(tab) {
    S.tab = tab;
    $('#tabDays').setAttribute('aria-selected', String(tab === 'days'));
    $('#tabPlaces').setAttribute('aria-selected', String(tab === 'places'));
    $('#panelDays').hidden = tab !== 'days';
    $('#panelPlaces').hidden = tab !== 'places';
    if (tab === 'places') renderPlaces();
  }

  // ───────── 시작 ─────────
  async function boot() {
    const pending = takePending();
    bindUI();
    $('#originCode').textContent = originText();
    PM.geo.setMapGetter(() => S.map);
    PM.geo.onUpdate(onGeoUpdate);

    if (location.protocol === 'file:') {
      notice('file', '파일을 바로 열면(file://) 지도 그림과 카카오·네이버 지도가 동작하지 않아요. GitHub Pages 같은 웹 주소로 열어 주세요.', { tone: 'warn' });
    }
    const ok = await PM.store.open();
    if (!ok) {
      notice('nostore', '이 브라우저에서는 기록을 저장할 수 없어서 창을 닫으면 기록이 사라져요. 사생활 보호(시크릿) 창이라면 일반 창에서 열어 주세요.', { tone: 'warn' });
    }
    try {
      const [photos, geo] = await Promise.all([PM.store.all('photos'), PM.store.all('geo')]);
      const list = photos || [];
      S.photos = list.filter(validRecord).map(sanitizeRecord);
      const skipped = list.length - S.photos.length;
      if (skipped) {
        notice('badstore', `저장된 기록 중 형식이 올바르지 않은 ${skipped}개는 안전을 위해 표시하지 않았어요. (지우지는 않았어요)`, { tone: 'warn' });
      }
      PM.geo.load((geo || []).filter((g) => g && typeof g.key === 'string' && GEO_KEY_RE.test(g.key)));
    } catch (e) {
      console.warn('저장된 기록을 읽지 못했어요:', e);
    }
    if (pending && Date.now() - pending.t < 30 * 60 * 1000) {
      if (pending.phase === 'reading') {
        notice('reloaded', `사진 ${pending.n}장을 읽는 중에 페이지가 다시 열렸어요. 휴대폰 메모리가 부족했을 수 있어요. 그때까지 읽은 사진은 저장했어요. 나머지는 30~50장씩 나눠서 다시 골라 주세요. 이미 넣은 사진은 알아서 건너뛰어요.`, {
          tone: 'warn', actions: [{ label: '사진 다시 고르기', act: 'add' }]
        });
      } else if (pending.phase === 'picking' && U.isTouch()) {
        notice('reloaded', '사진을 고르는 동안 페이지가 다시 열렸어요. 사진을 한꺼번에 많이 고르면 휴대폰 메모리가 부족해질 수 있어요. 30~50장씩 나눠서 골라 보세요.', {
          tone: 'warn', actions: [{ label: '사진 다시 고르기', act: 'add' }]
        });
      }
    }
    rebuild();
    S.screen = S.photos.length ? 'list' : 'empty';
    renderAll();
    await initMap(S.settings.provider);
    drawMap(true);
    queueAddresses();
  }

  // 테스트와 문제 확인용
  PM.app = { state: S, rebuild, renderAll, drawMap, queueAddresses, selectDay, selectVisit, showAll };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.PM = window.PM || {});
