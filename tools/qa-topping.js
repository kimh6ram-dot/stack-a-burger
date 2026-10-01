/* "빵 얹기"(수동 완성) 기능 QA — 명세 §22 A~F 테스트.
 * 사용: node tools/qa-topping.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('C:/Users/thkim/Desktop/code-work/260624/build/node_modules/playwright-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const OUT_DIR = 'C:/Users/thkim/AppData/Local/Temp/claude/c--Users-thkim-Desktop-code-work/9b7659f4-951f-4a55-8a4c-7f4aeffe1187/scratchpad';

let failures = 0;
function ok(label, cond, detail) {
  if (cond) { console.log('  OK  ', label); }
  else { failures++; console.log('  FAIL', label, detail !== undefined ? JSON.stringify(detail) : ''); }
}

async function newGame(browser, viewport) {
  const page = await browser.newPage({ viewport: viewport || { width: 390, height: 844 }, acceptDownloads: true });
  await page.goto(URL);
  await page.waitForFunction(() => window.BS && window.BS.sprites.isLoaded() && window.BS.play.getSnapshotState().state === 'playing', { timeout: 8000 });
  return page;
}

async function dropCentered(page) {
  await page.evaluate(() => {
    const s = window.BS.play.getSnapshotState();
    const top = s.stack[s.stack.length - 1];
    s.current.x = top.x + (top.width - s.current.width) / 2;
    window.BS.play.drop();
  });
  await page.waitForFunction(() => window.BS.play.getSnapshotState().state === 'playing', { timeout: 4000 });
}

async function waitState(page, states, timeout) {
  await page.waitForFunction((want) => want.includes(window.BS.play.getSnapshotState().state), states, { timeout: timeout || 4000 });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  console.log('=== A. 재료 1개만 쌓은 뒤 "빵 얹기" ===');
  {
    const page = await newGame(browser);
    await dropCentered(page); // 1개 재료 쌓음(layerCount=1)
    const before = await page.evaluate(() => window.BS.play.getSnapshotState().layerCount);
    ok('빵 얹기 전 layerCount=1', before === 1, before);
    await page.evaluate(() => window.BS.play.requestTopping());
    await waitState(page, ['topping'], 1000);
    ok('빵 얹기 직후 topping 상태 진입', true);
    await waitState(page, ['completed'], 3000);
    const snap = await page.evaluate(() => {
      const s = window.BS.play.getSnapshotState();
      return { state: s.state, stackLen: s.stack.length, ids: s.stack.map(l => l.ingredient), layerCount: s.layerCount };
    });
    ok('completed 상태 도달', snap.state === 'completed', snap);
    ok('스택 = bottom_bun + 재료1 + top_bun(3개)', snap.stackLen === 3 && snap.ids[0] === 'bottom_bun' && snap.ids[2] === 'top_bun', snap);
    const gap = await page.evaluate(() => {
      const s = window.BS.play.getSnapshotState();
      const st = s.stack;
      return +(st[1].topY - (st[2].topY + st[2].visualHeight)).toFixed(3);
    });
    ok('top_bun과 바로 아래 재료 사이 겹침(음수 또는 0, 뜬 공간 없음)', gap <= 0, { gap });
    await page.close();
  }

  console.log('=== B. 재료 여러 개를 삐뚤게 쌓은 뒤 "빵 얹기" — 모양 보정 없이 그대로 ===');
  {
    const page = await newGame(browser);
    const offsets = [25, -30, 15]; // 폭(135)의 일부만큼씩 치우치게(COLLAPSE 안 나는 범위)
    for (const off of offsets) {
      await page.evaluate((o) => {
        const s = window.BS.play.getSnapshotState();
        const top = s.stack[s.stack.length - 1];
        const centerX = top.x + (top.width - s.current.width) / 2;
        s.current.x = Math.max(4, Math.min(375 - 4 - s.current.width, centerX + o));
        window.BS.play.drop();
      }, off);
      await waitState(page, ['playing'], 4000);
    }
    const beforeXs = await page.evaluate(() => window.BS.play.getSnapshotState().stack.map(l => l.x));
    await page.evaluate(() => window.BS.play.requestTopping());
    await waitState(page, ['completed'], 4000);
    const after = await page.evaluate(() => {
      const s = window.BS.play.getSnapshotState();
      return { xs: s.stack.map(l => l.x), ids: s.stack.map(l => l.ingredient) };
    });
    const sameShape = JSON.stringify(beforeXs) === JSON.stringify(after.xs.slice(0, beforeXs.length));
    ok('기존 재료들의 x 위치가 그대로 유지됨(재정렬 없음)', sameShape, { beforeXs, afterXs: after.xs });
    ok('top_bun이 마지막에 추가됨', after.ids[after.ids.length - 1] === 'top_bun', after.ids);
    await page.close();
  }

  console.log('=== C. UNSTABLE 상태 직전에서 "빵 얹기" ===');
  {
    const page = await newGame(browser);
    // 폭의 가장자리 쪽으로 몰아서 UNSTABLE 유도(그러나 COLLAPSE는 아니게)
    await page.evaluate(() => {
      const s = window.BS.play.getSnapshotState();
      const top = s.stack[s.stack.length - 1];
      s.current.x = Math.min(375 - 4 - s.current.width, top.x + top.width * 0.30);
      window.BS.play.drop();
    });
    await waitState(page, ['playing', 'gameover-wait', 'gameover'], 4000);
    const tierAfter = await page.evaluate(() => window.BS.play.getSnapshotState().stack.slice(-1)[0].tier);
    console.log('  (참고) 착지 tier:', tierAfter);
    const stateNow = await page.evaluate(() => window.BS.play.getSnapshotState().state);
    if (stateNow === 'playing') {
      await page.evaluate(() => window.BS.play.requestTopping());
      await waitState(page, ['completed'], 4000);
      const s2 = await page.evaluate(() => window.BS.play.getSnapshotState().state);
      ok('UNSTABLE(또는 SAFE) 상태에서 collapse 시작 전이면 빵 얹기로 완성 가능', s2 === 'completed', s2);
    } else {
      ok('이미 collapse로 간 경우는 D 케이스와 동일 취급(스킵)', true);
    }
    await page.close();
  }

  console.log('=== D. collapse 중 "빵 얹기" — 실행 불가 ===');
  {
    const page = await newGame(browser);
    await page.evaluate(() => {
      const s = window.BS.play.getSnapshotState();
      s.current.x = 4; // 완전히 왼쪽 끝 — 거의 확실히 COLLAPSE
      window.BS.play.drop();
    });
    await waitState(page, ['collapsing', 'gameover-wait', 'gameover'], 4000);
    const stateBefore = await page.evaluate(() => window.BS.play.getSnapshotState().state);
    ok('collapse 계열 상태로 진입함', stateBefore === 'collapsing' || stateBefore === 'gameover-wait' || stateBefore === 'gameover', stateBefore);
    await page.evaluate(() => window.BS.play.requestTopping());
    await page.waitForTimeout(50);
    const stateAfter = await page.evaluate(() => window.BS.play.getSnapshotState().state);
    ok('collapse 중 빵 얹기 요청은 무시됨(topping으로 전환 안 됨)', stateAfter !== 'topping' && stateAfter !== 'topping-settle' && stateAfter !== 'completed', stateAfter);
    await page.close();
  }

  console.log('=== D2. bottom_bun만 있는 상태(재료 0개)에서 "빵 얹기" — 실행 불가 ===');
  {
    const page = await newGame(browser);
    await page.evaluate(() => window.BS.play.requestTopping());
    await page.waitForTimeout(50);
    const state = await page.evaluate(() => window.BS.play.getSnapshotState().state);
    ok('재료 0개에서는 topping으로 전환되지 않음', state === 'playing', state);
    await page.close();
  }

  console.log('=== E. 완성 후 이미지 저장 ===');
  {
    const page = await newGame(browser);
    await dropCentered(page);
    await dropCentered(page);
    await page.evaluate(() => window.BS.play.requestTopping());
    await waitState(page, ['completed'], 4000);
    const canvasInfo = await page.evaluate(() => {
      const s = window.BS.play.getSnapshotState();
      const c = window.BS.exportCompletedImage(s.stack, s.layerCount);
      return { w: c.width, h: c.height, dataUrlLen: c.toDataURL('image/png').length, ids: s.stack.map(l => l.ingredient) };
    });
    ok('저장용 canvas 해상도 1080x1920', canvasInfo.w === 1080 && canvasInfo.h === 1920, canvasInfo);
    ok('저장용 canvas에 top_bun 포함된 전체 스택 반영', canvasInfo.ids[canvasInfo.ids.length - 1] === 'top_bun', canvasInfo.ids);
    ok('PNG 데이터가 비어있지 않음', canvasInfo.dataUrlLen > 5000, canvasInfo.dataUrlLen);

    // 실제 다운로드 트리거까지 확인(버튼 클릭 경로)
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    await page.click('#btn-save-image');
    const download = await downloadPromise;
    const suggested = download.suggestedFilename();
    ok('파일명이 burger-stack-로 시작하고 .png로 끝남', /^burger-stack-.*\.png$/.test(suggested), suggested);
    const savePath = path.join(OUT_DIR, suggested);
    await download.saveAs(savePath);
    const fsize = fs.statSync(savePath).size;
    ok('다운로드된 PNG 파일이 실제로 저장됨(0바이트 아님)', fsize > 1000, fsize);
    console.log('  저장 경로:', savePath);
    await page.close();
  }

  console.log('=== F. 저장 버튼 연속 클릭 — 중복 저장 방지 ===');
  {
    const page = await newGame(browser);
    await dropCentered(page);
    await page.evaluate(() => window.BS.play.requestTopping());
    await waitState(page, ['completed'], 4000);
    const disabledDuring = await page.evaluate(async () => {
      document.getElementById('btn-save-image').click();
      const d = document.getElementById('btn-save-image').disabled;
      return d;
    });
    ok('저장 클릭 직후 버튼이 즉시 비활성화됨(연속 클릭 방지)', disabledDuring === true, disabledDuring);
    await page.waitForTimeout(300);
    const disabledAfter = await page.evaluate(() => document.getElementById('btn-save-image').disabled);
    ok('저장 완료 후 버튼이 다시 활성화됨', disabledAfter === false, disabledAfter);
    await page.close();
  }

  console.log('=== G. completed 상태에서 빵 얹기 재요청 — 중복 실행 방지 ===');
  {
    const page = await newGame(browser);
    await dropCentered(page);
    await page.evaluate(() => window.BS.play.requestTopping());
    await waitState(page, ['completed'], 4000);
    const lenBefore = await page.evaluate(() => window.BS.play.getSnapshotState().stack.length);
    await page.evaluate(() => window.BS.play.requestTopping());
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => ({ state: window.BS.play.getSnapshotState().state, len: window.BS.play.getSnapshotState().stack.length }));
    ok('completed 상태에서 재요청해도 무시(top_bun 중복 추가 안 됨)', after.state === 'completed' && after.len === lenBefore, { lenBefore, after });
    await page.close();
  }

  console.log('=== H. 모바일(터치 primary) 환경에서 빵 얹기 버튼/저장 동작 ===');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true });
    await page.goto(URL);
    await page.waitForFunction(() => window.BS && window.BS.sprites.isLoaded() && window.BS.play.getSnapshotState().state === 'playing', { timeout: 8000 });
    await dropCentered(page);
    const btnVisible = await page.evaluate(() => !document.getElementById('btn-topping').hidden);
    ok('모바일: 재료 1개 이상 쌓이면 빵 얹기 버튼 노출', btnVisible, btnVisible);
    await page.click('#btn-topping');
    await waitState(page, ['completed'], 4000);
    const completedVisible = await page.evaluate(() => !document.getElementById('screen-completed').hidden);
    ok('모바일: 완성 화면 노출', completedVisible, completedVisible);
    await page.close();
  }

  console.log('=== I. 기존 기능 회귀 — 일반 게임오버 플로우는 그대로 동작 ===');
  {
    const page = await newGame(browser);
    await page.evaluate(() => {
      const s = window.BS.play.getSnapshotState();
      s.current.x = 4;
      window.BS.play.drop();
    });
    await waitState(page, ['gameover'], 5000);
    const resultVisible = await page.evaluate(() => !document.getElementById('screen-result').hidden);
    ok('일반 COLLAPSE → GAME OVER 플로우는 영향 없음', resultVisible, resultVisible);
    await page.close();
  }

  await browser.close();
  console.log('');
  if (failures === 0) { console.log('전체 통과'); process.exit(0); }
  else { console.log(failures + '개 실패'); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
