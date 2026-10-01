/* assets/01_burger/*.png → src/game/sprites-data.js
 * 알파 bbox로 크롭 + 2배 축소 + base64 내장 (file://로 열어도 캔버스 오염 없이 클리핑·이미지 저장 가능)
 * 사용: node tools/build-sprites.js [--analyze] */
'use strict';
const fs = require('fs');
const path = require('path');
const png = require('./png');

const ROOT = path.join(__dirname, '..');
const ASSET_DIR = path.join(ROOT, 'assets', '01_burger');
const SPRITES = [
  'bottom_bun',
  'patty',
  'cheese',
  'lettuce',
  'tomato',
  'onion',
  'egg',
  'bacon',
  'middle_bun',
  'top_bun',
];
const ALPHA_MIN = 24;

function bbox(img) {
  const { width: w, height: h, data } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] >= ALPHA_MIN) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/* 2배 축소 (알파 가중 평균) + 크롭 */
function downsampleCrop(img, b, margin) {
  const sx = Math.max(0, b.x - margin), sy = Math.max(0, b.y - margin);
  const ex = Math.min(img.width, b.x + b.w + margin), ey = Math.min(img.height, b.y + b.h + margin);
  const w = Math.floor((ex - sx) / 2), h = Math.floor((ey - sy) / 2);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, bl = 0, a = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const o = ((sy + y * 2 + dy) * img.width + (sx + x * 2 + dx)) * 4;
      const al = img.data[o + 3];
      r += img.data[o] * al; g += img.data[o + 1] * al; bl += img.data[o + 2] * al; a += al;
    }
    const o = (y * w + x) * 4;
    if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(bl / a); }
    out[o + 3] = Math.round(a / 4);
  }
  return { width: w, height: h, data: out };
}

const analyze = process.argv.includes('--analyze');
const out = {};
for (const id of SPRITES) {
  const img = png.decode(fs.readFileSync(path.join(ASSET_DIR, id + '.png')));
  const b = bbox(img);
  if (analyze) {
    console.log(id, img.width + 'x' + img.height, 'bbox=', JSON.stringify(b), 'aspect=', (b.w / b.h).toFixed(2));
    continue;
  }
  const small = downsampleCrop(img, b, 6);
  const sb = bbox(small);
  const buf = png.encode(small);
  out[id] = { w: small.width, h: small.height, bbox: { x: sb.x, y: sb.y, w: sb.w, h: sb.h }, src: 'data:image/png;base64,' + buf.toString('base64') };
  console.log(id, '→', small.width + 'x' + small.height, 'bbox', JSON.stringify(out[id].bbox), (buf.length / 1024).toFixed(0) + 'KB');
}
if (!analyze) {
  const js = '/* 자동 생성: node tools/build-sprites.js — assets/01_burger/*.png를 알파 bbox로 크롭·2배 축소·base64로 내장 */\nwindow.BS_SPRITES = ' + JSON.stringify(out) + ';\n';
  fs.writeFileSync(path.join(ROOT, 'src', 'game', 'sprites-data.js'), js);
  const total = Object.values(out).reduce((s, v) => s + v.src.length, 0);
  console.log('written src/game/sprites-data.js', (total / 1024).toFixed(0) + 'KB (base64 total)');
}
