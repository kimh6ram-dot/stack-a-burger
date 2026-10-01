/* sprites-data.js(base64 내장)를 Image 객체로 로드. file://에서도 캔버스 오염 없이 그릴 수 있다. */
'use strict';
window.BS = window.BS || {};

BS.sprites = (function () {
  var store = {};
  var loaded = false;

  function loadAll(onDone) {
    var data = window.BS_SPRITES || {};
    var ids = Object.keys(data);
    var remaining = ids.length;
    if (remaining === 0) { loaded = true; onDone(); return; }
    ids.forEach(function (id) {
      var entry = data[id];
      var img = new Image();
      img.onload = function () {
        store[id] = { img: img, w: entry.w, h: entry.h, bbox: entry.bbox };
        remaining--;
        if (remaining === 0) { loaded = true; onDone(); }
      };
      img.onerror = function () {
        throw new Error('스프라이트 로드 실패: ' + id);
      };
      img.src = entry.src;
    });
  }

  function get(id) { return store[id]; }
  function isLoaded() { return loaded; }

  return { loadAll: loadAll, get: get, isLoaded: isLoaded };
})();
