/* 사진 발자국 — 공통 도우미 */
(function (PM) {
  'use strict';

  const U = {};
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  U.pad = (n) => String(n).padStart(2, '0');

  // "2025-05-03" → Date (정오 기준이라 서머타임 영향이 없어요)
  U.dayDate = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  };
  U.weekday = (key) => WEEKDAYS[U.dayDate(key).getDay()];
  U.fmtDayLong = (key) => {
    const dt = U.dayDate(key);
    return `${dt.getFullYear()}년 ${dt.getMonth() + 1}월 ${dt.getDate()}일 (${WEEKDAYS[dt.getDay()]})`;
  };
  U.fmtDayMid = (key) => {
    const dt = U.dayDate(key);
    return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${WEEKDAYS[dt.getDay()]})`;
  };
  U.fmtDayShort = (key) => key.replace(/-/g, '.');
  U.fmtDayTiny = (key) => {
    const dt = U.dayDate(key);
    return `${dt.getMonth() + 1}.${dt.getDate()} (${WEEKDAYS[dt.getDay()]})`;
  };
  U.fmtMonth = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return `${y}년 ${m}월`;
  };
  // "2025-05-03 10:12:05" → "10:12"
  U.fmtTime = (ts) => (ts || '').slice(11, 16);
  U.timeRange = (a, b) => {
    const s = U.fmtTime(a), e = U.fmtTime(b);
    return s === e ? s : `${s}–${e}`;
  };

  // 로컬 시각 문자열 "YYYY-MM-DD HH:MM:SS"
  U.localStamp = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())} ${U.pad(d.getHours())}:${U.pad(d.getMinutes())}:${U.pad(d.getSeconds())}`;
  };
  U.todayKey = () => U.localStamp(new Date()).slice(0, 10);

  // 두 시각 문자열 사이의 분 (시간대 정보 없이 벽시계 기준)
  U.minutesBetween = (a, b) => {
    const pa = a.replace(' ', 'T'), pb = b.replace(' ', 'T');
    return Math.abs(new Date(pb) - new Date(pa)) / 60000;
  };

  // 두 좌표 사이 거리(m)
  U.distance = (a, b) => {
    const R = 6371008.8, toRad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toRad, dLng = (b.lng - a.lng) * toRad;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  };

  U.coordText = (lat, lng) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  // 짧은 해시 (FNV-1a 32bit 두 번)
  U.hash = (str) => {
    let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2 ^ c, 0x5bd1e995);
    }
    return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
  };

  U.csvCell = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  U.download = (filename, blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  };

  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  U.nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

  U.debounce = (fn, ms) => {
    let t = 0;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  U.isTouch = () => window.matchMedia('(pointer: coarse)').matches;
  U.isAndroid = () => /Android/i.test(navigator.userAgent);
  // 아이패드는 PC처럼 보이는 경우가 있어서 터치 지점 수로도 확인해요.
  U.isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  U.isNarrow = () => window.matchMedia('(max-width: 860px)').matches;

  U.bytes = (n) => {
    if (!Number.isFinite(n)) return '';
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))}KB`;
    return `${(n / 1024 / 1024).toFixed(1)}MB`;
  };

  // 클립보드 복사 (안 되면 false)
  U.copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (e2) {
        return false;
      }
    }
  };

  PM.util = U;
})(window.PM = window.PM || {});
