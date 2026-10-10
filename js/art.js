// Rafale — images générées : affiches des vents et schéma des règles (SVG).

import { traceSuper, GOAL_DEPTH } from './sim.js';
import { SUN, CORAL, INK, CHALK } from './data.js';

const W = 960, H = 500;

function disc(x, y, r, o = 1) {
  return `<g opacity="${o}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${CHALK}" stroke="${INK}" stroke-width="3"/>` +
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.56).toFixed(1)}" fill="none" stroke="${CORAL}" stroke-width="${(r * 0.26).toFixed(1)}"/></g>`;
}

// trame de points : plus gros près du foyer
function halftone(fx, fy, reach, max, color, step = 24) {
  let out = '';
  let row = 0;
  for (let y = -10; y < H + 20; y += step * 0.866, row++) {
    for (let x = (row % 2 ? step / 2 : 0) - 60; x < W + 70; x += step) {
      const r = max * (1 - Math.hypot(x - fx, y - fy) / reach);
      if (r > 0.7) out += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}"/>`;
    }
  }
  return `<g fill="${color}">${out}</g>`;
}

// L'affiche d'un vent : une trame plein cadre + la trajectoire de son tir spécial,
// tracée par la vraie simulation.
export function toneSVG(c, mirror = false) {
  const soft = c.ink === '#FFFFFF' ? 'rgba(255,255,255,.17)' : 'rgba(0,0,0,.14)';
  return `<svg class="tone" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${halftone(mirror ? W * 0.16 : W * 0.84, H * 0.12, 700, 11, soft)}</svg>`;
}

export function trajSVG(c, mirror = false) {
  const pts = traceSuper(c.sup, W, H, -1);
  const cy = (y) => Math.max(14, Math.min(H - 14, y));
  const path = pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1)
    .map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + cy(p[1]).toFixed(1)).join('');
  const ink = c.ink;
  const ghosts = [0.2, 0.4, 0.6, 0.8].map((f, i) => {
    const p = pts[Math.floor(f * (pts.length - 1))];
    return disc(p[0], cy(p[1]), 15, 0.3 + i * 0.14);
  }).join('');
  const end = pts[pts.length - 1];
  const flip = mirror ? `transform="translate(${W} 0) scale(-1 1)"` : '';
  return `<svg class="traj" viewBox="-34 -34 ${W + 68} ${H + 68}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
  <g ${flip}>
    <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${ink}" stroke-width="6"/>
    <line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}" stroke="${ink}" stroke-width="6" stroke-dasharray="16 12"/>
    <path d="${path}" fill="none" stroke="${ink}" stroke-width="15" stroke-linejoin="round" stroke-linecap="round"/>
    ${ghosts}
    ${disc(pts[0][0], pts[0][1], 20, 1)}
    ${disc(Math.min(end[0], W), cy(end[1]), 28)}
  </g>
</svg>`;
}

// Le schéma des règles : un terrain, les trois façons de marquer.
export function rulesSVG() {
  const zones = [[0.38, 3], [0.24, 5], [0.38, 3]];
  const gd = GOAL_DEPTH + 14;
  let goals = '';
  for (const side of [0, 1]) {
    const x0 = side === 0 ? -gd : W;
    let y = 0;
    for (const [f, pts] of zones) {
      const zh = f * H;
      goals += `<rect x="${x0}" y="${y}" width="${gd}" height="${zh}" fill="${pts === 5 ? CORAL : SUN}" stroke="${INK}" stroke-width="4"/>` +
        `<text x="${x0 + gd / 2}" y="${y + zh / 2 + 24}" text-anchor="middle" class="sv-num" fill="${pts === 5 ? CHALK : INK}">${pts}</text>`;
      y += zh;
    }
  }
  // un tir avec rebond vers le 5, et un lob qui retombe
  const shot = `M250 330 L560 ${H - 10} L${W} 258`;
  const lob = 'M250 170 Q470 -150 730 140';
  return `<svg viewBox="${-gd - 6} -20 ${W + gd * 2 + 12} ${H + 40}" role="img" aria-label="Schéma du terrain : zones à 3 et 5 points derrière chaque joueur, 2 points quand le disque tombe au sol.">
  <rect x="0" y="0" width="${W}" height="${H}" fill="${CHALK}"/>
  ${halftone(730, 140, 330, 9, 'rgba(0,0,0,.2)', 22)}
  <rect x="2.5" y="2.5" width="${W - 5}" height="${H - 5}" fill="none" stroke="${INK}" stroke-width="5"/>
  <line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}" stroke="${INK}" stroke-width="6" stroke-dasharray="14 10"/>
  <rect x="${-gd - 2}" y="-14" width="${W + gd * 2 + 4}" height="14" fill="${INK}"/>
  <rect x="${-gd - 2}" y="${H}" width="${W + gd * 2 + 4}" height="14" fill="${INK}"/>
  ${goals}
  <path d="${shot}" fill="none" stroke="${INK}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="${lob}" fill="none" stroke="${INK}" stroke-width="7" stroke-dasharray="4 16" stroke-linecap="round"/>
  <circle cx="730" cy="140" r="40" fill="none" stroke="${INK}" stroke-width="5" stroke-dasharray="10 8"/>
  <text x="730" y="164" text-anchor="middle" class="sv-num sv-big" fill="${INK}">2</text>
  ${disc(250, 330, 22)}
  ${disc(250, 170, 22)}
  ${disc(W - 6, 258, 26)}
</svg>`;
}
