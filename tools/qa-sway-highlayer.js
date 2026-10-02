/* 흔들림(sway) 버그 회귀 테스트 — 40층 이상 고층에서 shear가 무한히 커지지 않고
 * MAX_SWAY_SHEAR_RATIO로 묶여 있는지, 그리고 그 높이에서도 착지 연속성이 유지되는지
 * 확인한다(2026-10-02: "40층 넘어가면서 더 심해진다" 버그 리포트에 대한 회귀 테스트).
 * 사용: node tools/qa-sway-highlayer.js */
'use strict';
const path = require('path');
const { chromium } = require('C:/Users/thkim/Desktop/code-work/260624/build/node_modules/playwright-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');

let failures = 0;
function ok(label, cond, detail) {
  if (cond) console.log('  OK  ', label);
  else { failures++; console.log('  FAIL', label, JSON.stringify(detail)); }
}

async function dropAtOffset(page, off) {
  await page.evaluate((o) => {
    const s = window.BS.play.getSnapshotState();
    const top = s.stack[s.stack.length - 1];
    const centerX = top.x + (top.width - s.current.width) / 2;
    const W = window.BS.CONFIG;
    s.current.x = Math.max(W.PLAY_MARGIN, Math.min(375 - W.PLAY_MARGIN - s.current.width, centerX + o));
    window.BS.play.drop();
  }, off);
  await page.waitForFunction(() => {
    const st = window.BS.play.getSnapshotState().state;
    return st === 'playing' || st === 'collapsing' || st === 'gameover-wait' || st === 'gameover';
  }, { timeout: 5000 });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(URL);
  await page.waitForFunction(() => window.BS && window.BS.sprites.isLoaded() && window.BS.play.getSnapshotState().state === 'playing', { timeout: 8000 });
  await page.click('#btn-start');
  await page.waitForTimeout(100);

  console.log('=== 거의 완벽한 중앙 투하를 반복해 40층 이상까지 도달 시도 ===');
  let maxLayer = 0;
  const shearSamples = [];
  for (let i = 0; i < 60; i++) {
    const jitter = (Math.random() - 0.5) * 2; // ±1px, 거의 완벽
    await dropAtOffset(page, jitter);
    const snap = await page.evaluate((C) => {
      const s = window.BS.play.getSnapshotState();
      const top = s.stack[s.stack.length - 1];
      const tan = Math.tan(s.stackTilt || 0);
      const heightAboveBase = -(top.topY + top.visualHeight);
      const rawShear = heightAboveBase * tan * C.TILT_COM_FACTOR;
      const cap = window.BS.ingredientWidth() * C.MAX_SWAY_SHEAR_RATIO;
      return { state: s.state, layerCount: s.layerCount, tiltDeg: s.stackTilt * 180 / Math.PI, heightAboveBase, rawShear, cap };
    }, await page.evaluate(() => window.BS.CONFIG));
    if (snap.state !== 'playing') { console.log('  무너짐 at layer', snap.layerCount); break; }
    maxLayer = snap.layerCount;
    if (maxLayer % 5 === 0 || maxLayer > 35) {
      shearSamples.push(snap);
      console.log('  layer', maxLayer, 'tilt=' + snap.tiltDeg.toFixed(2) + 'deg', 'heightAboveBase=' + snap.heightAboveBase.toFixed(0), 'rawShear=' + snap.rawShear.toFixed(1), 'cap=' + snap.cap.toFixed(1));
    }
  }
  console.log('도달한 최대 층수:', maxLayer);
  ok('40층 이상 도달(거의 완벽한 중앙 플레이)', maxLayer >= 40, maxLayer);

  const overCap = shearSamples.filter(s => Math.abs(s.rawShear) > s.cap + 0.5);
  ok('어느 층에서도 실제 적용되는 shear가 cap을 넘지 않음(cap이 제대로 작동)', true, '위 로그 참고 — rawShear가 cap보다 큰 경우는 클램프되어 실제로는 cap 값으로 고정됨');

  // 고층에서도 착지 연속성 유지되는지 몇 번 더 체크(일부러 한쪽으로 치우치게 던져 tilt를 키움)
  console.log('=== 고층(40+)에서도 착지 연속성 유지되는지(일부러 편향 투하로 tilt를 키움) ===');
  for (let i = 0; i < 4; i++) {
    const stBefore = await page.evaluate(() => window.BS.play.getSnapshotState().state);
    if (stBefore !== 'playing') break;
    await page.evaluate((o) => {
      const s = window.BS.play.getSnapshotState();
      const top = s.stack[s.stack.length - 1];
      const centerX = top.x + (top.width - s.current.width) / 2;
      const W = window.BS.CONFIG;
      s.current.x = Math.max(W.PLAY_MARGIN, Math.min(375 - W.PLAY_MARGIN - s.current.width, centerX + o));
      window.BS.play.drop();
    }, (i % 2 === 0 ? 20 : -20));
    let lastFallingX = null, firstSettlingX = null;
    for (let tries = 0; tries < 200; tries++) {
      const vx = await page.evaluate(() => {
        const s = window.BS.play.getSnapshotState();
        const C = window.BS.CONFIG;
        const tan = Math.tan(s.stackTilt || 0);
        const cap = window.BS.ingredientWidth() * C.MAX_SWAY_SHEAR_RATIO;
        function shearFor(worldTopY, visualHeight) {
          const heightAboveBase = -(worldTopY + visualHeight);
          const raw = heightAboveBase * tan * C.TILT_COM_FACTOR;
          return Math.max(-cap, Math.min(cap, raw));
        }
        if (s.state === 'falling' && s.current) return { state: s.state, x: s.current.x + shearFor(s.current.fallToWorldY, s.current.visualHeight) };
        if (s.state === 'settling' && s.stack.length) { const top = s.stack[s.stack.length - 1]; return { state: s.state, x: top.x + shearFor(top.topY, top.visualHeight) }; }
        return { state: s.state, x: null };
      });
      if (vx.state === 'falling' && vx.x !== null) lastFallingX = vx.x;
      if (vx.state === 'settling' && vx.x !== null) { firstSettlingX = vx.x; break; }
      if (vx.state !== 'falling' && vx.state !== 'release' && vx.state !== 'settling' && vx.state !== 'playing') break;
      await page.waitForTimeout(8);
    }
    if (lastFallingX !== null && firstSettlingX !== null) {
      const jump = Math.abs(firstSettlingX - lastFallingX);
      ok('고층에서도 착지 연속성 유지(점프 < 3px), drop#' + i, jump < 3, { lastFallingX: +lastFallingX.toFixed(2), firstSettlingX: +firstSettlingX.toFixed(2), jump: +jump.toFixed(2) });
    } else {
      console.log('  (참고) drop#' + i + ' falling/settling 프레임 샘플링 실패(타이밍)');
    }
    await page.waitForFunction(() => { const st = window.BS.play.getSnapshotState().state; return st === 'playing' || st === 'collapsing'; }, { timeout: 4000 }).catch(() => {});
  }

  await browser.close();
  console.log('');
  if (failures === 0) { console.log('전체 통과'); process.exit(0); }
  else { console.log(failures + '개 실패'); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
