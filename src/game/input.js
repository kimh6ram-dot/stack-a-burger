/* Pointer Events(터치/클릭) + Space bar. 둘 다 같은 onDrop 콜백 하나만 호출한다(로직 단일화). */
'use strict';
window.BS = window.BS || {};

BS.input = (function () {
  function attachPointer(el, onDrop) {
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      onDrop();
    }, { passive: false });
  }

  function attachKeyboard(onDrop) {
    window.addEventListener('keydown', function (e) {
      if (e.code !== 'Space' && e.key !== ' ') return;
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT') return;
      if (e.repeat) return;
      e.preventDefault();
      onDrop();
    }, { passive: false });
  }

  function isTouchPrimary() {
    try { return window.matchMedia('(pointer: coarse)').matches; }
    catch (e) { return 'ontouchstart' in window; }
  }

  return { attachPointer: attachPointer, attachKeyboard: attachKeyboard, isTouchPrimary: isTouchPrimary };
})();
