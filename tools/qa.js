/* 헤드리스 QA v3: 좌우 이동 범위 실측 · supportRatio 기반 SAFE/UNSTABLE/COLLAPSE ·
 * 고의 실패 테스트(CASE A~D) · 접촉 배치(간격 없음) · 붕괴 애니메이션 · 스폰 라인 · Space/터치 입력
 * 사용: node tools/qa.js */
'use strict';
const path = require('path');
const { chromium } = require('C:/Users/thkim/Desktop/code-work/260624/build/node_modules/playwright-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');

let failures = 0;
function ok(label, cond, detail) {
  if (cond) { console.log('  OK  ', label); }
  else { failures++; console.log('  FAIL', label, detail !== undefined ? JSON.stringify(detail) : ''); }
}

async function waitReady(page) {
  await page.waitForFunction(() => {
    return window.BS && window.BS.sprites && window.BS.sprites.isLoaded() &&
      window.BS.play && window.BS.play.getSnapshotState().state === 'playing';
  }, { timeout: 8000 });
  await page.click('#btn-start');
}

async function waitState(page, states, timeout) {
  await page.waitForFunction((states) => {
    return states.indexOf(window.BS.play.getSnapshotState().state) >= 0;
  }, states, { timeout: timeout || 4000 });
}

/* DOM 버튼과 무관하게 어떤 상태에서도(collapsing 도중이라도) 강제로 새 판을 시작한다. */
async function forceReset(page) {
  // main.js의 실제 restartGame()과 동일한 경로(BS_DEBUG로 노출)를 쓴다 — 게임 상태뿐
  // 아니라 RESULT 팝업 DOM 표시 여부(shownResult)까지 함께 되돌려야, 이후 실제
  // gameover가 다시 나도 팝업이 정상적으로 뜬다(직접 BS.play.reset()만 부르면 이 UI
  // 플래그가 안 돌아와 다음 gameover 때 팝업이 영영 안 뜨는 문제가 있었다).
  await page.evaluate(() => window.BS_DEBUG.restartGame());
  await waitState(page, ['playing'], 3000);
}

/* offsetRatio: top.width에 대한 비율(양수=오른쪽, 음수=왼쪽). 착지까지 대기 후 스냅샷 반환 */
async function dropWithOffset(page, offsetRatio, waitTimeout) {
  const before = await page.evaluate((offsetRatio) => {
    const s = window.BS.play.getSnapshotState();
    const top = s.stack[s.stack.length - 1];
    const before = {
      topX: top.x, topWidth: top.width, pieceWidth: s.current.width,
      layerCount: s.layerCount, score: s.score
    };
    s.current.x = top.x + top.width * offsetRatio;
    window.BS.play.drop();
    return before;
  }, offsetRatio);
  await waitState(page, ['playing', 'collapsing', 'gameover-wait', 'gameover'], waitTimeout || 4000);
  const mid = await page.evaluate(() => window.BS.play.getSnapshotState().state);
  await waitState(page, ['playing', 'gameover'], waitTimeout || 6000);
  const after = await page.evaluate(() => {
    const s = window.BS.play.getSnapshotState();
    const top = s.stack[s.stack.length - 1];
    return {
      state: s.state, stackLen: s.stack.length, layerCount: s.layerCount, score: s.score,
      newTop: { x: top.x, width: top.width, visualHeight: top.visualHeight, topY: top.topY, tier: top.tier, ingredient: top.ingredient }
    };
  });
  return { before, midState: mid, after };
}

/* 자연 이동 범위(minX/maxX)의 끝에 반복 착지 — "실제 조작만으로" 도달 가능한 극단.
 * 매번 정확히 같은 좌표를 노리면 그 자체로는 서로 완벽히 정렬돼 겹침은 항상 100%이지만,
 * bottom_bun(중앙)과의 첫 접점 하나는 계속 위태로운 채로 남는다 — 실측 결과 그 접점이
 * supportRatio 0.636/normalizedMargin 0.213으로 매번 UNSTABLE 판정을 받고, 이 상태가
 * UNSTABLE_STREAK_COLLAPSE(5)번 이어지면 "버티다 지쳐" COLLAPSE로 이어진다(§7 스트릭 규칙).
 * QA에서는 결정적으로 재현되도록 지터를 주지 않는다(랜덤 지터는 threshold 경계에 걸려
 * 결과가 들쭉날쭉해짐 — 실제 게임에서는 자연스러운 조작 오차가 오히려 더 빨리 무너뜨릴 수 있다). */
async function dropAtNaturalExtreme(page, side) {
  await page.evaluate((side) => {
    const s = window.BS.play.getSnapshotState();
    const C = window.BS.CONFIG;
    const stageW = C.LOGICAL_WIDTH;
    const w = s.current.width;
    const minX = C.PLAY_MARGIN, maxX = stageW - C.PLAY_MARGIN - w;
    s.current.x = side === 'right' ? maxX : minX;
    window.BS.play.drop();
  }, side);
  await waitState(page, ['playing', 'collapsing', 'gameover-wait', 'gameover'], 4000);
  await waitState(page, ['playing', 'gameover'], 6000);
  return page.evaluate(() => {
    const s = window.BS.play.getSnapshotState();
    const top = s.stack[s.stack.length - 1];
    return { state: s.state, layerCount: s.layerCount, tier: top.tier };
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => { console.log('  [pageerror]', e.message); failures++; });
  page.on('console', (m) => { if (m.type() === 'error') { console.log('  [console.error]', m.text()); } });

  console.log('=== 로드 & 인트로 → 플레이 ===');
  await page.goto(URL);
  await waitReady(page);
  const init = await page.evaluate(() => {
    const s = window.BS.play.getSnapshotState();
    return { state: s.state, stackLen: s.stack.length, bottom: s.stack[0].ingredient, spawnY: s.spawnScreenY, curScreenY: s.current.renderScreenY };
  });
  ok('인트로 진입 후 playing 상태', init.state === 'playing', init);
  ok('bottom_bun이 스택 0번', init.bottom === 'bottom_bun', init);
  ok('현재 재료 화면 y = 스폰 라인', Math.abs(init.curScreenY - init.spawnY) < 0.5, init);

  console.log('=== 0. 좌우 이동 범위 실측 ===');
  const move = await page.evaluate(() => {
    const s = window.BS.play.getSnapshotState();
    const C = window.BS.CONFIG;
    const top = s.stack[s.stack.length - 1];
    const stageW = C.LOGICAL_WIDTH;
    const w = s.current.width;
    const minX = C.PLAY_MARGIN, maxX = stageW - C.PLAY_MARGIN - w;
    return {
      GAME_LEFT: 0, GAME_RIGHT: stageW,
      SPAWN_MIN_X: minX, SPAWN_MAX_X: maxX,
      ingredientWidth: w, stackCenterX: top.x + top.width / 2,
      supportWidth: top.width,
      travel: maxX - minX,
      travelRatioOfWidth: +((maxX - minX) / w).toFixed(3),
      minSupportRatioFromCenteredPrev: +(1 - ((maxX - minX) / 2) / w).toFixed(3),
      minSupportRatioFromDriftedPrev: +(1 - (maxX - minX) / w).toFixed(3)
    };
  });
  console.log('  ', JSON.stringify(move, null, 2).split('\n').join('\n  '));
  console.log('  (참고) 정중앙 스택 기준 첫 이동만으로는 supportRatio ' + move.minSupportRatioFromCenteredPrev + ' — 의도적으로 첫수는 즉시 위험해지지 않게 함');
  ok('치우친 스택 기준으로는 COLLAPSE 임계값을 확실히 넘음(실제 조작으로 무너뜨릴 수 있음)', move.minSupportRatioFromDriftedPrev < 0.32, move);

  console.log('=== A. 정중앙 연속 착지(10회) — 간격 없음 · 크기 불변 ===');
  let gapErrors = 0, sizeErrors = 0, safeCount = 0;
  for (let i = 0; i < 10; i++) {
    const r = await dropWithOffset(page, 0);
    if (r.after.state !== 'playing') { failures++; console.log('  FAIL 정중앙 착지 중 게임오버 발생', r); break; }
    if (Math.abs(r.after.newTop.width - r.before.pieceWidth) > 0.01) sizeErrors++;
    if (r.after.newTop.tier === 'safe') safeCount++;
  }
  // 접촉 배치가 실제 BS.landingTopY 공식과 일치하는지(같은 함수 재사용) 별도로 검증
  const formulaCheck = await page.evaluate(() => {
    const s = window.BS.play.getSnapshotState();
    const top = s.stack[s.stack.length - 2], newTop = s.stack[s.stack.length - 1];
    const expected = window.BS.landingTopY(
      { ingredient: top.ingredient, topY: top.topY, visualHeight: top.visualHeight },
      newTop.ingredient, newTop.visualHeight
    );
    return Math.abs(expected - newTop.topY) < 0.5;
  });
  ok('10회 모두 정상 착지(중앙 정렬은 전부 SAFE)', safeCount === 10, { safeCount });
  ok('폭이 한 번도 줄어들지 않음(클리핑 없음)', sizeErrors === 0, { sizeErrors });
  ok('레이어 배치가 BS.landingTopY 공식과 일치', formulaCheck, { formulaCheck });

  console.log('=== CASE A: 한 번에 극단적으로(supportRatio≈0.20 강제) → COLLAPSE ===');
  {
    const r = await dropWithOffset(page, 0.80); // supportRatio = 1-0.80 = 0.20
    ok('supportRatio 0.20 강제 착지 → COLLAPSE', r.after.newTop.tier === 'collapse', r.after.newTop);
  }
  await forceReset(page);

  console.log('=== CASE B: 반복 오른쪽 편향(폭의 15~20%씩) → 누적 후 COLLAPSE ===');
  {
    let collapsedAtLayer = null;
    for (let i = 0; i < 10; i++) {
      const r = await dropWithOffset(page, 0.18);
      if (r.after.state === 'gameover' || r.after.newTop.tier === 'collapse') { collapsedAtLayer = r.after.layerCount; break; }
    }
    ok('반복 편향이 결국 COLLAPSE로 이어짐(10회 이내)', collapsedAtLayer !== null, { collapsedAtLayer });
    console.log('  → ' + (collapsedAtLayer !== null ? collapsedAtLayer + '층에서 무너짐' : '10회 동안 무너지지 않음(실패)'));
  }
  await forceReset(page);

  console.log('=== CASE C: 좌우 번갈아 균형 → 상대적으로 오래 버팀 ===');
  {
    let survivedAll = true;
    let layersReached = 0;
    for (let i = 0; i < 10; i++) {
      const dir = (i % 2 === 0) ? 1 : -1;
      const r = await dropWithOffset(page, dir * 0.15);
      layersReached = r.after.layerCount;
      if (r.after.state === 'gameover') { survivedAll = false; break; }
    }
    ok('좌우 번갈아 오프셋은 10층까지 버팀(중심이 크게 안 벗어남)', survivedAll, { layersReached });
  }
  await forceReset(page);

  console.log('=== CASE D: 실제 조작 범위의 가장 오른쪽에 반복 착지(영상 재현) ===');
  {
    let collapsedAtLayer = null, unstableSeen = false;
    for (let i = 0; i < 15; i++) {
      const r = await dropAtNaturalExtreme(page, 'right');
      if (r.tier === 'unstable') unstableSeen = true;
      if (r.state === 'gameover' || r.tier === 'collapse') { collapsedAtLayer = r.layerCount; break; }
    }
    // 재료 폭을 줄인 뒤로는(이동 범위가 넓어져) 극단 가장자리 착지 자체가 첫 수부터
    // 바로 COLLAPSE로 이어질 수 있다 — 이는 "웬만해선 안 무너진다"는 피드백을 고치려는
    // 의도된 결과이므로 UNSTABLE을 반드시 거쳐야 한다고 강제하지 않는다(참고 로그만 남김).
    console.log('  (참고) UNSTABLE 경유 여부:', unstableSeen);
    ok('20층 이전에 결국 COLLAPSE(같은 방향으로 계속 밀면 무너짐)', collapsedAtLayer !== null && collapsedAtLayer < 20, { collapsedAtLayer });
    console.log('  → ' + (collapsedAtLayer !== null ? collapsedAtLayer + '층에서 무너짐' : '15회 동안 무너지지 않음(실패)'));
  }
  await forceReset(page);

  console.log('=== D2. 지지 범위 크게 벗어남 — COLLAPSE 연출(즉시 RESULT 아님) ===');
  const beforeD = await page.evaluate(() => {
    const s = window.BS.play.getSnapshotState();
    const top = s.stack[s.stack.length - 1];
    return { topWidth: top.width, pieceWidth: s.current.width };
  });
  const t0 = Date.now();
  await page.evaluate(() => {
    const s = window.BS.play.getSnapshotState();
    const top = s.stack[s.stack.length - 1];
    s.current.x = top.x + top.width * 0.9;
    window.BS.play.drop();
  });
  await waitState(page, ['collapsing'], 4000);
  const collapsingSnap = await page.evaluate(() => {
    const s = window.BS.play.getSnapshotState();
    const top = s.stack[s.stack.length - 1];
    return { state: s.state, topWidth: top.width, tier: top.tier };
  });
  ok('COLLAPSE 발생 시 폭이 줄지 않음(클리핑 없음)', Math.abs(collapsingSnap.topWidth - beforeD.pieceWidth) < 0.01, { collapsingSnap, beforeD });
  ok('collapsing 상태로 전환(즉시 gameover 아님)', collapsingSnap.state === 'collapsing', collapsingSnap);
  await page.waitForTimeout(300);
  const stillCollapsing = await page.evaluate(() => window.BS.play.getSnapshotState().state);
  ok('붕괴 시작 후 바로 RESULT로 넘어가지 않음(0.3초 시점에도 진행 중)', stillCollapsing === 'collapsing', { stillCollapsing });
  await waitState(page, ['gameover'], 4000);
  const elapsedMs = Date.now() - t0;
  ok('약 1.5초 이상 붕괴 연출 후 게임오버(총 경과 ' + elapsedMs + 'ms)', elapsedMs >= 1500, { elapsedMs });
  const finalCollapsed = await page.evaluate(() => {
    const s = window.BS.play.getSnapshotState();
    return s.stack.map(l => ({ ingredient: l.ingredient, collX: l.collX, collY: l.collY, collAngle: l.collAngle }));
  });
  const anyMoved = finalCollapsed.slice(1).some(l => Math.abs(l.collX) > 1 || Math.abs(l.collY) > 1 || Math.abs(l.collAngle) > 0.01);
  ok('무너진 최종 상태(개별 레이어 위치 변화)가 남아있음', anyMoved, finalCollapsed);
  const perLayerVaries = new Set(finalCollapsed.slice(1).map(l => l.collAngle.toFixed(2))).size > 1;
  ok('모든 레이어가 동일 각도로 회전하지 않음(개별 오브젝트)', perLayerVaries || finalCollapsed.length <= 2, finalCollapsed);

  console.log('=== 재시작 ===');
  await page.click('#btn-restart');
  await page.waitForFunction(() => window.BS.play.getSnapshotState().state === 'playing', { timeout: 3000 });
  const afterRestart = await page.evaluate(() => {
    const s = window.BS.play.getSnapshotState();
    return { layerCount: s.layerCount, score: s.score, stackLen: s.stack.length };
  });
  ok('재시작 후 layerCount=0', afterRestart.layerCount === 0, afterRestart);
  ok('재시작 후 스택=1(bottom_bun만)', afterRestart.stackLen === 1, afterRestart);

  console.log('=== E. PC: Space 입력 ===');
  // 난이도가 높아진 뒤로는 무작위 위치에서 떨어뜨리는 이 입력 테스트 자체가 COLLAPSE로
  // 이어질 수 있다 — 그래도 "입력 1회당 정확히 1개만 drop"은 검증 가능해야 하므로,
  // 깨끗한 스택에서 시작하고 결과가 collapsing으로 빠지는 경우까지 끝까지 기다린다.
  await forceReset(page);
  const layersBeforeSpace = await page.evaluate(() => window.BS.play.getSnapshotState().layerCount);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true, cancelable: true })));
  await page.waitForTimeout(100);
  const stateAfterRepeat = await page.evaluate(() => window.BS.play.getSnapshotState().state);
  ok('repeat=true Space는 무시됨(여전히 playing)', stateAfterRepeat === 'playing', { stateAfterRepeat });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: false, cancelable: true })));
  await waitState(page, ['release', 'falling', 'settling'], 2000);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: false, cancelable: true })));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: false, cancelable: true })));
  await waitState(page, ['playing', 'collapsing', 'gameover-wait', 'gameover'], 4000);
  await waitState(page, ['playing', 'gameover'], 6000);
  const layersAfterSpace = await page.evaluate(() => window.BS.play.getSnapshotState().layerCount);
  ok('Space 연타에도 정확히 1개만 drop', (layersAfterSpace - layersBeforeSpace) === 1, { layersBeforeSpace, layersAfterSpace });

  console.log('=== F. 모바일 터치(pointerdown) ===');
  await forceReset(page); // E가 COLLAPSE로 끝났을 수 있으므로 깨끗하게 리셋 후 시작
  const layersBeforeTap = await page.evaluate(() => window.BS.play.getSnapshotState().layerCount);
  await page.click('#stage');
  await page.click('#stage');
  await page.click('#stage');
  await waitState(page, ['playing', 'collapsing', 'gameover-wait', 'gameover'], 4000);
  await waitState(page, ['playing', 'gameover'], 6000);
  const layersAfterTap = await page.evaluate(() => window.BS.play.getSnapshotState().layerCount);
  ok('터치 연타에도 정확히 1개만 drop', (layersAfterTap - layersBeforeTap) === 1, { layersBeforeTap, layersAfterTap });

  console.log('=== 스폰 라인 y좌표 일관성(층수 무관) ===');
  await forceReset(page); // 이전 테스트(Space/터치)의 무작위 위치로 스택이 치우쳐 있을 수 있어 깨끗하게 리셋
  const spawnSamples = [];
  spawnSamples.push(await page.evaluate(() => { const s = window.BS.play.getSnapshotState(); return { layers: s.layerCount, y: s.current.renderScreenY, cam: s.cameraY }; }));
  for (let i = 0; i < 6; i++) {
    await dropWithOffset(page, 0);
    spawnSamples.push(await page.evaluate(() => { const s = window.BS.play.getSnapshotState(); return { layers: s.layerCount, y: s.current.renderScreenY, cam: s.cameraY }; }));
  }
  const ys = spawnSamples.map(s => s.y);
  const maxDiff = Math.max(...ys) - Math.min(...ys);
  ok('층수가 늘어도 스폰 화면 y는 항상 동일(오차<1px)', maxDiff < 1, spawnSamples);
  const camDrifted = Math.abs(spawnSamples[spawnSamples.length - 1].cam - spawnSamples[0].cam) > 1;
  console.log('  (참고) 카메라 이동량:', spawnSamples[spawnSamples.length - 1].cam - spawnSamples[0].cam, camDrifted ? '(스크롤 발생)' : '(아직 스크롤 전)');

  console.log('=== 320x568에서 화면 밖으로 넘치지 않는지 ===');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth
  }));
  ok('가로 스크롤 없음(320px)', overflow.scrollW <= overflow.clientW + 1, overflow);

  await browser.close();

  console.log('');
  if (failures === 0) { console.log('전체 통과'); process.exit(0); }
  else { console.log(failures + '개 실패'); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
