/*
 * 사진 발자국 — 사진 파일에서 촬영 날짜·위치·미리보기를 읽어요.
 * EXIF 해석은 ExifReader(MPL-2.0)를 써요. 사진은 이 기기 밖으로 나가지 않아요.
 */
(function (PM) {
  'use strict';

  const U = PM.util;
  const IMAGE_EXT = /\.(jpe?g|jfif|heic|heif|hif|avif|png|webp|tiff?|dng|gif)$/i;
  const JPEG_EXT = /\.(jpe?g|jfif)$/i;
  const HEIC_EXT = /\.(heic|heif|hif)$/i;
  const THUMB_MAX = 200;

  function isImage(file) {
    if (!file || !file.name) return false;
    if (file.name.startsWith('._')) return false; // macOS 숨김 파일
    return (file.type && file.type.startsWith('image/')) || IMAGE_EXT.test(file.name);
  }
  function isJpeg(file) {
    return file.type === 'image/jpeg' || JPEG_EXT.test(file.name);
  }
  function isHeic(name) {
    return HEIC_EXT.test(name || '');
  }

  function parseTags(buffer) {
    try {
      return window.ExifReader.load(buffer, { expanded: true });
    } catch (e) {
      return null;
    }
  }
  function hasUseful(tags) {
    if (!tags) return false;
    const gps = tags.gps;
    const ex = tags.exif || {};
    return !!((gps && Number.isFinite(gps.Latitude)) || ex.DateTimeOriginal || ex.DateTime);
  }

  // 사진 앞부분만 먼저 읽고, 부족하면 파일 전체를 읽어요.
  async function readTags(file) {
    const head = isJpeg(file) ? 256 * 1024 : 1024 * 1024;
    let tags = parseTags(await file.slice(0, head).arrayBuffer());
    if (!hasUseful(tags) && file.size > head && file.size <= 80 * 1024 * 1024) {
      const full = parseTags(await file.arrayBuffer());
      if (full) tags = full;
    }
    return tags;
  }

  // "2025:05:03 10:12:05", "2025-05-03T10:12:05+09:00" 같은 형식을 읽어요.
  const DT_RE = /^\s*(\d{4})[:\-.](\d{2})[:\-.](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/;
  function validYMD(y, m, d) {
    if (y < 1980 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
    return d <= new Date(y, m, 0).getDate();
  }
  function parseDateTime(s) {
    if (!s) return null;
    const m = DT_RE.exec(String(s));
    if (!m) return null;
    const [, y, mo, d, h, mi, se = '00'] = m;
    if (!validYMD(+y, +mo, +d) || +h > 23 || +mi > 59 || +se > 59) return null;
    return `${y}-${mo}-${d} ${h}:${mi}:${se}`;
  }

  // 파일 이름에 들어 있는 날짜 (예: 20250601_140000.jpg, Screenshot_2025-06-01-14-00-00.png)
  const NAME_RE = /(?:^|\D)((?:19|20)\d{2})[-_.]?([01]\d)[-_.]?([0-3]\d)(?:[-_ T.]?([0-2]\d)[-_.:]?([0-5]\d)[-_.:]?([0-5]\d))?/;
  function dateFromName(name) {
    const m = NAME_RE.exec(name || '');
    if (!m) return null;
    const [, y, mo, d, h, mi, se] = m;
    if (!validYMD(+y, +mo, +d)) return null;
    if (h != null && +h <= 23) return { value: `${y}-${mo}-${d} ${h}:${mi}:${se}`, timeKnown: true };
    return { value: `${y}-${mo}-${d} 00:00:00`, timeKnown: false };
  }

  function desc(group, key) {
    const t = group && group[key];
    if (!t) return '';
    const v = t.description != null ? t.description : t.value;
    return Array.isArray(v) ? String(v[0] == null ? '' : v[0]) : String(v == null ? '' : v);
  }
  function clean(s) {
    return String(s || '').replace(/\u0000/g, '').trim().slice(0, 80);
  }
  function validCoord(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) &&
      Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
      !(Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6);
  }

  function pickDate(tags, file) {
    const ex = (tags && tags.exif) || {};
    const candidates = [['DateTimeOriginal', 'exif'], ['DateTimeDigitized', 'exif'], ['DateTime', 'exif-modified']];
    for (const [key, src] of candidates) {
      const v = parseDateTime(desc(ex, key));
      if (v) return { taken: v, src };
    }
    const xmp = tags && tags.xmp;
    if (xmp) {
      for (const key of ['DateTimeOriginal', 'DateCreated', 'CreateDate']) {
        const v = parseDateTime(desc(xmp, key));
        if (v) return { taken: v, src: 'xmp' };
      }
    }
    const fromName = dateFromName(file.name);
    if (fromName) {
      if (!fromName.timeKnown && file.lastModified) {
        const mod = U.localStamp(new Date(file.lastModified));
        if (mod.slice(0, 10) === fromName.value.slice(0, 10)) return { taken: mod, src: 'filename' };
      }
      return { taken: fromName.value, src: fromName.timeKnown ? 'filename' : 'filename-date' };
    }
    if (file.lastModified) return { taken: U.localStamp(new Date(file.lastModified)), src: 'modified' };
    return { taken: U.localStamp(new Date()), src: 'unknown' };
  }

  // ───────── 미리보기 ─────────
  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode-failed')); };
      img.src = url;
    });
  }

  // orientation: EXIF 회전값 (브라우저가 이미 돌려 준 경우 1)
  function drawThumb(img, orientation) {
    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    if (!sw || !sh) return null;
    const o = orientation >= 1 && orientation <= 8 ? orientation : 1;
    const swap = o >= 5;
    const ow = swap ? sh : sw;
    const oh = swap ? sw : sh;
    const scale = Math.min(1, THUMB_MAX / Math.max(ow, oh));
    const W = Math.max(1, Math.round(ow * scale));
    const H = Math.max(1, Math.round(oh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    switch (o) {
      case 2: ctx.transform(-1, 0, 0, 1, W, 0); break;
      case 3: ctx.transform(-1, 0, 0, -1, W, H); break;
      case 4: ctx.transform(1, 0, 0, -1, 0, H); break;
      case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
      case 6: ctx.transform(0, 1, -1, 0, W, 0); break;
      case 7: ctx.transform(0, -1, -1, 0, W, H); break;
      case 8: ctx.transform(0, -1, 1, 0, 0, H); break;
      default: break;
    }
    if (swap) ctx.drawImage(img, 0, 0, H, W);
    else ctx.drawImage(img, 0, 0, W, H);
    return canvas.toDataURL('image/jpeg', 0.74);
  }

  async function makeThumb(file, tags, orientation) {
    // 1) 사진 안에 들어 있는 작은 미리보기(EXIF 썸네일)를 먼저 써요. 빠르고 가벼워요.
    const th = tags && tags.Thumbnail;
    if (th && th.image && /jpeg/i.test(th.type || 'image/jpeg')) {
      try {
        const { img, url } = await loadImage(new Blob([th.image], { type: 'image/jpeg' }));
        const data = drawThumb(img, orientation);
        URL.revokeObjectURL(url);
        if (data) return data;
      } catch (e) { /* 아래 방법으로 */ }
    }
    // 2) 브라우저가 직접 열 수 있는 사진이면 줄여서 만들어요. (HEIC은 사파리만 가능)
    try {
      const { img, url } = await loadImage(file);
      const data = drawThumb(img, 1); // <img>는 EXIF 회전을 이미 반영해요
      URL.revokeObjectURL(url);
      return data;
    } catch (e) {
      return null;
    }
  }

  async function read(file) {
    const tags = await readTags(file);
    const ex = (tags && tags.exif) || {};
    const { taken, src } = pickDate(tags, file);

    let lat = null, lng = null, alt = null;
    const gps = tags && tags.gps;
    if (gps && validCoord(gps.Latitude, gps.Longitude)) {
      lat = Math.round(gps.Latitude * 1e6) / 1e6;
      lng = Math.round(gps.Longitude * 1e6) / 1e6;
      if (Number.isFinite(gps.Altitude)) alt = Math.round(gps.Altitude);
    }

    const orientRaw = ex.Orientation && (ex.Orientation.value != null ? ex.Orientation.value : ex.Orientation);
    const orientation = Number(Array.isArray(orientRaw) ? orientRaw[0] : orientRaw) || 1;

    const rec = {
      id: 'p' + U.hash(`${file.name}|${file.size}|${taken}`),
      name: file.name,
      size: file.size,
      type: file.type || '',
      lastModified: file.lastModified || 0,
      taken,
      dateSrc: src,
      offset: clean(desc(ex, 'OffsetTimeOriginal') || desc(ex, 'OffsetTime')),
      lat, lng, alt,
      make: clean(desc(ex, 'Make')),
      model: clean(desc(ex, 'Model')),
      orientation,
      thumb: null,
      addedAt: Date.now()
    };
    rec.thumb = await makeThumb(file, tags, orientation).catch(() => null);
    return rec;
  }

  PM.exif = { read, isImage, isHeic, parseDateTime, dateFromName };
})(window.PM = window.PM || {});
