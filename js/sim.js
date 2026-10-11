// Rafale — simulation. Pas de DOM ici : l'hôte fait tourner ce fichier,
// l'invité ne fait qu'afficher les états qu'il reçoit.

import { charById, courtById, stats, RULES, PACE } from './data.js';

export const DT = 1 / 60;
export const PR = 26;      // rayon d'un joueur
export const DR = 13;      // rayon du disque
export const GOAL_DEPTH = 56;
const NET_GAP = 34;        // distance minimale au filet
const REACH = 10;          // marge de réception autour du joueur : plus grand = plus facile
const EDGE = 6;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rad = (d) => (d * Math.PI) / 180;

function mkPlayer(side, ch) {
  return {
    side, ch, x: 0, y: 0, face: side === 0 ? 0 : Math.PI,
    has: false, holdT: 0, charged: false, serve: false,
    dashT: 0, dvx: 0, dvy: 0, guardT: 0, lockT: 0,
    kbT: 0, kbv: 0, kbSup: false, underT: 0,
    anim: 'idle', animT: 0, run: 0, ac: null, bc: null, _hist: [],
  };
}

function setAnim(p, a) { if (p.anim !== a) { p.anim = a; p.animT = 0; } }

// distance à laquelle un joueur attrape le disque, un peu plus en plongeant
function reach(p) { return PR + DR + REACH + (p.dashT > 0 ? 6 : 0); }

export function newMatch(cfg) {
  const c = courtById(cfg.court);
  const rules = {
    setTime: cfg.setTime ?? RULES.setTime,
    setPoints: cfg.setPoints ?? RULES.setPoints,
    setsToWin: cfg.setsToWin ?? RULES.setsToWin,
  };
  const s = {
    court: c.id, W: c.w, H: c.h, rules,
    tick: 0, phase: 'intro', phaseT: 2.0, fresh: true,
    setNo: 1, sets: [0, 0], score: [0, 0], time: rules.setTime, sudden: false,
    server: 0, winner: -1, freeze: 0, heat: 0, pend: null,
    players: [mkPlayer(0, cfg.chars[0]), mkPlayer(1, cfg.chars[1])],
    disc: {
      id: 0, mode: 'none', x: c.w / 2, y: c.h / 2, z: 0, vx: 0, vy: 0, owner: -1, last: -1,
      curve: 0, cleft: 0, reb: false, perf: false,
      t: 0, T: 1, fx: 0, fy: 0, tx: 0, ty: 0, zmax: 1, pop: false,
      sup: null, st: 0, sph: 0, sg: 1, sa: 0, sv: 0, sdir: 1, sy0: 0,
    },
    ev: [],
  };
  place(s);
  return s;
}

function homeOf(s, side) {
  return { x: side === 0 ? s.W * 0.2 : s.W * 0.8, y: s.H / 2 };
}

function calm(p) {
  p.has = false; p.holdT = 0; p.charged = false; p.serve = false;
  p.dashT = 0; p.guardT = 0; p.lockT = 0; p.kbT = 0; p.kbSup = false; p.underT = 0;
  p._hist = [];
}

function place(s) {
  for (const p of s.players) {
    const h = homeOf(s, p.side);
    p.x = h.x; p.y = h.y; p.face = p.side === 0 ? 0 : Math.PI;
    calm(p); setAnim(p, 'idle');
  }
}

export function zoneAt(s, y) {
  const zones = courtById(s.court).zones;
  const f = clamp(y / s.H, 0, 0.9999);
  let acc = 0;
  for (let i = 0; i < zones.length; i++) {
    acc += zones[i][0];
    if (f < acc) return { i, pts: zones[i][1] };
  }
  return { i: zones.length - 1, pts: zones[zones.length - 1][1] };
}

function hand(p) {
  return { x: p.x + (p.side === 0 ? 1 : -1) * 25, y: p.y };
}

function give(s, p, serve) {
  const d = s.disc;
  p.has = true; p.holdT = 0; p.serve = !!serve; p._hist = [];
  p.dashT = 0; p.guardT = 0; p.lockT = 0; p.underT = 0;
  p.face = p.side === 0 ? 0 : Math.PI;
  setAnim(p, 'hold');
  d.mode = 'held'; d.owner = p.side; d.z = 0; d.vx = 0; d.vy = 0;
  const h = hand(p); d.x = h.x; d.y = h.y;
}

function release(s, p) {
  const d = s.disc;
  p.has = false; p.charged = false; p.serve = false;
  d.owner = -1; d.last = p.side; d.reb = false; d.id++;
  d.curve = 0; d.cleft = 0; d.sup = null; d.pop = false; d.perf = false; d.z = 0;
}

// --- boucle principale ------------------------------------------------------

export function step(s, inputs) {
  s.ev = [];
  s.tick++;
  if (s.phase !== 'play') {
    // hors échange, les appuis ne comptent pas : on se contente de suivre les compteurs
    for (let i = 0; i < 2; i++) { s.players[i].ac = inputs[i].ac; s.players[i].bc = inputs[i].bc; }
  }
  if (s.freeze > 0) { s.freeze--; return s.ev; }

  switch (s.phase) {
    case 'intro':
      if (s.fresh) { s.fresh = false; s.ev.push({ k: s.sudden ? 'sudden' : 'set', n: s.setNo }); }
      for (const p of s.players) p.animT += DT;
      s.phaseT -= DT;
      if (s.phaseT <= 0) startServe(s);
      break;

    case 'serve': {
      const d = s.disc, p = s.players[s.server];
      for (const q of s.players) q.animT += DT;
      d.t += DT;
      const u = Math.min(1, d.t / d.T), h = hand(p);
      d.x = lerp(d.fx, h.x, u); d.y = lerp(d.fy, h.y, u); d.z = Math.sin(Math.PI * u) * 0.5;
      if (u >= 1) { give(s, p, true); s.phase = 'play'; s.ev.push({ k: 'catch', by: p.side, sp: 0, sup: 0 }); }
      break;
    }

    case 'play':
      updatePlayer(s, s.players[0], inputs[0]);
      if (s.phase === 'play') updatePlayer(s, s.players[1], inputs[1]);
      if (s.phase === 'play') { updateDisc(s, DT / 2); }
      if (s.phase === 'play') { updateDisc(s, DT / 2); }
      if (s.phase === 'play' && !s.sudden) {
        s.time -= DT;
        if (s.time <= 0) { s.time = 0; timeUp(s); }
      }
      break;

    case 'point':
      for (const p of s.players) p.animT += DT;
      s.phaseT -= DT;
      if (s.phaseT < 0.85) walkHome(s);
      if (s.phaseT <= 0) {
        if (s.pend) { s.pend = null; endSet(s); } else startServe(s);
      }
      break;

    case 'setend':
      for (const p of s.players) p.animT += DT;
      s.phaseT -= DT;
      walkHome(s);
      if (s.phaseT <= 0) afterSet(s);
      break;

    default:
      for (const p of s.players) p.animT += DT;
  }
  return s.ev;
}

function walkHome(s) {
  for (const p of s.players) {
    const h = homeOf(s, p.side);
    const ex = h.x - p.x, ey = h.y - p.y, m = Math.hypot(ex, ey);
    const v = 460 * DT;
    if (m <= v) { p.x = h.x; p.y = h.y; p.face = p.side === 0 ? 0 : Math.PI; if (p.anim === 'run') setAnim(p, 'idle'); }
    else { p.x += (ex / m) * v; p.y += (ey / m) * v; p.face = Math.atan2(ey, ex); p.run += v / 38; setAnim(p, 'run'); }
  }
}

function startServe(s) {
  place(s);
  const d = s.disc;
  d.mode = 'feed'; d.t = 0; d.T = 0.55; d.fx = s.W / 2; d.fy = s.H + 34; d.x = d.fx; d.y = d.fy;
  d.z = 0; d.vx = 0; d.vy = 0; d.owner = -1; d.last = -1; d.sup = null; d.curve = 0; d.cleft = 0; d.reb = false; d.pop = false;
  s.phase = 'serve';
  s.ev.push({ k: 'serve', to: s.server });
}

// --- joueurs ---------------------------------------------------------------

function clampPos(s, p) {
  const lo = p.side === 0 ? PR + EDGE : s.W / 2 + NET_GAP;
  const hi = p.side === 0 ? s.W / 2 - NET_GAP : s.W - PR - EDGE;
  p.x = clamp(p.x, lo, hi);
  p.y = clamp(p.y, PR, s.H - PR);
}

function updatePlayer(s, p, inp) {
  const st = stats(charById(p.ch));
  if (p.ac == null) { p.ac = inp.ac; p.bc = inp.bc; }
  const aP = inp.ac !== p.ac, bP = inp.bc !== p.bc;
  p.ac = inp.ac; p.bc = inp.bc;

  let dx = inp.x || 0, dy = inp.y || 0;
  const m = Math.hypot(dx, dy);
  if (m > 1) { dx /= m; dy /= m; }
  const moving = m > 0.3;
  p._hist.push(moving ? Math.atan2(dy, dx) : null);
  if (p._hist.length > 26) p._hist.shift();
  p.animT += DT;

  // recul après une réception
  if (p.kbT > 0) {
    p.kbT -= DT;
    p.x += p.kbv * DT;
    p.y = clamp(p.y, PR, s.H - PR);
    const lim = p.side === 0 ? PR + EDGE : s.W - PR - EDGE;
    const out = p.side === 0 ? p.x <= lim : p.x >= lim;
    if (out) {
      p.x = lim;
      if (p.kbSup && p.has) {            // emporté dans son propre but
        const d = s.disc;
        p.has = false; p.kbT = 0; p.kbSup = false;
        d.x = p.side === 0 ? -GOAL_DEPTH / 2 : s.W + GOAL_DEPTH / 2; d.y = p.y;
        goal(s, 1 - p.side, p.y, true);
        return;
      }
    }
    if (p.kbT <= 0) p.kbSup = false;
    clampPos(s, p);
  }

  if (p.has) {
    p.holdT += DT;
    const limit = p.serve ? 3.0 : p.charged ? 2.2 : 2.0;
    if (aP) return throwDisc(s, p, st, dx, dy, false);
    if (bP) return lobDisc(s, p, dx, dy);
    if (p.holdT >= limit) return throwDisc(s, p, st, 0, 0, true);
    return;
  }
  if (p.kbT > 0) return;

  if (p.guardT > 0) {
    p.guardT -= DT;
    if (p.guardT <= 0) { p.lockT = 0.1; }
    return;
  }
  if (p.dashT > 0) {
    p.dashT -= DT;
    p.x += p.dvx * DT; p.y += p.dvy * DT;
    clampPos(s, p);
    if (p.dashT <= 0) p.lockT = 0.08;
    return;
  }
  if (p.lockT > 0) {
    p.lockT -= DT;
    if (p.lockT <= 0) setAnim(p, 'idle');
    return;
  }

  if (aP && moving) {
    const n = Math.hypot(dx, dy) || 1;
    p.dashT = 0.2; p.dvx = (dx / n) * st.dash; p.dvy = (dy / n) * st.dash;
    p.face = Math.atan2(dy, dx);
    setAnim(p, 'dash');
    s.ev.push({ k: 'dash', by: p.side });
  } else if (aP || bP) {
    p.guardT = 0.2;
    p.face = p.side === 0 ? 0 : Math.PI;
    setAnim(p, 'guard');
    s.ev.push({ k: 'guard', by: p.side });
  } else if (moving) {
    p.x += dx * st.move * DT; p.y += dy * st.move * DT;
    p.run += (st.move * DT * Math.min(1, m)) / 38;
    p.face = Math.atan2(dy, dx);
    setAnim(p, 'run');
    clampPos(s, p);
  } else {
    setAnim(p, 'idle');
    p.face = p.side === 0 ? 0 : Math.PI;
  }
}

// Un demi-cercle au stick juste avant de tirer donne de l'effet.
function curveOf(p) {
  const h = p._hist;
  let sum = 0, prev = null;
  for (let k = 0; k < h.length; k++) {
    const a = h[k];
    if (a == null) continue;
    if (prev != null) {
      let da = a - prev;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      if (Math.abs(da) < rad(140)) sum += da;
    }
    prev = a;
  }
  return Math.abs(sum) >= rad(130) ? Math.sign(sum) : 0;
}

function throwDisc(s, p, st, dx, dy, auto) {
  const d = s.disc;
  const fwd = p.side === 0 ? 1 : -1;
  if (p.charged && !auto) return superThrow(s, p, st, dy);
  const fx = dx * fwd;
  const sy = Math.abs(dy) > 0.35 ? Math.sign(dy) : 0;
  const ax = fx > 0.35 ? 1 : fx < -0.35 ? -1 : 0;

  // au service, on prend son temps : la vitesse ne dépend pas de l'attente
  const q = p.serve ? 0.85 : 1 - clamp((p.holdT - 0.18) / 0.55, 0, 1);
  let sp = lerp(st.tmin, st.tmax, q);
  const perfect = !auto && !p.serve && p.holdT <= 0.13;
  if (perfect) { sp *= 1.1; s.heat = Math.min(0.24, s.heat + 0.06); }
  else if (q < 0.6) s.heat = 0;
  sp *= 1 + s.heat;
  if (auto) sp = st.tmin * 0.9;

  let ang = 0;
  if (sy) ang = ax > 0 ? rad(22) : ax === 0 ? rad(42) : rad(60);
  let vx = Math.cos(ang) * fwd, vy = Math.sin(ang) * sy;

  const c = auto ? 0 : curveOf(p);
  release(s, p);
  if (c) {
    const a0 = (fwd > 0 ? 0 : Math.PI) - c * rad(40);
    vx = Math.cos(a0); vy = Math.sin(a0);
    d.curve = c * 2.9; d.cleft = rad(80);
    sp *= 0.96;
  }
  const h = hand(p);
  d.mode = 'fly'; d.x = h.x; d.y = h.y; d.vx = vx * sp; d.vy = vy * sp; d.perf = perfect;
  p.lockT = 0.14; setAnim(p, 'throw');
  s.ev.push({ k: 'throw', by: p.side, sp: Math.round(sp), perf: perfect ? 1 : 0, curve: c ? 1 : 0 });
}

function lobDisc(s, p, dx, dy) {
  const d = s.disc;
  const fwd = p.side === 0 ? 1 : -1;
  const fx = dx * fwd;
  const sy = Math.abs(dy) > 0.35 ? Math.sign(dy) : 0;
  const ax = fx > 0.35 ? 1 : fx < -0.35 ? -1 : 0;
  const depth = ax > 0 ? 0.84 : ax < 0 ? 0.3 : 0.58;
  const fast = p.charged;
  release(s, p);
  const h = hand(p);
  d.mode = 'lob'; d.t = 0; d.T = fast ? 0.72 : 1.05;
  d.fx = h.x; d.fy = h.y; d.x = h.x; d.y = h.y;
  d.tx = s.W / 2 + fwd * depth * (s.W / 2 - 30);
  d.ty = sy < 0 ? s.H * 0.14 : sy > 0 ? s.H * 0.86 : clamp(p.y, s.H * 0.2, s.H * 0.8);
  d.zmax = 1; d.vx = 0; d.vy = 0;
  p.lockT = 0.16; setAnim(p, 'throw');
  s.ev.push({ k: 'lob', by: p.side, fast: fast ? 1 : 0 });
}

function superThrow(s, p, st, dy) {
  const d = s.disc;
  const fwd = p.side === 0 ? 1 : -1;
  const c = charById(p.ch);
  const sa = Math.abs(dy) > 0.35 ? Math.sign(dy) : 0;
  const sg = sa || (p.y < s.H / 2 ? 1 : -1);
  release(s, p);
  const h = hand(p);
  d.mode = 'super'; d.sup = c.sup; d.st = 0; d.sph = 0; d.sg = sg; d.sa = sa; d.sv = st.sup; d.sdir = fwd;
  d.x = h.x; d.y = h.y; d.sy0 = h.y; d.vx = fwd * st.sup; d.vy = 0;
  p.lockT = 0.22; setAnim(p, 'throw');
  s.freeze = 7;
  s.ev.push({ k: 'super', by: p.side, sup: c.sup });
}

// --- disque ----------------------------------------------------------------

function updateDisc(s, dt) {
  const d = s.disc;
  switch (d.mode) {
    case 'held': {
      const p = s.players[d.owner], h = hand(p);
      d.x = h.x; d.y = h.y; d.z = 0;
      break;
    }
    case 'fly': {
      if (d.cleft > 0) {
        const da = d.curve * dt, c = Math.cos(da), sn = Math.sin(da);
        const vx = d.vx * c - d.vy * sn, vy = d.vx * sn + d.vy * c;
        d.vx = vx; d.vy = vy; d.cleft -= Math.abs(da);
      }
      if (Math.abs(d.vx) < 170 * PACE) d.vx = (d.vx < 0 ? -1 : d.vx > 0 ? 1 : (d.last === 0 ? 1 : -1)) * 170 * PACE;
      d.x += d.vx * dt; d.y += d.vy * dt;
      walls(s, d, true);
      posts(s, d);
      if (edges(s, d)) return;
      tryCatch(s, d);
      break;
    }
    case 'super': {
      superMove(s, d, dt);
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (edges(s, d)) return;
      tryCatch(s, d);
      break;
    }
    case 'lob': {
      d.t += dt;
      const u = Math.min(1, d.t / d.T);
      d.x = lerp(d.fx, d.tx, u); d.y = lerp(d.fy, d.ty, u); d.z = 4 * u * (1 - u) * d.zmax;
      const side = d.tx < s.W / 2 ? 0 : 1, p = s.players[side];
      const dist = Math.hypot(p.x - d.tx, p.y - d.ty);
      if (dist < 42 && p.dashT <= 0 && !p.has) p.underT += dt; else p.underT = 0;
      if (u >= 1) {
        d.z = 0;
        if (dist < reach(p) && p.kbT <= 0) {
          const charged = p.underT >= 0.32;
          give(s, p, false);
          p.charged = charged;
          s.ev.push({ k: 'catch', by: p.side, sp: 0, sup: 0, ch: charged ? 1 : 0 });
        } else {
          // manqué : le disque tourne au sol, il reste un instant pour le ramasser
          s.players[0].underT = 0; s.players[1].underT = 0;
          d.mode = 'spin'; d.t = 0; d.T = RULES.groundTime; d.x = d.tx; d.y = d.ty;
          s.ev.push({ k: 'land', x: Math.round(d.x), y: Math.round(d.y) });
        }
      }
      break;
    }
    case 'spin': {
      d.t += dt;
      const side = d.x < s.W / 2 ? 0 : 1, p = s.players[side];
      if (!p.has && p.kbT <= 0 && Math.hypot(p.x - d.x, p.y - d.y) < reach(p)) {
        give(s, p, false);
        s.ev.push({ k: 'catch', by: p.side, sp: 0, sup: 0 });
      } else if (d.t >= d.T) {
        addPoints(s, 1 - side, RULES.missPoints, { k: 'miss', side, pts: RULES.missPoints, x: d.x, y: d.y });
      }
      break;
    }
    default:
  }
}

function walls(s, d, bounce) {
  let hit = false;
  if (d.y < DR) { d.y = DR; if (bounce) { d.vy = Math.abs(d.vy); d.curve = -d.curve; } hit = true; }
  else if (d.y > s.H - DR) { d.y = s.H - DR; if (bounce) { d.vy = -Math.abs(d.vy); d.curve = -d.curve; } hit = true; }
  if (hit) s.ev.push({ k: 'wall', x: Math.round(d.x), y: Math.round(d.y) });
  return hit;
}

function posts(s, d) {
  const ps = courtById(s.court).posts;
  if (!ps) return;
  for (const f of ps) {
    const cx = s.W / 2, cy = s.H * f, R = 20 + DR;
    const ex = d.x - cx, ey = d.y - cy, m = Math.hypot(ex, ey);
    if (m >= R || m === 0) continue;
    const nx = ex / m, ny = ey / m, dot = d.vx * nx + d.vy * ny;
    if (dot < 0) { d.vx -= 2 * dot * nx; d.vy -= 2 * dot * ny; }
    d.x = cx + nx * R; d.y = cy + ny * R;
    d.reb = true; d.cleft = 0;
    s.ev.push({ k: 'wall', x: Math.round(d.x), y: Math.round(d.y), post: 1 });
  }
}

function edges(s, d) {
  if (d.x <= 0) { goal(s, 1, d.y, false); return true; }
  if (d.x >= s.W) { goal(s, 0, d.y, false); return true; }
  return false;
}

function tryCatch(s, d) {
  for (const p of s.players) {
    if (p.has || p.kbT > 0) continue;
    if (d.last === p.side && !d.reb) continue;
    if (Math.hypot(p.x - d.x, p.y - d.y) > reach(p)) continue;
    if (p.lockT > 0 && p.guardT <= 0 && p.dashT <= 0) continue;   // en récupération : le disque passe
    const fwd = p.side === 0 ? 1 : -1;
    const sup = d.mode === 'super';
    const sp = Math.hypot(d.vx, d.vy);

    if (p.guardT > 0 && !sup) {
      // contre : le disque monte au-dessus du joueur
      p.guardT = 0; p.lockT = 0.12; p.underT = 0;
      d.last = p.side; d.id++; d.owner = -1;
      d.mode = 'lob'; d.t = 0; d.T = 0.9; d.zmax = 0.8; d.pop = true;
      d.fx = d.x; d.fy = d.y;
      const lo = p.side === 0 ? PR : s.W / 2 + NET_GAP, hi = p.side === 0 ? s.W / 2 - NET_GAP : s.W - PR;
      d.tx = clamp(p.x + fwd * 22, lo, hi); d.ty = p.y;
      d.vx = 0; d.vy = 0; d.curve = 0; d.cleft = 0; d.sup = null;
      s.freeze = 2;
      s.ev.push({ k: 'pop', by: p.side });
      return;
    }

    const st = stats(charById(p.ch));
    const dirx = d.vx === 0 ? -fwd : Math.sign(d.vx);
    give(s, p, false);
    p.kbT = sup ? 0.2 : 0.12;
    const dist = (sup ? 150 : clamp((sp - 600 * PACE) / (700 * PACE), 0, 1) * 58) * (1 - st.res);
    p.kbv = (dirx * dist) / p.kbT; p.kbSup = sup;
    s.freeze = sup ? 5 : sp > 1050 * PACE ? 2 : 0;
    s.ev.push({ k: 'catch', by: p.side, sp: Math.round(sp), sup: sup ? 1 : 0 });
    return;
  }
}

// Les six tirs spéciaux : chacun impose sa vitesse au disque.
function superMove(s, d, dt) {
  d.st += dt;
  const v = d.sv, f = d.sdir, t = d.st, lo = DR + 2, hi = s.H - DR - 2;
  const wallHit = () => { s.ev.push({ k: 'wall', x: Math.round(d.x), y: Math.round(d.y) }); };
  switch (d.sup) {
    case 'serpent':
      d.vx = f * v * 0.82; d.vy = d.sg * v * 1.25 * Math.cos(t * 10.5);
      if (d.y < lo) { d.y = lo; if (d.vy < 0) { d.sg = -d.sg; wallHit(); } }
      else if (d.y > hi) { d.y = hi; if (d.vy > 0) { d.sg = -d.sg; wallHit(); } }
      break;
    case 'ricochet':
      if (d.sph === 0) { d.sph = 1; d.vy = d.sg * v * 1.3; }
      d.vx = f * v * 0.62;
      if (d.y < lo) { d.y = lo; d.vy = Math.abs(d.vy); wallHit(); }
      else if (d.y > hi) { d.y = hi; d.vy = -Math.abs(d.vy); wallHit(); }
      break;
    case 'boucle': {
      const w = 9.5, R = v * 0.95;
      d.vx = f * (v * 0.55 + R * Math.cos(w * t));
      d.vy = d.sg * R * Math.sin(w * t);
      if (d.y < lo) { d.y = lo; if (d.vy < 0) d.sg = -d.sg; }
      else if (d.y > hi) { d.y = hi; if (d.vy > 0) d.sg = -d.sg; }
      break;
    }
    case 'rasemur': {
      if (d.sph === 0) {
        d.vx = f * v * 0.55; d.vy = d.sg * v * 1.15;
        if (d.y <= lo + 2 || d.y >= hi - 2) { d.sph = 1; wallHit(); }
      }
      if (d.sph === 1) {
        d.vy = 0; d.y = d.sg < 0 ? lo + 1 : hi - 1; d.vx = f * v * 1.2;
        const gx = f > 0 ? s.W : 0;
        if (Math.abs(gx - d.x) < s.W * 0.2) d.sph = 2;
      }
      if (d.sph === 2) { d.vx = f * v * 0.75; d.vy = -d.sg * v * 0.95; }
      d.y = clamp(d.y, lo, hi);
      break;
    }
    case 'comete':
      if (t < 0.42) { d.vx = f * v * 0.05; d.vy = 0; }
      else {
        if (d.sph === 0) { d.sph = 1; s.ev.push({ k: 'boom', x: Math.round(d.x), y: Math.round(d.y) }); }
        if (d.sph === 1) { d.sph = 2; d.vx = f * v * 1.8 * Math.cos(rad(15) * Math.abs(d.sa)); d.vy = d.sa * v * 1.8 * Math.sin(rad(15)); }
        if (d.y < lo) { d.y = lo; d.vy = Math.abs(d.vy); wallHit(); }
        else if (d.y > hi) { d.y = hi; d.vy = -Math.abs(d.vy); wallHit(); }
      }
      break;
    case 'crochet': {
      if (d.sph === 0) {
        d.vx = f * v * 1.15; d.vy = 0;
        const pass = f > 0 ? d.x > s.W * 0.6 : d.x < s.W * 0.4;
        if (pass) { d.sph = 1; d.sg = d.sa || (d.y < s.H / 2 ? 1 : -1); d.sy0 = d.y; }
      } else if (d.sph === 1) {
        d.vx = f * v * 0.35; d.vy = d.sg * v * 1.5;
        if (Math.abs(d.y - d.sy0) > s.H * 0.36 || d.y <= lo || d.y >= hi) d.sph = 2;
      } else { d.vx = f * v * 1.25; d.vy = 0; }
      d.y = clamp(d.y, lo, hi);
      break;
    }
    default:
      d.vx = f * v; d.vy = 0;
  }
}

// Trace la trajectoire d'un tir spécial (pour les affiches).
export function traceSuper(sup, W = 960, H = 500, sg = -1) {
  const s = { W, H, ev: [], court: 'gazon' };
  const d = { mode: 'super', sup, st: 0, sph: 0, sg, sa: 0, sv: 1050, sdir: 1, x: W * 0.2 + 25, y: H * 0.5, sy0: H * 0.5, vx: 0, vy: 0 };
  const pts = [[d.x, d.y]];
  for (let i = 0; i < 600 && d.x < W && d.x > -50; i++) {
    superMove(s, d, DT / 2);
    d.x += d.vx * DT / 2; d.y += d.vy * DT / 2;
    pts.push([d.x, d.y]);
  }
  return pts;
}

// --- score -----------------------------------------------------------------

function goal(s, scorer, y, pushed) {
  const z = zoneAt(s, y);
  addPoints(s, scorer, z.pts, { k: 'goal', side: 1 - scorer, pts: z.pts, zi: z.i, y: Math.round(y), pushed: pushed ? 1 : 0 });
}

function addPoints(s, scorer, pts, ev) {
  s.score[scorer] += pts;
  ev.by = scorer; ev.score = s.score.slice();
  s.ev.push(ev);
  s.disc.mode = 'dead'; s.disc.owner = -1; s.disc.z = 0;
  for (const p of s.players) { calm(p); setAnim(p, p.side === scorer ? 'win' : 'lose'); }
  s.heat = 0;
  s.server = 1 - scorer;                 // celui qui encaisse sert
  s.phase = 'point'; s.phaseT = 1.5;
  if (s.sudden || s.score[scorer] >= s.rules.setPoints) s.pend = 'setend';
}

function timeUp(s) {
  s.ev.push({ k: 'timeup' });
  s.disc.mode = 'dead'; s.disc.owner = -1;
  for (const p of s.players) { calm(p); setAnim(p, 'idle'); }
  s.phase = 'point'; s.phaseT = 1.3; s.pend = 'setend';
}

function endSet(s) {
  const [a, b] = s.score;
  let w = -1;
  if (a > b) w = 0; else if (b > a) w = 1;
  if (w >= 0) s.sets[w]++; else { s.sets[0]++; s.sets[1]++; }
  s.ev.push({ k: 'setend', w, n: s.setNo, sets: s.sets.slice(), score: [a, b] });
  s.phase = 'setend'; s.phaseT = 2.6;
}

function afterSet(s) {
  const [A, B] = s.sets, N = s.rules.setsToWin;
  if ((A >= N || B >= N) && A !== B) {
    s.winner = A > B ? 0 : 1;
    s.phase = 'over';
    s.ev.push({ k: 'over', w: s.winner, sets: s.sets.slice() });
    return;
  }
  if (A >= N && B >= N) s.sudden = true;   // égalité parfaite : mort subite
  s.setNo++;
  s.score = [0, 0]; s.time = s.rules.setTime;
  s.server = (s.setNo + 1) % 2;
  s.phase = 'intro'; s.phaseT = 2.0; s.fresh = true;
  s.disc.mode = 'none';
  place(s);
}

// --- réseau ----------------------------------------------------------------

export function snapshot(s) {
  return JSON.stringify(s, (k, v) => {
    if (k.charCodeAt(0) === 95) return undefined;      // champs privés : _hist…
    if (typeof v === 'number' && !Number.isInteger(v)) return Math.round(v * 100) / 100;
    return v;
  });
}
