/* PLAY 화면 바닥 기준선(floorY)이 뷰포트 크기 변화에 즉시 재배치되는지 검증한다.
 * 390x844 / 390x650 / 390x568, PC 창 높이 900→700→550 순차 변경, "줌"에 해당하는
 * 레이아웃 뷰포트 변화를 전부 확인하고 bottom_bun의 실제 하단 픽셀과 viewport 하단
 * 사이 거리를 측정한다(목표: PLAY_FLOOR_PADDING과 거의 동일).
 * 사용: node tools/qa-floor-resize.js */
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

async function measureFloor(page) {
  return page.evaluate(() => {
    const s = window.BS.play.getSnapshotState();
    const base = s.stack[0]; // bottom_bun
    const bottomScreenY = (base.topY + base.visualHeight) - s.cameraY; // logical px
    const rect = document.getElementById('app').getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const scale = rect.width / window.BS.CONFIG.LOGICAL_WIDTH;
    const viewportBottomCss = rect.height; // app 내부 기준(0..rect.height)
    const bottomScreenYcss = bottomScreenY * scale;
    var distanceCss = viewportBottomCss - bottomScreenYcss;
    return {
      viewportW: rect.width, viewportH: rect.height, scale: +scale.toFixed(4),
      bottomBunVisibleBottomCss: +bottomScreenYcss.toFixed(2),
      distanceFromViewportBottom: +distanceCss.toFixed(2),
      // CSS px 거리는 scale(=viewportW/LOGICAL_WIDTH)에 비례해 커진다(다른 모든 게임 요소와
      // 동일한 반응형 모델) — "같은 논리 여백"인지 검증할 땐 scale로 나눈 논리 px 기준으로 봐야 한다.
      distanceLogical: +(distanceCss / scale).toFixed(2)
    };
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(URL);
  await page.waitForFunction(() => window.BS && window.BS.sprites.isLoaded() && window.BS.play.getSnapshotState().state === 'playing', { timeout: 8000 });
  await page.click('#btn-start');

  const padding = await page.evaluate(() => window.BS.CONFIG.PLAY_FLOOR_PADDING);
  console.log('PLAY_FLOOR_PADDING =', padding, 'px');

  console.log('=== 테스트 A: 390x844 ===');
  let m = await measureFloor(page);
  console.log(' ', JSON.stringify(m));
  ok('바닥과 화면 하단 거리 ≈ PLAY_FLOOR_PADDING', Math.abs(m.distanceLogical - padding) < 0.5, m);

  console.log('=== 테스트 B: 390x650 (resize) ===');
  await page.setViewportSize({ width: 390, height: 650 });
  await page.waitForTimeout(100);
  m = await measureFloor(page);
  console.log(' ', JSON.stringify(m));
  ok('리사이즈 후에도 바닥과 화면 하단 거리 ≈ PLAY_FLOOR_PADDING', Math.abs(m.distanceLogical - padding) < 0.5, m);

  console.log('=== 테스트 C: 390x568 (resize) ===');
  await page.setViewportSize({ width: 390, height: 568 });
  await page.waitForTimeout(100);
  m = await measureFloor(page);
  console.log(' ', JSON.stringify(m));
  ok('리사이즈 후에도 바닥과 화면 하단 거리 ≈ PLAY_FLOOR_PADDING', Math.abs(m.distanceLogical - padding) < 0.5, m);

  console.log('=== 테스트 D: PC 창 높이 900 → 700 → 550 순차 변경 ===');
  for (const h of [900, 700, 550]) {
    await page.setViewportSize({ width: 430, height: h });
    await page.waitForTimeout(100);
    m = await measureFloor(page);
    console.log('  h=' + h, JSON.stringify(m));
    ok('높이 ' + h + '에서도 바닥 거리 ≈ PLAY_FLOOR_PADDING', Math.abs(m.distanceLogical - padding) < 0.5, m);
  }

  console.log('=== 테스트 E: "줌" 역할(레이아웃 뷰포트 CSS px 축소) 100% / 125% / 150% 비슷하게 재현 ===');
  // 실제 브라우저 줌은 Playwright로 직접 제어할 수 없지만, 줌의 효과(같은 물리 화면에
  // 더 적은 CSS px가 들어오는 것)는 viewport(width,height)를 비례 축소하는 것과
  // 동일하게 레이아웃에 반영된다 — 390x844 기준을 1/1.25, 1/1.5로 줄여 재현한다.
  const base = { w: 390, h: 844 };
  for (const zoom of [1.0, 1.25, 1.5]) {
    const w = Math.round(base.w / zoom), h = Math.round(base.h / zoom);
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(100);
    m = await measureFloor(page);
    console.log('  zoom=' + zoom + ' (viewport ' + w + 'x' + h + ')', JSON.stringify(m));
    ok('줌 ' + zoom + '에서도 바닥 거리 ≈ PLAY_FLOOR_PADDING', Math.abs(m.distanceLogical - padding) < 0.5, m);
  }

  console.log('=== 테스트 F: 게임 진행 중(몇 층 쌓은 뒤) 리사이즈 — 스택 모양 유지 + 바닥 재배치 ===');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const rect = document.getElementById('app').getBoundingClientRect();
    const h = window.BS.renderer.logicalHeight(rect.width, rect.height);
    window.BS.play.reset(window.BS.CONFIG.LOGICAL_WIDTH, h);
  });
  await page.waitForFunction(() => window.BS.play.getSnapshotState().state === 'playing', { timeout: 3000 });
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const s = window.BS.play.getSnapshotState();
      const top = s.stack[s.stack.length - 1];
      s.current.x = top.x;
      window.BS.play.drop();
    });
    await page.waitForFunction(() => window.BS.play.getSnapshotState().state === 'playing', { timeout: 4000 });
  }
  const gapsBefore = await page.evaluate(() => {
    const s = window.BS.play.getSnapshotState();
    const st = s.stack;
    const gaps = [];
    for (let i = 0; i < st.length - 1; i++) gaps.push(+(st[i].topY - st[i + 1].topY).toFixed(3));
    return gaps;
  });
  await page.setViewportSize({ width: 390, height: 620 });
  await page.waitForTimeout(100);
  const gapsAfter = await page.evaluate(() => {
    const s = window.BS.play.getSnapshotState();
    const st = s.stack;
    const gaps = [];
    for (let i = 0; i < st.length - 1; i++) gaps.push(+(st[i].topY - st[i + 1].topY).toFixed(3));
    return gaps;
  });
  const shapeUnchanged = JSON.stringify(gapsBefore) === JSON.stringify(gapsAfter);
  ok('리사이즈 전후 레이어 간 상대 간격(스택 모양) 완전히 동일', shapeUnchanged, { gapsBefore, gapsAfter });
  const mF = await measureFloor(page);
  console.log('  리사이즈 후:', JSON.stringify(mF));
  ok('플레이 도중 리사이즈에도 바닥 거리 ≈ PLAY_FLOOR_PADDING', Math.abs(mF.distanceLogical - padding) < 0.5, mF);
  const spawnY = await page.evaluate(() => { const s = window.BS.play.getSnapshotState(); return s.current ? s.current.renderScreenY : null; });
  const expectedSpawnY = await page.evaluate(() => window.BS.spawnScreenY());
  ok('리사이즈 후에도 스폰 라인은 그대로 상단 고정', spawnY !== null && Math.abs(spawnY - expectedSpawnY) < 1, { spawnY, expectedSpawnY });

  console.log('=== 가로 스크롤/세로 스크롤 없는지(오버플로) ===');
  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
    scrollH: document.documentElement.scrollHeight, clientH: document.documentElement.clientHeight
  }));
  ok('가로 오버플로 없음', overflow.scrollW <= overflow.clientW + 1, overflow);
  ok('세로 오버플로 없음(스크롤 페이지 아님)', overflow.scrollH <= overflow.clientH + 1, overflow);

  await browser.close();
  console.log('');
  if (failures === 0) { console.log('전체 통과'); process.exit(0); }
  else { console.log(failures + '개 실패'); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
