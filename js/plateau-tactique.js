/* PLATEAU TACTIQUE 2D
   ===================

   Une vue de dessus, lisible d'un coup d'œil, pensée pour JOUER vite : on doit
   voir en une seconde où sont les couronnes, qui peut les atteindre, et où l'on
   a le droit de cliquer.

   LE MOTEUR RESTE LA SEULE SOURCE DE VÉRITÉ

   Ce fichier ne connaît aucune règle, et n'en déduit aucune. À chaque rendu, le
   jeu a DÉJÀ marqué ses 121 cases avec ce qu'elles offrent — `reachable`,
   `push-target-preview`, `magic-valid`, `preview-invalid`, `spawn-choice`…
   Le canvas ne fait que traduire ces marques en couleurs.

   C'est ce qui garantit qu'il ne peut pas diverger. Une première version
   recalculait de son côté la validité d'une pose d'île : deux formulations de
   la même règle, donc deux chances de se contredire. Il n'en reste aucune.

   Trois responsabilités, pas une de plus :
     — lire l'état et les marques du moteur ;
     — dessiner ;
     — transmettre une intention au VRAI élément concerné.

   Ce dernier point est plus subtil qu'il n'y paraît : le jeu distingue un clic
   sur la case d'un clic sur la couronne portée. Tout renvoyer sur la case
   rendait vol, transmission et dépôt injouables. Voir `elementVise`.         */

(function () {
  "use strict";

  // Taille du plateau (11 ou 13) lue sur --board-n, réévaluée à chaque métrique.
  let GRILLE = 11;
  function lireGrille() {
    return parseInt(getComputedStyle(document.documentElement).getPropertyValue("--board-n"), 10) === 13 ? 13 : 11;
  }

  /* DIRECTION ARTISTIQUE « NUIT ÉTOILÉE » (validée sur maquettes, fil « Refonte
     vue 2D ») : un ciel de nuit, des îles de pierre claire épaisses d'un seul
     tenant, un sanctuaire de marbre veiné d'or, les villages en constellations
     et les vrais gardiens KayKit photographiés depuis la scène 3D.

     Une couleur par action, et une seule :
       bleu   = déplacement
       ambre  = poussée
       vert   = magie (le violet est déjà la couleur d'une équipe)
       nacre  = pose d'île
       rouge  = impossible ou chute
     Aucun texte sur le plateau : seuls des chiffres discrets (« +1 »).        */
  const C = {
    nuitCentre: "#1c2450",
    nuitBord: "#070a1c",
    or: "#d6b46e",
    bleu: "#1592d4",
    ambre: "#f0961e",
    vert: "#21c08e",
    nacre: "#f4f1ff",
    rouge: "#ff5a6a",
    blanc: "#ffffff"
  };

  /* Marques posées par le moteur, groupées par ce qu'elles veulent dire. */
  const SELECTIONNABLE = [
    "reachable", "reachable-zone", "spawn-choice", "crown-claimable", "ally-ready",
    "direct-move-candidate", "crown-validation-ready"
  ];
  const CHEMIN = ["move-path-preview", "diagonal-step-preview"];
  const DANGER = ["push-target-preview", "push-fall-preview", "smart-cancel-preview"];
  const SELECTION = ["selected", "selected-character", "magic-selected-island"];

  /* Pierre lisse des îles, marbre du sanctuaire. */
  const PIERRE = { haut: "#e9e4d8", bas: "#bdb4a2", flancHaut: "#8f8778", flancBas: "#4f4a42", strate: "rgba(30,28,24,.30)" };
  const MARBRE = { haut: "#fbf8f1", bas: "#ddd6c8", flancHaut: "#b9b1a2", flancBas: "#6d665b", strate: "rgba(140,110,40,.35)" };
  const EPAISSEUR = 0.32, RETRAIT = 0.04, RAYON = 0.16;
  const TAILLE_GARDIEN = 1.62; // hauteur d'un gardien, en cases

  let canvas = null;
  let ctx = null;
  let conteneur = null;
  let actif = false;
  let etat = null;
  /* Les ÉJECTIONS : poussées dont l'arrivée tombe hors du plateau. Elles n'ont
     aucune case à cliquer, et c'est le coup gagnant de six énigmes. On les
     dessine dans la marge et on garde ici de quoi les toucher : {id, x, y, r}
     en pixels canvas, refait à chaque peinture. */
  let ejections = [];
  /* Les COURONNES PORTÉES sont dessinées au-dessus de la tête du gardien,
     donc souvent dans la case du dessus : on garde leur cercle pour les
     toucher là où on les voit. {r, c, x, y, rayon}, refait à chaque peinture. */
  let couronnesPortees = [];
  let cellules = null;        // lecture des 121 cases du moteur
  let survol = null;          // [r, c] sous la souris
  let survolCouronne = false; // la souris est-elle sur une couronne portée ?
  let survolEjection = null;  // identifiant de l'éjection survolée
  let repeindreDemande = false;
  let bouton = null;

  /* ------------------------------------------------------------------ ÉTAT */

  function lireEtat() {
    try {
      const brut = window.ILYOS_BENCH && window.ILYOS_BENCH.etatComplet();
      return brut ? JSON.parse(brut) : null;
    } catch (erreur) {
      return null;
    }
  }

  function caseOrigine(r, c) {
    return document.querySelector(`#board .cell[data-r="${r}"][data-c="${c}"]`);
  }

  /* Une lecture des 121 cases par rendu. Tout ce que le moteur a décidé y est
     déjà : on ne redécide rien. */
  function lireCellules() {
    const lues = new Map();
    document.querySelectorAll("#board .cell").forEach(cellule => {
      lues.set(`${cellule.dataset.r},${cellule.dataset.c}`, {
        classes: cellule.classList,
        badgeCouronne: cellule.querySelector(".carrier-crown"),
        artefact: cellule.querySelector(".artifact"),
        optionScore: cellule.querySelector(".crown-score-option")
      });
    });
    return lues;
  }

  function cle(r, c) { return `${r},${c}`; }

  function marque(info, liste) {
    return !!info && liste.some(n => info.classes.contains(n));
  }

  function couleurJoueur(id) {
    const j = (etat && etat.players || [])[id];
    return (j && j.color) || "#8ab6e8";
  }

  /* -------------------------------------------------------------- GÉOMÉTRIE */

  function metrique() {
    GRILLE = lireGrille();
    const taille = canvas.width;
    const marge = Math.round(taille * 0.045);
    /* Un gardien dépasse d'environ une demi-case au-dessus de sa case : la
       grille descend d'autant, pour que ceux de la première rangée gardent
       leur tête dans le cadre. */
    const tete = 0.4;
    const cote = Math.floor((taille - marge * 2) / (GRILLE + tete));
    const x0 = Math.round((taille - cote * GRILLE) / 2);
    const y0 = Math.round((taille - cote * GRILLE) / 2 + cote * tete / 2);
    return { cote, x0, y0, taille };
  }

  function centreCase(m, r, c) {
    return [m.x0 + c * m.cote + m.cote / 2, m.y0 + r * m.cote + m.cote / 2];
  }

  /* Les pieds d'un gardien : un peu sous le centre de sa case. */
  function piedCase(m, r, c) {
    const [x, y] = centreCase(m, r, c);
    return [x, y + m.cote * 0.28];
  }

  function caseSousPoint(px, py) {
    const m = metrique();
    const c = Math.floor((px - m.x0) / m.cote);
    const r = Math.floor((py - m.y0) / m.cote);
    if (r < 0 || c < 0 || r >= GRILLE || c >= GRILLE) return null;
    return [r, c];
  }

  function couronneSousPoint(px, py) {
    return couronnesPortees.find(k =>
      (px - k.x) * (px - k.x) + (py - k.y) * (py - k.y) <= k.rayon * k.rayon) || null;
  }

  /* ----------------------------------------------------------- PRIMITIVES */

  function rectangleArrondi(x, y, l, h, rayon) {
    rayon = Math.min(rayon, l / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rayon, y);
    ctx.arcTo(x + l, y, x + l, y + h, rayon);
    ctx.arcTo(x + l, y + h, x, y + h, rayon);
    ctx.arcTo(x, y + h, x, y, rayon);
    ctx.arcTo(x, y, x + l, y, rayon);
    ctx.closePath();
  }

  function sousChemin(g, x, y, l, h, rayon) {
    g.moveTo(x + rayon, y);
    g.arcTo(x + l, y, x + l, y + h, rayon);
    g.arcTo(x + l, y + h, x, y + h, rayon);
    g.arcTo(x, y + h, x, y, rayon);
    g.arcTo(x, y, x + l, y, rayon);
    g.closePath();
  }

  /* Un groupe de cases dessiné d'un seul tenant : cases arrondies et ponts
     entre voisines, en un seul chemin (aucun trait intérieur). */
  function formeGroupe(g, m, cases, retrait, rayon) {
    const k = new Set(cases.map(([r, c]) => cle(r, c)));
    const s = m.cote;
    g.beginPath();
    cases.forEach(([r, c]) => {
      const x = m.x0 + c * s, y = m.y0 + r * s;
      sousChemin(g, x + retrait, y + retrait, s - 2 * retrait, s - 2 * retrait, rayon);
      if (k.has(cle(r, c + 1))) g.rect(x + s / 2, y + retrait, s, s - 2 * retrait);
      if (k.has(cle(r + 1, c))) g.rect(x + retrait, y + s / 2, s - 2 * retrait, s);
      if (k.has(cle(r, c + 1)) && k.has(cle(r + 1, c)) && k.has(cle(r + 1, c + 1)))
        g.rect(x + s / 2, y + s / 2, s, s);
    });
  }

  /* Contour extérieur seul d'un groupe de cases. */
  function contourGroupe(g, m, cases, retrait) {
    const k = new Set(cases.map(([r, c]) => cle(r, c)));
    const s = m.cote, e = retrait;
    g.beginPath();
    cases.forEach(([r, c]) => {
      const x = m.x0 + c * s, y = m.y0 + r * s;
      const gauche = k.has(cle(r, c - 1)), droite = k.has(cle(r, c + 1));
      const haut = k.has(cle(r - 1, c)), bas = k.has(cle(r + 1, c));
      if (!haut) { g.moveTo(x + (gauche ? 0 : e), y + e); g.lineTo(x + s - (droite ? 0 : e), y + e); }
      if (!bas) { g.moveTo(x + (gauche ? 0 : e), y + s - e); g.lineTo(x + s - (droite ? 0 : e), y + s - e); }
      if (!gauche) { g.moveTo(x + e, y + (haut ? 0 : e)); g.lineTo(x + e, y + s - (bas ? 0 : e)); }
      if (!droite) { g.moveTo(x + s - e, y + (haut ? 0 : e)); g.lineTo(x + s - e, y + s - (bas ? 0 : e)); }
    });
  }

  /* Pseudo-hasard FIXE par case : les détails ne bougent pas d'un rendu à
     l'autre. */
  function hasard(r, c, k) {
    let h = (r * 73856093) ^ (c * 19349663) ^ ((k || 0) * 83492791);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function dessinerCouronne(g, cx, cy, t, halo) {
    g.save();
    if (halo) { g.shadowColor = "#ffcf5a"; g.shadowBlur = t * halo; }
    const l = t, h = t * 0.74;
    const degrade = g.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2);
    degrade.addColorStop(0, "#fff2b5");
    degrade.addColorStop(1, "#e2a42a");
    g.beginPath();
    g.moveTo(cx - l / 2, cy + h / 2);
    g.lineTo(cx - l / 2, cy - h / 4);
    g.lineTo(cx - l / 4, cy + h / 10);
    g.lineTo(cx, cy - h / 2);
    g.lineTo(cx + l / 4, cy + h / 10);
    g.lineTo(cx + l / 2, cy - h / 4);
    g.lineTo(cx + l / 2, cy + h / 2);
    g.closePath();
    g.fillStyle = degrade;
    g.fill();
    g.shadowBlur = 0;
    g.lineJoin = "round";
    g.lineWidth = Math.max(1, t * 0.07);
    g.strokeStyle = "#7a5208";
    g.stroke();
    [[-l / 2, -h / 4], [0, -h / 2], [l / 2, -h / 4]].forEach(([dx, dy]) => {
      g.beginPath();
      g.arc(cx + dx, cy + dy, t * 0.075, 0, Math.PI * 2);
      g.fillStyle = "#fffbe6";
      g.fill();
      g.stroke();
    });
    g.restore();
  }

  function fleche(ax, ay, bx, by, couleur, epaisseur, pointe) {
    ctx.save();
    ctx.strokeStyle = couleur;
    ctx.fillStyle = couleur;
    ctx.lineWidth = epaisseur;
    ctx.lineCap = "round";
    ctx.shadowColor = couleur;
    ctx.shadowBlur = epaisseur * 3;
    const angle = Math.atan2(by - ay, bx - ax);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx - Math.cos(angle) * pointe * 0.6, by - Math.sin(angle) * pointe * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - pointe * Math.cos(angle - 0.45), by - pointe * Math.sin(angle - 0.45));
    ctx.lineTo(bx - pointe * Math.cos(angle + 0.45), by - pointe * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function chiffre(x, y, texte, taille, couleur) {
    ctx.save();
    ctx.font = `600 ${Math.round(taille)}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = taille * 0.22;
    ctx.strokeStyle = "rgba(7,10,28,.85)";
    ctx.strokeText(texte, x, y);
    ctx.fillStyle = couleur;
    ctx.fillText(texte, x, y);
    ctx.restore();
  }

  /* Une case marquée : voile coloré et liseré lumineux. */
  function caseLumineuse(m, r, c, couleur, fort) {
    const s = m.cote, x = m.x0 + c * s, y = m.y0 + r * s;
    rectangleArrondi(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8, s * 0.12);
    ctx.save();
    ctx.fillStyle = couleur;
    ctx.globalAlpha = fort ? 0.45 : 0.24;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = couleur;
    ctx.lineWidth = Math.max(1, s * (fort ? 0.055 : 0.028));
    ctx.shadowColor = couleur;
    ctx.shadowBlur = s * (fort ? 0.3 : 0.15);
    ctx.stroke();
    ctx.restore();
  }

  /* Un anneau au sol, aux pieds d'un gardien. */
  function anneau(m, r, c, couleur, largeur, lueur) {
    const s = m.cote, [x, y] = piedCase(m, r, c);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.45, s * 0.2, 0, 0, Math.PI * 2);
    ctx.strokeStyle = couleur;
    ctx.lineWidth = Math.max(1.5, s * largeur);
    ctx.shadowColor = couleur;
    ctx.shadowBlur = s * lueur;
    ctx.stroke();
    ctx.restore();
  }

  /* Une chute : un tourbillon dans le vide. */
  function vortex(x, y, s, couleur) {
    ctx.save();
    ctx.strokeStyle = couleur;
    ctx.lineWidth = Math.max(1.2, s * 0.03);
    ctx.shadowColor = couleur;
    ctx.shadowBlur = s * 0.25;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let t = 0; t < 1; t += 0.04) {
        const angle = k * 2.09 + t * 4.2, rayon = s * (0.06 + 0.26 * t);
        const px = x + Math.cos(angle) * rayon, py = y + Math.sin(angle) * rayon * 0.75;
        if (t) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /* Un groupe de cases prévisualisé (île à poser, île tournée) : voile et
     contour d'un seul tenant. */
  function groupeLumineux(m, cases, couleur, fort) {
    if (!cases.length) return;
    const s = m.cote;
    ctx.save();
    formeGroupe(ctx, m, cases, s * 0.06, s * 0.14);
    ctx.fillStyle = couleur;
    ctx.globalAlpha = fort ? 0.28 : 0.16;
    ctx.fill();
    ctx.globalAlpha = 1;
    contourGroupe(ctx, m, cases, s * 0.06);
    ctx.strokeStyle = couleur;
    ctx.lineWidth = Math.max(1.5, s * (fort ? 0.05 : 0.035));
    ctx.lineCap = "round";
    ctx.shadowColor = couleur;
    ctx.shadowBlur = s * 0.3;
    ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------------------------- COUCHES MISES EN CACHE

     Le ciel et les îles ne changent presque jamais : ils sont peints une fois
     dans des canevas hors écran, puis recopiés d'un seul trait. Un survol ne
     coûte ainsi que les marques et les gardiens — rien de plus qu'avant. */
  const cache = { fond: null, cleFond: "", iles: null, cleIles: "" };

  function canevasHorsEcran(taille) {
    const c = document.createElement("canvas");
    c.width = taille;
    c.height = taille;
    return c;
  }

  function peindreFond(m) {
    const k = `${m.taille}|${GRILLE}`;
    if (cache.fond && cache.cleFond === k) return cache.fond;
    const toile = canevasHorsEcran(m.taille);
    const g = toile.getContext("2d");
    const W = m.taille, s = m.cote;
    const ciel = g.createRadialGradient(W / 2, W * 0.45, W * 0.05, W / 2, W / 2, W * 0.75);
    ciel.addColorStop(0, C.nuitCentre);
    ciel.addColorStop(1, C.nuitBord);
    g.fillStyle = ciel;
    g.fillRect(0, 0, W, W);
    // Étoiles : un tirage fixe, toujours le même ciel.
    for (let i = 0; i < 170; i++) {
      g.globalAlpha = 0.15 + hasard(i, 1, 2) * 0.55;
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(hasard(i, 3, 4) * W, hasard(i, 5, 6) * W, hasard(i, 7, 8) * Math.max(0.8, s * 0.028), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    // Quadrillage à peine visible : il donne les cases sans rien concurrencer.
    g.strokeStyle = "rgba(214,180,110,.06)";
    g.lineWidth = 1;
    for (let i = 0; i <= GRILLE; i++) {
      const p = m.x0 + i * s + 0.5;
      g.beginPath(); g.moveTo(p, m.y0); g.lineTo(p, m.y0 + s * GRILLE); g.stroke();
      g.beginPath(); g.moveTo(m.x0, p); g.lineTo(m.x0 + s * GRILLE, p); g.stroke();
    }
    cache.fond = toile;
    cache.cleFond = k;
    return toile;
  }

  /* Une île : ombre portée dans le vide, flanc épais strié, dessus clair. */
  function peindreIle(g, m, cases, mat, marbre) {
    const s = m.cote;
    const k = new Set(cases.map(([r, c]) => cle(r, c)));

    g.save();
    g.translate(s * 0.06, s * (EPAISSEUR + 0.12));
    formeGroupe(g, m, cases, s * RETRAIT, s * RAYON);
    g.fillStyle = "rgba(0,0,10,.45)";
    g.shadowColor = "rgba(0,0,10,.6)";
    g.shadowBlur = s * 0.35;
    g.fill();
    g.restore();

    g.save();
    g.translate(0, s * EPAISSEUR);
    formeGroupe(g, m, cases, s * RETRAIT, s * RAYON);
    g.fillStyle = mat.flancBas;
    g.fill();
    g.restore();
    cases.forEach(([r, c]) => {
      if (k.has(cle(r + 1, c))) return;
      const x = m.x0 + c * s, y = m.y0 + r * s;
      const flanc = g.createLinearGradient(0, y + s * 0.5, 0, y + s + s * EPAISSEUR);
      flanc.addColorStop(0, mat.flancHaut);
      flanc.addColorStop(1, mat.flancBas);
      const gauche = k.has(cle(r, c - 1)) ? 0 : s * RETRAIT;
      const droite = k.has(cle(r, c + 1)) ? s : s - s * RETRAIT;
      g.fillStyle = flanc;
      g.fillRect(x + gauche, y + s * 0.5, droite - gauche, s * (0.5 - RETRAIT) + s * EPAISSEUR - s * RAYON * 0.3);
      g.strokeStyle = mat.strate;
      g.lineWidth = Math.max(1, s * 0.018);
      for (let i = 1; i <= 2; i++) {
        const yy = y + s - s * RETRAIT + s * EPAISSEUR * i / 3;
        g.beginPath();
        g.moveTo(x + gauche + s * 0.05, yy);
        g.quadraticCurveTo(x + s * 0.5, yy + s * 0.03 * (hasard(r, c, i) - 0.5), x + droite - s * 0.05, yy);
        g.stroke();
      }
      g.fillStyle = "rgba(255,255,255,.10)";
      g.beginPath();
      g.arc(x + s * (0.2 + 0.6 * hasard(r, c, 9)), y + s + s * EPAISSEUR * 0.45, s * 0.035, 0, Math.PI * 2);
      g.fill();
    });

    formeGroupe(g, m, cases, s * RETRAIT, s * RAYON);
    const dessus = g.createLinearGradient(m.x0, m.y0, m.x0 + s * GRILLE, m.y0 + s * GRILLE);
    dessus.addColorStop(0, mat.haut);
    dessus.addColorStop(1, mat.bas);
    g.fillStyle = dessus;
    g.fill();
    g.save();
    g.clip();
    if (marbre) veinesDeMarbre(g, m, cases);
    else grainDePierre(g, m, cases);
    g.lineWidth = s * 0.10;
    g.strokeStyle = "rgba(0,0,0,.10)";
    g.translate(0, s * 0.05);
    contourGroupe(g, m, cases, s * RETRAIT);
    g.stroke();
    g.restore();
    g.save();
    contourGroupe(g, m, cases, s * RETRAIT);
    g.strokeStyle = "rgba(255,255,255,.55)";
    g.lineWidth = Math.max(1, s * 0.022);
    g.stroke();
    g.restore();
  }

  function grainDePierre(g, m, cases) {
    const s = m.cote;
    cases.forEach(([r, c]) => {
      const x = m.x0 + c * s, y = m.y0 + r * s;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(x + s * hasard(r, c, i), y + s * hasard(c, r, i + 4), s * (0.2 + 0.12 * hasard(r, c, i + 8)), 0, Math.PI * 2);
        g.fillStyle = "rgba(120,110,90,.07)";
        g.fill();
      }
      if (hasard(r, c, 11) > 0.55) { // fine fissure
        g.strokeStyle = "rgba(90,80,65,.30)";
        g.lineWidth = 1;
        const px = x + s * (0.2 + 0.5 * hasard(r, c, 12)), py = y + s * (0.2 + 0.5 * hasard(r, c, 13));
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + s * 0.12, py + s * 0.06);
        g.lineTo(px + s * 0.18, py + s * 0.16);
        g.stroke();
      }
      if (hasard(r, c, 14) > 0.6) { // une touffe de mousse
        g.beginPath();
        g.arc(x + s * 0.78, y + s * 0.8, s * 0.06, 0, Math.PI * 2);
        g.fillStyle = "rgba(110,160,90,.45)";
        g.fill();
      }
    });
  }

  function veinesDeMarbre(g, m, cases) {
    const s = m.cote;
    const xs = cases.map(([, c]) => c), ys = cases.map(([r]) => r);
    const x0 = m.x0 + Math.min(...xs) * s, x1 = m.x0 + (Math.max(...xs) + 1) * s;
    const y0 = m.y0 + Math.min(...ys) * s, y1 = m.y0 + (Math.max(...ys) + 1) * s;
    const H = y1 - y0, L = x1 - x0;
    g.strokeStyle = "rgba(160,150,140,.25)";
    g.lineWidth = Math.max(1, s * 0.015);
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(x0, y0 + H * hasard(i, 1, 2));
      g.bezierCurveTo(x0 + L * 0.3, y0 + H * hasard(i, 3, 4), x0 + L * 0.6, y0 + H * hasard(i, 5, 6), x1, y0 + H * hasard(i, 7, 8));
      g.stroke();
    }
    g.save();
    g.strokeStyle = "#d9a83a";
    g.lineWidth = Math.max(1.2, s * 0.025);
    g.shadowColor = "#ffd36a";
    g.shadowBlur = s * 0.15;
    [[0.15, 0.2, 0.55, 0.75], [0.7, 0.4, 0.1, 0.5]].forEach(v => {
      g.beginPath();
      g.moveTo(x0, y0 + H * v[0]);
      g.bezierCurveTo(x0 + L * 0.35, y0 + H * v[1], x0 + L * 0.6, y0 + H * v[2], x1, y0 + H * v[3]);
      g.stroke();
    });
    g.restore();
  }

  /* LES CINQ CASES DU SANCTUAIRE. C'est l'île de départ, une croix : le centre
     et ses quatre voisines, toujours de la terre. C'est un REPÈRE DE PLATEAU :
     il se dessine même si aucune île ne le recouvre. */
  function casesSanctuaire() {
    const centre = Math.floor(GRILLE / 2);
    return [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]
      .map(([dr, dc]) => [centre + dr, centre + dc])
      .filter(([r, c]) => r >= 0 && c >= 0 && r < GRILLE && c < GRILLE);
  }

  function peindreIles(m) {
    const iles = (etat.islands || [])
      .map(ile => (ile.cells || []).map(([r, c]) => [r, c]))
      .filter(cases => cases.length);
    const k = `${m.taille}|${GRILLE}|${JSON.stringify(iles)}`;
    if (cache.iles && cache.cleIles === k) return cache.iles;
    const toile = canevasHorsEcran(m.taille);
    const g = toile.getContext("2d");
    const sanctuaire = casesSanctuaire();
    const ks = new Set(sanctuaire.map(([r, c]) => cle(r, c)));
    // Les îles du fond d'abord : un flanc ne doit jamais passer sur l'île du dessous.
    const groupes = iles
      .map(cases => ({ cases: cases.filter(([r, c]) => !ks.has(cle(r, c))), marbre: false }))
      .filter(gr => gr.cases.length)
      .concat([{ cases: sanctuaire, marbre: true }]);
    groupes
      .sort((a, b) => Math.max(...a.cases.map(x => x[0])) - Math.max(...b.cases.map(x => x[0])))
      .forEach(gr => peindreIle(g, m, gr.cases, gr.marbre ? MARBRE : PIERRE, gr.marbre));
    // Halo doré du sanctuaire, très doux.
    const [cx, cy] = centreCase(m, Math.floor(GRILLE / 2), Math.floor(GRILLE / 2));
    const halo = g.createRadialGradient(cx, cy, 0, cx, cy, m.cote * 1.7);
    halo.addColorStop(0, "rgba(255,215,120,.22)");
    halo.addColorStop(1, "rgba(255,215,120,0)");
    g.fillStyle = halo;
    g.fillRect(cx - 2 * m.cote, cy - 2 * m.cote, 4 * m.cote, 4 * m.cote);
    cache.iles = toile;
    cache.cleIles = k;
    return toile;
  }

  /* ------------------------------------------------------------ VILLAGES

     Une constellation à la couleur de l'équipe : une étoile à quatre branches
     sur la case du coin, reliée aux étoiles des deux cases voisines. Les trois
     cases baignent dans un halo de l'équipe. Le village s'ALLUME quand le
     moteur y propose de valider une couronne. */
  function casesVillage(v) {
    const cases = [[v.r, v.c]];
    [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([dr, dc]) => {
      const r = v.r + dr, c = v.c + dc;
      if (r >= 0 && c >= 0 && r < GRILLE && c < GRILLE) cases.push([r, c]);
    });
    return cases;
  }

  function etoile(x, y, rayon) {
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const angle = -Math.PI / 2 + k * Math.PI / 4;
      const rr = k % 2 ? rayon * 0.32 : rayon;
      ctx.lineTo(x + Math.cos(angle) * rr, y + Math.sin(angle) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  function peindreVillages(m) {
    const s = m.cote;
    (etat.players || []).forEach(joueur => {
      const couleur = joueur.color || "#8ab6e8";
      (joueur.villages || (joueur.village ? [joueur.village] : [])).forEach(v => {
        if (!v) return;
        const cases = casesVillage(v);
        const allume = cases.some(([r, c]) => {
          const info = cellules.get(cle(r, c));
          return !!info && (!!info.optionScore || info.classes.contains("crown-validation-ready"));
        });
        cases.forEach(([r, c]) => {
          const [x, y] = centreCase(m, r, c);
          const halo = ctx.createRadialGradient(x, y, 0, x, y, s * 0.75);
          halo.addColorStop(0, couleur + (allume ? "99" : "50"));
          halo.addColorStop(1, couleur + "00");
          ctx.fillStyle = halo;
          ctx.fillRect(x - s, y - s, 2 * s, 2 * s);
        });
        const points = cases.map(([r, c]) => centreCase(m, r, c));
        ctx.save();
        ctx.strokeStyle = couleur;
        ctx.globalAlpha = allume ? 1 : 0.75;
        ctx.lineWidth = Math.max(1.2, s * (allume ? 0.045 : 0.03));
        ctx.lineCap = "round";
        ctx.shadowColor = couleur;
        ctx.shadowBlur = s * 0.2;
        points.slice(1).forEach(p => {
          ctx.beginPath();
          ctx.moveTo(points[0][0], points[0][1]);
          ctx.lineTo(p[0], p[1]);
          ctx.stroke();
        });
        ctx.restore();
        points.forEach((p, i) => {
          ctx.save();
          ctx.shadowColor = couleur;
          ctx.shadowBlur = s * (allume ? 0.7 : 0.4);
          ctx.fillStyle = "#fff";
          if (i === 0) etoile(p[0], p[1], s * (allume ? 0.2 : 0.16));
          else { ctx.beginPath(); ctx.arc(p[0], p[1], s * 0.055, 0, Math.PI * 2); ctx.fill(); }
          ctx.restore();
        });
      });
    });
  }

  /* ---------------------------------------------- PORTRAITS DES GARDIENS

     Les gardiens sont les VRAIS modèles KayKit de la partie : chacun est
     photographié une fois depuis la scène 3D (même modèle, mêmes couleurs,
     gardien choisi dans la collection compris), puis réutilisé comme une
     simple image. Un petit moteur WebGL est créé pour l'occasion et libéré
     aussitôt. Tant qu'un modèle n'est pas chargé, un pion le remplace. */
  const portraits = new Map(); // `${assetKey}|${joueur}` -> { image, ancreX, hauteur } | null
  const portraitsLumineux = new Map(); // même clé + taille -> canevas avec la lueur d'équipe

  function photographier(v, T, rendu) {
    const w = v.wrapper;
    const parent = w.parent;
    const position = w.position.clone();
    const rotation = w.rotation.clone();
    const visible = w.visible;
    const caches = [v.crown, v.halo].filter(o => o && o.visible);
    caches.forEach(o => { o.visible = false; });
    const scene = new T.Scene();
    scene.add(new T.HemisphereLight(0xdfe8ff, 0x40305a, 1.0));
    const lune = new T.DirectionalLight(0xfff2dd, 1.2);
    lune.position.set(2, 4, 3);
    scene.add(lune);
    const contre = new T.DirectionalLight(0x9fb8ff, 0.6);
    contre.position.set(-3, 2, -2);
    scene.add(contre);
    let resultat = null;
    try {
      scene.add(w);
      w.position.set(0, 0, 0);
      w.rotation.set(0, 0.45, 0);
      w.visible = true;
      w.updateMatrixWorld(true);
      const boite = new T.Box3().setFromObject(w);
      const centre = boite.getCenter(new T.Vector3());
      const taille = boite.getSize(new T.Vector3());
      const h = Math.max(taille.y, taille.x * 1.25) * 0.62;
      const camera = new T.OrthographicCamera(-h * 0.8, h * 0.8, h, -h, 0.01, 50);
      const elevation = 0.3, distance = 8;
      camera.position.set(centre.x, centre.y + Math.sin(elevation) * distance, centre.z + Math.cos(elevation) * distance);
      camera.lookAt(centre);
      rendu.render(scene, camera);
      resultat = recadrer(rendu.domElement, taille.y);
    } finally {
      if (parent) parent.add(w);
      w.position.copy(position);
      w.rotation.copy(rotation);
      w.visible = visible;
      caches.forEach(o => { o.visible = true; });
    }
    return resultat;
  }

  /* Rogne l'image sur la silhouette et trouve l'axe des pieds. */
  function recadrer(source, hauteurMonde) {
    const L = source.width, H = source.height;
    const brut = canevasHorsEcran(L);
    brut.height = H;
    const g = brut.getContext("2d");
    g.drawImage(source, 0, 0);
    const pixels = g.getImageData(0, 0, L, H).data;
    let x0 = L, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < L; x++) {
        if (pixels[(y * L + x) * 4 + 3] > 24) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    // Axe des pieds : milieu des pixels opaques des dernières lignes.
    let somme = 0, nombre = 0;
    for (let y = Math.max(y0, y1 - Math.round((y1 - y0) * 0.06)); y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (pixels[(y * L + x) * 4 + 3] > 24) { somme += x; nombre++; }
      }
    }
    const image = canevasHorsEcran(x1 - x0 + 1);
    image.height = y1 - y0 + 1;
    image.getContext("2d").drawImage(brut, x0, y0, image.width, image.height, 0, 0, image.width, image.height);
    return {
      image,
      ancreX: nombre ? (somme / nombre - x0) / image.width : 0.5,
      hauteurMonde
    };
  }

  function preparerPortraits() {
    const K = window.kaykit3D, T = window.THREE;
    if (!K || !T || !K.characterVisuals) return;
    const aFaire = [];
    K.characterVisuals.forEach(v => {
      if (!v || !v.wrapper || !v.assetKey || v.usesFallback) return;
      const k = `${v.assetKey}|${v.playerId}`;
      if (!portraits.has(k) && !aFaire.some(([kk]) => kk === k)) aFaire.push([k, v]);
    });
    if (!aFaire.length) return;
    let rendu = null;
    try {
      rendu = new T.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      rendu.setPixelRatio(1);
      rendu.setSize(256, 320);
      rendu.setClearColor(0x000000, 0);
      if (K.renderer) rendu.outputEncoding = K.renderer.outputEncoding;
      aFaire.forEach(([k, v]) => {
        try { portraits.set(k, photographier(v, T, rendu)); } catch (_) { portraits.set(k, null); }
      });
    } catch (_) {
      aFaire.forEach(([k]) => portraits.set(k, null));
    } finally {
      if (rendu) {
        rendu.dispose();
        if (rendu.forceContextLoss) rendu.forceContextLoss();
      }
    }
  }

  function portraitDe(g) {
    const K = window.kaykit3D;
    const v = K && K.characterVisuals && K.characterVisuals.get(String(g.id).replace(/\*$/, ""));
    if (!v || v.usesFallback) return null;
    return portraits.get(`${v.assetKey}|${v.playerId}`) || null;
  }

  /* Tous les modèles à la même échelle : le plus grand mesure TAILLE_GARDIEN
     cases, les autres en proportion de leur vraie hauteur. */
  function echellePortrait(p) {
    let plusGrand = 0;
    portraits.forEach(q => { if (q && q.hauteurMonde > plusGrand) plusGrand = q.hauteurMonde; });
    return plusGrand ? p.hauteurMonde / plusGrand : 1;
  }

  /* Le portrait à la bonne taille, entouré de la lueur de son équipe. La lueur
     (shadowBlur) coûte cher : elle est calculée une fois par taille. */
  function portraitLumineux(p, couleur, hauteur) {
    if (portraitsLumineux.size > 64) portraitsLumineux.clear(); // après un redimensionnement
    const k = `${couleur}|${Math.round(hauteur)}|${p.image.width}x${p.image.height}`;
    let toile = portraitsLumineux.get(k);
    if (toile) return toile;
    const echelle = hauteur / p.image.height;
    const l = Math.ceil(p.image.width * echelle), h = Math.ceil(hauteur);
    const bord = Math.ceil(hauteur * 0.12);
    toile = canevasHorsEcran(l + bord * 2);
    toile.height = h + bord * 2;
    const g = toile.getContext("2d");
    g.shadowColor = couleur;
    g.shadowBlur = hauteur * 0.09;
    g.drawImage(p.image, bord, bord, l, h);
    toile.bord = bord;
    portraitsLumineux.set(k, toile);
    return toile;
  }

  /* --------------------------------------------------------- PERSONNAGES */

  function socle(m, x, y, couleur, choisi) {
    const s = m.cote;
    ctx.save();
    // Ombre douce posée sur la pierre, même lumière de lune partout.
    ctx.beginPath();
    ctx.ellipse(x + s * 0.06, y + s * 0.05, s * 0.42, s * 0.17, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10,10,30,.38)";
    ctx.fill();
    // Socle plein à la couleur de l'équipe.
    const degrade = ctx.createLinearGradient(0, y - s * 0.17, 0, y + s * 0.17);
    degrade.addColorStop(0, "#ffffff");
    degrade.addColorStop(0.18, couleur);
    degrade.addColorStop(1, couleur);
    ctx.shadowColor = couleur;
    ctx.shadowBlur = s * (choisi ? 0.45 : 0.25);
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.39, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = degrade;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1, s * 0.022);
    ctx.strokeStyle = "rgba(20,16,30,.55)";
    ctx.stroke();
    ctx.restore();
  }

  /* Hauteur à l'écran d'un portrait : tous les modèles à la même échelle, un
     gardien mesurant TAILLE_GARDIEN cases. */
  function hauteurPortrait(m) { return m.cote * TAILLE_GARDIEN; }

  function dessinerGardien(m, g, options) {
    const s = m.cote;
    const couleur = couleurJoueur(g.player);
    const [x, pied] = piedCase(m, g.r, g.c);
    const fantome = !!options.fantome;
    ctx.save();
    if (options.alpha != null) ctx.globalAlpha = options.alpha;
    if (!fantome) socle(m, x, pied, couleur, options.choisi);
    else {
      ctx.beginPath();
      ctx.ellipse(x, pied, s * 0.36, s * 0.15, 0, 0, Math.PI * 2);
      ctx.strokeStyle = couleur;
      ctx.lineWidth = Math.max(1.2, s * 0.035);
      ctx.stroke();
    }
    const p = portraitDe(g);
    let sommet = pied - s * 0.62;
    if (p) {
      const h = hauteurPortrait(m) * echellePortrait(p);
      const leve = options.choisi ? s * 0.06 : 0;
      const l = p.image.width * h / p.image.height;
      const gauche = x - p.ancreX * l, haut = pied - h + s * 0.06 - leve;
      if (fantome) ctx.drawImage(p.image, gauche, haut, l, h);
      else {
        const toile = portraitLumineux(p, couleur, h);
        ctx.drawImage(toile, gauche - toile.bord, haut - toile.bord);
      }
      sommet = haut;
    } else {
      // Pion de remplacement, le temps que le modèle 3D arrive.
      const cy = pied - s * 0.3;
      ctx.beginPath();
      ctx.arc(x, cy, s * 0.26, 0, Math.PI * 2);
      ctx.fillStyle = couleur;
      ctx.shadowColor = couleur;
      ctx.shadowBlur = fantome ? 0 : s * 0.25;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(2, s * 0.06);
      ctx.strokeStyle = "rgba(255,255,255,.92)";
      ctx.stroke();
      sommet = cy - s * 0.26;
    }
    ctx.restore();
    if (options.choisi && !fantome) anneau(m, g.r, g.c, C.blanc, 0.035, 0.2);
    return sommet;
  }

  /* ------------------------------------------------------------ PEINTURE */

  function peindre() {
    repeindreDemande = false;
    if (!actif || !ctx) return;
    etat = lireEtat();
    ejections = [];
    couronnesPortees = [];
    if (!etat) return;
    cellules = lireCellules();
    preparerPortraits();

    const m = metrique();
    const s = m.cote;
    const survolCle = survol ? cle(survol[0], survol[1]) : null;
    const magie = /MAGIC/.test(String(etat.selectedActionType || ""));
    const gardienSur = new Map((etat.characters || []).map(g => [cle(g.r, g.c), g]));

    /* 1. LE CIEL, LES VILLAGES, LES ÎLES. */
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(peindreFond(m), 0, 0);
    peindreVillages(m);
    ctx.drawImage(peindreIles(m), 0, 0);

    /* 2. LE CADRE, liseré de la couleur du joueur qui a la main. */
    const trait = couleurJoueur(etat.currentPlayer);
    const marge = s * 0.12, cadre = s * GRILLE + marge * 2;
    ctx.save();
    ctx.shadowColor = trait;
    ctx.shadowBlur = s * 0.35;
    ctx.strokeStyle = trait;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = Math.max(1.5, s * 0.035);
    ctx.strokeRect(m.x0 - marge, m.y0 - marge, cadre, cadre);
    ctx.restore();
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([i, j]) => {
      ctx.save();
      ctx.translate(m.x0 - marge + i * cadre, m.y0 - marge + j * cadre);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = C.or;
      ctx.fillRect(-s * 0.07, -s * 0.07, s * 0.14, s * 0.14);
      ctx.restore();
    });

    /* 3. TOUTES LES MARQUES DU MOTEUR, traduites en couleurs.

       Une seule lecture pour tous les états du jeu — déplacement, poussée,
       magie, pose d'île, apparition, couronne. Les groupes (île à poser, île
       tournée) sont dessinés d'un seul tenant, comme une île. */
    const groupes = { valide: [], invalide: [], survolMagie: [] };
    const chemin = [];
    let depart = null, cibleDeplacement = null;
    cellules.forEach((info, k) => {
      const [r, c] = k.split(",").map(Number);
      const vise = survolCle === k;
      const cl = info.classes;
      if (cl.contains("preview-invalid") || cl.contains("magic-invalid")) groupes.invalide.push([r, c]);
      else if (cl.contains("preview-valid") || cl.contains("magic-valid")) groupes.valide.push([r, c]);
      else if (cl.contains("push-fall-preview")) {
        const [x, y] = centreCase(m, r, c);
        vortex(x, y, s, C.rouge);
      } else if (cl.contains("smart-cancel-preview")) caseLumineuse(m, r, c, C.rouge, vise);
      else if (cl.contains("push-destination-preview")) caseLumineuse(m, r, c, C.ambre, true);
      else if (cl.contains("move-target-preview")) { caseLumineuse(m, r, c, C.bleu, true); cibleDeplacement = [r, c]; }
      else if (cl.contains("push-line-preview")) caseLumineuse(m, r, c, C.ambre, false);
      else if (marque(info, SELECTIONNABLE)) caseLumineuse(m, r, c, cl.contains("crown-validation-ready") ? C.or : C.bleu, vise);
      if (marque(info, CHEMIN)) chemin.push([r, c]);
      if (cl.contains("magic-hover-island")) groupes.survolMagie.push([r, c]);
      if (cl.contains("selected-character")) depart = [r, c];
      if (marque(info, SELECTION) && !gardienSur.has(k)) {
        rectangleArrondi(m.x0 + c * s + 2, m.y0 + r * s + 2, s - 4, s - 4, s * 0.16);
        ctx.strokeStyle = C.blanc;
        ctx.lineWidth = Math.max(2, s * 0.05);
        ctx.stroke();
      }
    });
    groupeLumineux(m, groupes.valide, magie ? C.vert : C.nacre, false);
    groupeLumineux(m, groupes.invalide, C.rouge, false);
    if (groupes.survolMagie.length) {
      ctx.save();
      contourGroupe(ctx, m, groupes.survolMagie, s * 0.06);
      ctx.strokeStyle = C.vert;
      ctx.lineWidth = Math.max(1.5, s * 0.04);
      ctx.shadowColor = C.vert;
      ctx.shadowBlur = s * 0.25;
      ctx.stroke();
      ctx.restore();
    }
    // Le pivot de la magie : un arc fléché autour de la case.
    cellules.forEach((info, k) => {
      if (!info.classes.contains("magic-hover-pivot") && !info.classes.contains("magic-pivot")) return;
      const [r, c] = k.split(",").map(Number);
      const [x, y] = centreCase(m, r, c);
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = C.vert;
      ctx.fillStyle = C.vert;
      ctx.lineWidth = Math.max(1.2, s * 0.035);
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.42, -0.4, Math.PI * 1.25);
      ctx.stroke();
      const a = Math.PI * 1.25;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42);
      ctx.lineTo(Math.cos(a - 0.35) * s * 0.52, Math.sin(a - 0.35) * s * 0.52);
      ctx.lineTo(Math.cos(a - 0.35) * s * 0.32, Math.sin(a - 0.35) * s * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

    /* 3 bis. LE CHEMIN DU DÉPLACEMENT : un trait plein, du gardien choisi à la
       case visée, en suivant les cases que le moteur a marquées. */
    if (depart && chemin.length) {
      const restantes = new Set(chemin.map(([r, c]) => cle(r, c)));
      const trace = [depart];
      let courant = depart;
      for (let i = 0; i < chemin.length; i++) {
        const suivant = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
          .map(([dr, dc]) => [courant[0] + dr, courant[1] + dc])
          .find(([r, c]) => restantes.has(cle(r, c)));
        if (!suivant) break;
        restantes.delete(cle(suivant[0], suivant[1]));
        trace.push(suivant);
        courant = suivant;
      }
      if (cibleDeplacement && cle(courant[0], courant[1]) !== cle(cibleDeplacement[0], cibleDeplacement[1])
        && Math.abs(courant[0] - cibleDeplacement[0]) + Math.abs(courant[1] - cibleDeplacement[1]) <= 2) {
        trace.push(cibleDeplacement);
      }
      if (trace.length > 1) {
        ctx.save();
        ctx.strokeStyle = C.bleu;
        ctx.lineWidth = Math.max(2, s * 0.05);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = C.bleu;
        ctx.shadowBlur = s * 0.25;
        ctx.beginPath();
        trace.forEach(([r, c], i) => {
          const [x, y] = piedCase(m, r, c);
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.stroke();
        ctx.restore();
      }
    }

    /* 3 ter. LES POUSSÉES DISPONIBLES.

       Le bouton POUSSER lance le flux « unifié » : on ne choisit pas son
       pousseur, on choisit une CIBLE, et le moteur en déduit qui pousse et
       avec quelle force. Il calcule `pushOptions` dès la sélection de la
       carte ; on dessine ce qu'il a décidé : un anneau ambre sous chaque
       cible, chaque arrivée possible en ambre, un tourbillon rouge pour une
       chute. La flèche et le fantôme n'apparaissent que sur l'issue survolée :
       au repos, le plateau reste calme. Pas de chiffre de force. */
    const options = etat.pushOptions || [];
    const fantomes = [];
    const chutes = [];
    if (options.length) {
      const posDe = id => {
        const g = (etat.characters || []).find(x => x.id === id);
        if (g) return [g.r, g.c];
        const a = [etat.artifact, etat.secondArtifact].find(x => x && x.id === id);
        return a ? [a.r, a.c] : null;
      };
      /* TOUTES les destinations distinctes, pas seulement la moins chère :
         faire tomber un gardien demande souvent une force SUPÉRIEURE au
         minimum. On garde, par case d'arrivée, la force la plus faible qui y
         mène — celle que le moteur appliquera au clic.

         Une chute n'a pas de case d'arrivée : son repère est la case qui suit
         la dernière terre dans le sens de la poussée. */
      const caseOption = o => o.fell
        ? [o.lastLandR + o.dr, o.lastLandC + o.dc]
        : [o.r, o.c];

      const cibles = new Set();
      const parDestination = new Map();
      /* Hors grille = ÉJECTION, posée dans la marge du côté où la victime
         sort. C'est le coup gagnant de six énigmes. */
      const horsGrille = new Map();
      options.forEach(o => {
        cibles.add(o.targetId);
        const [dr, dc] = caseOption(o);
        if (!Number.isFinite(dr) || !Number.isFinite(dc)) return;
        const dedans = dr >= 0 && dc >= 0 && dr < GRILLE && dc < GRILLE;
        const table = dedans ? parDestination : horsGrille;
        const k = cle(dr, dc);
        const connue = table.get(k);
        if (!connue || o.force < connue.force) table.set(k, o);
      });

      cibles.forEach(id => {
        const pos = posDe(id);
        if (!pos) return;
        const vise = survol && survol[0] === pos[0] && survol[1] === pos[1];
        anneau(m, pos[0], pos[1], C.ambre, vise ? 0.05 : 0.04, 0.3);
      });

      parDestination.forEach((o, k) => {
        const [dr, dc] = k.split(",").map(Number);
        const dep = posDe(o.targetId);
        if (!dep) return;
        const vise = survol && survol[0] === dr && survol[1] === dc;
        const [bx, by] = centreCase(m, dr, dc);
        if (o.fell) vortex(bx, by, s, C.rouge);
        else caseLumineuse(m, dr, dc, C.ambre, vise);
        if (!vise) return;
        const [ax, ay] = centreCase(m, dep[0], dep[1]);
        fleche(ax, ay, bx - (bx - ax) * 0.18, by - (by - ay) * 0.18,
          o.fell ? C.rouge : C.ambre, Math.max(1.5, s * 0.06), s * 0.22);
        const victime = (etat.characters || []).find(g => g.id === o.targetId);
        if (victime) (o.fell ? chutes : fantomes).push({ ...victime, r: dr, c: dc });
      });

      horsGrille.forEach(o => {
        const [dr, dc] = caseOption(o);
        const dep = posDe(o.targetId);
        if (!dep) return;
        const rayon = s * 0.30;
        const borne = v => Math.min(Math.max(v, rayon + 2), canvas.width - rayon - 2);
        const bx = borne(m.x0 + dc * s + s / 2);
        const by = borne(m.y0 + dr * s + s / 2);
        const vise = survolEjection === o.id;
        vortex(bx, by, s * 1.1, C.rouge);
        ctx.save();
        ctx.beginPath();
        ctx.arc(bx, by, rayon, 0, Math.PI * 2);
        ctx.strokeStyle = C.rouge;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.stroke();
        ctx.restore();
        const [ax, ay] = centreCase(m, dep[0], dep[1]);
        if (vise) fleche(ax, ay, bx, by, C.rouge, Math.max(1.5, s * 0.06), s * 0.22);
        ejections.push({ id: o.id, x: bx, y: by, r: rayon + s * 0.10 });
      });
    }

    /* 4. LES COURONNES AU SOL, grandes : ce sont elles l'enjeu. */
    [etat.artifact, etat.secondArtifact].forEach(a => {
      if (!a || !a.active || a.carrierId) return;
      const [x, y] = centreCase(m, a.r, a.c);
      dessinerCouronne(ctx, x, y + s * 0.02, s * 0.62, 0.9);
    });

    /* 5. LES GARDIENS, du fond vers l'avant : un gardien ne doit jamais
       passer derrière celui de la rangée du dessus. */
    const choisi = (etat.characters || []).find(g => g.id === etat.selectedCharId)
      || (depart ? gardienSur.get(cle(depart[0], depart[1])) : null);
    if (choisi && !depart) depart = [choisi.r, choisi.c];
    (etat.characters || []).slice().sort((a, b) => a.r - b.r).forEach(g => {
      const estChoisi = !!choisi && choisi.id === g.id;
      const sommet = dessinerGardien(m, g, { choisi: estChoisi });

      /* LA COURONNE PORTÉE EST UNE CIBLE DE CLIC À PART.

         Le jeu distingue « je clique la case » de « je clique la couronne » :
         c'est ce second geste qui déclenche vol, transmission et dépôt. Elle
         est dessinée au-dessus de la tête, et on la touche là où on la voit
         (voir `couronneSousPoint`). */
      const info = cellules.get(cle(g.r, g.c));
      if (info && info.badgeCouronne) {
        const [x] = piedCase(m, g.r, g.c);
        const y = sommet - s * 0.12;
        const surBadge = survolCouronne && survol && survol[0] === g.r && survol[1] === g.c;
        if (surBadge) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, s * 0.34, 0, Math.PI * 2);
          ctx.strokeStyle = "#ffe08a";
          ctx.lineWidth = Math.max(1.5, s * 0.035);
          ctx.shadowColor = "#ffcf5a";
          ctx.shadowBlur = s * 0.3;
          ctx.stroke();
          ctx.restore();
        }
        dessinerCouronne(ctx, x, y, s * (surBadge ? 0.5 : 0.44), 0.8);
        couronnesPortees.push({ r: g.r, c: g.c, x, y, rayon: s * 0.36 });
      }
    });

    /* 6. LES FANTÔMES : où ira le gardien choisi (case survolée), où ira le
       gardien poussé, et le gardien qui tombe. */
    if (choisi && survol && /MOVE/.test(String(etat.selectedActionType || ""))
      && !gardienSur.has(survolCle)) {
      const info = cellules.get(survolCle);
      if (info && (info.classes.contains("move-target-preview")
        || info.classes.contains("reachable") || info.classes.contains("reachable-zone"))) {
        fantomes.push({ ...choisi, r: survol[0], c: survol[1] });
      }
    }
    fantomes.forEach(g => dessinerGardien(m, g, { fantome: true, alpha: 0.55 }));
    chutes.forEach(g => {
      const p = portraitDe(g);
      const [x, y] = centreCase(m, g.r, g.c);
      if (!p) return;
      const h = s * 0.8, l = p.image.width * h / p.image.height;
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.translate(x, y);
      ctx.rotate(0.5);
      ctx.drawImage(p.image, -p.ancreX * l, -h * 0.6, l, h);
      ctx.restore();
    });

    /* 7. « +1 » : le moteur ne propose la validation que si le point est
       marquable ; le clic part vers son vrai bouton. */
    cellules.forEach((info, k) => {
      if (!info.optionScore) return;
      const [r, c] = k.split(",").map(Number);
      const [x, y] = centreCase(m, r, c);
      const vise = survolCle === k;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, s * (vise ? 0.36 : 0.32), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,215,120,.22)";
      ctx.fill();
      ctx.strokeStyle = "#ffe08a";
      ctx.lineWidth = Math.max(1.5, s * 0.04);
      ctx.shadowColor = "#ffcf5a";
      ctx.shadowBlur = s * 0.35;
      ctx.stroke();
      ctx.restore();
      chiffre(x, y, "+1", s * 0.36, "#ffe08a");
    });

    /* 8. LA CASE SURVOLÉE : un liseré fin. */
    if (survol) {
      const x = m.x0 + survol[1] * s, y = m.y0 + survol[0] * s;
      rectangleArrondi(x + 2, y + 2, s - 4, s - 4, s * 0.14);
      ctx.strokeStyle = "rgba(255,255,255,.7)";
      ctx.lineWidth = Math.max(1, s * 0.025);
      ctx.stroke();
    }
  }

  function demanderPeinture() {
    if (repeindreDemande) return;
    repeindreDemande = true;
    requestAnimationFrame(peindre);
  }

  /* ----------------------------------------------------------- INTERACTION */

  /* QUEL ÉLÉMENT LE JOUEUR VISE-T-IL ?

     `onCellClick` interroge `event.target.closest(".carrier-crown,.artifact")`
     et `.crown-score-option`. Un clic posé sur la case elle-même ne trouve
     rien : vol, transmission, dépôt et validation étaient donc INJOUABLES
     depuis la vue 2D — ils ne se déclenchaient jamais.

     On renvoie donc le clic sur le vrai nœud interne quand le geste le vise :
     le « +1 » d'abord, puis la couronne portée si le geste tombe sur elle
     (au-dessus de la tête du gardien). Le reste part sur la case.           */
  function elementVise(r, c, surCouronne) {
    const cellule = caseOrigine(r, c);
    if (!cellule) return null;
    const info = cellules && cellules.get(cle(r, c));
    if (!info) return cellule;

    /* SEULEMENT hors action engagée.

       Ces raccourcis n'ont de sens que dans `ACTION_SELECT`, la phase où le
       jeu attend qu'on choisisse quoi faire. Dès qu'une action est en cours —
       PUSH, MOVE, MAGIC, pose d'île, ramassage, dépôt — le moteur n'attend
       plus qu'une CASE, et détourner le clic vers la couronne rendait la
       poussée impossible : cliquer un porteur pour le désigner comme pousseur
       ouvrait le dépôt à la place. */
    if (etat && etat.phase !== "ACTION_SELECT") return cellule;
    if (info.optionScore) return info.optionScore;
    if (info.badgeCouronne && surCouronne) return info.badgeCouronne;
    return cellule;
  }

  function pointCanvas(evenement) {
    const rect = canvas.getBoundingClientRect();
    return [
      (evenement.clientX - rect.left) * (canvas.width / rect.width),
      (evenement.clientY - rect.top) * (canvas.height / rect.height)
    ];
  }

  function relayer(r, c, type, surCouronne) {
    const cible = type === "click" ? elementVise(r, c, surCouronne) : caseOrigine(r, c);
    if (!cible) return;
    if (type === "click") { cible.click(); return; }
    cible.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  }

  function surSouris(evenement) {
    const [px, py] = pointCanvas(evenement);
    /* Une couronne portée se dessine au-dessus de la tête, souvent dans la
       case du dessus : la toucher vise son porteur. */
    const couronne = couronneSousPoint(px, py);
    const trouvee = couronne ? [couronne.r, couronne.c] : caseSousPoint(px, py);
    const surCouronne = !!couronne;
    const ejection = ejections.find(e =>
      (px - e.x) * (px - e.x) + (py - e.y) * (py - e.y) <= e.r * e.r);
    const idEjection = ejection ? ejection.id : null;
    if (idEjection !== survolEjection) { survolEjection = idEjection; demanderPeinture(); }
    const memeCase = trouvee && survol
      && trouvee[0] === survol[0] && trouvee[1] === survol[1];
    if (memeCase && surCouronne === survolCouronne) return;

    if (survol && !memeCase) relayer(survol[0], survol[1], "mouseleave");
    survol = trouvee;
    survolCouronne = surCouronne;
    if (survol && !memeCase) {
      relayer(survol[0], survol[1], "mouseenter");
    }
    if (survol) relayer(survol[0], survol[1], "mousemove");
    demanderPeinture();
  }

  /* Un seul relais par clic. Le navigateur enverra bien deux `click` sur un
     double-clic, mais chacun traverse la logique du moteur exactement comme
     deux clics distincts sur le plateau d'origine. Un filtre anti-double-clic
     empêcherait au contraire deux actions légitimes d'affilée — enchaîner
     deux déplacements est parfaitement normal. */
  function surClic(evenement) {
    evenement.preventDefault();
    const [px, py] = pointCanvas(evenement);

    /* L'ÉJECTION d'abord : son repère est hors de la grille, donc caseSousPoint
       le refuse et aucune case du plateau d'origine ne peut recevoir le clic.
       On exécute alors l'option par son identifiant, seul chemin possible. */
    const ejection = ejections.find(e =>
      (px - e.x) * (px - e.x) + (py - e.y) * (py - e.y) <= e.r * e.r);
    if (ejection) {
      try { window.ILYOS_BENCH?.executerPoussee?.(ejection.id); } catch (_) { }
      demanderPeinture();
      return;
    }

    const couronne = couronneSousPoint(px, py);
    const cellule = couronne ? [couronne.r, couronne.c] : caseSousPoint(px, py);
    if (!cellule) return;
    /* Aucune garde ajoutée ici : `onCellClick` sort déjà de lui-même si
       `inputLocked`, si la partie est finie ou si ce n'est pas notre tour. En
       écrire une seconde, c'est prendre le risque qu'elle dise le contraire. */
    relayer(cellule[0], cellule[1], "click", !!couronne);
    demanderPeinture();
  }

  /* CLIC DROIT = ANNULER, la même annulation que partout ailleurs.

     La vue 3D appelle `handleCancelButton()`. Cette fonction vit à l'intérieur
     du module de jeu et n'est pas accessible d'ici — mais le bouton ↶ de
     l'interface y est branché. Le cliquer, c'est appeler la même chose sans en
     écrire une seconde version. Désactivé, il ne fait rien : c'est exactement
     le comportement voulu quand il n'y a rien à annuler. */
  function surClicDroit(evenement) {
    evenement.preventDefault();
    const annuler = document.getElementById("cancelCardBtn");
    if (annuler && !annuler.disabled) annuler.click();
    demanderPeinture();
  }

  /* La molette pilote déjà quelque chose sur le plateau d'origine. On lui
     transmet l'événement au lieu de deviner ce qu'il déclenche. */
  function surMolette(evenement) {
    const plateau = document.getElementById("board");
    if (!plateau) return;
    evenement.preventDefault();
    plateau.dispatchEvent(new WheelEvent("wheel", {
      deltaY: evenement.deltaY,
      deltaX: evenement.deltaX,
      bubbles: true,
      cancelable: true
    }));
    demanderPeinture();
  }

  function surSortie() {
    if (survol) relayer(survol[0], survol[1], "mouseleave");
    survol = null;
    survolCouronne = false;
    survolEjection = null;
    demanderPeinture();
  }

  /* ---------------------------------------------------------- CYCLE DE VIE */

  function dimensionner() {
    if (!canvas || !conteneur) return;
    const rect = conteneur.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    /* La barre de cartes et les commandes flottent PAR-DESSUS le plateau :
       sans marge réservée, les dernières rangées étaient visibles mais pas
       cliquables. Une fenêtre masquée annonce par ailleurs une taille NULLE —
       prise au mot, la formule repliait le plateau sur son minimum, où il
       restait au retour faute d'une nouvelle mesure. */
    /* Deux barres flottent PAR-DESSUS le plateau : celle des scores en haut,
       celle des cartes en bas. Sans marge réservée des deux côtés, la première
       rangée passait sous le bandeau des joueurs et la dernière sous la main :
       visibles, mais impossibles à cliquer. */
    const RESERVE_HAUTE = 96;
    const RESERVE_BASSE = 172;
    /* Téléphone en portrait : les commandes sont toutes en bas
       (css/portrait-mobile.css), la largeur entière est libre. Le plateau la
       prend, sous le bandeau des joueurs et le bouton VUE 3D, et ses cases
       passent d'environ 22 à 32 px — la taille d'un doigt. */
    const portrait = window.innerHeight > window.innerWidth && window.innerWidth <= 820;
    const bornes = portrait
      ? [rect.width - 12, window.innerHeight - 138 - 186]
      : [rect.width, window.innerWidth * 0.70,
        window.innerHeight - RESERVE_HAUTE - RESERVE_BASSE]
      .filter(v => Number.isFinite(v) && v > 0);
    if (!bornes.length) return;
    const cote = Math.max(240, Math.floor(Math.min(...bornes)));
    canvas.style.width = cote + "px";
    canvas.style.height = cote + "px";
    canvas.width = Math.floor(cote * ratio);
    canvas.height = Math.floor(cote * ratio);
    demanderPeinture();
  }

  function construire() {
    conteneur = document.querySelector(".board-wrap");
    if (!conteneur || canvas) return;

    canvas = document.createElement("canvas");
    canvas.id = "plateauTactique";
    canvas.setAttribute("aria-label", "Plateau tactique de jeu");
    conteneur.appendChild(canvas);
    ctx = canvas.getContext("2d");

    canvas.addEventListener("mousemove", surSouris);
    canvas.addEventListener("mouseleave", surSortie);
    canvas.addEventListener("click", surClic);
    canvas.addEventListener("contextmenu", surClicDroit);
    canvas.addEventListener("wheel", surMolette, { passive: false });

    /* Le plateau d'origine est repeint à chaque changement de jeu : l'observer
       revient à s'abonner aux événements du moteur sans y toucher. */
    const plateau = document.getElementById("board");
    if (plateau) {
      new MutationObserver(demanderPeinture)
        .observe(plateau, { childList: true, subtree: true, attributes: true });
    }
    window.addEventListener("resize", dimensionner);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) dimensionner();
    });
  }

  function basculer(vers) {
    actif = vers === undefined ? !actif : !!vers;
    if (actif) construire();
    document.body.dataset.plateauTactique = actif ? "on" : "off";
    if (bouton) bouton.textContent = actif ? "3D" : "2D";
    if (actif) { dimensionner(); demanderPeinture(); }
  }

  function ajouterBouton() {
    if (bouton) return;
    bouton = document.createElement("button");
    bouton.type = "button";
    bouton.id = "plateauTactiqueBtn";
    bouton.textContent = "2D";
    bouton.title = "Basculer entre la vue 3D et le plateau tactique (touche V)";
    bouton.addEventListener("click", () => basculer());
    document.body.appendChild(bouton);
  }

  function demarrer() {
    ajouterBouton();
    document.addEventListener("keydown", e => {
      if (e.key !== "v" && e.key !== "V") return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const c = e.target;
      if (c && /^(INPUT|TEXTAREA)$/.test(c.tagName)) return;
      basculer();
    });
    document.body.dataset.plateauTactique = "off";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", demarrer);
  } else {
    demarrer();
  }

  window.ILYOS_PLATEAU_2D = {
    activer: basculer,
    actif: () => actif,
    repeindre: demanderPeinture,
    /* Les repères d'éjection, en pixels canevas. Ils sont dessinés hors de la
       grille : aucun sélecteur ne les désigne, et un test qui voudrait les
       cliquer devrait sinon recalculer la géométrie du plateau à la main. */
    _ejections: () => ejections.map(e => ({ ...e }))
  };
})();
