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
    var settlingTopIndex = (snap.state === 'settling') ? stack.length - 1 : -1;

    // 흔들림(UNSTABLE) 피벗: 바닥(맨 아래 레이어) 중심의 화면 좌표
    var pivotX = stageW / 2, pivotY = stageH;
    if (stack.length) {
      var base = stack[0];
      pivotX = base.x + base.width / 2;
      pivotY = (base.topY + base.visualHeight) - cam;
    }
    var applyWobble = !isCollapsing && snap.wobbleAngle;
    if (applyWobble) {
      ctx.save();
      ctx.translate(pivotX, pivotY);
      ctx.rotate(snap.wobbleAngle);
      ctx.translate(-pivotX, -pivotY);
    }

    for (var i = 0; i < stack.length; i++) {
      if (i === settlingTopIndex) continue; // settling 임팩트는 아래에서 별도로 그림
      var l = stack[i];
      var x = l.x, y = l.topY - cam, w = l.width, h = l.visualHeight;
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
      var t = Math.min(1, snap.current ? snap.current.settleT / (BS.CONFIG.LAND_IMPACT_MS / 1000) : 1);
      var squash = BS.CONFIG.LANDING_SQUASH_PX * Math.sin(t * Math.PI); // 눌렸다 복귀, 오버슈트 없음
      var dy = (top.topY - cam) + squash;
      var dh = Math.max(2, top.visualHeight - squash);
      drawFull(top.ingredient, top.x, dy, top.width, dh);
    }

    if (applyWobble) ctx.restore();

    if (!isCollapsing && (snap.state === 'playing' || snap.state === 'release' || snap.state === 'falling') && snap.current) {
      var c = snap.current;
      drawFull(c.ingredient, c.x, c.renderScreenY, c.width, c.visualHeight);
    }

    if (snap.perfectFlashTimer > 0 && stack.length) {
      var pTop = stack[stack.length - 1];
      ctx.fillStyle = '#000';
      ctx.font = '800 20px Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PERFECT!', stageW / 2, Math.max(20, (pTop.topY - cam) - 18));
    }

    // 컴팩트 HUD — 한 줄
    var C = BS.CONFIG;
    var hudY = C.PLAY_TOP_PADDING + C.HUD_HEIGHT * 0.68;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#000';
    ctx.font = '700 15px Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
    ctx.fillText(snap.layerCount + '층 · SCORE ' + snap.score, 16, hudY);
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
