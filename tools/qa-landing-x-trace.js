/* 착지 가로 위치(X) 보존 종합 검증 — DROP/CONTACT/SETTLE START/STACK INSERT/AFTER BALANCE
 * 디버그 로그(window.BS.DEBUG_LANDING_LOG=true)를 실제로 찍어보고, 오른쪽/왼쪽 오프셋,
 * 지그재그 다층, 10층 이상 가장자리, 기울어진 상태에서의 프레임별(A~F) centerX까지
 * 정확한 숫자로 확인한다(2026-10-02, "착지 후 X가 아래 재료로 보정된다" 리포트 대응).
 * 사용: node tools/qa-landing-x-trace.js */
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

async function newGame(browser, consoleSink) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  if (consoleSink) page.on('console', (msg) => { if (msg.text().indexOf('[') === 0) consoleSink.push(msg.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.BS && window.BS.sprites.isLoaded() && window.BS.play.getSnapshotState().state === 'playing', { timeout: 8000 });
  await page.click('#btn-start');
  await page.waitForTimeout(80);
  await page.evaluate(() => { window.BS.DEBUG_LANDING_LOG = true; });
  return page;
}

async function dropAtAbsoluteX(page, absX) {
  await page.evaluate((x) => {
    const s = window.BS.play.getSnapshotState();
    const W = window.BS.CONFIG;
    s.current.x = Math.max(W.PLAY_MARGIN, Math.min(375 - W.PLAY_MARGIN - s.current.width, x));
    window.BS.play.drop();
  }, absX);
  await page.waitForFunction(() => {
    const st = window.BS.play.getSnapshotState().state;
    return st === 'playing' || st === 'collapsing' || st === 'gameover-wait' || st === 'gameover';
  }, { timeout: 5000 });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  console.log('=== TEST A: 눈에 띄는 오른쪽 오프셋 (아래 재료 중심 대비 극단적으로 치우치게) ===');
  {
    const logs = [];
    const page = await newGame(browser, logs);
    const before = await page.evaluate(() => {
      const s = window.BS.play.getSnapshotState();
      const top = s.stack[s.stack.length - 1];
      return { belowCenterX: top.x + top.width / 2, belowX: top.x, width: top.width };
    });
    const dropX = Math.min(375 - 4 - 135, before.belowX + 50); // 아래 재료보다 50px 오른쪽(가능한 범위 내 최대)
    await dropAtAbsoluteX(page, dropX);
    const after = await page.evaluate(() => {
      const s = window.BS.play.getSnapshotState();
      const top = s.stack[s.stack.length - 1];
      return { x: top.x, state: s.state };
    });
    await page.waitForTimeout(1000); // 1초 후에도 baseX 그대로인지
    const after1s = await page.evaluate(() => {
      const s = window.BS.play.getSnapshotState();
      const top = s.stack[s.stack.length - 1];
      return { x: top.x };
    });
    console.log('  belowX=' + before.belowX.toFixed(2), 'dropX=' + dropX.toFixed(2));
    console.log('  착지 직후 top.x=' + after.x.toFixed(2), ' / 1초 후 top.x=' + after1s.x.toFixed(2));
    ok('착지 직후 baseX == dropX(오차 0.5px)', Math.abs(after.x - dropX) <= 0.5, { dropX, afterX: after.x });
    ok('1초 후에도 baseX 그대로', Math.abs(after1s.x - dropX) <= 0.5, { dropX, after1sX: after1s.x });
    console.log('  --- 디버그 로그 ---');
    logs.forEach((l) => console.log('  ' + l));
    await page.close();
  }

  console.log('=== TEST B: 왼쪽 오프셋 ===');
  {
    const logs = [];
    const page = await newGame(browser, logs);
    const before = await page.evaluate(() => {
      const s = window.BS.play.getSnapshotState();
      const top = s.stack[s.stack.length - 1];
      return { belowX: top.x };
    });
    const dropX = Math.max(4, before.belowX - 50);
    await dropAtAbsoluteX(page, dropX);
    const after = await page.evaluate(() => {
      const s = window.BS.play.getSnapshotState();
      return { x: s.stack[s.stack.length - 1].x };
    });
    console.log('  belowX=' + before.belowX.toFixed(2), 'dropX=' + dropX.toFixed(2), '-> landedX=' + after.x.toFixed(2));
    ok('착지 직후 baseX == dropX(오차 0.5px)', Math.abs(after.x - dropX) <= 0.5, { dropX, afterX: after.x });
    await page.close();
  }

  console.log('=== TEST C: 여러 층 지그재그 — 각 레이어 baseX가 보존되는지 ===');
  {
    const page = await newGame(browser, null);
    await page.evaluate(() => { window.BS.DEBUG_LANDING_LOG = false; }); // 로그 과다 방지
    // bottom_bun 중심을 기준으로 지그재그 오프셋(사용자 예시와 동일한 패턴, 폭에 맞게 스케일)
    const zigzagOffsets = [0, 40, -20, 60, -35, 50, -25, 45];
    const droppedX = [];
    for (const off of zigzagOffsets) {
      const dropX = await page.evaluate((o) => {
        const s = window.BS.play.getSnapshotState();
        const top = s.stack[s.stack.length - 1];
        const W = window.BS.CONFIG;
        const target = Math.max(W.PLAY_MARGIN, Math.min(375 - W.PLAY_MARGIN - s.current.width, top.x + o));
        s.current.x = target;
        return target;
      }, off);
      droppedX.push(dropX);
      await page.waitForFunction(() => {
        const st = window.BS.play.getSnapshotState().state;
        return st === 'playing' || st === 'collapsing' || st === 'gameover-wait' || st === 'gameover';
      }, { timeout: 5000 });
      await page.evaluate(() => window.BS.play.drop());
      await page.waitForFunction(() => {
        const st = window.BS.play.getSnapshotState().state;
        return st === 'playing' || st === 'collapsing' || st === 'gameover-wait' || st === 'gameover';
      }, { timeout: 5000 }).catch(() => {});
      const st = await page.evaluate(() => window.BS.play.getSnapshotState().state);
      if (st !== 'playing') { console.log('  무너짐, 테스트 중단 at drop#' + droppedX.length); break; }
    }
    const finalXs = await page.evaluate(() => window.BS.play.getSnapshotState().stack.map((l) => +l.x.toFixed(2)));
    console.log('  dropped (실제 drop() 호출 당시 current.x):', JSON.stringify(droppedX.map((v) => +v.toFixed(2))));
    console.log('  최종 stack의 layer.x 전체:          ', JSON.stringify(finalXs));
    // finalXs[0]은 bottom_bun(스폰 시 자동 중앙 배치) — 그 다음부터 droppedX와 1:1 비교
    let allMatch = true;
    const diffs = [];
    for (let i = 0; i < droppedX.length; i++) {
      const diff = Math.abs(finalXs[i + 1] - droppedX[i]);
      diffs.push(+diff.toFixed(3));
      if (diff > 0.5) allMatch = false;
    }
    ok('지그재그로 쌓은 각 layer.x가 drop 시점 x와 오차 0.5px 이내로 보존됨', allMatch, { droppedX, finalXs, diffs });
    const allSame = finalXs.slice(1).every((v, i, arr) => i === 0 || Math.abs(v - arr[0]) < 0.01);
    ok('(참고) 모든 레이어가 같은 값으로 수렴(=버그)하지 않았음', !allSame, finalXs);
    await page.close();
  }

  console.log('=== TEST D: 10층 이상 쌓은 뒤 가장자리에 떨어뜨리기 ===');
  {
    const page = await newGame(browser, null);
    await page.evaluate(() => { window.BS.DEBUG_LANDING_LOG = false; });
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => {
        const s = window.BS.play.getSnapshotState();
        const top = s.stack[s.stack.length - 1];
        s.current.x = top.x + (top.width - s.current.width) / 2 + (Math.random() - 0.5) * 4;
        window.BS.play.drop();
      });
      await page.waitForFunction(() => window.BS.play.getSnapshotState().state === 'playing', { timeout: 5000 });
    }
    const edgeX = await page.evaluate(() => {
      const s = window.BS.play.getSnapshotState();
      const W = window.BS.CONFIG;
      return 375 - W.PLAY_MARGIN - s.current.width; // 가장 오른쪽 끝
    });
    await dropAtAbsoluteX(page, edgeX);
    const landedX = await page.evaluate(() => window.BS.play.getSnapshotState().stack.slice(-1)[0].x);
    console.log('  edgeX(의도한 드롭 위치)=' + edgeX.toFixed(2), ' landedX=' + landedX.toFixed(2));
    ok('10층 이상에서도 가장자리에 떨어뜨린 그대로 착지(오차 0.5px)', Math.abs(landedX - edgeX) <= 0.5, { edgeX, landedX });
    await page.close();
  }

  console.log('=== TEST E/F: 기울어진 상태에서 착지 + 프레임 단위(A~F) centerX 비교 ===');
  {
    const page = await newGame(browser, null);
    await page.evaluate(() => { window.BS.DEBUG_LANDING_LOG = false; });
    // 의도적 편향으로 눈에 보일 만큼 기울인다
    const biasOffsets = [20, -25, 30, -15, 25];
    for (const off of biasOffsets) {
      await page.evaluate((o) => {
        const s = window.BS.play.getSnapshotState();
        const top = s.stack[s.stack.length - 1];
        const W = window.BS.CONFIG;
        s.current.x = Math.max(W.PLAY_MARGIN, Math.min(375 - W.PLAY_MARGIN - s.current.width, top.x + o));
        window.BS.play.drop();
      }, off);
      await page.waitForFunction(() => window.BS.play.getSnapshotState().state === 'playing', { timeout: 5000 }).catch(() => {});
      const st = await page.evaluate(() => window.BS.play.getSnapshotState().state);
      if (st !== 'playing') break;
    }
    const tiltBefore = await page.evaluate(() => window.BS.play.getSnapshotState().stackTilt * 180 / Math.PI);
    console.log('  현재 tilt=' + tiltBefore.toFixed(2) + 'deg (0이 아니어야 의미 있는 테스트)');

    // 다음 재료를 드롭하고, A~F 프레임 동안 baseX/renderX(centerX) 샘플링
    const st0 = await page.evaluate(() => window.BS.play.getSnapshotState().state);
    if (st0 === 'playing') {
      await page.evaluate(() => {
        const s = window.BS.play.getSnapshotState();
        const top = s.stack[s.stack.length - 1];
        s.current.x = Math.max(4, Math.min(375 - 4 - s.current.width, top.x + 20));
        window.BS.play.drop();
      });
      const samples = [];
      for (let i = 0; i < 400; i++) {
        const snap = await page.evaluate(() => {
          const s = window.BS.play.getSnapshotState();
          const C = window.BS.CONFIG;
          const tan = Math.tan(s.stackTilt || 0);
          const cap = window.BS.ingredientWidth() * C.MAX_SWAY_SHEAR_RATIO;
          function shearFor(worldTopY, visualHeight) {
            const h = -(worldTopY + visualHeight);
            return Math.max(-cap, Math.min(cap, h * tan * C.TILT_COM_FACTOR));
          }
          if ((s.state === 'falling' || s.state === 'release') && s.current) {
            const shear = shearFor(s.current.fallToWorldY, s.current.visualHeight);
            return { state: s.state, baseX: s.current.x, renderX: s.current.x + shear, centerX: s.current.x + shear + s.current.width / 2 };
          }
          if ((s.state === 'settling') && s.stack.length) {
            const top = s.stack[s.stack.length - 1];
            const shear = shearFor(top.topY, top.visualHeight);
            return { state: s.state, baseX: top.x, renderX: top.x + shear, centerX: top.x + shear + top.width / 2 };
          }
          if (s.state === 'playing' && s.stack.length) {
            const top = s.stack[s.stack.length - 1];
            const shear = shearFor(top.topY, top.visualHeight);
            return { state: 'settled', baseX: top.x, renderX: top.x + shear, centerX: top.x + shear + top.width / 2 };
          }
          return { state: s.state, baseX: null, renderX: null, centerX: null };
        });
        samples.push(snap);
        if (snap.state === 'settled') break;
        await page.waitForTimeout(5);
      }
      // 라벨링: 접촉 2프레임 전(falling 끝에서 2번째), 접촉 직전(falling 마지막), 접촉 순간(settling 첫), 착지 1프레임 후(settling 2번째), settle 완료(playing/settled 첫), 500ms 후
      const fallingSamples = samples.filter(s => s.state === 'falling');
      const settlingSamples = samples.filter(s => s.state === 'settling');
      const A = fallingSamples[Math.max(0, fallingSamples.length - 3)];
      const B = fallingSamples[fallingSamples.length - 1];
      const C_ = settlingSamples[0];
      const D = settlingSamples[Math.min(1, settlingSamples.length - 1)];
      const E = samples.find(s => s.state === 'settled');
      await page.waitForTimeout(500);
      const F = await page.evaluate(() => {
        const s = window.BS.play.getSnapshotState();
        const C = window.BS.CONFIG;
        const tan = Math.tan(s.stackTilt || 0);
        const cap = window.BS.ingredientWidth() * C.MAX_SWAY_SHEAR_RATIO;
        const top = s.stack[s.stack.length - 1];
        const h = -(top.topY + top.visualHeight);
        const shear = Math.max(-cap, Math.min(cap, h * tan * C.TILT_COM_FACTOR));
        return { baseX: top.x, renderX: top.x + shear, centerX: top.x + shear + top.width / 2 };
      });
      console.log('  A(접촉 2프레임 전) centerX=' + (A ? A.centerX.toFixed(2) : 'N/A') + ' baseX=' + (A ? A.baseX.toFixed(2) : 'N/A'));
      console.log('  B(접촉 직전)      centerX=' + (B ? B.centerX.toFixed(2) : 'N/A') + ' baseX=' + (B ? B.baseX.toFixed(2) : 'N/A'));
      console.log('  C(접촉 순간)      centerX=' + (C_ ? C_.centerX.toFixed(2) : 'N/A') + ' baseX=' + (C_ ? C_.baseX.toFixed(2) : 'N/A'));
      console.log('  D(착지 1프레임 후) centerX=' + (D ? D.centerX.toFixed(2) : 'N/A') + ' baseX=' + (D ? D.baseX.toFixed(2) : 'N/A'));
      console.log('  E(settle 완료)    centerX=' + (E ? E.centerX.toFixed(2) : 'N/A') + ' baseX=' + (E ? E.baseX.toFixed(2) : 'N/A'));
      console.log('  F(500ms 후)       centerX=' + F.centerX.toFixed(2) + ' baseX=' + F.baseX.toFixed(2));

      if (B && C_) {
        ok('B->C(접촉 순간) renderX(centerX) 연속(점프 < 3px)', Math.abs(B.centerX - C_.centerX) < 3, { B: B.centerX, C: C_.centerX });
      }
      if (A && B) {
        ok('A->B baseX 동일(가로 위치는 낙하 중 절대 안 변함)', Math.abs(A.baseX - B.baseX) < 0.01, { A: A.baseX, B: B.baseX });
      }
      if (C_ && E) {
        ok('C->E baseX 동일(착지~settle 완료까지 baseX 불변)', Math.abs(C_.baseX - E.baseX) < 0.01, { C: C_.baseX, E: E.baseX });
      }
      if (E && F) {
        ok('E->F(500ms 후) baseX 동일(시간이 지나도 baseX 불변 — 스무딩/보정 없음)', Math.abs(E.baseX - F.baseX) < 0.01, { E: E.baseX, F: F.baseX });
      }
    } else {
      console.log('  (tilt 유도 중 무너짐 — 이 서브테스트는 스킵)');
    }
    await page.close();
  }

  await browser.close();
  console.log('');
  if (failures === 0) { console.log('전체 통과'); process.exit(0); }
  else { console.log(failures + '개 실패'); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
