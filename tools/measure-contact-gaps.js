/* 인접 레이어 사이의 실제 렌더링 픽셀 gap을 측정한다(캔버스를 getImageData로 직접 읽음).
 * 경계선(두 레이어가 맞닿아야 하는 y)을 기준으로 위/아래 각각 "경계선에 가장 가까운
 * 내용물 행"을 찾아 그 사이 거리를 gap으로 잰다 — 베이컨처럼 구불구불한 재료는 경계선에서
 * 멀리 떨어진 곳(물결 끝 등)에 별개의 알파 조각이 있을 수 있는데, "창 전체에서 처음
 * 발견되는 내용물"을 기준으로 삼으면 그 무관한 조각 때문에 가짜 gap이 잡힌다
 * (2026-09-29 실측 중 발견: 베이컨이 실제로는 0px인데 21px로 오검출됨).
 * 지정한 재료 순서대로 정중앙(PERFECT) 착지를 강제한다.
 * 사용: node tools/measure-contact-gaps.js */
'use strict';
const path = require('path');
const { chromium } = require('C:/Users/thkim/Desktop/code-work/260624/build/node_modules/playwright-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');

const SEQUENCE = process.argv[2] === '--repro'
  ? ['bacon', 'cheese', 'cheese', 'tomato', 'bacon'] // 사용자가 첨부한 스크린샷 재현(bottom_bun은 이미 있음)
  : ['bacon', 'onion', 'patty', 'tomato', 'cheese', 'lettuce', 'egg', 'middle_bun', 'patty'];

const BAND_FRACS = [0.25, 0.35, 0.5, 0.65, 0.75];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(URL);
  await page.waitForFunction(() => window.BS && window.BS.sprites.isLoaded() && window.BS.play.getSnapshotState().state === 'playing', { timeout: 8000 });
  await page.click('#btn-start');

  for (const ing of SEQUENCE) {
    await page.evaluate((ing) => {
      const s = window.BS.play.getSnapshotState();
      const top = s.stack[s.stack.length - 1];
      s.current.ingredient = ing;
      s.current.visualHeight = window.BS.visualHeightOf(ing);
      s.current.x = top.x; // 정중앙 정렬(PERFECT)
      window.BS.play.drop();
    }, ing);
    await page.waitForFunction(() => window.BS.play.getSnapshotState().state === 'playing', { timeout: 4000 });
  }

  const measurements = await page.evaluate((BAND_FRACS) => {
    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const scale = rect.width / BS.CONFIG.LOGICAL_WIDTH;
    const pxY = (logicalY) => Math.round(logicalY * dpr * scale);

    const snap = BS.play.getSnapshotState();
    const stack = snap.stack;
    const cam = snap.cameraY;
    const W = stack[0].width;
    const baseX = stack[0].x;

    // 중요: canvas.getImageData()는 화면에 "흰색으로 보이는" 합성 결과가 아니라
    // 캔버스 내부의 원본 픽셀 버퍼를 그대로 반환한다. clearRect()로 비운 영역은
    // 실제로는 완전 투명(RGBA 0,0,0,0)이며 흰색(255,255,255)이 아니다 — 흰 배경처럼
    // "보이는" 것은 브라우저가 페이지의 흰 배경과 합성해서 그려줄 때뿐이다. 그래서
    // RGB가 흰색인지가 아니라 alpha가 낮은지로 "배경(빈 곳)"을 판정해야 한다.
    function isBackground(data, idx) {
      return data[idx + 3] < 10;
    }

    const results = [];
    for (let i = 0; i < stack.length - 1; i++) {
      const lower = stack[i], upper = stack[i + 1];
      const boundaryScreenY = lower.topY - cam;
      const y0 = pxY(boundaryScreenY - 20), y1 = pxY(boundaryScreenY + 20);
      const mid = pxY(boundaryScreenY) - y0; // 창 안에서 경계선의 상대 행
      const h = y1 - y0;
      if (h <= 0 || y0 < 0) { results.push({ pair: lower.ingredient + ' + ' + upper.ingredient, error: 'out of range' }); continue; }

      const colReports = [];
      for (const frac of BAND_FRACS) {
        const xLogical = baseX + W * frac;
        const xDevice = Math.round(xLogical * dpr * scale);
        const imgData = ctx.getImageData(xDevice, y0, 1, h).data;
        const rowIsBg = [];
        for (let r = 0; r < h; r++) rowIsBg.push(isBackground(imgData, r * 4));
        // 재료 전체에서 "가장 먼저 발견되는 내용물"을 기준으로 삼지 않는다 — 베이컨처럼
        // 구불구불한 재료는 경계선에서 멀리 떨어진 곳(물결 끝 등)에 별개의 알파 조각이
        // 있을 수 있고, 그걸 기준으로 잡으면 오히려 "경계선 근처의 진짜 틈"을 놓치거나
        // 반대로 없는 틈을 만들어낸다. 대신 경계선을 기준으로 위/아래 각각 "경계선에
        // 가장 가까운 내용물"을 찾아 그 사이 거리만 잰다.
        let upperEdge = -1; // 경계선보다 위(작은 행)에서 경계선에 가장 가까운 내용물 행
        for (let r = mid; r >= 0; r--) { if (!rowIsBg[r]) { upperEdge = r; break; } }
        let lowerEdge = -1; // 경계선보다 아래(큰 행)에서 경계선에 가장 가까운 내용물 행
        for (let r = mid; r < h; r++) { if (!rowIsBg[r]) { lowerEdge = r; break; } }
        if (upperEdge < 0 || lowerEdge < 0) { colReports.push({ frac, noContent: true }); continue; }
        const gapRows = Math.max(0, lowerEdge - upperEdge - 1);
        colReports.push({ frac, gapPx: +(gapRows / (dpr * scale)).toFixed(2) });
      }
      const worstGap = Math.max(...colReports.map((c) => c.gapPx || 0));
      results.push({ pair: lower.ingredient + ' + ' + upper.ingredient, columns: colReports, worstGapPx: +worstGap.toFixed(2) });
    }
    return results;
  }, BAND_FRACS);

  console.log('=== 인접 레이어 실측(가운데 50% 밴드 5개 지점) — 목표: 어느 지점도 흰 줄 없음(gap=0) ===');
  let anyFail = false;
  for (const m of measurements) {
    if (m.error) { console.log(' ', m.pair, '→', m.error); continue; }
    const detail = m.columns.map((c) => 'x' + c.frac + '=' + (c.noContent ? 'NA' : c.gapPx + 'px')).join('  ');
    console.log(' ', m.pair.padEnd(20), 'worst=' + m.worstGapPx + 'px', ' [' + detail + ']');
    if (m.worstGapPx > 0.5) anyFail = true;
  }
  await browser.close();
  if (anyFail) { console.log('\n일부 지점에서 흰 줄(gap) 발견 — 실패'); process.exit(1); }
  console.log('\n밴드 전 구간 gap 없음(0px)');
})().catch((e) => { console.error(e); process.exit(1); });
