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

  const GRILLE = 11;

  /* Convention de couleur, volontairement courte :
       vert   = sélectionnable
       blanc  = sélectionné
       rouge  = cible, danger ou impossible
       accent = trajectoire et destination                                    */
  const C = {
    vide: "#0e1a24",
    quadrillage: "#16283a",
    terre: "#e8e2d2",
    terreOmbre: "#bfb7a3",
    sanctuaire: "#ffd76a",
    couronne: "#ffc93c",
    couronneBord: "#6b4a00",
    vert: "#37d6a8",
    rouge: "#ff5d5d",
    accent: "#8fe9ff",
    blanc: "#ffffff"
  };

  /* Marques posées par le moteur, groupées par ce qu'elles veulent dire. */
  const SELECTIONNABLE = [
    "reachable", "spawn-choice", "crown-claimable", "ally-ready",
    "direct-move-candidate", "crown-validation-ready"
  ];
  const CHEMIN = ["move-path-preview", "diagonal-step-preview", "push-line-preview"];
  const DESTINATION = ["move-target-preview", "push-destination-preview"];
  const DANGER = ["push-target-preview", "push-fall-preview", "smart-cancel-preview"];
  const VALIDE = ["preview-valid", "magic-valid"];
  const INVALIDE = ["preview-invalid", "magic-invalid"];
  const SELECTION = ["selected", "selected-character", "magic-selected-island"];

  let canvas = null;
  let ctx = null;
  let conteneur = null;
  let actif = false;
  let etat = null;
  let cellules = null;        // lecture des 121 cases du moteur
  let survol = null;          // [r, c] sous la souris
  let survolCouronne = false; // la souris est-elle sur le badge couronne ?
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
    const taille = canvas.width;
    const marge = Math.round(taille * 0.045);
    const cote = Math.floor((taille - marge * 2) / GRILLE);
    const decalage = Math.round((taille - cote * GRILLE) / 2);
    return { cote, x0: decalage, y0: decalage };
  }

  function caseSousPoint(px, py) {
    const m = metrique();
    const c = Math.floor((px - m.x0) / m.cote);
    const r = Math.floor((py - m.y0) / m.cote);
    if (r < 0 || c < 0 || r >= GRILLE || c >= GRILLE) return null;
    return [r, c];
  }

  /* La couronne d'un porteur est dessinée en haut de sa case : c'est aussi là
     qu'on la clique. Le tiers supérieur suffit, et il se voit. */
  function dansZoneCouronne(py, r) {
    const m = metrique();
    return py < m.y0 + r * m.cote + m.cote * 0.42;
  }

  /* ---------------------------------------------------------------- DESSIN */

  function rectangleArrondi(x, y, l, h, rayon) {
    ctx.beginPath();
    ctx.moveTo(x + rayon, y);
    ctx.arcTo(x + l, y, x + l, y + h, rayon);
    ctx.arcTo(x + l, y + h, x, y + h, rayon);
    ctx.arcTo(x, y + h, x, y, rayon);
    ctx.arcTo(x, y, x + l, y, rayon);
    ctx.closePath();
  }

  function dessinerCouronne(cx, cy, taille) {
    const l = taille, h = taille * 0.78;
    ctx.beginPath();
    ctx.moveTo(cx - l / 2, cy + h / 2);
    ctx.lineTo(cx - l / 2, cy - h / 4);
    ctx.lineTo(cx - l / 4, cy + h / 8);
    ctx.lineTo(cx, cy - h / 2);
    ctx.lineTo(cx + l / 4, cy + h / 8);
    ctx.lineTo(cx + l / 2, cy - h / 4);
    ctx.lineTo(cx + l / 2, cy + h / 2);
    ctx.closePath();
    ctx.fillStyle = C.couronne;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, taille * 0.09);
    ctx.strokeStyle = C.couronneBord;
    ctx.stroke();
  }

  function teinter(x, y, cote, couleur, alpha, contour) {
    rectangleArrondi(x + 2, y + 2, cote - 4, cote - 4, cote * 0.16);
    ctx.fillStyle = couleur;
    ctx.globalAlpha = alpha;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (contour) {
      ctx.strokeStyle = couleur;
      ctx.lineWidth = Math.max(2, cote * contour);
      ctx.stroke();
    }
  }

  function peindre() {
    repeindreDemande = false;
    if (!actif || !ctx) return;
    etat = lireEtat();
    if (!etat) return;
    cellules = lireCellules();

    const m = metrique();
    const cote = m.cote;
    const survolCle = survol ? cle(survol[0], survol[1]) : null;

    const terrain = new Map();
    (etat.islands || []).forEach(ile => {
      (ile.cells || []).forEach(([r, c]) => terrain.set(cle(r, c), ile));
    });

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = C.vide;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* 1. LE VIDE — un quadrillage discret donne les coordonnées sans entrer en
       concurrence avec la terre. */
    ctx.strokeStyle = C.quadrillage;
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRILLE; i++) {
      const p = m.x0 + i * cote + 0.5;
      ctx.beginPath(); ctx.moveTo(p, m.y0); ctx.lineTo(p, m.y0 + cote * GRILLE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(m.x0, p); ctx.lineTo(m.x0 + cote * GRILLE, p); ctx.stroke();
    }

    /* 2. LES ZONES DE VILLAGE, sous la terre : repérables même recouvertes. */
    (etat.players || []).forEach(joueur => {
      const cases = [];
      (joueur.villages || (joueur.village ? [joueur.village] : [])).forEach(v => {
        if (!v) return;
        cases.push([v.r, v.c]);
        [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([dr, dc]) => {
          const r = v.r + dr, c = v.c + dc;
          if (r >= 0 && c >= 0 && r < GRILLE && c < GRILLE) cases.push([r, c]);
        });
      });
      ctx.fillStyle = joueur.color || "#8ab6e8";
      ctx.globalAlpha = 0.22;
      cases.forEach(([r, c]) => ctx.fillRect(m.x0 + c * cote, m.y0 + r * cote, cote, cote));
      ctx.globalAlpha = 0.9;
      ctx.setLineDash([cote * 0.16, cote * 0.12]);
      ctx.lineWidth = Math.max(1.5, cote * 0.05);
      ctx.strokeStyle = joueur.color || "#8ab6e8";
      cases.forEach(([r, c]) =>
        ctx.strokeRect(m.x0 + c * cote + 2, m.y0 + r * cote + 2, cote - 4, cote - 4));
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    });

    /* 3. LA TERRE. Le relief vient du contraste avec le vide, pas d'une
       texture. Le liseré dit à qui appartient l'île. */
    for (let r = 0; r < GRILLE; r++) {
      for (let c = 0; c < GRILLE; c++) {
        const ile = terrain.get(cle(r, c));
        if (!ile) continue;
        const x = m.x0 + c * cote, y = m.y0 + r * cote;
        ctx.fillStyle = C.terreOmbre;
        rectangleArrondi(x + 1, y + 3, cote - 2, cote - 2, cote * 0.16);
        ctx.fill();
        ctx.fillStyle = C.terre;
        rectangleArrondi(x + 1, y + 1, cote - 2, cote - 2, cote * 0.16);
        ctx.fill();
        ctx.strokeStyle = couleurJoueur(ile.owner);
        ctx.lineWidth = Math.max(1.5, cote * 0.055);
        ctx.globalAlpha = 0.55;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    /* 4. LE SANCTUAIRE. */
    /* Le sanctuaire est un REPÈRE DE PLATEAU, pas une propriété du terrain :
       il se voit même quand la case centrale est vide. Le conditionner à la
       présence de terre le faisait disparaître exactement quand on avait le
       plus besoin de savoir où viser. */
    const centre = Math.floor(GRILLE / 2);
    const xs = m.x0 + centre * cote, ys = m.y0 + centre * cote;
    const surTerre = !!terrain.get(cle(centre, centre));
    rectangleArrondi(xs + 3, ys + 3, cote - 6, cote - 6, cote * 0.14);
    ctx.fillStyle = C.sanctuaire;
    ctx.globalAlpha = surTerre ? 0.28 : 0.12;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.sanctuaire;
    ctx.lineWidth = Math.max(2, cote * 0.08);
    ctx.globalAlpha = surTerre ? 1 : 0.75;
    if (!surTerre) ctx.setLineDash([cote * 0.14, cote * 0.10]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    /* 5. TOUTES LES MARQUES DU MOTEUR, traduites en couleurs.

       Une seule boucle pour tous les états du jeu — déplacement, poussée,
       magie, pose d'île, apparition, couronne. Un nouvel état posant une
       classe apparaîtra ici sans une ligne de plus : c'est exactement ce qu'on
       attend d'un afficheur. */
    for (let r = 0; r < GRILLE; r++) {
      for (let c = 0; c < GRILLE; c++) {
        const info = cellules.get(cle(r, c));
        if (!info) continue;
        const x = m.x0 + c * cote, y = m.y0 + r * cote;
        const vise = survolCle === cle(r, c);

        if (marque(info, INVALIDE)) {
          teinter(x, y, cote, C.rouge, 0.40, 0.08);
        } else if (marque(info, VALIDE)) {
          teinter(x, y, cote, C.vert, vise ? 0.58 : 0.45, 0.08);
        } else if (marque(info, DANGER)) {
          teinter(x, y, cote, C.rouge, vise ? 0.55 : 0.38, 0.07);
        } else if (marque(info, DESTINATION)) {
          teinter(x, y, cote, C.accent, vise ? 0.60 : 0.42, 0.08);
        } else if (marque(info, SELECTIONNABLE)) {
          teinter(x, y, cote, C.vert, vise ? 0.55 : 0.26, 0.06);
        } else if (marque(info, CHEMIN)) {
          teinter(x, y, cote, C.accent, 0.22, 0);
        }

        // Sélection : un contour blanc net, jamais une couleur de plus.
        if (marque(info, SELECTION)) {
          rectangleArrondi(x + 2, y + 2, cote - 4, cote - 4, cote * 0.16);
          ctx.strokeStyle = C.blanc;
          ctx.lineWidth = Math.max(2.5, cote * 0.09);
          ctx.stroke();
        }

        // Magie : l'île visée, et le pivot autour duquel elle tournera.
        if (info.classes.contains("magic-hover-island")) {
          rectangleArrondi(x + 3, y + 3, cote - 6, cote - 6, cote * 0.14);
          ctx.strokeStyle = C.accent;
          ctx.lineWidth = Math.max(2, cote * 0.06);
          ctx.stroke();
        }
        if (info.classes.contains("magic-hover-pivot") || info.classes.contains("magic-pivot")) {
          ctx.beginPath();
          ctx.arc(x + cote / 2, y + cote / 2, cote * 0.17, 0, Math.PI * 2);
          ctx.strokeStyle = C.sanctuaire;
          ctx.lineWidth = Math.max(2, cote * 0.08);
          ctx.stroke();
        }
      }
    }

    /* 5 bis. LE SENS D'UNE POUSSÉE. Les cases de la trajectoire sont déjà
       marquées ; ce qui manquait, c'est la DIRECTION. Une flèche de la cible
       vers la destination la donne sans ambiguïté, et dit si ça tombe. */
    let cible = null, arrivee = null;
    cellules.forEach((info, k) => {
      if (info.classes.contains("push-target-preview")) cible = k;
      if (info.classes.contains("push-destination-preview")
        || info.classes.contains("push-fall-preview")) arrivee = k;
    });
    if (cible && arrivee && cible !== arrivee) {
      const [r1, c1] = cible.split(",").map(Number);
      const [r2, c2] = arrivee.split(",").map(Number);
      const ax = m.x0 + c1 * cote + cote / 2, ay = m.y0 + r1 * cote + cote / 2;
      const bx = m.x0 + c2 * cote + cote / 2, by = m.y0 + r2 * cote + cote / 2;
      const tombe = cellules.get(arrivee).classes.contains("push-fall-preview");
      const teinte = tombe ? C.rouge : C.accent;
      ctx.strokeStyle = teinte;
      ctx.lineWidth = Math.max(3, cote * 0.10);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      const angle = Math.atan2(by - ay, bx - ax);
      const pointe = cote * 0.28;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - pointe * Math.cos(angle - 0.5), by - pointe * Math.sin(angle - 0.5));
      ctx.lineTo(bx - pointe * Math.cos(angle + 0.5), by - pointe * Math.sin(angle + 0.5));
      ctx.closePath();
      ctx.fillStyle = teinte;
      ctx.fill();
      if (tombe) {
        ctx.font = `800 ${Math.round(cote * 0.24)}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = C.rouge;
        ctx.fillText("CHUTE", bx, by + cote * 0.52);
      }
    }

    /* 5 ter. LES POUSSÉES DISPONIBLES — enfin visibles.

       Le bouton POUSSER lance le flux « unifié » : on ne choisit pas son
       pousseur, on choisit une CIBLE, et le moteur en déduit qui pousse et
       avec quelle force. Il calcule donc `pushOptions` dès la sélection de la
       carte… mais ne les montrait que sur des marqueurs 3D. En 2D, rien ne
       s'affichait : impossible de deviner où cliquer.

       Le clic, lui, fonctionnait déjà — `onCellClick` recalcule les options
       pour la case cliquée et exécute. Il ne manquait que l'affichage. On se
       contente donc de dessiner ce que le moteur a déjà décidé : cible en
       rouge, flèche vers la destination, « CHUTE » quand il l'annonce. */
    const options = etat.pushOptions || [];
    if (options.length) {
      const posDe = id => {
        const g = (etat.characters || []).find(x => x.id === id);
        if (g) return [g.r, g.c];
        const a = [etat.artifact, etat.secondArtifact].find(x => x && x.id === id);
        return a ? [a.r, a.c] : null;
      };
      // Une seule option par cible : la moins coûteuse, celle que le moteur
      // retiendra par défaut. Les autres forces restent réglables au HUD.
      const parCible = new Map();
      options.forEach(o => {
        const connue = parCible.get(o.targetId);
        if (!connue || o.force < connue.force) parCible.set(o.targetId, o);
      });

      parCible.forEach((o, targetId) => {
        const cible = posDe(targetId);
        if (!cible) return;
        const [tr, tc] = cible;
        const x = m.x0 + tc * cote, y = m.y0 + tr * cote;
        const vise = survol && survol[0] === tr && survol[1] === tc;

        teinter(x, y, cote, C.rouge, vise ? 0.60 : 0.34, 0.09);

        if (!Number.isFinite(o.r) || !Number.isFinite(o.c)) return;
        const ax = x + cote / 2, ay = y + cote / 2;
        const bx = m.x0 + o.c * cote + cote / 2, by = m.y0 + o.r * cote + cote / 2;
        const teinte = o.fell ? C.rouge : C.accent;
        ctx.globalAlpha = vise ? 1 : 0.75;
        ctx.strokeStyle = teinte;
        ctx.lineWidth = Math.max(3, cote * (vise ? 0.12 : 0.09));
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        const angle = Math.atan2(by - ay, bx - ax);
        const pointe = cote * 0.28;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - pointe * Math.cos(angle - 0.5), by - pointe * Math.sin(angle - 0.5));
        ctx.lineTo(bx - pointe * Math.cos(angle + 0.5), by - pointe * Math.sin(angle + 0.5));
        ctx.closePath();
        ctx.fillStyle = teinte;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Destination : un cercle qu'on vise, ou une tête de mort si ça tombe.
        ctx.beginPath();
        ctx.arc(bx, by, cote * 0.20, 0, Math.PI * 2);
        ctx.fillStyle = teinte;
        ctx.globalAlpha = vise ? 0.55 : 0.30;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = Math.max(2, cote * 0.06);
        ctx.strokeStyle = teinte;
        ctx.stroke();

        ctx.font = `800 ${Math.round(cote * 0.22)}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = teinte;
        ctx.fillText(o.fell ? "CHUTE" : `×${o.force}`, bx, by + cote * 0.46);
      });
    }

    /* 6. LES COURONNES AU SOL. */
    [etat.artifact, etat.secondArtifact].forEach(a => {
      if (!a || !a.active || a.carrierId) return;
      const x = m.x0 + a.c * cote, y = m.y0 + a.r * cote;
      dessinerCouronne(x + cote / 2, y + cote / 2, cote * 0.52);
    });

    /* 7. LES GARDIENS. */
    (etat.characters || []).forEach(g => {
      const x = m.x0 + g.c * cote, y = m.y0 + g.r * cote;
      const cx = x + cote / 2, cy = y + cote / 2 + cote * 0.06;
      const rayon = cote * 0.27;

      ctx.beginPath();
      ctx.arc(cx, cy + cote * 0.04, rayon, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, rayon, 0, Math.PI * 2);
      ctx.fillStyle = couleurJoueur(g.player);
      ctx.fill();
      ctx.lineWidth = Math.max(2, cote * 0.07);
      ctx.strokeStyle = "rgba(255,255,255,.92)";
      ctx.stroke();

      /* L'initiale prise sur le DERNIER mot du nom : « BOT AZUR » et
         « BOT CORAIL » donnaient tous deux un « B ». */
      const nom = ((etat.players || [])[g.player] || {}).name || String(g.player);
      const mots = String(nom).trim().split(/\s+/).filter(Boolean);
      ctx.fillStyle = "rgba(255,255,255,.95)";
      ctx.font = `700 ${Math.round(cote * 0.27)}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((mots[mots.length - 1] || "?").charAt(0).toUpperCase(), cx, cy);

      /* LA COURONNE PORTÉE EST UNE CIBLE DE CLIC À PART.

         Le jeu distingue « je clique la case » de « je clique la couronne » :
         c'est ce second geste qui déclenche vol, transmission et dépôt. Elle
         est donc dessinée nettement au-dessus du gardien, dans le tiers haut
         de la case — la zone que `dansZoneCouronne` reconnaît. */
      const info = cellules.get(cle(g.r, g.c));
      if (info && info.badgeCouronne) {
        const surBadge = survol && survol[0] === g.r && survol[1] === g.c && survolCouronne;
        if (surBadge) {
          ctx.beginPath();
          ctx.arc(cx, y + cote * 0.22, cote * 0.27, 0, Math.PI * 2);
          ctx.fillStyle = C.blanc;
          ctx.globalAlpha = 0.30;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        dessinerCouronne(cx, y + cote * 0.22, cote * (surBadge ? 0.46 : 0.40));
      }
    });

    /* 8. « VALIDER +1 ». Le moteur ne l'affiche que si le point est marquable :
       on le montre donc tel quel, et le clic part vers son vrai bouton. */
    cellules.forEach((info, k) => {
      if (!info.optionScore) return;
      const [r, c] = k.split(",").map(Number);
      const x = m.x0 + c * cote, y = m.y0 + r * cote;
      rectangleArrondi(x + 2, y + cote * 0.62, cote - 4, cote * 0.34, cote * 0.10);
      ctx.fillStyle = C.sanctuaire;
      ctx.globalAlpha = survolCle === k ? 1 : 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#22303c";
      ctx.font = `800 ${Math.round(cote * 0.19)}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("VALIDER +1", x + cote / 2, y + cote * 0.79);
    });

    /* 9. REPÈRES et case survolée. */
    ctx.fillStyle = "rgba(242,247,251,.45)";
    ctx.font = `${Math.round(cote * 0.30)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < GRILLE; i++) {
      ctx.fillText(String(i), m.x0 + i * cote + cote / 2, m.y0 - cote * 0.32);
      ctx.fillText(String(i), m.x0 - cote * 0.32, m.y0 + i * cote + cote / 2);
    }

    if (survol) {
      const x = m.x0 + survol[1] * cote, y = m.y0 + survol[0] * cote;
      rectangleArrondi(x + 1, y + 1, cote - 2, cote - 2, cote * 0.16);
      ctx.strokeStyle = C.blanc;
      ctx.lineWidth = Math.max(1.5, cote * 0.05);
      ctx.globalAlpha = 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
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
     le bandeau « VALIDER +1 » d'abord, puis la couronne portée si la souris
     est dans son tiers de case. Le reste part sur la case, comme avant.      */
  function elementVise(r, c, py) {
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
    if (info.badgeCouronne && dansZoneCouronne(py, r)) return info.badgeCouronne;
    return cellule;
  }

  function pointCanvas(evenement) {
    const rect = canvas.getBoundingClientRect();
    return [
      (evenement.clientX - rect.left) * (canvas.width / rect.width),
      (evenement.clientY - rect.top) * (canvas.height / rect.height)
    ];
  }

  function relayer(r, c, type, py) {
    const cible = type === "click" ? elementVise(r, c, py) : caseOrigine(r, c);
    if (!cible) return;
    if (type === "click") { cible.click(); return; }
    cible.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  }

  function surSouris(evenement) {
    const [px, py] = pointCanvas(evenement);
    const trouvee = caseSousPoint(px, py);
    const surCouronne = !!trouvee && dansZoneCouronne(py, trouvee[0]);
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
    const cellule = caseSousPoint(px, py);
    if (!cellule) return;
    /* Aucune garde ajoutée ici : `onCellClick` sort déjà de lui-même si
       `inputLocked`, si la partie est finie ou si ce n'est pas notre tour. En
       écrire une seconde, c'est prendre le risque qu'elle dise le contraire. */
    relayer(cellule[0], cellule[1], "click", py);
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
    const bornes = [rect.width, window.innerWidth * 0.70,
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
    canvas.setAttribute("aria-label", "Plateau tactique 11 par 11");
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
    if (bouton) bouton.textContent = actif ? "VUE 3D" : "VUE 2D";
    if (actif) { dimensionner(); demanderPeinture(); }
  }

  function ajouterBouton() {
    if (bouton) return;
    bouton = document.createElement("button");
    bouton.type = "button";
    bouton.id = "plateauTactiqueBtn";
    bouton.textContent = "VUE 2D";
    bouton.title = "Basculer entre la vue 3D et le plateau tactique (touche T)";
    bouton.addEventListener("click", () => basculer());
    document.body.appendChild(bouton);
  }

  function demarrer() {
    ajouterBouton();
    document.addEventListener("keydown", e => {
      if (e.key !== "t" && e.key !== "T") return;
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
    repeindre: demanderPeinture
  };
})();
