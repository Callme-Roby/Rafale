// Rafale — l'ordi. Il produit les mêmes entrées qu'un joueur : direction + deux boutons.

import { DT, DR } from './sim.js';
import { charById, stats, PACE } from './data.js';

const LV = [
  { react: 0.30, err: 74, hold: [0.38, 0.85], dash: 0.3, guard: 0.0, lob: 0.10 },
  { react: 0.17, err: 38, hold: [0.16, 0.48], dash: 0.75, guard: 0.10, lob: 0.12 },
  { react: 0.07, err: 13, hold: [0.03, 0.22], dash: 1.0, guard: 0.26, lob: 0.14 },
];

export function makeAI(level = 1) {
  return { lv: LV[level] || LV[1], ac: 0, bc: 0, hold: -1, did: -1, delay: 0, err: 0, canDash: true, guard: false, out: { x: 0, y: 0, ac: 0, bc: 0 } };
}

function predict(s, d, x) {
  if (Math.abs(d.vx) < 1) return null;
  const t = (x - d.x) / d.vx;
  if (t < 0) return null;
  const lo = DR, span = s.H - 2 * DR;
  let y = (d.y + d.vy * t - lo) % (2 * span);
  if (y < 0) y += 2 * span;
  if (y > span) y = 2 * span - y;
  return { y: y + lo, t };
}

export function aiInput(s, id, m) {
  const me = s.players[id], op = s.players[1 - id], d = s.disc, lv = m.lv;
  const fwd = id === 0 ? 1 : -1;
  const out = m.out;
  out.x = 0; out.y = 0; out.ac = m.ac; out.bc = m.bc;
  if (s.phase !== 'play') { m.hold = -1; return out; }

  if (me.has) {
    if (m.hold < 0) m.hold = lv.hold[0] + Math.random() * (lv.hold[1] - lv.hold[0]) + (me.serve ? 0.25 : 0);
    m.hold -= DT;
    if (m.hold <= 0) {
      m.hold = -1;
      const far = op.y < s.H / 2 ? 1 : -1;               // viser loin de l'adversaire
      let sy = Math.random() < 0.74 ? far : -far;
      if (Math.random() < 0.16) sy = 0;
      const r = Math.random();
      const sx = r < 0.4 ? 1 : r < 0.8 ? 0 : -1;
      out.y = sy;
      if (!me.charged && Math.random() < lv.lob) { out.x = fwd * (Math.random() < 0.5 ? 1 : -1); out.bc = ++m.bc; }
      else { out.x = sx * fwd; out.ac = ++m.ac; }
    }
    return out;
  }
  m.hold = -1;

  const homeX = id === 0 ? s.W * 0.17 : s.W * 0.83;
  let tx = homeX, ty = s.H / 2, eta = 0;
  if (d.id !== m.did) {
    m.did = d.id;
    m.delay = lv.react * (0.7 + 0.6 * Math.random());
    m.err = (Math.random() * 2 - 1) * lv.err;
    m.canDash = Math.random() < lv.dash;
    m.guard = Math.random() < lv.guard;
  }
  const mine = (x) => (id === 0 ? x < s.W / 2 : x > s.W / 2);

  if (m.delay > 0) { m.delay -= DT; tx = me.x; ty = me.y; }
  else if (d.mode === 'lob') {
    if (mine(d.tx)) { tx = d.tx; ty = d.ty; } else { ty = s.H / 2; }
  } else if (d.mode === 'fly' && d.vx * fwd < 0) {
    const pr = predict(s, d, me.x);
    if (pr) {
      tx = me.x + (homeX - me.x) * 0.2; ty = pr.y + m.err; eta = pr.t;
      const sp = Math.hypot(d.vx, d.vy);
      if (m.guard && sp < 1000 * PACE && pr.t < 0.1 && pr.t > 0.02 && Math.abs(me.y - pr.y) < 24 && me.lockT <= 0 && me.guardT <= 0 && me.dashT <= 0) {
        m.guard = false; out.bc = ++m.bc; return out;
      }
    }
  } else if (d.mode === 'super' && d.sdir * fwd < 0) {
    tx = homeX; ty = d.y + d.vy * 0.07 + m.err * 0.6;
  }

  const ex = tx - me.x, ey = ty - me.y, dist = Math.hypot(ex, ey);
  if (dist > 7) { out.x = ex / dist; out.y = ey / dist; }
  if (eta > 0 && m.canDash && me.dashT <= 0 && me.lockT <= 0 && me.guardT <= 0) {
    const reach = stats(charById(me.ch)).move * eta;
    if (dist > reach + 14 && dist > 54 && eta < 0.45) { m.canDash = false; out.ac = ++m.ac; }
  }
  return out;
}
