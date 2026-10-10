// Rafale — sons synthétisés, aucun fichier audio.

let ctx = null, master = null, muted = false;
try { muted = localStorage.getItem('rafale-muet') === '1'; } catch { /* stockage indisponible */ }

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlock() { ac(); }
export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('rafale-muet', m ? '1' : '0'); } catch { /* tant pis */ }
  if (master) master.gain.value = m ? 0 : 0.5;
}

function tone(type, f0, f1, dur, vol = 0.3, delay = 0) {
  const c = ac(); if (!c || muted) return;
  const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}

let noiseBuf = null;
function noise(dur, f0, f1, vol = 0.3, q = 1.2) {
  const c = ac(); if (!c || muted) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.02);
}

export function play(evs) {
  for (const e of evs) {
    switch (e.k) {
      case 'throw': noise(0.16, 900 + e.sp * 0.9, 2600, 0.26); if (e.perf) tone('square', 880, 1320, 0.07, 0.08); break;
      case 'lob': noise(0.3, 500, 1500, 0.2, 0.8); break;
      case 'catch': tone('sine', 190, 70, 0.11, 0.42); noise(0.05, 1800, 900, 0.16); if (e.ch) { tone('square', 440, 880, 0.14, 0.09); tone('square', 660, 1320, 0.16, 0.08, 0.08); } break;
      case 'pop': tone('triangle', 520, 1040, 0.12, 0.26); break;
      case 'wall': tone('square', 340, 220, 0.05, 0.1); break;
      case 'dash': noise(0.14, 300, 1300, 0.14, 0.7); break;
      case 'guard': tone('triangle', 300, 260, 0.05, 0.08); break;
      case 'super': tone('sawtooth', 110, 880, 0.42, 0.2); noise(0.42, 400, 5000, 0.24, 0.6); break;
      case 'boom': tone('sawtooth', 700, 60, 0.3, 0.28); noise(0.25, 3000, 300, 0.3); break;
      case 'goal': tone('square', 523, 523, 0.1, 0.13); tone('square', 659, 659, 0.1, 0.13, 0.09); tone('square', e.pts === 5 ? 1047 : 784, 784, 0.24, 0.14, 0.18); noise(0.3, 2500, 600, 0.2); break;
      case 'miss': tone('sine', 150, 50, 0.28, 0.45); tone('square', 330, 196, 0.24, 0.1, 0.05); break;
      case 'serve': tone('sine', 1900, 2100, 0.09, 0.07); break;
      case 'set': case 'sudden': tone('sine', 2300, 2500, 0.34, 0.11); tone('sine', 2500, 2300, 0.34, 0.07, 0.03); break;
      case 'timeup': tone('sine', 2400, 2300, 0.2, 0.12); tone('sine', 2400, 2200, 0.5, 0.12, 0.26); break;
      case 'over': tone('square', 392, 392, 0.14, 0.12); tone('square', 523, 523, 0.14, 0.12, 0.14); tone('square', 659, 659, 0.14, 0.12, 0.28); tone('square', 784, 784, 0.5, 0.13, 0.42); break;
      default:
    }
  }
}
