/* 부트스트랩: 스프라이트 로드 → 캔버스 크기 계산 → 화면 전환(INTRO/PLAY/RESULT) → 게임 루프 → 입력 연결 */
'use strict';
(function () {
  var container = document.getElementById('app');
  var canvas = document.getElementById('stage');
  var screenIntro = document.getElementById('screen-intro');
  var screenResult = document.getElementById('screen-result');
  var btnStart = document.getElementById('btn-start');
  var btnRestart = document.getElementById('btn-restart');
  var resultLayers = document.getElementById('result-layers');
  var resultStats = document.getElementById('result-stats');

  var isTouch = BS.input.isTouchPrimary();
  BS.renderer.init(canvas, isTouch);

  /* 인트로 화면 미리보기 — 완성된 햄버거 하나를 정적으로 그린다(게임 상태·게임플레이 접촉 규칙과는
   * 무관하게 독립적으로 계산한다). 사용자가 재료 사이에 살짝 간격이 있는 모습을 마음에 들어해서,
   * 게임플레이용 접촉/overlap 튜닝(BS.landingTopY, INGREDIENT_CONTACT 등)과는 별도로
   * 고정된 작은 간격(PREVIEW_GAP_PX)만 적용한 단순 bbox-flush 스택으로 유지한다. */
  function drawIntroPreview() {
    var pc = document.getElementById('intro-preview');
    if (!pc) return;
    var dpr = window.devicePixelRatio || 1;
    var cssW = pc.clientWidth || 150, cssH = pc.clientHeight || 180;
    pc.width = Math.round(cssW * dpr);
    pc.height = Math.round(cssH * dpr);
    var pctx = pc.getContext('2d');
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pctx.clearRect(0, 0, cssW, cssH);

    var recipe = ['bottom_bun', 'patty', 'cheese', 'lettuce', 'tomato', 'top_bun'];
    var W = cssW * 0.72;
    var scale = W / BS.ingredientWidth();
    var PREVIEW_GAP_PX = 2; // 프리뷰 전용 고정 간격(정한 값) — 게임플레이 overlap과 별개

    var layers = [];
    var prev = null;
    for (var i = 0; i < recipe.length; i++) {
      var id = recipe[i];
      var vh = BS.visualHeightOf(id) * scale;
      var topY = prev ? (prev.topY - vh - PREVIEW_GAP_PX) : -vh;
      var l = { ingredient: id, topY: topY, visualHeight: vh };
      layers.push(l);
      prev = l;
    }
    var minY = Math.min.apply(null, layers.map(function (l) { return l.topY; }));
    var maxY = Math.max.apply(null, layers.map(function (l) { return l.topY + l.visualHeight; }));
    var totalH = maxY - minY;
    var offsetY = (cssH - totalH) / 2 - minY;
    var x = (cssW - W) / 2;

    for (var j = 0; j < layers.length; j++) {
      var ly = layers[j];
      var sp = BS.sprites.get(ly.ingredient);
      if (!sp) continue;
      pctx.drawImage(sp.img, sp.bbox.x, sp.bbox.y, sp.bbox.w, sp.bbox.h, x, ly.topY + offsetY, W, ly.visualHeight);
    }
  }

  var stageHLogical = 0;
  var shownResult = false;

  function handleResize() {
    var rect = container.getBoundingClientRect();
    var w = rect.width, h = rect.height;
    BS.renderer.resize(w, h);
    stageHLogical = BS.renderer.logicalHeight(w, h);
    BS.play.updateStageSize(BS.CONFIG.LOGICAL_WIDTH, stageHLogical);
  }

  function requestDrop() {
    BS.audio.unlock();
    BS.play.drop();
  }

  function startGame() {
    BS.audio.unlock();
    screenIntro.hidden = true;
    BS.play.reset(BS.CONFIG.LOGICAL_WIDTH, stageHLogical);
  }

  function restartGame() {
    BS.audio.unlock();
    screenResult.hidden = true;
    shownResult = false;
    BS.play.reset(BS.CONFIG.LOGICAL_WIDTH, stageHLogical);
  }

  function showResultIfNeeded(snap) {
    if (snap.state === 'gameover' && !shownResult) {
      shownResult = true;
      resultLayers.textContent = snap.layerCount + '층';
      resultStats.textContent = 'SCORE ' + snap.score + ' · PERFECT ' + snap.perfectCount + ' · BEST ' + snap.best;
      screenResult.hidden = false;
    }
  }

  var lastTs = null;
  function loop(ts) {
    if (lastTs === null) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    BS.play.update(dt);
    var snap = BS.play.getSnapshotState();
    BS.renderer.render(snap, BS.CONFIG.LOGICAL_WIDTH, stageHLogical);
    showResultIfNeeded(snap);
    requestAnimationFrame(loop);
  }

  BS.input.attachPointer(canvas, requestDrop);
  BS.input.attachKeyboard(requestDrop);
  btnStart.addEventListener('click', startGame);
  btnRestart.addEventListener('click', restartGame);

  // 브라우저 resize뿐 아니라 줌/모바일 주소창 변화(visualViewport)·화면 회전까지
  // 전부 같은 handleResize()로 받아서, "지금 실제로 보이는 높이" 기준으로 즉시
  // 다시 계산한다(BS.play.updateStageSize()가 카메라를 즉시 재배치함).
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleResize);
  }

  BS.sprites.loadAll(function () {
    handleResize();
    drawIntroPreview();
    BS.play.reset(BS.CONFIG.LOGICAL_WIDTH, stageHLogical);
    requestAnimationFrame(loop);
  });

  window.BS_DEBUG = { get play() { return BS.play; }, get renderer() { return BS.renderer; }, restartGame: restartGame };
})();
