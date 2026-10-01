/* "빵 얹기"로 완성한 햄버거를 별도 offscreen canvas에 깔끔하게 다시 그려 PNG로 저장한다.
 * 플레이 화면(카메라/HUD/반응형 레이아웃)과 완전히 분리된 고정 1080x1920 export 전용
 * 레이아웃을 쓴다 — 뷰포트 크기에 따라 흔들리지 않는다(§16). 레이어 전체를 하나의 균일한
 * 스케일/이동으로만 배치하고, 레이어 각각을 재정렬하지 않는다 — 실제 플레이 결과(약간
 * 삐뚤어진 모양 포함)를 그대로 보여준다(§17). */
'use strict';
window.BS = window.BS || {};

BS.EXPORT_WIDTH = 1080;
BS.EXPORT_HEIGHT = 1920;

BS.exportCompletedImage = function (stack, layerCount) {
  var W = BS.EXPORT_WIDTH, H = BS.EXPORT_HEIGHT;
  var canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FAFAF8';
  ctx.fillRect(0, 0, W, H);

  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (var i = 0; i < stack.length; i++) {
    var l = stack[i];
    minX = Math.min(minX, l.x); maxX = Math.max(maxX, l.x + l.width);
    minY = Math.min(minY, l.topY); maxY = Math.max(maxY, l.topY + l.visualHeight);
  }
  var bboxW = Math.max(1, maxX - minX), bboxH = Math.max(1, maxY - minY);

  var targetW = W * 0.70, targetH = H * 0.58;
  var scale = Math.min(targetW / bboxW, targetH / bboxH);
  var regionCenterX = W / 2, regionCenterY = H * 0.50;
  var offsetX = regionCenterX - (minX + bboxW / 2) * scale;
  var offsetY = regionCenterY - (minY + bboxH / 2) * scale;

  for (var j = 0; j < stack.length; j++) {
    var ly = stack[j];
    var sp = BS.sprites.get(ly.ingredient);
    if (!sp) continue;
    var dx = ly.x * scale + offsetX;
    var dy = ly.topY * scale + offsetY;
    var dw = ly.width * scale, dh = ly.visualHeight * scale;
    ctx.drawImage(sp.img, sp.bbox.x, sp.bbox.y, sp.bbox.w, sp.bbox.h, dx, dy, dw, dh);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#1A1A2E';
  ctx.font = '800 36px Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
  ctx.fillText(layerCount + '층 완성', W / 2, (minY * scale + offsetY) + bboxH * scale + 64);

  // 계정 워터마크 — 우하단, 작고 은은하게(§6 "저장 이미지 오른쪽 아래").
  // CONFIG의 logical px 값(375 기준 폭)을 export 해상도(1080) 비율로 환산해 동일한
  // 체감 크기를 유지한다.
  var C = BS.CONFIG;
  var exportScale = W / C.LOGICAL_WIDTH;
  var wmPad = C.WATERMARK_PADDING * exportScale;
  var wmFont = C.WATERMARK_FONT_SIZE * exportScale;
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(0, 0, 0, ' + C.WATERMARK_OPACITY + ')';
  ctx.font = '500 ' + wmFont + 'px Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
  ctx.fillText(C.WATERMARK_TEXT, W - wmPad, H - wmPad);

  return canvas;
};

BS.exportFilename = function () {
  var d = new Date();
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return 'burger-stack-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.png';
};

BS.downloadCanvasAsPng = function (canvas, filename, onDone) {
  canvas.toBlob(function (blob) {
    if (!blob) { if (onDone) onDone(); return; }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (onDone) onDone();
  }, 'image/png');
};
