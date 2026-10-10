// Rafale — données du jeu : les six vents, les terrains, les règles.

export const INK = '#000000';
export const CHALK = '#FFFFFF';
export const CONCRETE = '#D4D6D9';
export const SUN = '#FFC928';
export const CORAL = '#FF4A2E';
export const COBALT = '#2238E8';

export const RULES = {
  setTime: 30,      // secondes par set
  setPoints: 12,    // score qui termine le set
  setsToWin: 2,     // sets gagnants
  missPoints: 2,    // disque tombé au sol
};

// vitesse / puissance sur 5. Deux rapides, deux équilibrés, deux puissants.
export const CHARS = [
  {
    id: 'zephyr', name: 'Zéphyr', no: 7, speed: 5, power: 1,
    color: '#FFC928', ink: '#000000', alt: '#FFF1B8', skin: '#F2C9A5', hair: '#231712',
    blurb: 'Partout à la fois. Le disque lui pèse un peu.',
    sup: 'serpent', supName: 'Le serpent', supBlurb: 'Ondule d’un mur à l’autre.',
  },
  {
    id: 'alize', name: 'Alizé', no: 11, speed: 4, power: 2,
    color: '#10B9A4', ink: '#000000', alt: '#B9F2E9', skin: '#8D5B3E', hair: '#111111',
    blurb: 'Régulier, rapide, jamais pris de court.',
    sup: 'boucle', supName: 'La boucle', supBlurb: 'Tourne sur lui-même en avançant.',
  },
  {
    id: 'sirocco', name: 'Sirocco', no: 3, speed: 3, power: 3,
    color: '#FF4A2E', ink: '#000000', alt: '#FFC2B6', skin: '#C98A5E', hair: '#3A1E10',
    blurb: 'Aucun point faible, aucune excuse.',
    sup: 'crochet', supName: 'Le crochet', supBlurb: 'File droit, puis vire d’un coup.',
  },
  {
    id: 'tramontane', name: 'Tramontane', no: 21, speed: 3, power: 3,
    color: '#A98BFF', ink: '#000000', alt: '#E2D8FF', skin: '#F0D2B6', hair: '#C9462B',
    blurb: 'Joue les murs mieux que personne.',
    sup: 'ricochet', supName: 'Le ricochet', supBlurb: 'Rebondit sec, trois fois plus vite.',
  },
  {
    id: 'mistral', name: 'Mistral', no: 9, speed: 2, power: 4,
    color: '#2238E8', ink: '#FFFFFF', alt: '#B8C0FF', skin: '#E8B58E', hair: '#E6D7A8',
    blurb: 'Lent à démarrer, dur à repousser.',
    sup: 'rasemur', supName: 'Le rase-mur', supBlurb: 'Longe la ligne et plonge au dernier moment.',
  },
  {
    id: 'bora', name: 'Bora', no: 44, speed: 1, power: 5,
    color: '#0B0B0B', ink: '#FFFFFF', alt: '#8A8A8A', skin: '#6B4530', hair: '#EDEDED',
    blurb: 'Trois pas par minute. Un tir suffit.',
    sup: 'comete', supName: 'La comète', supBlurb: 'S’arrête en l’air, puis part tout droit.',
  },
];

export function charById(id) { return CHARS.find(c => c.id === id) || CHARS[0]; }

export function stats(c) {
  return {
    move: 290 + c.speed * 23,        // unités / s
    dash: 720 + c.speed * 48,
    tmin: 500 + c.power * 22,        // tir mou (disque gardé trop longtemps)
    tmax: 980 + c.power * 52,        // tir franc
    res: 0.12 + c.power * 0.12,      // résistance au recul
    sup: 960 + c.power * 46,         // vitesse de base du tir spécial
  };
}

// zones : [part de la hauteur, points], du haut vers le bas.
export const COURTS = [
  {
    id: 'plage', name: 'Plage', w: 880, h: 440,
    blurb: 'Petit terrain, échanges courts.',
    zones: [[0.35, 3], [0.30, 5], [0.35, 3]],
    look: { apron: '#F6E2B3', surface: '#EEC57A', alt: '#E9BC6C', line: '#2238E8', paint: 'rgba(255,255,255,.34)', pattern: 'dunes', net: '#2238E8' },
  },
  {
    id: 'gazon', name: 'Gazon', w: 960, h: 500,
    blurb: 'Le classique. Le 5 est au centre.',
    zones: [[0.38, 3], [0.24, 5], [0.38, 3]],
    look: { apron: '#0C6B3B', surface: '#1E9F57', alt: '#23AD60', line: '#FFFFFF', paint: 'rgba(255,255,255,.16)', pattern: 'stripes', net: '#FFFFFF' },
  },
  {
    id: 'dalles', name: 'Dalles', w: 960, h: 500,
    blurb: 'Les 5 points sont dans les coins.',
    zones: [[0.2, 5], [0.6, 3], [0.2, 5]],
    look: { apron: '#0B5F5C', surface: '#F0A49B', alt: '#EC978D', line: '#FFFFFF', paint: 'rgba(255,255,255,.3)', pattern: 'checker', net: '#FFFFFF' },
  },
  {
    id: 'beton', name: 'Béton', w: 1040, h: 540,
    blurb: 'Deux plots sur la ligne du filet.',
    zones: [[0.37, 3], [0.26, 5], [0.37, 3]],
    posts: [0.25, 0.75],
    look: { apron: '#7C8085', surface: '#B9BCBF', alt: '#B0B3B7', line: '#FFC928', paint: 'rgba(0,0,0,.09)', pattern: 'speckle', net: '#FFC928' },
  },
  {
    id: 'stade', name: 'Stade', w: 1040, h: 560,
    blurb: 'Grand terrain, cinq zones.',
    zones: [[0.13, 5], [0.30, 3], [0.14, 5], [0.30, 3], [0.13, 5]],
    look: { apron: '#FF4A2E', surface: '#2238E8', alt: '#2640F2', line: '#FFFFFF', paint: 'rgba(255,255,255,.13)', pattern: 'plain', net: '#FFFFFF' },
  },
];

export function courtById(id) { return COURTS.find(c => c.id === id) || COURTS[0]; }

export const LEVELS = [
  { id: 0, name: 'Tranquille' },
  { id: 1, name: 'Sérieux' },
  { id: 2, name: 'Sans pitié' },
];
