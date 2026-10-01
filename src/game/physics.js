/* 순수 함수: overlap(안정성 판정용으로 재사용) · PERFECT 판정 · 다음 재료 뽑기 · 스택 안정성 평가.
 * Math.random()은 재료 선택에만 사용(점수 생성 금지). */
'use strict';
window.BS = window.BS || {};

BS.physics = (function () {
  function computeOverlap(prevLeft, prevRight, curLeft, curRight) {
    var left = Math.max(prevLeft, curLeft);
    var right = Math.min(prevRight, curRight);
    return { left: left, right: right, width: right - left };
  }

  function isPerfect(prevLeft, prevRight, curLeft, curRight, threshold) {
    var prevCenter = (prevLeft + prevRight) / 2;
    var curCenter = (curLeft + curRight) / 2;
    return Math.abs(prevCenter - curCenter) <= threshold;
  }

  /* 동일 재료가 3번 이상 연속 등장하지 않게 (maxStreak=2 → 최대 2연속까지 허용) */
  function pickNextIngredient(pool, history, maxStreak) {
    var last = history.length ? history[history.length - 1] : null;
    var streak = 0;
    for (var i = history.length - 1; i >= 0 && history[i] === last; i--) streak++;
    var candidates = pool;
    if (last !== null && streak >= maxStreak) {
      candidates = pool.filter(function (id) { return id !== last; });
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function sign(v) { return v < 0 ? -1 : 1; }
  var TIER_RANK = { safe: 0, unstable: 1, collapse: 2 };

  function tierOf(supportRatio, normalizedMargin, cfg) {
    if (supportRatio < cfg.COLLAPSE_SUPPORT_RATIO || normalizedMargin < cfg.COLLAPSE_COM_MARGIN) return 'collapse';
    if (supportRatio >= cfg.SAFE_SUPPORT_RATIO && normalizedMargin >= cfg.SAFE_COM_MARGIN) return 'safe';
    return 'unstable';
  }

  function severityOf(supportRatio, normalizedMargin, cfg) {
    var ratioSeverity = clamp01((cfg.SAFE_SUPPORT_RATIO - supportRatio) / (cfg.SAFE_SUPPORT_RATIO - cfg.COLLAPSE_SUPPORT_RATIO));
    var marginSeverity = clamp01((cfg.SAFE_COM_MARGIN - normalizedMargin) / (cfg.SAFE_COM_MARGIN - cfg.COLLAPSE_COM_MARGIN));
    return Math.max(ratioSeverity, marginSeverity);
  }

  /* 스택 안정성 평가 v3: 재료는 항상 원래 크기(width=W)를 유지한다는 전제. 바로 아래 재료와의
   * overlap 하나만 보지 않는다 — 스택의 모든 접점(layer[i]/layer[i+1] 사이)마다 "그 위에 올라간
   * 전체 upper stack의 무게중심(COM)"이 그 접점의 실제 지지 구간(support interval) 안에서
   * 얼마나 여유 있게 있는지를 확인한다.
   *
   * 접점 i의 판정 요소:
   *   supportLeft/Right = overlap(layer[i], layer[i+1])
   *   supportRatio       = supportWidth / layer[i+1].width
   *   upperCOM           = layer[i+1..top] centerX의 평균(동일 가중치)
   *   normalizedMargin    = min(upperCOM-supportLeft, supportRight-upperCOM) / supportWidth
   *                         (0.5=완전 중앙, 0=가장자리, 음수=지지 구간 밖)
   *
   * 접점을 아래(i=0)에서 위로 스캔하다가 COLLAPSE인 접점을 처음 만나면 그 접점이 실제 붕괴
   * 지점이다(그 위 접점들의 상태는 이미 의미가 없어진다 — 그 위는 다 같이 넘어가므로).
   * COLLAPSE가 하나도 없으면 UNSTABLE 중 가장 위험한(severity가 큰) 접점을 대표로 삼는다.
   *
   * newLayer: {x, width} — 아직 stack에 push하기 전의 후보 위치. 내부적으로 stack 끝에
   * 이어붙여서 평가한다.
   * 반환: { tier, interfaceIndex, supportRatio, normalizedMargin, upperCOM, supportCenter,
   *         direction, severity } */
  function evaluateStability(stack, newLayerX, width, cfg) {
    var full = stack.concat([{ x: newLayerX, width: width }]);
    var n = full.length;
    var worstUnstable = null;

    for (var i = 0; i < n - 1; i++) {
      var lower = full[i], upper = full[i + 1];
      var supportLeft = Math.max(lower.x, upper.x);
      var supportRight = Math.min(lower.x + lower.width, upper.x + upper.width);
      var supportWidth = supportRight - supportLeft;
      var supportRatio = Math.max(0, supportWidth) / upper.width;

      var sum = 0, count = 0;
      for (var j = i + 1; j < n; j++) { sum += (full[j].x + full[j].width / 2); count++; }
      var upperCOM = sum / count;

      var supportCenter = (supportLeft + supportRight) / 2;
      var normalizedMargin = supportWidth > 0
        ? Math.min(upperCOM - supportLeft, supportRight - upperCOM) / supportWidth
        : -1;

      var tier = tierOf(supportRatio, normalizedMargin, cfg);
      var entry = {
        interfaceIndex: i, tier: tier,
        supportRatio: supportRatio, normalizedMargin: normalizedMargin,
        upperCOM: upperCOM, supportCenter: supportCenter,
        direction: sign(upperCOM - supportCenter),
        severity: severityOf(supportRatio, normalizedMargin, cfg)
      };

      if (tier === 'collapse') return entry; // 가장 아래에서 처음 발견되는 붕괴 지점 = 실제 pivot
      if (tier === 'unstable' && (!worstUnstable || entry.severity > worstUnstable.severity)) worstUnstable = entry;
    }

    return worstUnstable || {
      interfaceIndex: n - 2, tier: 'safe', supportRatio: 1, normalizedMargin: 0.5,
      upperCOM: 0, supportCenter: 0, direction: 1, severity: 0
    };
  }

  return {
    computeOverlap: computeOverlap,
    isPerfect: isPerfect,
    pickNextIngredient: pickNextIngredient,
    evaluateStability: evaluateStability
  };
})();
