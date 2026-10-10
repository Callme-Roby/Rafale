// Rafale — rendu : le terrain vu du ciel, ombres dures, aplats de couleur.

import { charById, courtById, SUN, CORAL, INK, CHALK } from './data.js';
import { PR, DR, GOAL_DEPTH } from './sim.js';

const FONT = (px, stretch = 'extra-condensed') => `900 ${stretch} ${px}px Archivo, "Arial Narrow", sans-serif`;
const TAU = Math.PI * 2;
const SHX = 13, SHY = 18;        // direction du soleil

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function colorDist(a, b) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

// bruit déterministe pour les textures
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGrain() {
  const c = document.createElement('canvas');
  c.width = c.height = 220;
  const g = c.getContext('2d'), img = g.createImageData(220, 220), r = rng(7);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r() < 0.5 ? 0 : 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = r() * 26;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function jerseys(s) {
  const look = courtById(s.court).look;
  const a = charById(s.players[0].ch), b = charById(s.players[1].ch);
  const pick = (c, avoid) => {
    let col = c.color;
    if (colorDist(col, look.surface) < 70 || (avoid && colorDist(col, avoid) < 40)) col = c.alt;
    return col;
  };
  const c0 = pick(a, null);
  const c1 = pick(b, c0);
  return [c0, c1];
}

// --- terrain ---------------------------------------------------------------

function drawSurface(ctx, court) {
  const { w: W, h: H, look } = court;
  ctx.fillStyle = look.surface;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  ctx.fillStyle = look.alt;
  const r = rng(court.w * 31 + court.h);
  switch (look.pattern) {
    case 'stripes': {
      const n = 12, bw = W / n;
      for (let i = 0; i < n; i += 2) ctx.fillRect(i * bw, 0, bw, H);
      break;
    }
    case 'checker': {
      const t = W / 24;
      for (let y = 0; y * t < H; y++) for (let x = 0; x < 24; x++) if ((x + y) % 2 === 0) ctx.fillRect(x * t, y * t, t, t);
      break;
    }
    case 'speckle': {
      for (let i = 0; i < 520; i++) {
        const x = r() * W, y = r() * H, q = 1 + r() * 2.6;
        ctx.globalAlpha = 0.5 + r() * 0.5;
        ctx.fillRect(x, y, q, q);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.lineWidth = 2;
      for (const fx of [0.25, 0.5, 0.75]) { ctx.beginPath(); ctx.moveTo(W * fx, 0); ctx.lineTo(W * fx, H); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
      break;
    }
    case 'dunes': {
      for (let k = 0; k < 7; k++) {
        const y0 = (k + 0.4) * (H / 7);
        ctx.beginPath();
        for (let x = 0; x <= W; x += 20) {
          const y = y0 + Math.sin(x / 90 + k * 1.7) * 10;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        for (let x = W; x >= 0; x -= 20) ctx.lineTo(x, y0 + 16 + Math.sin(x / 70 + k * 2.3) * 9);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    default: {
      ctx.fillRect(W * 0.25, 0, W * 0.5, H);
    }
  }
  ctx.restore();
}

function drawLines(ctx, court) {
  const { w: W, h: H, look } = court;
  ctx.strokeStyle = look.line; ctx.lineWidth = 5; ctx.lineJoin = 'miter';
  ctx.strokeRect(2.5, 2.5, W - 5, H - 5);
  ctx.lineWidth = 3;
  for (const fx of [0.25, 0.75]) { ctx.beginPath(); ctx.moveTo(W * fx, 0); ctx.lineTo(W * fx, H); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(W * 0.25, H / 2); ctx.lineTo(W * 0.75, H / 2); ctx.stroke();
}

function drawGoals(ctx, court, flash) {
  const { w: W, h: H, zones } = court;
  for (const side of [0, 1]) {
    const x0 = side === 0 ? -GOAL_DEPTH : W;
    let y = 0;
    zones.forEach(([f, pts], i) => {
      const zh = f * H;
      const fl = flash && flash.side === side && flash.zi === i ? flash.a : 0;
      ctx.fillStyle = pts === 5 ? CORAL : SUN;
      ctx.fillRect(x0, y, GOAL_DEPTH, zh);
      if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${fl})`; ctx.fillRect(x0, y, GOAL_DEPTH, zh); }
      ctx.fillStyle = pts === 5 ? CHALK : INK;
      const fs = Math.min(zh * 0.74, 62);
      ctx.font = FONT(fs);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(pts), x0 + GOAL_DEPTH / 2, y + zh / 2 + fs * 0.36);
      y += zh;
    });
    ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.strokeRect(x0, 0, GOAL_DEPTH, H);
    y = 0;
    for (let i = 0; i < zones.length - 1; i++) {
      y += zones[i][0] * H;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + GOAL_DEPTH, y); ctx.stroke();
    }
  }
}

function drawWalls(ctx, court) {
  const { w: W, h: H } = court;
  ctx.fillStyle = 'rgba(0,0,0,.24)';
  ctx.fillRect(-GOAL_DEPTH + SHX * 0.5, 0, W + GOAL_DEPTH * 2, SHY * 0.55);      // ombre du mur du haut
  ctx.fillRect(-GOAL_DEPTH + SHX * 0.5, H + 12, W + GOAL_DEPTH * 2, SHY * 0.55);
  ctx.fillStyle = INK;
  ctx.fillRect(-GOAL_DEPTH - 2, -12, W + GOAL_DEPTH * 2 + 4, 12);
  ctx.fillRect(-GOAL_DEPTH - 2, H, W + GOAL_DEPTH * 2 + 4, 12);
}

function drawNet(ctx, court) {
  const { w: W, h: H, look } = court;
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath();
  ctx.moveTo(W / 2 - 3, 0); ctx.lineTo(W / 2 + 3, 0); ctx.lineTo(W / 2 + 3 + SHX, SHY); ctx.lineTo(W / 2 + 3 + SHX, H); ctx.lineTo(W / 2 - 3 + SHX, H); ctx.lineTo(W / 2 - 3, H - SHY);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = INK; ctx.fillRect(W / 2 - 4, 0, 8, H);
  ctx.strokeStyle = look.net; ctx.lineWidth = 4; ctx.setLineDash([10, 7]);
  ctx.beginPath(); ctx.moveTo(W / 2, 4); ctx.lineTo(W / 2, H - 4); ctx.stroke();
  ctx.setLineDash([]);
  if (court.posts) {
    for (const f of court.posts) {
      const y = H * f;
      ctx.fillStyle = 'rgba(0,0,0,.26)';
      ctx.beginPath(); ctx.ellipse(W / 2 + SHX, y + SHY, 22, 20, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#FF7A1A'; ctx.beginPath(); ctx.arc(W / 2, y, 20, 0, TAU); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.strokeStyle = CHALK; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(W / 2, y, 11, 0, TAU); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(W / 2, y, 3.5, 0, TAU); ctx.fill();
    }
  }
}

function paintText(ctx, text, cx, cy, bw, bh, color) {
  // texte peint au sol, étiré pour remplir exactement la boîte bw × bh
  ctx.save();
  ctx.font = FONT(200);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(text);
  const tw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight || m.width;
  const th = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent || 140;
  ctx.translate(cx - bw / 2, cy + bh / 2);
  ctx.scale(bw / tw, bh / th);
  ctx.fillStyle = color;
  ctx.fillText(text, m.actualBoundingBoxLeft, -m.actualBoundingBoxDescent);
  ctx.restore();
}

export function drawCourtThumb(canvas, court) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = canvas.clientWidth || 200, ch = canvas.clientHeight || 110;
  canvas.width = cw * dpr; canvas.height = ch * dpr;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = court.look.apron; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const bw = 1040 + GOAL_DEPTH * 2 + 70, bh = 560 + 70;       // même échelle pour tous : on voit les tailles
  const k = Math.min(canvas.width / bw, canvas.height / bh);
  ctx.translate(canvas.width / 2, canvas.height / 2); ctx.scale(k, k); ctx.translate(-court.w / 2, -court.h / 2);
  drawSurface(ctx, court); drawLines(ctx, court); drawGoals(ctx, court, null); drawWalls(ctx, court); drawNet(ctx, court);
}

// --- joueurs ---------------------------------------------------------------

function limb(ctx, x0, y0, x1, y1, skin, sleeve) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = skin; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = sleeve; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (x1 - x0) * 0.38, y0 + (y1 - y0) * 0.38); ctx.stroke();
}

function drawPlayer(ctx, p, ch, jersey, t) {
  const a = p.anim, at = p.animT;
  const fwdAng = p.side === 0 ? 0 : Math.PI;
  let ang = a === 'run' || a === 'dash' ? p.face : fwdAng;
  // les bras : positions des mains dans le repère du joueur (+x = devant)
  let hl = [8, -24], hr = [8, 24], stretch = 1, feet = 0, bob = 0;
  const sw = Math.sin(p.run * Math.PI);
  switch (a) {
    case 'run': hl = [10 * sw + 6, -24]; hr = [-10 * sw + 6, 24]; feet = sw; break;
    case 'dash': hl = [31, -9]; hr = [31, 9]; stretch = 1.28; feet = 1; break;
    case 'hold': hl = [21, -7]; hr = [22, 7]; break;
    case 'guard': hl = [19, -11]; hr = [19, 11]; break;
    case 'throw': {
      const u = Math.min(1, at / 0.12);
      hl = [-6 + 8 * u, -24]; hr = [-10 + 44 * u, 22 - 20 * u];
      break;
    }
    case 'win': { const k = Math.sin(at * 16) * 5; hl = [2, -33 - k]; hr = [2, 33 + k]; bob = Math.abs(Math.sin(at * 9)) * 2; break; }
    case 'lose': hl = [5, -9]; hr = [5, 9]; break;
    default: { const k = Math.sin(t * 3 + p.side * 2) * 1.2; hl = [8 + k, -24]; hr = [8 - k, 24]; }
  }

  // ombre portée
  ctx.save();
  ctx.translate(p.x + SHX, p.y + SHY);
  ctx.rotate(Math.atan2(SHY, SHX));
  ctx.fillStyle = 'rgba(0,0,0,.27)';
  ctx.beginPath(); ctx.ellipse(4, 0, 31 * (stretch > 1 ? 1.1 : 1), 21, 0, 0, TAU); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  if (bob) ctx.scale(1 + bob * 0.02, 1 + bob * 0.02);

  // chaussures
  ctx.fillStyle = CHALK; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  const f1 = feet * 13, f2 = -feet * 13;
  for (const [fx, fy] of [[f1 - (a === 'dash' ? 22 : 0), -9], [f2 - (a === 'dash' ? 26 : 0), 9]]) {
    ctx.beginPath(); ctx.ellipse(fx + 3, fy, 10, 5.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
  }
  // bras
  limb(ctx, 0, -18, hl[0], hl[1], ch.skin, jersey);
  limb(ctx, 0, 18, hr[0], hr[1], ch.skin, jersey);
  // buste
  ctx.fillStyle = jersey; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(-1, 0, 13 * stretch, 22, 0, 0, TAU); ctx.fill(); ctx.stroke();
  // tête
  ctx.fillStyle = ch.skin;
  ctx.beginPath(); ctx.arc(2, 0, 10.5, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = ch.hair;
  ctx.beginPath(); ctx.arc(2, 0, 10.5, 0.95, TAU - 0.95); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// --- le moteur de rendu ------------------------------------------------------

export class Renderer {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.grain = makeGrain();
    this.trail = [];
    this.parts = [];
    this.pops = [];
    this.flash = null;
    this.shake = 0;
    this.lastDisc = null;
    this.t = 0;
    this.topPad = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.c.clientWidth, h = this.c.clientHeight;
    if (this.c.width !== Math.round(w * dpr) || this.c.height !== Math.round(h * dpr)) {
      this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
    }
    this.dpr = dpr; this.w = w; this.h = h;
  }

  reset() { this.trail = []; this.parts = []; this.pops = []; this.flash = null; this.shake = 0; }

  // les événements de la simulation deviennent des effets
  events(evs, s) {
    for (const e of evs) {
      const d = s.disc;
      switch (e.k) {
        case 'catch':
          this.ring(d.x, d.y, e.sup ? 70 : 34 + Math.min(30, e.sp / 40), CHALK, e.sup ? 7 : 4);
          if (e.sup) this.shake = 12; else if (e.sp > 1000) this.shake = 5;
          if (e.ch) this.ring(d.x, d.y, 80, SUN, 8);
          break;
        case 'pop': this.ring(d.x, d.y, 50, CHALK, 5); this.burst(d.x, d.y, CHALK, 8, 260); break;
        case 'wall': this.burst(e.x, e.y, CHALK, e.post ? 8 : 5, 220); break;
        case 'boom': this.ring(e.x, e.y, 110, CHALK, 9); this.shake = 9; break;
        case 'super': this.ring(d.x, d.y, 120, charById(s.players[e.by].ch).color, 10); this.shake = 8; break;
        case 'throw': if (e.perf) this.ring(d.x, d.y, 46, SUN, 5); break;
        case 'goal': {
          const x = e.side === 0 ? 0 : s.W, col = e.pts === 5 ? CORAL : SUN;
          this.flash = { side: e.side, zi: e.zi, a: 1, t: 0 };
          this.burst(x, e.y, col, 26, 620); this.burst(x, e.y, CHALK, 12, 480);
          this.pops.push({ x: e.side === 0 ? 96 : s.W - 96, y: e.y, text: '+' + e.pts, t: 0 });
          this.shake = e.pts === 5 ? 16 : 10;
          break;
        }
        case 'miss':
          this.ring(e.x, e.y, 90, INK, 6); this.burst(e.x, e.y, INK, 10, 300);
          this.pops.push({ x: e.x, y: e.y - 30, text: '+' + e.pts, t: 0 });
          this.shake = 8;
          break;
        default:
      }
    }
  }

  ring(x, y, r, color, w) { this.parts.push({ type: 'ring', x, y, r, color, w, t: 0, life: 0.36 }); }
  burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.7);
      this.parts.push({ type: 'bit', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, t: 0, life: 0.45 + Math.random() * 0.35, s: 5 + Math.random() * 7, rot: Math.random() * TAU });
    }
  }

  view(s, opt) {
    const W = s.W, H = s.H;
    const top = opt.top || 0, bottom = opt.bottom || 0;
    if (opt.attract) {
      // le titre peint doit tenir entier dans la partie visible
      const vh = Math.max(120, this.h - top - bottom);
      const k = Math.min(this.w / (W * 0.97), vh / (H * 0.84));
      return { k, cx: this.w / 2, cy: top + vh / 2, rot: -0.07 };
    }
    const pad = Math.min(this.w, this.h) < 520 ? 10 : 26;
    const bw = W + GOAL_DEPTH * 2 + 8, bh = H + 24 + 8;
    const k = Math.min((this.w - pad * 2) / bw, (this.h - top - bottom - pad * 2) / bh);
    return { k, cx: this.w / 2, cy: top + (this.h - top - bottom) / 2, rot: 0 };
  }

  draw(s, opt = {}, dt = 1 / 60) {
    this.resize();
    this.t += dt;
    const ctx = this.ctx, court = courtById(s.court), look = court.look, W = s.W, H = s.H;
    const d = s.disc;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = look.apron;
    ctx.fillRect(0, 0, this.w, this.h);

    const v = this.view(s, opt);
    this.shake *= Math.pow(0.0009, dt);
    const shx = opt.calm ? 0 : (Math.random() - 0.5) * this.shake, shy = opt.calm ? 0 : (Math.random() - 0.5) * this.shake;
    ctx.translate(v.cx + shx, v.cy + shy);
    ctx.rotate(v.rot);
    ctx.scale(v.k, v.k);
    ctx.translate(-W / 2, -H / 2);

    // ombre du terrain sur le sol autour
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    ctx.fillRect(-GOAL_DEPTH + 10, -12 + 14, W + GOAL_DEPTH * 2, H + 24);

    drawSurface(ctx, court);

    // peinture au sol : le titre à l'accueil, le score en match
    if (opt.title) {
      paintText(ctx, opt.title, W / 2, H / 2, W * 0.9, H * 0.8, 'rgba(255,255,255,.96)');
    } else {
      const sc = (n) => String(n).padStart(2, '0');
      paintText(ctx, sc(s.score[0]), W * 0.25, H / 2, W * 0.3, H * 0.66, look.paint);
      paintText(ctx, sc(s.score[1]), W * 0.75, H / 2, W * 0.3, H * 0.66, look.paint);
    }
    drawLines(ctx, court);

    if (this.flash) {
      this.flash.t += dt;
      this.flash.a = this.flash.t > 1.1 ? 0 : Math.sin(this.flash.t * 28) > 0 ? 0.85 : 0;
      if (this.flash.t > 1.1) this.flash = null;
    }
    drawGoals(ctx, court, this.flash);
    drawWalls(ctx, court);

    // repère d'atterrissage d'un lob
    if (d.mode === 'lob') {
      const u = Math.min(1, d.t / d.T), r = 46 - u * 22;
      ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.setLineDash([9, 7]);
      ctx.beginPath(); ctx.arc(d.tx, d.ty, r, this.t * 3, this.t * 3 + TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.beginPath(); ctx.arc(d.tx, d.ty, DR * (0.5 + u * 0.6), 0, TAU); ctx.fill();
    }

    // marqueurs au sol
    const cols = jerseys(s);
    s.players.forEach((p, i) => {
      if (opt.me === i || opt.me === 2) {
        ctx.strokeStyle = CHALK; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(p.x, p.y, PR + 11, 0, TAU); ctx.stroke();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, PR + 13.5, 0, TAU); ctx.stroke();
      }
      if (d.mode === 'lob' && p.underT > 0) {
        const q = Math.min(1, p.underT / 0.32);
        ctx.strokeStyle = q >= 1 ? SUN : CHALK; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.arc(p.x, p.y, PR + 18, -Math.PI / 2, -Math.PI / 2 + TAU * q); ctx.stroke();
      }
      if (p.has && p.charged) {
        const k = 0.5 + 0.5 * Math.sin(this.t * 22);
        ctx.fillStyle = SUN;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(this.t * 2.2);
        for (let j = 0; j < 10; j++) {
          ctx.rotate(TAU / 10);
          ctx.beginPath(); ctx.moveTo(PR + 8, -5); ctx.lineTo(PR + 26 + k * 12, 0); ctx.lineTo(PR + 8, 5); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
    });

    drawNet(ctx, court);

    // traînée du disque
    const flying = d.mode === 'fly' || d.mode === 'super' || d.mode === 'lob';
    const dy = d.y - d.z * 46;
    if (flying) {
      this.trail.push({ x: d.x, y: dy });
      const max = d.mode === 'super' ? 26 : d.perf ? 16 : 10;
      while (this.trail.length > max) this.trail.shift();
    } else if (this.trail.length) this.trail.shift();
    if (this.trail.length > 1 && d.mode !== 'lob') {
      const n = this.trail.length;
      const col = d.mode === 'super' && d.last >= 0 ? cols[d.last] : CHALK;
      ctx.lineCap = 'round';
      for (let i = 1; i < n; i++) {
        const a = this.trail[i - 1], b = this.trail[i], q = i / n;
        ctx.strokeStyle = col; ctx.globalAlpha = q * (d.mode === 'super' ? 0.9 : 0.55);
        ctx.lineWidth = DR * 2 * q;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // joueurs, du fond vers l'avant
    const order = s.players.map((p, i) => i).sort((a, b) => s.players[a].y - s.players[b].y);
    for (const i of order) {
      const p = s.players[i];
      drawPlayer(ctx, p, charById(p.ch), cols[i], this.t);
      if (p.guardT > 0) {
        const f = p.side === 0 ? 0 : Math.PI;
        ctx.strokeStyle = CHALK; ctx.lineWidth = 7; ctx.lineCap = 'round';
        ctx.globalAlpha = Math.min(1, p.guardT / 0.1);
        ctx.beginPath(); ctx.arc(p.x, p.y, PR + 12, f - 1.05, f + 1.05); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // disque
    if (d.mode !== 'none' && !(d.mode === 'dead')) {
      const sc = 1 + d.z * 0.85;
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.beginPath(); ctx.ellipse(d.x + 7 + d.z * 44, d.y + 9 + d.z * 62, DR * (1 + d.z * 0.2), DR * 0.9 * (1 + d.z * 0.2), 0, 0, TAU); ctx.fill();
      ctx.fillStyle = CHALK; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(d.x, dy, DR * sc, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = CORAL; ctx.lineWidth = 3.5 * sc;
      ctx.beginPath(); ctx.arc(d.x, dy, DR * sc * 0.58, 0, TAU); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(d.x, dy, 2.2 * sc, 0, TAU); ctx.fill();
    }

    // particules
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      const q = p.t / p.life;
      if (q >= 1) { this.parts.splice(i, 1); continue; }
      if (p.type === 'ring') {
        ctx.strokeStyle = p.color; ctx.lineWidth = p.w * (1 - q); ctx.globalAlpha = 1 - q * q;
        ctx.beginPath(); ctx.arc(p.x, p.y, 12 + (p.r - 12) * (1 - Math.pow(1 - q, 3)), 0, TAU); ctx.stroke();
      } else {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.t * 9);
        ctx.fillStyle = p.color; ctx.globalAlpha = 1 - q;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // points gagnés
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      if (p.t > 1.2) { this.pops.splice(i, 1); continue; }
      const q = Math.min(1, p.t / 0.16), sc = 0.4 + 0.6 * (1 - Math.pow(1 - q, 3));
      ctx.save();
      ctx.translate(p.x, p.y - p.t * 26);
      ctx.scale(sc, sc);
      ctx.font = FONT(120); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = p.t > 0.95 ? (1.2 - p.t) / 0.25 : 1;
      ctx.fillStyle = INK; ctx.fillText(p.text, 5, 6);
      ctx.fillStyle = CHALK; ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }

    // grain
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.pat) this.pat = ctx.createPattern(this.grain, 'repeat');
    ctx.fillStyle = this.pat;
    ctx.fillRect(0, 0, this.c.width, this.c.height);
  }
}
