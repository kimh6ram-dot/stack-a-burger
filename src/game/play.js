/* 게임 루프 v2: 재료는 항상 원본 크기 유지(클리핑 폐기) → 접촉 기반 쌓기 → 안정성(SAFE/UNSTABLE/COLLAPSE) 판정
 * 입력→RELEASE(정지+미세 처짐)→FALL(고정시간 ease-in 낙하)→LAND IMPACT(압축/복귀)→(COLLAPSING)→GAMEOVER
 * 스폰 라인은 화면 상단에 고정, 스택(월드)이 필요할 때만 아래로 스크롤된다. */
'use strict';
window.BS = window.BS || {};

BS.play = (function () {
  var C = BS.CONFIG;

  var state = 'idle';
  var stack = [];
  var current = null;
  var history = [];
  var cameraY = 0;
  var cameraTargetY = 0;
  var perfectFlashTimer = 0;
  var wobble = null; // { elapsed, amplitude, dir }
  var collapseDir = 1;
  var collapseElapsed = 0;
  var gameoverTimer = 0;
  var layerCount = 0;
  var score = 0;
  var perfectCount = 0;
  var best = 0;
  var stageW = 0, stageH = 0;
  var hasEverDropped = false; // 페이지 로드 후 한 번이라도 drop했는지(재시작해도 유지 — 안내문구 재노출 방지)
  var unstableStreak = 0; // 연속 UNSTABLE 착지 횟수(버티다 지쳐 무너지는 판정용)
  var topping = null; // "빵 얹기" 수동 완성 중인 top_bun. { ingredient, x, width, visualHeight, worldY, fallFromWorldY, fallToWorldY, phaseT, settleT }

  function ingredientWidth() { return BS.ingredientWidth(); }
  function visualHeightOf(id) { return BS.visualHeightOf(id); }
  function landingWorldTopY(topLayer, newVisualHeight, newIngredient) {
    return BS.landingTopY(topLayer, newIngredient, newVisualHeight);
  }

  function topLayer() { return stack[stack.length - 1]; }

  function readBest() {
    try { return parseInt(localStorage.getItem('bs_best_score') || '0', 10) || 0; } catch (e) { return 0; }
  }
  function writeBestIfNeeded() {
    try {
      var prev = readBest();
      if (score > prev) { localStorage.setItem('bs_best_score', String(score)); best = score; }
      else { best = prev; }
    } catch (e) { best = Math.max(best, score); }
  }

  /* 현재 stageH·스택 상태 기준으로 카메라가 가야 할 목표치. 바닥 기준선(floorAnchor)과
   * 스폰 낙하 간격 기준선(corridorAnchor) 중 "더 제약이 센"(더 작은/더 아래로 미는) 쪽을
   * 쓴다 — 스택이 짧을 땐 바닥이 이기고(화면 하단에 붙음), 스택이 스폰 라인에 가까워질
   * 만큼 커지면 낙하 간격 쪽이 이겨서 자연스럽게 스크롤로 전환된다. */
  function computeCameraTarget() {
    var floorAnchor = C.PLAY_FLOOR_PADDING - stageH; // worldY(0) → stageH-PLAY_FLOOR_PADDING
    var top = topLayer();
    if (!top) return floorAnchor;
    var neededMin = BS.spawnScreenY() + C.MIN_DROP_DISTANCE;
    var corridorAnchor = top.topY - neededMin;
    return Math.min(floorAnchor, corridorAnchor);
  }

  function updateStageSize(w, h) {
    stageW = w; stageH = h;
    if (!stack.length) return; // reset() 이전(초기 로드 시점)이면 아직 할 게 없다
    // 리사이즈 순간 즉시 재배치한다 — easing으로 서서히 따라가면 그 사이 "떠 보이는"
    // 구간이 생긴다(요청: resize 시 즉시 재배치). 이후의 자연스러운 스택 성장에 따른
    // 스크롤은 update()의 easing이 계속 담당한다.
    var target = computeCameraTarget();
    cameraY = target;
    cameraTargetY = target;
  }

  function reset(w, h) {
    stageW = w; stageH = h;
    stack = [];
    current = null;
    topping = null;
    history = [];
    perfectFlashTimer = 0;
    wobble = null;
    unstableStreak = 0;
    layerCount = 0; score = 0; perfectCount = 0;
    best = readBest();

    var W = ingredientWidth();
    var bunH = visualHeightOf(BS.START_INGREDIENT);
    var bunSprite = BS.sprites.get(BS.START_INGREDIENT);
    stack.push({
      ingredient: BS.START_INGREDIENT,
      x: (stageW - W) / 2,
      width: W,
      visualHeight: bunH,
      topY: -bunH, // 월드 바닥(y=0)에 밑면이 닿도록
      tier: null,
      collX: 0, collY: 0, collAngle: 0
    });

    // 햄버거 바닥은 게임 시작 시 "현재 보이는 화면"의 하단에 그대로 고정한다(자동으로
    // 위로 끌어올리지 않음 — 재료가 실제로 낙하하는 느낌을 원한다는 피드백 반영). 스택이
    // 아주 높아져 스폰 라인에 가까워질 때만 스크롤이 작동해 화면 아래로 밀어준다.
    var initialTarget = computeCameraTarget();
    cameraY = initialTarget;
    cameraTargetY = initialTarget;

    spawnNext();
    state = 'playing';
  }

  function spawnNext() {
    var id = BS.physics.pickNextIngredient(BS.REGULAR_INGREDIENTS, history, C.MAX_STREAK_SAME);
    history.push(id);
    var W = ingredientWidth();
    var vh = visualHeightOf(id);
    var targetLayer = layerCount + 1;
    var mult = BS.speedMultiplierForLayer(targetLayer);
    if (targetLayer > C.SPEED_VARIANCE_START_LAYER) {
      var variance = C.SPEED_VARIANCE_MIN + Math.random() * (C.SPEED_VARIANCE_MAX - C.SPEED_VARIANCE_MIN);
      mult *= variance;
    }
    mult = Math.min(mult, C.SPEED_MULT_CAP);
    var speed = C.BASE_SPEED * mult;
    var dir = (layerCount === 0) ? (Math.random() < 0.5 ? 1 : -1) : ((layerCount % 2 === 0) ? 1 : -1);
    var startX = (dir === 1) ? C.PLAY_MARGIN : (stageW - C.PLAY_MARGIN - W);
    var sy = BS.spawnScreenY();

    current = {
      ingredient: id, x: startX, width: W, visualHeight: vh,
      direction: dir, speed: speed,
      screenY: sy, renderScreenY: sy,
      phaseT: 0
    };
    state = 'playing';
  }

  function drop() {
    if (state !== 'playing' || !current) return;
    hasEverDropped = true;
    current.direction = 0;
    current.phaseT = 0;
    current.releaseFromScreenY = current.screenY;
    current.releaseToScreenY = current.screenY + C.RELEASE_SINK_PX;
    state = 'release';
  }

  /* "빵 얹기" — 게임오버와 별개로, 플레이어가 원하는 시점에 현재 스택 위에 top_bun을
   * 올려 수동으로 완성한다. playing 상태(= 낙하/정산/붕괴 중이 아님)이고 일반 재료가
   * 1개 이상 쌓였을 때만 동작한다(bottom_bun만 있는 시작 상태는 제외). 움직이던
   * current는 스택에 추가하지 않고 그냥 버린다(§5 "moving piece 제거"). */
  function requestTopping() {
    if (state !== 'playing' || !current) return;
    if (layerCount < 1) return;
    current = null;

    var top = topLayer();
    var W = ingredientWidth();
    var vh = visualHeightOf('top_bun');
    // top_bun은 모든 재료와 동일한 고정 폭 W를 공유하므로, 바로 아래 최상단 재료와
    // 같은 x를 쓰면 폭이 같아 자동으로 그 재료 중심에 맞춰진다(별도 center 계산 불필요).
    var startWorldY = BS.spawnScreenY() + cameraY; // 스폰 라인에서 등장(일반 재료와 동일 기준)
    topping = {
      ingredient: 'top_bun', x: top.x, width: W, visualHeight: vh,
      fallFromWorldY: startWorldY,
      fallToWorldY: landingWorldTopY(top, vh, 'top_bun'),
      worldY: startWorldY,
      phaseT: 0, settleT: 0
    };
    state = 'topping';
  }

  function beginFall() {
    var top = topLayer();
    var camAtRelease = cameraY;
    current.fallFromWorldY = current.releaseToScreenY + camAtRelease;
    current.fallToWorldY = landingWorldTopY(top, current.visualHeight, current.ingredient);
    current.worldY = current.fallFromWorldY;
    current.phaseT = 0;
    state = 'falling';
  }

  function finalizeDrop() {
    var top = topLayer();
    var result = BS.physics.evaluateStability(stack, current.x, current.width, C);

    if (result.tier === 'unstable') {
      unstableStreak += 1;
      if (unstableStreak >= C.UNSTABLE_STREAK_COLLAPSE) result = { tier: 'collapse', interfaceIndex: result.interfaceIndex, direction: result.direction, severity: 1 };
    } else if (result.tier === 'safe') {
      // 완전히 초기화하지 않고 1만 회복시킨다 — 가끔 살짝 안전권으로 들어와도(자연스러운 손 떨림
      // 수준) "계속 위태로운 상태"였다는 누적 위험이 한 번에 사라지지 않게 한다.
      unstableStreak = Math.max(0, unstableStreak - 1);
    } else {
      unstableStreak = 0; // collapse
    }

    var perfectThreshold = BS.perfectThresholdForLayer(layerCount + 1); // layerCount는 아직 증가 전(이 재료가 될 층수)
    var perfect = result.tier === 'safe' &&
      Math.abs((current.x + current.width / 2) - (top.x + top.width / 2)) <= perfectThreshold;

    var newLayer = {
      ingredient: current.ingredient,
      x: current.x,
      width: current.width,
      visualHeight: current.visualHeight,
      topY: current.fallToWorldY,
      tier: result.tier,
      perfect: perfect,
      collX: 0, collY: 0, collAngle: 0,
      collVX: 0, collVY: 0, collAngVel: 0, collActive: false, collDetached: false,
      collDetachAt: 0, collHeightFactor: 1
    };
    stack.push(newLayer);
    layerCount += 1;
    score += 1;
    if (perfect) { score += 1; perfectCount += 1; perfectFlashTimer = C.PERFECT_FLASH_MS / 1000; }

    BS.audio.playThump(perfect ? 1 : (result.tier === 'safe' ? 0.85 : 0.6));

    current.landedTier = result.tier;
    current.landedDirection = result.direction;
    current.landedSeverity = result.severity;
    current.landedPivotIndex = result.interfaceIndex;
    current.settleT = 0;
    state = 'settling';
  }

  var collapsePivotIndex = 0, collapsePivotX = 0, collapsePivotY = 0;

  /* 새 위치(cx,cy)로부터의 오프셋(dx,dy) = layer를 (pivotX,pivotY) 축으로 angle만큼 돌렸을 때
   * 중심이 이동하는 거리. 렌더러는 이 dx/dy를 collX/collY로 쓰고, 동시에 collAngle로 스프라이트
   * 자체도 같은 각도만큼 돌린다(강체 회전과 동일한 시각 효과). */
  function rotateOffsetAroundPivot(layer, pivotX, pivotY, angle) {
    var cx = layer.x + layer.width / 2, cy = layer.topY + layer.visualHeight / 2;
    var dx0 = cx - pivotX, dy0 = cy - pivotY;
    var cos = Math.cos(angle), sin = Math.sin(angle);
    var dx1 = dx0 * cos - dy0 * sin, dy1 = dx0 * sin + dy0 * cos;
    return { dx: (pivotX + dx1) - cx, dy: (pivotY + dy1) - cy };
  }

  function beginCollapse(pivotIndex, direction) {
    collapseDir = direction || 1;
    collapsePivotIndex = pivotIndex;
    collapseElapsed = 0;

    var lower = stack[pivotIndex], upper = stack[pivotIndex + 1];
    var supportLeft = Math.max(lower.x, upper.x), supportRight = Math.min(lower.x + lower.width, upper.x + upper.width);
    collapsePivotX = collapseDir > 0 ? supportRight : supportLeft;
    collapsePivotY = lower.topY;

    var n = stack.length;
    for (var i = pivotIndex + 1; i < n; i++) {
      var layer = stack[i];
      var depthFromTop = n - 1 - i; // 0 = 맨 위층
      layer.collActive = true; // pivot 회전 단계부터 이미 렌더러에서 변형 적용 대상
      layer.collDetached = false;
      layer.collX = 0; layer.collY = 0; layer.collAngle = 0;
      layer.collVX = 0; layer.collVY = 0; layer.collAngVel = 0;
      layer.collDetachAt = (C.COLLAPSE_BRACE_MS + C.COLLAPSE_TOPPLE_MS) / 1000 + depthFromTop * (C.COLLAPSE_DETACH_STAGGER_MS / 1000);
      var span = Math.max(1, n - 1 - pivotIndex);
      layer.collHeightFactor = 0.5 + 0.5 * ((i - pivotIndex) / span); // 위층일수록 1.0에 가까움
    }
    state = 'collapsing';
  }

  function beginWobble(severity, direction) {
    wobble = { elapsed: 0, amplitude: C.WOBBLE_MAX_ANGLE * severity, dir: direction || 1 };
  }

  function update(dt) {
    dt = Math.min(dt, 0.05);

    if (state === 'playing' && current) {
      current.x += current.direction * current.speed * dt;
      var minX = C.PLAY_MARGIN, maxX = stageW - C.PLAY_MARGIN - current.width;
      if (current.x < minX) { current.x = minX; current.direction = 1; }
      if (current.x > maxX) { current.x = maxX; current.direction = -1; }
      current.renderScreenY = current.screenY;
    } else if (state === 'release' && current) {
      current.phaseT += dt;
      var rt = Math.min(1, current.phaseT / (C.RELEASE_MS / 1000));
      current.screenY = current.releaseFromScreenY + (current.releaseToScreenY - current.releaseFromScreenY) * rt;
      current.renderScreenY = current.screenY;
      if (rt >= 1) beginFall();
    } else if (state === 'falling' && current) {
      current.phaseT += dt;
      var ft = Math.min(1, current.phaseT / (C.FALL_MS / 1000));
      var te = ft * ft * ft; // ease-in: 처음엔 느리게, 갈수록 빠르게
      current.worldY = current.fallFromWorldY + (current.fallToWorldY - current.fallFromWorldY) * te;
      current.renderScreenY = current.worldY - cameraY;
      if (ft >= 1) finalizeDrop();
    } else if (state === 'settling' && current) {
      current.settleT += dt;
      if (current.settleT >= C.LAND_IMPACT_MS / 1000) {
        var tier = current.landedTier;
        var severity = current.landedSeverity;
        var direction = current.landedDirection;
        var pivotIndex = current.landedPivotIndex;
        current = null;
        if (tier === 'collapse') beginCollapse(pivotIndex, direction);
        else {
          if (tier === 'unstable') beginWobble(severity, direction);
          spawnNext();
        }
      }
    } else if (state === 'collapsing') {
      collapseElapsed += dt;
      var braceEnd = C.COLLAPSE_BRACE_MS / 1000;
      var toppleEnd = braceEnd + C.COLLAPSE_TOPPLE_MS / 1000;
      var braceAngle = C.COLLAPSE_BRACE_ANGLE_DEG * Math.PI / 180;
      var toppleAngleCap = C.COLLAPSE_TOPPLE_ANGLE_CAP_DEG * Math.PI / 180;
      var sharedAngle;
      if (collapseElapsed < braceEnd) {
        sharedAngle = braceAngle * (collapseElapsed / braceEnd);
      } else if (collapseElapsed < toppleEnd) {
        var tt = (collapseElapsed - braceEnd) / (toppleEnd - braceEnd);
        sharedAngle = braceAngle + (toppleAngleCap - braceAngle) * tt;
      } else {
        sharedAngle = toppleAngleCap;
      }
      sharedAngle *= collapseDir;

      var floorScreenY = stageH - 16; // 화면 밖으로 완전히 사라지지 않도록 바닥에서 멈춘다(결과 배경으로 계속 보여야 함)
      for (var i = collapsePivotIndex + 1; i < stack.length; i++) {
        var layer = stack[i];
        if (!layer.collDetached) {
          if (collapseElapsed >= layer.collDetachAt) {
            var frozen = rotateOffsetAroundPivot(layer, collapsePivotX, collapsePivotY, sharedAngle);
            layer.collX = frozen.dx; layer.collY = frozen.dy; layer.collAngle = sharedAngle;
            layer.collVX = collapseDir * C.COLLAPSE_DETACH_VX_BASE * layer.collHeightFactor;
            layer.collVY = C.COLLAPSE_DETACH_VY_BASE * layer.collHeightFactor;
            layer.collAngVel = collapseDir * C.COLLAPSE_DETACH_ANGVEL * (0.8 + Math.random() * 0.4);
            layer.collDetached = true;
          } else {
            var live = rotateOffsetAroundPivot(layer, collapsePivotX, collapsePivotY, sharedAngle);
            layer.collX = live.dx; layer.collY = live.dy; layer.collAngle = sharedAngle;
          }
        } else {
          layer.collVY += C.COLLAPSE_GRAVITY * dt;
          layer.collX += layer.collVX * dt;
          layer.collY += layer.collVY * dt;
          var capTotal = toppleAngleCap + (C.COLLAPSE_DETACH_EXTRA_ANGLE_DEG * Math.PI / 180);
          var newAngle = layer.collAngle + layer.collAngVel * dt;
          if (Math.abs(newAngle) > capTotal) { newAngle = capTotal * (newAngle < 0 ? -1 : 1); layer.collAngVel = 0; }
          layer.collAngle = newAngle;

          var screenBottom = (layer.topY + layer.collY + layer.visualHeight) - cameraY;
          if (screenBottom > floorScreenY) {
            layer.collY -= (screenBottom - floorScreenY);
            layer.collVY = 0;
            layer.collVX *= 0.7;
          }
          var screenX = layer.x + layer.collX;
          if (screenX < -layer.width * 0.6) { layer.collX = -layer.width * 0.6 - layer.x; layer.collVX = 0; }
          if (screenX > stageW - layer.width * 0.4) { layer.collX = (stageW - layer.width * 0.4) - layer.x; layer.collVX = 0; }
        }
      }
      if (collapseElapsed >= C.COLLAPSE_DURATION_MS / 1000) {
        writeBestIfNeeded();
        gameoverTimer = C.RESULT_DELAY_MS / 1000;
        state = 'gameover-wait';
      }
    } else if (state === 'gameover-wait') {
      gameoverTimer -= dt;
      if (gameoverTimer <= 0) state = 'gameover';
    } else if (state === 'topping' && topping) {
      topping.phaseT += dt;
      var tpt = Math.min(1, topping.phaseT / (C.FALL_MS / 1000));
      var tpe = tpt * tpt * tpt; // 일반 낙하와 동일한 ease-in — "기존 착지감과 톤 맞춤"
      topping.worldY = topping.fallFromWorldY + (topping.fallToWorldY - topping.fallFromWorldY) * tpe;
      if (tpt >= 1) {
        stack.push({
          ingredient: topping.ingredient, x: topping.x, width: topping.width, visualHeight: topping.visualHeight,
          topY: topping.fallToWorldY, tier: 'safe', perfect: false,
          collX: 0, collY: 0, collAngle: 0, collVX: 0, collVY: 0, collAngVel: 0,
          collActive: false, collDetached: false, collDetachAt: 0, collHeightFactor: 1
        });
        topping.settleT = 0;
        state = 'topping-settle';
      }
    } else if (state === 'topping-settle' && topping) {
      topping.settleT += dt;
      if (topping.settleT >= C.LAND_IMPACT_MS / 1000) {
        topping = null;
        state = 'completed';
      }
    }

    if (perfectFlashTimer > 0) perfectFlashTimer = Math.max(0, perfectFlashTimer - dt);

    if (wobble) {
      wobble.elapsed += dt;
      if (wobble.elapsed >= C.WOBBLE_DECAY_MS / 1000) wobble = null;
    }

    if (state !== 'collapsing' && state !== 'gameover-wait' && state !== 'gameover' &&
        state !== 'topping' && state !== 'topping-settle' && state !== 'completed') {
      // 매 프레임 현재 stageH·스택 기준으로 다시 계산한다(이전 목표값에 대한 min() 래칫을
      // 걸지 않음) — 그래야 창 크기가 커져서 바닥 기준선이 "덜 제약적"으로 바뀌는 경우에도
      // 카메라가 다시 그쪽으로 자연스럽게 돌아올 수 있다. 일반적인 스택 성장만 있는
      // 동안에는(창 크기 변화 없음) 이 값이 단조 감소하므로 기존 동작과 동일하다.
      // 빵 얹기(topping) 이후에는 완성 장면이 갑자기 스크롤되지 않도록 카메라를 고정한다.
      cameraTargetY = computeCameraTarget();
    }
    cameraY += (cameraTargetY - cameraY) * C.STACK_SCROLL_EASE;
  }

  function getWobbleAngle() {
    if (!wobble) return 0;
    var t = Math.min(1, wobble.elapsed / (C.WOBBLE_DECAY_MS / 1000));
    return wobble.amplitude * (1 - t) * Math.sin(t * Math.PI) * wobble.dir;
  }

  function getSnapshotState() {
    return {
      state: state, stack: stack, current: current, topping: topping,
      cameraY: cameraY, layerCount: layerCount, score: score, perfectCount: perfectCount,
      best: best, perfectFlashTimer: perfectFlashTimer,
      wobbleAngle: getWobbleAngle(),
      hasEverDropped: hasEverDropped,
      spawnScreenY: BS.spawnScreenY()
    };
  }

  return {
    reset: reset, update: update, drop: drop, updateStageSize: updateStageSize,
    requestTopping: requestTopping,
    getSnapshotState: getSnapshotState
  };
})();
