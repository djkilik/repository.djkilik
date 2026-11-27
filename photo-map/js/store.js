/*
 * 사진 발자국 — 이 기기(브라우저)에 기록을 저장해요.
 * 사진 원본은 저장하지 않고, 날짜·위치·작은 미리보기만 IndexedDB에 저장해요.
 */
(function (PM) {
  'use strict';

  const DB_NAME = 'photo-footprints';
  const DB_VERSION = 1;
  const SETTINGS_KEY = 'photo-footprints.settings.v1';
  const DEFAULTS = {
    provider: 'osm',
    keys: { kakao: '', naver: '', google: '' },
    radius: 300,
    autoAddress: true
  };

  let db = null;
  const memory = { photos: new Map(), geo: new Map() };

  function promisify(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const store = {
    persistent: false,

    async open() {
      if (!('indexedDB' in window)) return false;
      try {
        db = await new Promise((resolve, reject) => {
          const req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = () => {
            const d = req.result;
            if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' });
            if (!d.objectStoreNames.contains('geo')) d.createObjectStore('geo', { keyPath: 'key' });
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
          req.onblocked = () => reject(new Error('blocked'));
        });
        this.persistent = true;
        return true;
      } catch (e) {
        db = null;
        this.persistent = false;
        return false;
      }
    },

    async all(name) {
      if (!db) return Array.from(memory[name].values());
      const tx = db.transaction(name, 'readonly');
      return promisify(tx.objectStore(name).getAll());
    },

    async put(name, items) {
      const list = [].concat(items);
      if (!list.length) return;
      if (!db) {
        for (const it of list) memory[name].set(it.id || it.key, it);
        return;
      }
      await new Promise((resolve, reject) => {
        const tx = db.transaction(name, 'readwrite');
        const os = tx.objectStore(name);
        for (const it of list) os.put(it);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('aborted'));
      });
    },

    async clear(name) {
      memory[name].clear();
      if (!db) return;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(name, 'readwrite');
        tx.objectStore(name).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    // 브라우저가 저장 공간이 부족할 때 기록을 지우지 않도록 요청해요.
    async askPersist() {
      try {
        if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
      } catch (e) { /* 지원 안 함 */ }
      return false;
    },

    async usage() {
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const { usage } = await navigator.storage.estimate();
          return usage;
        }
      } catch (e) { /* 지원 안 함 */ }
      return null;
    },

    loadSettings() {
      let saved = {};
      try {
        saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
      } catch (e) {
        saved = {};
      }
      const s = Object.assign({}, DEFAULTS, saved);
      s.keys = Object.assign({}, DEFAULTS.keys, saved.keys || {});
      if (!['kakao', 'naver', 'google', 'osm'].includes(s.provider)) s.provider = 'osm';
      if (![100, 300, 1000].includes(Number(s.radius))) s.radius = 300;
      s.radius = Number(s.radius);
      s.autoAddress = s.autoAddress !== false;
      return s;
    },

    saveSettings(s) {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  PM.store = store;
})(window.PM = window.PM || {});
