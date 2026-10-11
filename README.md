# Rafale — club de disque

Un jeu de disque à deux dans le navigateur : un but de chaque côté, des zones à 3 et 5 points,
2 points quand le disque tombe au sol, des sets de 30 secondes ou 12 points, deux sets gagnants.

Trois façons de jouer : en ligne avec un lien d'invitation, contre l'ordi, ou à deux sur le même clavier.

## Mettre en ligne sur Vercel

Le site est 100 % statique : pas de build, pas de dépendances à installer.

```bash
npx vercel          # depuis ce dossier, répondre aux questions, c'est en ligne
npx vercel --prod   # pour l'adresse définitive
```

Ou bien : pousser le dossier sur GitHub puis l'importer dans Vercel (Framework Preset : « Other », rien d'autre à régler).

## Essayer en local

Les modules JavaScript ne se chargent pas en ouvrant `index.html` directement : il faut un petit serveur.

```bash
npx serve .         # ou : python3 -m http.server 4173
```

## Comment marche la partie en ligne

- « Inviter un ami » crée une partie et affiche un lien du type `https://ton-site.vercel.app/?partie=AB3CD`.
- Les deux navigateurs se connectent directement l'un à l'autre (WebRTC, via la bibliothèque PeerJS).
- Seule la mise en relation passe par le serveur public gratuit de PeerJS (`0.peerjs.com`). S'il est en panne,
  « Inviter un ami » affiche une erreur ; les deux autres modes marchent toujours.
- Celui qui crée la partie fait tourner le jeu ; l'invité envoie ses touches et reçoit l'état 60 fois par seconde.
  L'hôte doit donc garder l'onglet au premier plan : s'il change d'onglet, le match se fige pour les deux.
- Sur certains réseaux très fermés (entreprise, 4G stricte), la connexion directe peut échouer.

Pour utiliser son propre serveur PeerJS : ajouter `?signal=hôte:port` à l'adresse.

## Où changer quoi

| Fichier | Contenu |
| --- | --- |
| `js/data.js` | Les six vents (stats, couleurs, textes), les cinq terrains (taille, zones, couleurs), les règles (30 s, 12 points), la vitesse du disque (`PACE`) |
| `js/sim.js` | Le moteur : déplacements, tirs, effets, lobs, contres, tirs spéciaux, score, sets |
| `js/ai.js` | L'ordi et ses trois niveaux |
| `js/render.js` | Le dessin du terrain, des joueurs, du disque et des effets |
| `js/art.js` | Les affiches (trajectoires des tirs spéciaux) et le schéma des règles |
| `js/net.js` | La liaison en ligne |
| `js/input.js` | Clavier, manette, tactile |
| `js/audio.js` | Les sons, synthétisés (aucun fichier audio) |
| `js/main.js` | Les écrans et la boucle de jeu |
| `styles.css` | Toute la mise en page |

## Crédits

- Police : [Archivo](https://github.com/Omnibus-Type/Archivo), SIL Open Font License 1.1 (voir `fonts/OFL.txt`).
- Réseau : [PeerJS](https://peerjs.com), licence MIT (`vendor/peerjs.min.js`).
