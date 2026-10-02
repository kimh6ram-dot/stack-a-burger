/* 흔들림(sway) 도입 후 생겼던 버그 회귀 테스트: 재료가 떨어지는 동안(falling)과 착지
 * 직후(settling)의 화면 x가 끊기지 않고 이어지는지 확인한다 — 한때 착지 순간에만 흔들림
 * shear가 갑자기 적용돼 "다른 곳에 자석처럼 붙는" 것처럼 보이는 버그가 있었다(2026-10-02).
 * 사용: node tools/qa-landing-continuity.js */
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

function visualX(s, C) {
  // 렌더러와 동일한 shear 계산을 그대로 재현해, "화면에 실제로 그려지는 x"를 구한다.
  const tan = Math.tan(s.stackTilt || 0);
  function shearFor(worldTopY, visualHeight) {
    const heightAboveBase = -(worldTopY + visualHeight);
    return heightAboveBase * tan * C.TILT_COM_FACTOR;
  }
  if (s.state === 'falling' && s.current) {
    return { who: 'current(falling)', x: s.current.x + shearFor(s.current.fallToWorldY, s.current.visualHeight) };
  }
  if (s.state === 'settling' && s.stack.length) {
    const top = s.stack[s.stack.length - 1];
    return { who: 'stack-top(settling)', x: top.x + shearFor(top.topY, top.visualHeight) };
  }
  return null;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(URL);
  await page.waitForFunction(() => window.BS && window.BS.sprites.isLoaded() && window.BS.play.getSnapshotState().state === 'playing', { timeout: 8000 });
  await page.click('#btn-start');
  await page.waitForTimeout(100);

  console.log('=== 여러 방향으로 어긋나게 10층까지 쌓으며 매 착지마다 falling 마지막 프레임 vs settling 첫 프레임 연속성 확인 ===');
  const offsets = [15, -20, 25, -12, 18, -22, 10, -16, 20, -14];
  for (let i = 0; i < offsets.length; i++) {
    // falling 상태로 들어가면 가능한 한 끝까지(랜딩 직전) 폴링하며 fallToWorldY 기준 visualX 기록
    await page.evaluate((o) => {
      const s = window.BS.play.getSnapshotState();
      const top = s.stack[s.stack.length - 1];
      const centerX = top.x + (top.width - s.current.width) / 2;
      const W = window.BS.CONFIG;
      s.current.x = Math.max(W.PLAY_MARGIN, Math.min(375 - W.PLAY_MARGIN - s.current.width, centerX + o));
      window.BS.play.drop();
    }, offsets[i]);

    let lastFallingX = null, firstSettlingX = null;
    for (let tries = 0; tries < 200; tries++) {
      const snap = await page.evaluate((C) => {
        const s = window.BS.play.getSnapshotState();
        return { state: s.state, stackTilt: s.stackTilt, current: s.current, stack: s.stack };
      });
      const C = await page.evaluate(() => window.BS.CONFIG);
      const vx = visualX(snap, C);
      if (snap.state === 'falling' && vx) lastFallingX = vx.x;
      if (snap.state === 'settling' && vx && firstSettlingX === null) { firstSettlingX = vx.x; break; }
      if (snap.state !== 'falling' && snap.state !== 'release' && snap.state !== 'settling' && snap.state !== 'playing') break;
      if (snap.state === 'playing' && firstSettlingX === null && lastFallingX !== null) break; // 이미 settling 지나감(너무 빨랐음)
      await page.waitForTimeout(8);
    }
    if (lastFallingX !== null && firstSettlingX !== null) {
      const jump = Math.abs(firstSettlingX - lastFallingX);
      ok('착지 직전(falling 마지막)과 직후(settling 첫) 화면 x가 연속적(점프 < 3px), drop#' + i, jump < 3, { lastFallingX: +lastFallingX.toFixed(2), firstSettlingX: +firstSettlingX.toFixed(2), jump: +jump.toFixed(2) });
    } else {
      console.log('  (참고) drop#' + i + ' — falling/settling 프레임을 둘 다 못 잡음(너무 빠름), 샘플링 주기를 줄여야 할 수도 있음');
    }
    await page.waitForFunction(() => window.BS.play.getSnapshotState().state === 'playing', { timeout: 4000 }).catch(() => {});
    const st = await page.evaluate(() => window.BS.play.getSnapshotState().state);
    if (st !== 'playing') { console.log('  무너짐, 테스트 종료'); break; }
  }

  await browser.close();
  console.log('');
  if (failures === 0) { console.log('전체 통과'); process.exit(0); }
  else { console.log(failures + '개 실패'); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
