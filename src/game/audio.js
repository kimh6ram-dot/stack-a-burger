/* Web Audio API로 합성한 "묵직한 착지 thump" — 외부 음원 파일 없음.
 * 모바일 autoplay 제한 대응: 최초 입력(unlock) 시점에 AudioContext를 생성/resume한다. */
'use strict';
window.BS = window.BS || {};

BS.audio = (function () {
  var ctx = null;

  function ensureContext() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }

  function unlock() { ensureContext(); }

  /* intensity(0~1)가 클수록 착지가 확실할수록(=흔들림 없을수록) 약간 더 단단한 타격감 */
  function playThump(intensity) {
    var c = ensureContext();
    if (!c) return;
    intensity = intensity === undefined ? 1 : intensity;
    var now = c.currentTime;

    var osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.09);
    var oscGain = c.createGain();
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.exponentialRampToValueAtTime(0.5 * intensity, now + 0.008);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    osc.connect(oscGain).connect(c.destination);

    var bufSize = Math.max(1, Math.floor(c.sampleRate * 0.06));
    var buf = c.createBuffer(1, bufSize, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    var noise = c.createBufferSource();
    noise.buffer = buf;
    var lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 480;
    var noiseGain = c.createGain();
    noiseGain.gain.setValueAtTime(0.32 * intensity, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    noise.connect(lp).connect(noiseGain).connect(c.destination);

    osc.start(now); osc.stop(now + 0.16);
    noise.start(now); noise.stop(now + 0.07);
  }

  return { unlock: unlock, playThump: playThump };
})();
