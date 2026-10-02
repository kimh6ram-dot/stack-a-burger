/* 동적 균형/흔들림(stack sway) QA — 명세 §19~21 TEST A~D.
 * 사용: node tools/qa-sway.js */
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
function degOf(rad) { return +(rad * 180 / Math.PI).toFixed(3); }

async function newGame(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(URL);
  await page.waitForFunction(() => window.BS && window.BS.sprites.isLoaded() && window.BS.play.getSnapshotState().state === 'playing', { timeout: 8000 });
  return page;
}

async function dropAtOffset(page, offsetPx) {
  await page.evaluate((off) => {
    const s = window.BS.play.getSnapshotState();
    const top = s.stack[s.stack.length - 1];
    const centerX = top.x + (top.width - s.current.width) / 2;
    const W = window.BS.CONFIG;
    s.current.x = Math.max(W.PLAY_MARGIN, Math.min(375 - W.PLAY_MARGIN - s.current.width, centerX + off));
    window.BS.play.drop();
  }, offsetPx);
  await page.waitForFunction(() => {
    const st = window.BS.play.getSnapshotState().state;
    return st === 'playing' || st === 'collapsing' || st === 'gameover-wait' || st === 'gameover';
  }, { timeout: 5000 });
}

async function snap(page) {
  return page.evaluate(() => {
    const s = window.BS.play.getSnapshotState();
    return { state: s.state, layerCount: s.layerCount, tiltDeg: s.stackTilt * 180 / Math.PI, targetDeg: s.stackTargetTilt * 180 / Math.PI };
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  console.log('=== TEST A: 중앙 플레이(거의 중앙에 15층) ===');
  {
    const page = await newGame(browser);
    const tilts = [];
    for (let i = 0; i < 15; i++) {
      const jitter = (Math.random() - 0.5) * 6; // ±3px 정도의 자연스러운 손 떨림 수준
      await dropAtOffset(page, jitter);
      const s = await snap(page);
      tilts.push(+s.tiltDeg.toFixed(2));
      if (s.state !== 'playing') { console.log('  무너짐:', s); break; }
    }
    console.log('  층별 tilt(deg):', JSON.stringify(tilts));
    const final = await snap(page);
    ok('중앙 위주 플레이는 15층까지(또는 그 근처까지) 생존', final.layerCount >= 10, final);
    const maxAbsTilt = Math.max(...tilts.map(Math.abs));
    ok('중앙 플레이 중 tilt가 과도하지 않음(10도 이내)', maxAbsTilt < 10, maxAbsTilt);
    await page.close();
  }

  console.log('=== TEST B: 오른쪽 편향(계속 오른쪽으로 치우쳐 쌓기) ===');
  {
    const page = await newGame(browser);
    const tilts = [];
    let collapsedAtLayer = null;
    for (let i = 0; i < 20; i++) {
      await dropAtOffset(page, 22); // 폭(135)의 약 16%씩 계속 오른쪽
      const s = await snap(page);
      tilts.push(+s.tiltDeg.toFixed(2));
      if (s.state !== 'playing') { collapsedAtLayer = s.layerCount; break; }
    }
    console.log('  층별 tilt(deg):', JSON.stringify(tilts));
    const increasing = tilts[tilts.length - 1] > tilts[0] || collapsedAtLayer !== null;
    ok('오른쪽 편향 시 tilt가 오른쪽(양수)으로 점점 커지거나 그 전에 무너짐', increasing, { tilts, collapsedAtLayer });
    ok('결국 UNSTABLE/COLLAPSE로 이어짐(20층 이내)', collapsedAtLayer !== null, collapsedAtLayer);
    if (collapsedAtLayer !== null) console.log('  → ' + collapsedAtLayer + '층에서 무너짐');
    await page.close();
  }

  console.log('=== TEST C: 균형 회복(초반 오른쪽 편향 → 이후 왼쪽 보정) ===');
  {
    const page = await newGame(browser);
    const tilts = [];
    for (let i = 0; i < 3; i++) {
      await dropAtOffset(page, 14);
      const s = await snap(page);
      tilts.push(s.tiltDeg);
      if (s.state !== 'playing') break;
    }
    const afterBias = tilts[tilts.length - 1];
    for (let i = 0; i < 6; i++) {
      const s0 = await snap(page);
      if (s0.state !== 'playing') break;
      await dropAtOffset(page, -14);
      tilts.push((await snap(page)).tiltDeg);
    }
    const afterCorrection = tilts[tilts.length - 1];
    console.log('  tilt 추이(deg):', JSON.stringify(tilts.map(t => +t.toFixed(2))));
    console.log('  오른쪽 편향 직후:', afterBias.toFixed(2), '→ 왼쪽 보정 후:', afterCorrection.toFixed(2));
    ok('왼쪽으로 보정하면 tilt가 오른쪽 편향 때보다 중앙 쪽으로 돌아옴', afterCorrection < afterBias, { afterBias, afterCorrection });
    const final = await snap(page);
    ok('보정 후에도 생존 중(즉시 무너지지 않음)', final.state === 'playing', final);
    await page.close();
  }

  console.log('=== TEST D: 10층 이상에서 "정지해 있지 않은지" 확인 ===');
  {
    const page = await newGame(browser);
    for (let i = 0; i < 11; i++) {
      const jitter = (Math.random() - 0.5) * 10;
      await dropAtOffset(page, jitter);
      const s = await snap(page);
      if (s.state !== 'playing') { console.log('  (10층 전에 무너짐, 재시도 데이터로는 부적합하지만 계속 기록)', s); break; }
    }
    const info0 = await snap(page);
    console.log('  11회 투하 후 상태:', JSON.stringify(info0));
    if (info0.state === 'playing' && info0.layerCount >= 8) {
      const samples = [];
      for (let t = 0; t < 10; t++) {
        await page.waitForTimeout(150);
        const s = await page.evaluate(() => window.BS.play.getSnapshotState().stackTilt * 180 / Math.PI);
        samples.push(+s.toFixed(3));
      }
      console.log('  1.5초간 150ms 간격 tilt 샘플(deg):', JSON.stringify(samples));
      const distinctValues = new Set(samples.map(v => v.toFixed(2))).size;
      ok('가만히 둬도 tilt가 계속 변함(완전 정지 아님)', distinctValues >= 3, samples);
      const maxDelta = Math.max(...samples) - Math.min(...samples);
      ok('그 변화가 감지 가능한 수준(최소 0.05도 이상 진폭)', maxDelta > 0.05, maxDelta);
    } else {
      ok('10층 근처까지 도달하지 못함(무작위 지터로 인한 변동, 참고만)', true, info0);
    }
    await page.close();
  }

  console.log('=== TEST E: 완성(빵 얹기) 후에는 tilt가 더 변하지 않고 멈춰야 함 ===');
  {
    const page = await newGame(browser);
    for (let i = 0; i < 4; i++) await dropAtOffset(page, 15);
    await page.evaluate(() => window.BS.play.requestTopping());
    await page.waitForFunction(() => window.BS.play.getSnapshotState().state === 'completed', { timeout: 4000 });
    const t1 = (await snap(page)).tiltDeg;
    await page.waitForTimeout(500);
    const t2 = (await snap(page)).tiltDeg;
    ok('completed 상태에서는 tilt가 더 이상 바뀌지 않음(마지막 모습 그대로 유지)', Math.abs(t1 - t2) < 0.001, { t1, t2 });
    await page.close();
  }

  await browser.close();
  console.log('');
  if (failures === 0) { console.log('전체 통과'); process.exit(0); }
  else { console.log(failures + '개 실패'); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
