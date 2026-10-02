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

  /* 접점(interface) 스캔 — v3 안정성 평가의 핵심 로직. 바로 아래 재료와의 overlap 하나만
   * 보지 않는다 — full 배열의 모든 접점(full[i]/full[i+1] 사이)마다 "그 위에 올라간 전체
   * upper stack의 무게중심(COM)"이 그 접점의 실제 지지 구간(support interval) 안에서
   * 얼마나 여유 있게 있는지를 확인한다.
   *
   * 접점 i의 판정 요소:
   *   supportLeft/Right = overlap(full[i], full[i+1])
   *   supportRatio       = supportWidth / full[i+1].width
   *   upperCOM           = full[i+1..top] centerX의 평균(동일 가중치)
   *   normalizedMargin    = min(upperCOM-supportLeft, supportRight-upperCOM) / supportWidth
   *                         (0.5=완전 중앙, 0=가장자리, 음수=지지 구간 밖)
   *
   * 접점을 아래(i=0)에서 위로 스캔하다가 COLLAPSE인 접점을 처음 만나면 그 접점이 실제 붕괴
   * 지점이다(그 위 접점들의 상태는 이미 의미가 없어진다 — 그 위는 다 같이 넘어가므로).
   * COLLAPSE가 하나도 없으면 UNSTABLE 중 가장 위험한(severity가 큰) 접점을 대표로 삼는다.
   *
   * full: [{x, width}, ...] — 이미 완성된(또는 가상의 새 레이어까지 포함한) 전체 배열.
   * evaluateStability(착지 판정)와 evaluateExistingStability(흔들림 자체의 위험도, 2026-10-02
   * 신설)가 이 스캔을 공유한다 — 둘 다 "주어진 x 좌표 배열이 지금 안전한가"를 묻는 동일한
   * 질문이고, 차이는 그 x 좌표가 정지 위치냐(착지) 현재 기울어 보이는 위치냐(흔들림)뿐이다. */
  function scanInterfaces(full, cfg) {
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

  /* newLayer: {x, width} — 아직 stack에 push하기 전의 착지 후보 위치. stack 끝에 이어붙여서
   * 평가한다. stack 자체는 호출부(play.js)가 이미 "현재 흔들려 보이는 x"로 보정해 넘긴다
   * (정지 좌표가 아니라 실제 화면에 보이는 위치 기준으로 판정 — §12). */
  function evaluateStability(stack, newLayerX, width, cfg) {
    return scanInterfaces(stack.concat([{ x: newLayerX, width: width }]), cfg);
  }

  /* 새 재료 없이 "지금 이 스택 자체"(흔들림으로 보정된 x)가 안전한지만 본다 — 착지와 무관하게
   * 흔들림 자체가 위험해지는 상황(2026-10-02 신설, §16~18)을 매 프레임 감시하는 데 쓴다.
   * stack.length < 2(bottom_bun만 있음)이면 접점이 없으므로 항상 안전. */
  function evaluateExistingStability(stack, cfg) {
    if (stack.length < 2) {
      return { interfaceIndex: -1, tier: 'safe', supportRatio: 1, normalizedMargin: 0.5, upperCOM: 0, supportCenter: 0, direction: 1, severity: 0 };
    }
    return scanInterfaces(stack, cfg);
  }

  function computeStackCOMX(stack) {
    var sum = 0;
    for (var i = 0; i < stack.length; i++) sum += stack[i].x + stack[i].width / 2;
    return sum / stack.length;
  }

  return {
    computeOverlap: computeOverlap,
    isPerfect: isPerfect,
    pickNextIngredient: pickNextIngredient,
    evaluateStability: evaluateStability,
    evaluateExistingStability: evaluateExistingStability,
    computeStackCOMX: computeStackCOMX
  };
})();
