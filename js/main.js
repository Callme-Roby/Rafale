// Rafale — l'application : écrans, modes de jeu, boucle, liaison en ligne.

import { CHARS, COURTS, LEVELS, charById, courtById } from './data.js';
import { newMatch, step, snapshot, DT } from './sim.js';
import { makeAI, aiInput } from './ai.js';
import { Renderer, drawCourtThumb } from './render.js';
import { Input } from './input.js';
import { Link, newCode } from './net.js';
import * as sfx from './audio.js';
import { toneSVG, trajSVG, rulesSVG } from './art.js';

const $ = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => [...el.querySelectorAll(q)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

const input = new Input();
const R = new Renderer($('#stage'));

const app = {
  screen: 'home',
  mode: null,                 // solo | local | host | guest
  picks: ['zephyr', 'bora'],
  court: 'gazon',
  level: 1,
  link: null, code: null, peer: false, hostReady: false, netError: '',
  sim: null,                  // la simulation (hôte, solo, local)
  view: null,                 // l'état affiché (chez l'invité : le dernier reçu)
  ai: null, me: 0, paused: false, over: false, cfg: null,
  remote: { x: 0, y: 0, ac: 0, bc: 0 },
  wasd: (navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'ZQSD' : 'WASD',
};
window.rafale = app;          // pratique pour bidouiller depuis la console

// --- préférences -----------------------------------------------------------

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('rafale-prefs') || '{}');
    if (CHARS.some((c) => c.id === p.me)) app.picks[0] = p.me;
    if (CHARS.some((c) => c.id === p.other)) app.picks[1] = p.other;
    if (COURTS.some((c) => c.id === p.court)) app.court = p.court;
    if (LEVELS.some((l) => l.id === p.level)) app.level = p.level;
  } catch { /* pas de stockage : on garde les valeurs par défaut */ }
}
function savePrefs() {
  if (app.mode === 'guest') return;
  try { localStorage.setItem('rafale-prefs', JSON.stringify({ me: app.picks[0], other: app.picks[1], court: app.court, level: app.level })); } catch { /* tant pis */ }
}

// --- petites aides ---------------------------------------------------------

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3600);
}

function syncMute() {
  const m = sfx.isMuted();
  for (const b of $$('[data-mute]')) { b.textContent = m ? 'Remettre le son' : 'Couper le son'; b.setAttribute('aria-pressed', String(m)); }
}

function show(screen) {
  app.screen = screen;
  $('#home').hidden = screen !== 'home';
  $('#versus').hidden = screen !== 'versus';
  $('#match').hidden = screen !== 'match';
  document.body.classList.toggle('playing', screen !== 'home');
  input.active = screen === 'match';
  if (screen === 'home') scrollTo(0, 0);
}

function hudHeight() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud')) || 60;
}

function bars(n) {
  let s = '<span class="bar" aria-hidden="true">';
  for (let i = 1; i <= 5; i++) s += `<i${i <= n ? ' class="on"' : ''}></i>`;
  return s + `</span><span class="sr">${n} sur 5</span>`;
}

// --- accueil ---------------------------------------------------------------

function buildHome() {
  $('#rules-fig').innerHTML = rulesSVG();
  $('#wind-grid').innerHTML = CHARS.map((c) => `
    <article class="wind" style="--c:${c.color};--i:${c.ink}">
      ${toneSVG(c)}
      <div class="art">${trajSVG(c)}</div>
      <h3>${c.name} <span class="no" aria-hidden="true">${c.no}</span></h3>
      <p>${c.blurb}</p>
      <div class="bars"><span>Vitesse</span>${bars(c.speed)}<span>Puissance</span>${bars(c.power)}</div>
      <p class="sup">${c.supName}. ${c.supBlurb}</p>
    </article>`).join('');
  for (const k of $$('[data-wasd]')) k.textContent = app.wasd;
}

let attract = null, attractAI = null;
function newAttract() {
  const a = CHARS[Math.floor(Math.random() * CHARS.length)];
  let b = a; while (b === a) b = CHARS[Math.floor(Math.random() * CHARS.length)];
  attract = newMatch({ court: 'stade', chars: [a.id, b.id] });
  attractAI = [makeAI(2), makeAI(2)];
  if (reduced) for (let i = 0; i < 230; i++) step(attract, [aiInput(attract, 0, attractAI[0]), aiInput(attract, 1, attractAI[1])]);
}

// --- choix des vents et du terrain -----------------------------------------

const TITLES = { solo: 'Contre l’ordi', local: 'À deux sur ce clavier', host: 'Partie en ligne', guest: 'Partie en ligne' };

function labels() {
  switch (app.mode) {
    case 'solo': return ['Toi', 'L’ordi'];
    case 'local': return ['Joueur 1', 'Joueur 2'];
    case 'host': return ['Toi', 'Ton adversaire'];
    default: return ['Ton adversaire', 'Toi'];
  }
}
function canPick(i) {
  if (app.mode === 'host') return i === 0;
  if (app.mode === 'guest') return i === 1 && app.peer;
  return true;
}
function inviteUrl() {
  const u = new URL(location.href);
  u.hash = ''; u.searchParams.set('partie', app.code);
  return u.toString();
}

function renderWait(el, i) {
  el.className = `half half-${i} wait`;
  el.style.removeProperty('--c'); el.style.removeProperty('--i');
  let h;
  if (app.mode === 'host') {
    if (app.netError) h = `<h2>Hors ligne</h2><p>${app.netError}</p><button type="button" class="ghost" data-act="retry-host">Réessayer</button>`;
    else if (!app.hostReady) h = '<h2>Ouverture</h2><p class="dots">On prépare ta partie</p>';
    else h = `<h2>Invite un ami</h2>
      <p>Envoie-lui ce lien. La partie démarre ici dès qu’il l’ouvre.</p>
      <div class="invite"><input id="invite-url" readonly value="${inviteUrl()}" aria-label="Lien d’invitation"><button type="button" data-act="copy">Copier le lien</button></div>
      <p class="dots">En attente de ton adversaire</p>`;
  } else if (app.netError) {
    h = `<h2>Raté</h2><p>${app.netError}</p><button type="button" class="ghost" data-act="home">Retour à l’accueil</button>`;
  } else {
    h = '<h2>Connexion</h2><p class="dots">On rejoint la partie</p>';
  }
  el.innerHTML = `<p class="who">${labels()[i]}</p><div class="body">${h}</div>`;
}

function renderHalf(i) {
  const el = $('#half' + i);
  const waiting = (app.mode === 'host' && i === 1 && !app.peer) || (app.mode === 'guest' && i === 0 && !app.peer);
  if (waiting) return renderWait(el, i);
  const c = charById(app.picks[i]);
  const can = canPick(i);
  const keys = app.mode === 'local' ? `<em>${i === 0 ? `${app.wasd}, F, G` : 'Flèches, K, L'}</em>` : '';
  el.className = `half half-${i}`;
  el.style.setProperty('--c', c.color); el.style.setProperty('--i', c.ink);
  el.innerHTML = `${toneSVG(c, i === 1)}
    <p class="who">${labels()[i]} ${keys}</p>
    <div class="body">
      <h2 class="name">${c.name}</h2>
      <div class="info">
        <div class="txt">
          <p class="blurb">${c.blurb}</p>
          <div class="bars"><span>Vitesse</span>${bars(c.speed)}<span>Puissance</span>${bars(c.power)}</div>
          <p class="sup">Tir spécial : ${c.supName.toLowerCase()}. ${c.supBlurb}</p>
        </div>
        <div class="art">${trajSVG(c, i === 1)}</div>
      </div>
      <div class="picks" role="group" aria-label="Vent de : ${labels()[i]}">
        ${CHARS.map((k) => `<button type="button" class="pick" style="--pc:${k.color};--pi:${k.ink}" data-pick="${i}:${k.id}" aria-pressed="${k.id === c.id}" aria-label="${k.name}" title="${k.name}"${can ? '' : ' disabled'}>${k.no}</button>`).join('')}
      </div>
    </div>`;
}

function renderBar() {
  const host = app.mode !== 'guest';
  $('#court-row').innerHTML = COURTS.map((c) => `
    <button type="button" class="court" data-court="${c.id}" aria-pressed="${c.id === app.court}"${host ? '' : ' disabled'}>
      <canvas></canvas><span>${c.name}<small>${c.blurb}</small></span>
    </button>`).join('');
  $$('#court-row .court').forEach((b) => drawCourtThumb($('canvas', b), courtById(b.dataset.court)));
  $('#levels').hidden = app.mode !== 'solo';
  $('#level-row').innerHTML = LEVELS.map((l) => `<button type="button" class="level" data-level="${l.id}" aria-pressed="${l.id === app.level}">${l.name}</button>`).join('');
  const go = $('#go'), note = $('#go-note');
  go.hidden = app.mode === 'guest';
  go.disabled = app.mode === 'host' && !app.peer;
  note.textContent = app.mode === 'guest' ? (app.peer ? 'L’hôte choisit le terrain et lance la partie.' : '')
    : app.mode === 'host' ? (app.peer ? 'Ton adversaire est là.' : 'Il manque ton adversaire.') : '';
}

function renderVersus() {
  $('#vs-title').textContent = TITLES[app.mode] || '';
  renderHalf(0); renderHalf(1); renderBar();
}

function openVersus(mode) {
  app.mode = mode;
  renderVersus();
  show('versus');
}

function goHome() {
  if (app.link) { app.link.close(); app.link = null; }
  app.peer = false; app.hostReady = false; app.netError = ''; app.code = null; app.sim = null; app.view = null;
  const wasGuest = app.mode === 'guest';
  app.mode = null;
  if (new URLSearchParams(location.search).has('partie')) {
    const u = new URL(location.href); u.searchParams.delete('partie'); history.replaceState(null, '', u);
  }
  if (wasGuest) loadPrefs();
  show('home');
}

// --- en ligne --------------------------------------------------------------

function sendLobby() {
  if (app.link) app.link.send({ t: 'lobby', picks: app.picks, court: app.court });
}

function wire(link) {
  link.onOpen = () => {
    app.peer = true; app.netError = '';
    if (app.mode === 'host') { sendLobby(); toast('Ton adversaire est là.'); }
    else link.send({ t: 'pick', ch: app.picks[1] });
    if (app.screen === 'versus') renderVersus();
  };
  link.onMessage = onNet;
  link.onClose = peerLost;
  link.onError = (e) => console.warn('[rafale] liaison', e && (e.type || e.message));
}

function onNet(m) {
  if (!m || typeof m !== 'object') return;
  if (app.mode === 'host') {
    if (m.t === 'i') {
      app.remote = { x: +m.x || 0, y: +m.y || 0, ac: m.ac | 0, bc: m.bc | 0 };
    } else if (m.t === 'pick' && CHARS.some((c) => c.id === m.ch)) {
      app.picks[1] = m.ch; sendLobby();
      if (app.screen === 'versus') { renderHalf(1); }
    }
    return;
  }
  // invité
  switch (m.t) {
    case 's':
      if (app.screen === 'match' && m.s) { app.view = m.s; onEvents(m.s.ev || [], m.s); }
      break;
    case 'lobby':
      if (Array.isArray(m.picks) && m.picks.every((id) => CHARS.some((c) => c.id === id))) app.picks = m.picks.slice(0, 2);
      if (COURTS.some((c) => c.id === m.court)) app.court = m.court;
      if (app.screen !== 'versus') show('versus');
      renderVersus();
      break;
    case 'start':
      if (m.cfg && COURTS.some((c) => c.id === m.cfg.court)) beginMatch(m.cfg);
      break;
    case 'full':
      app.netError = 'Cette partie est déjà complète.'; app.peer = false; renderVersus();
      break;
    default:
  }
}

function peerLost() {
  app.peer = false;
  if (app.mode === 'host') {
    toast('Ton adversaire a quitté la partie.');
    app.sim = null; app.view = null;
    renderVersus(); show('versus');
  } else if (app.mode === 'guest') {
    app.netError = 'L’hôte a quitté la partie.';
    app.view = null;
    renderVersus(); show('versus');
  }
}

async function startHost() {
  app.peer = false; app.hostReady = false; app.netError = '';
  openVersus('host');
  for (let tries = 0; tries < 3; tries++) {
    if (app.link) app.link.close();
    app.code = newCode();
    const link = (app.link = new Link());
    wire(link);
    try {
      await link.host(app.code);
      if (app.link !== link) return;
      app.hostReady = true; renderVersus();
      return;
    } catch (e) {
      if (app.link !== link) return;
      if (e && e.type === 'unavailable-id') continue;
      break;
    }
  }
  app.netError = 'Impossible d’ouvrir la partie. Vérifie ta connexion, puis réessaie.';
  renderVersus();
}

async function startGuest(code) {
  app.peer = false; app.netError = ''; app.code = code;
  openVersus('guest');
  const link = (app.link = new Link());
  wire(link);
  try { await link.join(code); }
  catch (e) {
    if (app.link !== link) return;
    app.netError = e && e.type === 'peer-unavailable'
      ? 'Cette partie n’existe plus. Demande un nouveau lien à ton ami.'
      : 'Connexion impossible. Vérifie ta connexion, puis rouvre le lien.';
    renderVersus();
  }
}

// --- match -----------------------------------------------------------------

const hud = { s0: -1, s1: -1, clock: '', p0: '', p1: '' };

function who(side) {
  if (app.mode === 'local') return `le joueur ${side + 1}`;
  if (app.me === side) return 'toi';
  return charById(app.view.players[side].ch).name;
}

function setupHud(cfg) {
  cfg.chars.forEach((id, i) => {
    const c = charById(id);
    const tag = app.mode === 'local' ? `<em>J${i + 1}</em>` : app.me === i ? '<em>toi</em>' : '';
    const dot = `<i style="--c:${c.color}"></i>`;
    const nm = `<span class="nm">${c.name}</span>`;
    $('#n' + i).innerHTML = i === 0 ? `${dot}${nm}${tag}` : `${tag}${nm}${dot}`;
  });
  hud.s0 = hud.s1 = -1; hud.clock = ''; hud.p0 = hud.p1 = '';
}

function updateHud(s) {
  if (s.score[0] !== hud.s0) { hud.s0 = s.score[0]; $('#sc0').textContent = String(hud.s0).padStart(2, '0'); }
  if (s.score[1] !== hud.s1) { hud.s1 = s.score[1]; $('#sc1').textContent = String(hud.s1).padStart(2, '0'); }
  const clock = s.sudden ? '∞' : String(Math.ceil(s.time));
  if (clock !== hud.clock) {
    hud.clock = clock;
    const el = $('#clock'); el.textContent = clock;
    el.classList.toggle('low', !s.sudden && s.time <= 5);
  }
  for (const i of [0, 1]) {
    const key = s.sets[i] + '/' + Math.max(2, s.sets[0], s.sets[1]);
    if (key !== hud['p' + i]) {
      hud['p' + i] = key;
      let h = '';
      for (let k = 0; k < Math.max(2, s.sets[0], s.sets[1]); k++) h += `<i${k < s.sets[i] ? ' class="on"' : ''}></i>`;
      $('#pips' + i).innerHTML = h + `<span class="sr">${s.sets[i]} set${s.sets[i] > 1 ? 's' : ''}</span>`;
    }
  }
}

function call(main, sub = '', bg = 'var(--encre)', fg = 'var(--craie)', dur = 1.3) {
  const el = $('#call');
  $('#call-main').textContent = main; $('#call-sub').textContent = sub;
  el.style.setProperty('--bg', bg); el.style.setProperty('--fg', fg); el.style.setProperty('--dur', dur + 's');
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}

function onEvents(evs, s) {
  if (!evs.length) return;
  R.events(evs, s);
  sfx.play(evs);
  for (const e of evs) {
    switch (e.k) {
      case 'set': call('Set ' + e.n, `${s.rules.setPoints} points ou ${s.rules.setTime} secondes`, 'var(--encre)', 'var(--craie)', 1.7); break;
      case 'sudden': call('Mort subite', 'Le premier point gagne', 'var(--corail)', 'var(--craie)', 1.8); break;
      case 'goal':
        call(e.pts + ' points', (e.pushed ? 'Emporté dans son but. ' : '') + 'Pour ' + who(e.by), e.pts === 5 ? 'var(--corail)' : 'var(--soleil)', e.pts === 5 ? 'var(--craie)' : 'var(--encre)');
        break;
      case 'miss': call('Au sol', `${e.pts} points pour ${who(e.by)}`, 'var(--craie)', 'var(--encre)'); break;
      case 'timeup': call('Temps', 'Le chrono est à zéro', 'var(--encre)', 'var(--craie)', 1.2); break;
      case 'setend':
        if (!s.sudden) call(e.w < 0 ? 'Set partagé' : 'Set ' + e.n, e.w < 0 ? `${e.score[0]} partout, un set chacun` : `Pour ${who(e.w)}, ${e.score[e.w]} à ${e.score[1 - e.w]}`, 'var(--outremer)', 'var(--craie)', 2.2);
        break;
      default:
    }
  }
}

function hintText() {
  if (coarse) return '';
  if (app.mode === 'local') return `Joueur 1 <kbd>${app.wasd}</kbd><kbd>F</kbd><kbd>G</kbd> Joueur 2 <kbd>Flèches</kbd><kbd>K</kbd><kbd>L</kbd>`;
  return '<kbd>Flèches</kbd> bouger <kbd>Espace</kbd> tirer, glisser <kbd>C</kbd> lober, contrer';
}

let acc = 0, hintTimer = 0;

function beginMatch(cfg) {
  app.cfg = cfg; app.over = false; app.paused = false;
  app.me = app.mode === 'guest' ? 1 : app.mode === 'local' ? -1 : 0;
  R.reset();
  const fresh = newMatch(cfg);
  if (app.mode === 'guest') { app.sim = null; app.view = fresh; }
  else { app.sim = fresh; app.view = fresh; app.ai = app.mode === 'solo' ? makeAI(app.level) : null; }
  app.remote = { x: 0, y: 0, ac: 0, bc: 0 };
  acc = 0;
  setupHud(cfg);
  $('#pause').hidden = true; $('#result').hidden = true;
  $('#call').classList.remove('show');
  $('#touch').hidden = !(coarse && app.mode !== 'local');
  const hint = $('#hint');
  hint.innerHTML = hintText(); hint.classList.toggle('off', !hint.innerHTML);
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint.classList.add('off'), 9000);
  sfx.unlock();
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  show('match');
}

function startMatch() {
  const cfg = { court: app.court, chars: app.picks.slice() };
  if (app.mode === 'host') { if (!app.peer) return; app.link.send({ t: 'start', cfg }); }
  savePrefs();
  beginMatch(cfg);
}

function backToVersus() {
  app.sim = null; app.view = null;
  if (app.mode === 'host') sendLobby();
  renderVersus(); show('versus');
}

function showResult(s) {
  app.over = true;
  const w = s.winner, c = charById(s.players[w].ch);
  const el = $('#result');
  el.style.setProperty('--c', c.color); el.style.setProperty('--i', c.ink);
  const title = app.mode === 'local' ? `Joueur ${w + 1}` : app.me === w ? 'Gagné' : 'Perdu';
  $('#res-kicker').textContent = app.mode === 'local' ? 'Le match est pour' : `Victoire de ${c.name}`;
  $('#res-title').textContent = title;
  const a = s.sets[w], b = s.sets[1 - w];
  $('#res-sets').textContent = `${a} set${a > 1 ? 's' : ''} à ${b}`;
  const guest = app.mode === 'guest';
  $('#again').hidden = guest; $('#change').hidden = guest;
  $('#res-note').textContent = guest ? 'L’hôte peut relancer la partie ou changer de terrain.' : '';
  el.hidden = false;
  sfx.play([{ k: 'over' }]);
  focusSheet(el);
}

// le focus va sur le panneau, pas sur un bouton : la touche de tir ne doit rien valider par accident
function focusSheet(sheet) {
  const box = $('.sheet-in', sheet);
  box.tabIndex = -1; box.focus({ preventScroll: true });
}

function togglePause(force) {
  if (app.screen !== 'match' || app.over) return;
  const online = app.mode === 'host' || app.mode === 'guest';
  const open = force ?? $('#pause').hidden;
  $('#pause').hidden = !open;
  app.paused = open && !online;            // en ligne, la partie continue
  $('#pause-title').textContent = online ? 'Menu' : 'Pause';
  $('#resume').textContent = online ? 'Retour au match' : 'Reprendre';
  if (open) focusSheet($('#pause')); else if (document.activeElement) document.activeElement.blur();
}

// --- boucle ----------------------------------------------------------------

function tick() {
  const s = app.sim;
  let in0, in1;
  if (app.mode === 'solo') { in0 = input.read('solo'); in1 = aiInput(s, 1, app.ai); }
  else if (app.mode === 'local') { in0 = input.read('p1'); in1 = input.read('p2'); }
  else { in0 = input.read('solo'); in1 = app.remote; }
  const ev = step(s, [in0, in1]);
  if (app.mode === 'host' && app.link) app.link.sendState('{"t":"s","s":' + snapshot(s) + '}');
  onEvents(ev, s);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (app.screen === 'match' && app.view) {
    if (app.mode === 'guest') {
      const i = input.read('solo');
      if (app.link) app.link.send({ t: 'i', x: Math.round(i.x * 100) / 100, y: Math.round(i.y * 100) / 100, ac: i.ac, bc: i.bc });
    } else if (app.sim && !app.paused) {
      acc += dt;
      let n = 0;
      while (acc >= DT && n < 6) { tick(); acc -= DT; n++; if (!app.sim) break; }
      if (n === 6) acc = 0;
    }
    const s = app.view;
    if (s) {
      updateHud(s);
      R.draw(s, { me: app.me, top: hudHeight(), calm: reduced }, app.paused ? 0 : dt);
      if (s.phase === 'over' && !app.over) showResult(s);
    }
  } else if (app.screen === 'home' && scrollY < innerHeight * 1.05) {
    if (!attract || attract.phase === 'over') newAttract();
    if (!reduced) {
      acc += dt;
      let n = 0;
      while (acc >= DT && n < 6) { step(attract, [aiInput(attract, 0, attractAI[0]), aiInput(attract, 1, attractAI[1])]); R.events(attract.ev, attract); acc -= DT; n++; }
      if (n === 6) acc = 0;
    }
    R.draw(attract, { attract: true, title: 'RAFALE', me: -1, calm: true, top: $('.hero-top').offsetHeight, bottom: $('.modes').offsetHeight }, reduced ? 0 : dt);
  }
  requestAnimationFrame(frame);
}

// --- branchements ----------------------------------------------------------

function bind() {
  for (const b of $$('.modes [data-mode]')) {
    b.addEventListener('click', () => {
      sfx.unlock();
      const m = b.dataset.mode;
      if (m === 'host') startHost(); else openVersus(m);
    });
  }
  for (const b of $$('[data-mute]')) b.addEventListener('click', () => { sfx.setMuted(!sfx.isMuted()); syncMute(); });

  $('#versus').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.pick) {
      const [i, id] = t.dataset.pick.split(':');
      app.picks[+i] = id;
      if (app.mode === 'host') sendLobby();
      if (app.mode === 'guest' && app.link) app.link.send({ t: 'pick', ch: id });
      savePrefs(); renderHalf(+i);
      const again = $(`[data-pick="${i}:${id}"]`); if (again) again.focus();
    } else if (t.dataset.court) {
      app.court = t.dataset.court;
      if (app.mode === 'host') sendLobby();
      savePrefs();
      for (const b of $$('#court-row .court')) b.setAttribute('aria-pressed', String(b.dataset.court === app.court));
    } else if (t.dataset.level) {
      app.level = +t.dataset.level; savePrefs();
      for (const b of $$('#level-row .level')) b.setAttribute('aria-pressed', String(+b.dataset.level === app.level));
    } else if (t.dataset.act === 'copy') {
      const url = inviteUrl(), done = () => { t.textContent = 'Lien copié'; setTimeout(() => { t.textContent = 'Copier le lien'; }, 2000); };
      const fallback = () => { const f = $('#invite-url'); f.focus(); f.select(); try { document.execCommand('copy'); done(); } catch { toast('Sélectionne le lien et copie-le à la main.'); } };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback); else fallback();
    } else if (t.dataset.act === 'retry-host') startHost();
    else if (t.dataset.act === 'home') goHome();
  });
  $('#versus').addEventListener('focusin', (e) => { if (e.target.id === 'invite-url') e.target.select(); });
  $('#vs-back').addEventListener('click', goHome);
  $('#go').addEventListener('click', startMatch);

  $('#pause-btn').addEventListener('click', () => togglePause());
  $('#resume').addEventListener('click', () => togglePause(false));
  $('#quit').addEventListener('click', () => { $('#pause').hidden = true; if (app.mode === 'guest') goHome(); else backToVersus(); });
  $('#again').addEventListener('click', startMatch);
  $('#change').addEventListener('click', backToVersus);
  $('#res-home').addEventListener('click', goHome);
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && app.screen === 'match') { e.preventDefault(); togglePause(); }
    else if (e.code === 'Enter' && app.screen === 'versus' && !$('#go').hidden && !$('#go').disabled && !e.target.closest('button, input')) startMatch();
  });
  addEventListener('resize', () => R.resize());
  addEventListener('pagehide', () => { if (app.link) app.link.bye(); });
  input.bindTouch($('#stick'), $('#knob'), $('#ta'), $('#tb'));
}

async function boot() {
  loadPrefs();
  if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
    try {
      const map = await navigator.keyboard.getLayoutMap();
      const k = ['KeyW', 'KeyA', 'KeyS', 'KeyD'].map((c) => (map.get(c) || '').toUpperCase()).join('');
      if (k.length === 4) app.wasd = k;
    } catch { /* on garde la valeur devinée */ }
  }
  buildHome(); syncMute(); bind();
  try { await Promise.race([document.fonts.load('900 100px Archivo'), new Promise((r) => setTimeout(r, 1500))]); } catch { /* police de secours */ }
  const code = (new URLSearchParams(location.search).get('partie') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (code) startGuest(code);
  requestAnimationFrame((t) => { last = t; frame(t); });
}

boot();
