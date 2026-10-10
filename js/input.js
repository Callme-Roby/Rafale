// Rafale — entrées : clavier, manette, tactile. Chaque joueur = une direction + deux boutons.
// Les boutons sont transmis comme des compteurs d'appuis : aucun appui ne se perd en route.

const SCHEMES = {
  // un seul joueur sur ce clavier : les deux mains au choix
  solo: {
    up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
    a: ['Space', 'KeyX', 'KeyJ'], b: ['KeyC', 'KeyK', 'ShiftLeft', 'ShiftRight'],
  },
  p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], a: ['KeyF'], b: ['KeyG'] },
  p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], a: ['KeyK'], b: ['KeyL'] },
};
const GAME_KEYS = new Set(Object.values(SCHEMES).flatMap((s) => Object.values(s).flat()));

export class Input {
  constructor() {
    this.down = new Set();
    this.count = {};
    this.active = false;                 // vrai pendant un match : on bloque le défilement
    this.touch = { x: 0, y: 0, a: 0, b: 0, on: false };
    this.padPrev = [{}, {}];
    this.padCount = [{ a: 0, b: 0 }, { a: 0, b: 0 }];
    addEventListener('keydown', (e) => {
      if (this.active && GAME_KEYS.has(e.code) && !e.metaKey && !e.ctrlKey) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.count[e.code] = (this.count[e.code] || 0) + 1;
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }

  any(codes) { for (const c of codes) if (this.down.has(c)) return true; return false; }
  sum(codes) { let n = 0; for (const c of codes) n += this.count[c] || 0; return n; }

  pad(i) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const list = []; for (const p of pads) if (p && p.connected) list.push(p);
    const g = list[i];
    if (!g) return null;
    let x = Math.abs(g.axes[0]) > 0.28 ? g.axes[0] : 0, y = Math.abs(g.axes[1]) > 0.28 ? g.axes[1] : 0;
    const b = (n) => !!(g.buttons[n] && g.buttons[n].pressed);
    if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = -1; if (b(13)) y = 1;
    const a = b(0) || b(2) || b(7), bb = b(1) || b(3) || b(5);
    const prev = this.padPrev[i], cnt = this.padCount[i];
    if (a && !prev.a) cnt.a++; if (bb && !prev.b) cnt.b++;
    prev.a = a; prev.b = bb;
    return { x, y, a: cnt.a, b: cnt.b };
  }

  // scheme : 'solo' | 'p1' | 'p2'
  read(scheme) {
    const k = SCHEMES[scheme];
    let x = (this.any(k.right) ? 1 : 0) - (this.any(k.left) ? 1 : 0);
    let y = (this.any(k.down) ? 1 : 0) - (this.any(k.up) ? 1 : 0);
    let ac = this.sum(k.a), bc = this.sum(k.b);
    const g = this.pad(scheme === 'p2' ? 1 : 0);
    if (g) { if (g.x || g.y) { x = g.x; y = g.y; } ac += g.a; bc += g.b; }
    if (scheme === 'solo' && this.touch.on) {
      if (this.touch.x || this.touch.y) { x = this.touch.x; y = this.touch.y; }
      ac += this.touch.a; bc += this.touch.b;
    }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y, ac, bc };
  }

  // manette tactile : un stick à gauche, deux boutons à droite
  bindTouch(stick, knob, btnA, btnB) {
    let id = null, ox = 0, oy = 0;
    const R = 52;
    const set = (e) => {
      const t = [...e.changedTouches].find((q) => q.identifier === id);
      if (!t) return;
      let dx = t.clientX - ox, dy = t.clientY - oy;
      const m = Math.hypot(dx, dy);
      if (m > R) { dx = (dx / m) * R; dy = (dy / m) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const dead = 0.3, nx = dx / R, ny = dy / R;
      this.touch.x = Math.abs(nx) > dead ? nx : 0; this.touch.y = Math.abs(ny) > dead ? ny : 0;
    };
    stick.addEventListener('touchstart', (e) => {
      e.preventDefault(); this.touch.on = true;
      const t = e.changedTouches[0]; id = t.identifier;
      const r = stick.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + r.height / 2;
      set(e);
    }, { passive: false });
    stick.addEventListener('touchmove', (e) => { e.preventDefault(); set(e); }, { passive: false });
    const end = (e) => {
      if (![...e.changedTouches].some((q) => q.identifier === id)) return;
      id = null; this.touch.x = 0; this.touch.y = 0; knob.style.transform = '';
    };
    stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);
    const press = (el, key) => el.addEventListener('touchstart', (e) => {
      e.preventDefault(); this.touch.on = true; this.touch[key]++;
      el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 110);
    }, { passive: false });
    press(btnA, 'a'); press(btnB, 'b');
  }
}
