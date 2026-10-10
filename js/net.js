// Rafale — la liaison entre les deux joueurs.
// Connexion directe de navigateur à navigateur (WebRTC). Le site reste 100 % statique :
// seul l'échange initial passe par le service public gratuit de PeerJS.

const PREFIX = 'rafale-club-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // sans 0/O, 1/I/L

export function newCode() {
  let c = '';
  const r = crypto.getRandomValues(new Uint8Array(5));
  for (const n of r) c += ALPHABET[n % ALPHABET.length];
  return c;
}

function peerOptions() {
  // ?signal=hôte:port pour tester avec son propre serveur PeerJS
  const q = new URLSearchParams(location.search).get('signal');
  if (!q) return { debug: 1 };
  const [host, port] = q.split(':');
  return { host, port: Number(port) || 9000, path: '/', secure: false, debug: 1 };
}

export class Link {
  constructor() {
    this.peer = null; this.conn = null;
    this.onMessage = () => {}; this.onOpen = () => {}; this.onClose = () => {}; this.onError = () => {};
    this.closed = false; this.seen = 0; this.beat = null;
  }

  get ready() { return !!(this.conn && this.conn.open); }

  // l'hôte ouvre une partie et attend son invité
  host(code) {
    return new Promise((resolve, reject) => {
      const peer = new window.Peer(PREFIX + code, peerOptions());
      this.peer = peer;
      let opened = false;
      peer.on('open', () => { opened = true; resolve(code); });
      peer.on('error', (err) => {
        if (!opened) { reject(err); try { peer.destroy(); } catch { /* déjà détruit */ } } else this.onError(err);
      });
      // la partie en cours ne passe pas par le serveur : on se rebranche juste pour rester joignable
      peer.on('disconnected', () => {
        if (opened) setTimeout(() => { if (!this.closed && !peer.destroyed && peer.disconnected) peer.reconnect(); }, 2500);
      });
      peer.on('connection', (conn) => {
        if (this.conn && this.conn.open) { conn.on('open', () => { conn.send(JSON.stringify({ t: 'full' })); setTimeout(() => conn.close(), 300); }); return; }
        this.adopt(conn);
      });
    });
  }

  // l'invité rejoint la partie
  join(code) {
    return new Promise((resolve, reject) => {
      const peer = new window.Peer(undefined, peerOptions());
      this.peer = peer;
      let done = false;
      const fail = (err) => { if (!done) { done = true; clearTimeout(timer); reject(err); try { peer.destroy(); } catch { /* déjà détruit */ } } else this.onError(err); };
      const timer = setTimeout(() => fail(Object.assign(new Error('timeout'), { type: 'timeout' })), 15000);
      peer.on('error', fail);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
        this.adopt(conn, () => { clearTimeout(timer); done = true; resolve(); });
      });
    });
  }

  adopt(conn, opened) {
    this.conn = conn;
    conn.on('open', () => { this.seen = performance.now(); this.watch(); if (opened) opened(); this.onOpen(); });
    conn.on('data', (raw) => {
      this.seen = performance.now();
      let m; try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
      if (!m || m.t === 'p') return;                       // simple battement de cœur
      if (m.t === 'bye') { this.drop(); return; }          // l'autre a fermé sa page
      this.onMessage(m);
    });
    conn.on('close', () => { if (this.conn === conn) { this.conn = null; if (!this.closed) this.onClose(); } });
    conn.on('error', (e) => this.onError(e));
  }

  // un battement par seconde ; sept secondes de silence = l'autre est parti
  watch() {
    if (this.beat) return;
    this.beat = setInterval(() => {
      if (!this.ready) return;
      this.conn.send('{"t":"p"}');
      if (performance.now() - this.seen > 7000) this.drop();
    }, 1000);
  }

  drop() {
    const c = this.conn;
    if (!c) return;
    this.conn = null;
    try { c.close(); } catch { /* déjà fermé */ }
    if (!this.closed) this.onClose();
  }

  bye() { if (this.ready) { try { this.conn.send('{"t":"bye"}'); } catch { /* trop tard */ } } }

  send(obj) { if (this.ready) this.conn.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); }

  // les états de jeu partent 60 fois par seconde : on saute si le tuyau est plein
  sendState(str) {
    if (!this.ready) return;
    const dc = this.conn.dataChannel;
    if (dc && dc.bufferedAmount > 60000) return;
    this.conn.send(str);
  }

  close() {
    this.bye();
    this.closed = true;
    clearInterval(this.beat); this.beat = null;
    try { if (this.conn) this.conn.close(); } catch { /* déjà fermé */ }
    try { if (this.peer) this.peer.destroy(); } catch { /* déjà détruit */ }
    this.conn = null; this.peer = null;
  }
}
