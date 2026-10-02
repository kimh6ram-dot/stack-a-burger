/* Canvas 렌더링 v2 — 클리핑 없음(항상 전체 소스 이미지), 접촉 기반 위치, 착지 임팩트, 흔들림/붕괴 애니메이션, 컴팩트 HUD. */
'use strict';
window.BS = window.BS || {};

BS.renderer = (function () {
  var canvas, ctx;
  var scale = 1;
  var dpr = 1;
  var isTouch = false;

  function init(canvasEl, touchPrimary) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    isTouch = !!touchPrimary;
  }

  function resize(cssW, cssH) {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    scale = cssW / BS.CONFIG.LOGICAL_WIDTH;
  }

  function logicalHeight(cssW, cssH) {
    return cssH / (cssW / BS.CONFIG.LOGICAL_WIDTH);
  }

  function drawFull(id, x, y, w, h) {
    var sp = BS.sprites.get(id);
    if (!sp || w <= 0 || h <= 0) return;
    ctx.drawImage(sp.img, sp.bbox.x, sp.bbox.y, sp.bbox.w, sp.bbox.h, x, y, w, h);
  }

  function render(snap, stageW, stageH) {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, stageW, stageH);

    var cam = snap.cameraY;
    var stack = snap.stack;
    var isCollapsing = (snap.state === 'collapsing' || snap.state === 'gameover-wait' || snap.state === 'gameover');

    // 동적 균형/흔들림(2026-10-02) — 바닥을 pivot 삼아 높이에 비례해 좌우로 전단(shear)시킨다.
    // play.js의 shearedStackSnapshot()/beginCollapse()와 같은 공식을 공유해야 "보이는 대로
    // 판정"이 성립한다. COLLAPSE 연출 중에는 각 레이어의 collX가 이미 그 전환 시점의 흔들림을
    // 반영해 이어받으므로(§15) 여기서 추가로 shear를 더하지 않는다(이중 적용 방지).
    var TILT_FACTOR = BS.CONFIG.TILT_COM_FACTOR;
    var tiltTan = Math.tan(snap.stackTilt || 0);
    function shearXFor(layer) {
      if (isCollapsing) return 0;
      var heightAboveBase = -(layer.topY + layer.visualHeight);
      return heightAboveBase * tiltTan * TILT_FACTOR;
    }
    // topping-settle(빵 얹기 착지 임팩트)도 settling과 같은 압축/복귀 연출을 공유한다.
    var settlingTopIndex = (snap.state === 'settling' || snap.state === 'topping-settle') ? stack.length - 1 : -1;

    for (var i = 0; i < stack.length; i++) {
      if (i === settlingTopIndex) continue; // settling 임팩트는 아래에서 별도로 그림
      var l = stack[i];
      var x = l.x + shearXFor(l), y = l.topY - cam, w = l.width, h = l.visualHeight;
      if (isCollapsing && l.collActive) {
        ctx.save();
        var cx = x + w / 2 + l.collX, cy = y + h / 2 + l.collY;
        ctx.translate(cx, cy);
        ctx.rotate(l.collAngle);
        drawFull(l.ingredient, -w / 2, -h / 2, w, h);
        ctx.restore();
      } else {
        drawFull(l.ingredient, x, y, w, h);
      }
    }

    if (settlingTopIndex >= 0) {
      var top = stack[settlingTopIndex];
      var settleSrc = snap.state === 'topping-settle' ? snap.topping : snap.current;
      var t = Math.min(1, settleSrc ? settleSrc.settleT / (BS.CONFIG.LAND_IMPACT_MS / 1000) : 1);
      var squash = BS.CONFIG.LANDING_SQUASH_PX * Math.sin(t * Math.PI); // 눌렸다 복귀, 오버슈트 없음
      var dy = (top.topY - cam) + squash;
      var dh = Math.max(2, top.visualHeight - squash);
      drawFull(top.ingredient, top.x + shearXFor(top), dy, top.width, dh);
    }

    if (!isCollapsing && (snap.state === 'playing' || snap.state === 'release' || snap.state === 'falling') && snap.current) {
      var c = snap.current;
      drawFull(c.ingredient, c.x, c.renderScreenY, c.width, c.visualHeight);
    }

    if (snap.state === 'topping' && snap.topping) {
      var tb = snap.topping;
      drawFull(tb.ingredient, tb.x, tb.worldY - cam, tb.width, tb.visualHeight);
    }

    if (snap.perfectFlashTimer > 0 && stack.length) {
      var pTop = stack[stack.length - 1];
      ctx.fillStyle = '#000';
      ctx.font = '800 20px Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PERFECT!', stageW / 2, Math.max(20, (pTop.topY - cam) - 18));
    }

    // 컴팩트 HUD — 한 줄: 중앙 층수·점수 / 우측 BEST. 좌측은 워터마크 자리로 비워둔다
    // (워터마크는 더 이상 캔버스에 그리지 않고, 메인 화면과 완전히 동일한 고정 CSS px
    // DOM 요소 하나를 모든 화면이 공유한다 — 화면 전환 시 위치/크기가 절대 변하지
    // 않도록 2026-10-01 재변경. index.html의 `.watermark` 참고).
    var C = BS.CONFIG;
    var hudY = C.PLAY_TOP_PADDING + C.HUD_HEIGHT * 0.68;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.font = '700 15px Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
    ctx.fillText(snap.layerCount + '층 · SCORE ' + snap.score, stageW / 2, hudY);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#777';
    ctx.font = '700 13px Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
    ctx.fillText('BEST ' + snap.best, stageW - 16, hudY);

    // 첫 입력 전 안내(한 줄, 작게) — 현재 재료와 겹치지 않도록 그 아래 여백에 배치
    if (!snap.hasEverDropped && snap.state === 'playing' && snap.current) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#777';
      ctx.font = '600 13px Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
      var hint = isTouch ? '화면을 눌러 쌓기' : 'SPACE 또는 클릭해서 쌓기';
      var hintY = snap.spawnScreenY + snap.current.visualHeight + 20;
      ctx.fillText(hint, stageW / 2, hintY);
    }
  }

  return { init: init, resize: resize, logicalHeight: logicalHeight, render: render };
})();
