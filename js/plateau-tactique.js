/* PLATEAU TACTIQUE 2D
   ===================

   Une vue de dessus, lisible d'un coup d'œil, pensée pour JOUER vite : on doit
   voir en une seconde où sont les couronnes, qui peut les atteindre, et où l'on
   a le droit de cliquer.

   DEUX PRINCIPES DE CONSTRUCTION

   1. Aucune règle n'est réécrite. Ce fichier ne sait rien du jeu : il lit
      l'état, il dessine, et il renvoie chaque clic à la vraie case du plateau
      d'origine. Tout ce qui décide — déplacements légaux, poussées, pose d'île,
      validation — reste dans le moteur. Une seconde implémentation, même
      fidèle au départ, finirait par diverger.

   2. Aucun fichier existant n'est modifié, hormis deux lignes de chargement
      dans index.html. Le module s'ajoute, il ne s'insère pas : il peut donc
      être fusionné sans conflit pendant que d'autres branches travaillent sur
      le moteur ou sur le rendu 3D.

   Le canvas est repeint quand le plateau d'origine change (MutationObserver) :
   il est donc toujours en phase avec le jeu, sans horloge ni sondage.        */

(function () {
  "use strict";

  const GRILLE = 11;

  /* Palette : peu de couleurs, très contrastées. Le fond recule, la terre
     avance, et seules trois choses brillent — les couronnes, les cases
     jouables, et la sélection. */
  const C = {
    vide: "#0e1a24",
    videQuadrillage: "#16283a",
    terre: "#e8e2d2",
    terreOmbre: "#bfb7a3",
    liseré: "#5c5344",
    sanctuaire: "#ffd76a",
    couronne: "#ffc93c",
    couronneBord: "#6b4a00",
    jouable: "#37d6a8",
    selection: "#ffffff",
    cible: "#ff5d5d",
    texte: "#f2f7fb",
    texteSombre: "#22303c"
  };

  let canvas = null;
  let ctx = null;
  let conteneur = null;
  let actif = false;
  let etat = null;
  let survol = null;          // [r, c] sous la souris
  let repeindreDemande = false;

  /* ------------------------------------------------------------------ ÉTAT */

  /* L'état complet est déjà sérialisé par le moteur pour les bancs et les
     sauvegardes. On le relit plutôt que d'inventer un accès : le jour où le
     format change, il change pour tout le monde en même temps. */
  function lireEtat() {
    try {
      const brut = window.ILYOS_BENCH && window.ILYOS_BENCH.etatComplet();
      return brut ? JSON.parse(brut) : null;
    } catch (erreur) {
      return null;
    }
  }

  function caseDuPlateauOrigine(r, c) {
    return document.querySelector(`#board .cell[data-r="${r}"][data-c="${c}"]`);
  }

  /* Le moteur marque lui-même les cases jouables. On ne recalcule rien : on
     lit ce qu'il a décidé. */
  function ensembleJouable() {
    const jouables = new Set();
    (etat && etat.reachable || []).forEach(k => jouables.add(String(k)));
    return jouables;
  }

  function cle(r, c) { return `${r},${c}`; }

  function terrainPar() {
    const carte = new Map();
    (etat && etat.islands || []).forEach(ile => {
      (ile.cells || []).forEach(([r, c]) => carte.set(cle(r, c), ile));
    });
    return carte;
  }

  function couleurJoueur(id) {
    const j = (etat && etat.players || [])[id];
    return (j && j.color) || "#8ab6e8";
  }

  /* --------------------------------------------------------------- GÉOMÉTRIE */

  function metrique() {
    const largeur = canvas.width;
    const hauteur = canvas.height;
    const marge = Math.round(Math.min(largeur, hauteur) * 0.045);
    const cote = Math.floor((Math.min(largeur, hauteur) - marge * 2) / GRILLE);
    const total = cote * GRILLE;
    return {
      cote,
      x0: Math.round((largeur - total) / 2),
      y0: Math.round((hauteur - total) / 2)
    };
  }

  function caseSousPoint(px, py) {
    const m = metrique();
    const c = Math.floor((px - m.x0) / m.cote);
    const r = Math.floor((py - m.y0) / m.cote);
    if (r < 0 || c < 0 || r >= GRILLE || c >= GRILLE) return null;
    return [r, c];
  }

  /* ----------------------------------------------------------------- DESSIN */

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

  function peindre() {
    repeindreDemande = false;
    if (!actif || !ctx) return;
    etat = lireEtat();
    if (!etat) return;

    const m = metrique();
    const cote = m.cote;
    const terrain = terrainPar();
    const jouables = ensembleJouable();
    const villages = etat.players || [];
    const survolCle = survol ? cle(survol[0], survol[1]) : null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = C.vide;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* 1. LE VIDE — un quadrillage discret suffit à donner les coordonnées sans
       jamais entrer en concurrence avec la terre. */
    ctx.strokeStyle = C.videQuadrillage;
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRILLE; i++) {
      const p = m.x0 + i * cote + 0.5;
      const q = m.y0 + i * cote + 0.5;
      ctx.beginPath(); ctx.moveTo(p, m.y0); ctx.lineTo(p, m.y0 + cote * GRILLE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(m.x0, q); ctx.lineTo(m.x0 + cote * GRILLE, q); ctx.stroke();
    }

    /* 2. LES ZONES DE VILLAGE, sous la terre : elles teintent le sol sans
       cacher ce qui s'y trouve. */
    villages.forEach(joueur => {
      const cases = [];
      (joueur.villages || (joueur.village ? [joueur.village] : [])).forEach(v => {
        if (!v) return;
        cases.push([v.r, v.c]);
        [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([dr, dc]) => {
          const r = v.r + dr, c = v.c + dc;
          if (r >= 0 && c >= 0 && r < GRILLE && c < GRILLE) cases.push([r, c]);
        });
      });
      /* Teinte pleine SOUS la terre, plus un liseré tireté : on doit repérer
         une zone de validation d'un coup d'œil, y compris quand une île la
         recouvre entièrement. */
      ctx.fillStyle = joueur.color || "#8ab6e8";
      ctx.globalAlpha = 0.22;
      cases.forEach(([r, c]) => {
        ctx.fillRect(m.x0 + c * cote, m.y0 + r * cote, cote, cote);
      });
      ctx.globalAlpha = 0.9;
      ctx.setLineDash([cote * 0.16, cote * 0.12]);
      ctx.lineWidth = Math.max(1.5, cote * 0.05);
      ctx.strokeStyle = joueur.color || "#8ab6e8";
      cases.forEach(([r, c]) => {
        ctx.strokeRect(m.x0 + c * cote + 2, m.y0 + r * cote + 2, cote - 4, cote - 4);
      });
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    });

    /* 3. LA TERRE. Une seule teinte, avec une ombre portée courte : le relief
       vient du contraste avec le vide, pas d'une texture. */
    for (let r = 0; r < GRILLE; r++) {
      for (let c = 0; c < GRILLE; c++) {
        const ile = terrain.get(cle(r, c));
        if (!ile) continue;
        const x = m.x0 + c * cote;
        const y = m.y0 + r * cote;
        ctx.fillStyle = C.terreOmbre;
        rectangleArrondi(x + 1, y + 3, cote - 2, cote - 2, cote * 0.16);
        ctx.fill();
        ctx.fillStyle = C.terre;
        rectangleArrondi(x + 1, y + 1, cote - 2, cote - 2, cote * 0.16);
        ctx.fill();

        // Liseré à la couleur du propriétaire : à qui appartient cette île ?
        ctx.strokeStyle = couleurJoueur(ile.owner);
        ctx.lineWidth = Math.max(1.5, cote * 0.055);
        ctx.globalAlpha = 0.55;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    /* 4. LE SANCTUAIRE — la case centrale d'où viennent les couronnes. */
    const cr = Math.floor(GRILLE / 2);
    if (terrain.get(cle(cr, cr))) {
      const x = m.x0 + cr * cote, y = m.y0 + cr * cote;
      rectangleArrondi(x + 3, y + 3, cote - 6, cote - 6, cote * 0.14);
      ctx.fillStyle = C.sanctuaire;
      ctx.globalAlpha = 0.28;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.sanctuaire;
      ctx.lineWidth = Math.max(2, cote * 0.08);
      ctx.stroke();
    }

    /* 5. LES CASES JOUABLES. C'est l'information la plus utile de tout
       l'écran : elle est donc la plus visible, en pleine surface plutôt qu'en
       simple contour. */
    jouables.forEach(k => {
      const [r, c] = k.split(",").map(Number);
      const x = m.x0 + c * cote, y = m.y0 + r * cote;
      ctx.fillStyle = C.jouable;
      ctx.globalAlpha = k === survolCle ? 0.55 : 0.28;
      rectangleArrondi(x + 2, y + 2, cote - 4, cote - 4, cote * 0.14);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.jouable;
      ctx.lineWidth = Math.max(1.5, cote * 0.06);
      ctx.stroke();
    });

    /* 6. L'APERÇU DE POSE D'ÎLE, quand une forme est en main. */
    (etat.placementCells || []).forEach(([r, c]) => {
      if (r < 0 || c < 0 || r >= GRILLE || c >= GRILLE) return;
      const x = m.x0 + c * cote, y = m.y0 + r * cote;
      ctx.fillStyle = C.jouable;
      ctx.globalAlpha = 0.35;
      rectangleArrondi(x + 2, y + 2, cote - 4, cote - 4, cote * 0.14);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    /* 7. LES COURONNES POSÉES AU SOL. */
    [etat.artifact, etat.secondArtifact].forEach(a => {
      if (!a || !a.active || a.carrierId) return;
      const x = m.x0 + a.c * cote, y = m.y0 + a.r * cote;
      dessinerCouronne(x + cote / 2, y + cote / 2, cote * 0.52);
    });

    /* 8. LES GARDIENS. Disque plein à la couleur du camp, anneau blanc pour
       détacher du sol, couronne posée dessus si le gardien la porte. */
    (etat.characters || []).forEach(g => {
      const x = m.x0 + g.c * cote, y = m.y0 + g.r * cote;
      const cx = x + cote / 2, cy = y + cote / 2;
      const rayon = cote * 0.30;

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

      /* L'initiale du camp. Deux couleurs proches — et il y en a — cessent
         d'être ambiguës : on lit à qui appartient la pièce, on ne la devine
         pas. C'est ce qui manque le plus souvent à une vue tactique. */
      /* Le DERNIER mot du nom, pas le premier : « BOT AZUR » et « BOT CORAIL »
         donnaient tous deux un « B », ce qui ne distinguait rien. */
      const nom = ((etat.players || [])[g.player] || {}).name || String(g.player);
      const mots = String(nom).trim().split(/\s+/).filter(Boolean);
      const initiale = (mots[mots.length - 1] || "?").charAt(0).toUpperCase();
      ctx.fillStyle = "rgba(255,255,255,.95)";
      ctx.font = `700 ${Math.round(cote * 0.30)}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initiale, cx, cy + cote * 0.01);

      const porte = [etat.artifact, etat.secondArtifact]
        .some(a => a && a.active && a.carrierId === g.id);
      if (porte) dessinerCouronne(cx, cy - cote * 0.30, cote * 0.40);

      // Le gardien sélectionné : un halo net, jamais une couleur de plus.
      if (etat.selectedCharId === g.id) {
        ctx.beginPath();
        ctx.arc(cx, cy, rayon + cote * 0.13, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(2, cote * 0.06);
        ctx.strokeStyle = C.selection;
        ctx.stroke();
      }
    });

    /* 9. LES REPÈRES. Lettres et chiffres en bord de plateau : indispensables
       pour parler d'une position à voix haute ou la noter. */
    ctx.fillStyle = "rgba(242,247,251,.45)";
    ctx.font = `${Math.round(cote * 0.30)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < GRILLE; i++) {
      ctx.fillText(String(i), m.x0 + i * cote + cote / 2, m.y0 - cote * 0.32);
      ctx.fillText(String(i), m.x0 - cote * 0.32, m.y0 + i * cote + cote / 2);
    }

    /* 10. LA CASE SURVOLÉE, toujours dessinée en dernier pour rester lisible
        par-dessus tout le reste. */
    if (survol) {
      const x = m.x0 + survol[1] * cote, y = m.y0 + survol[0] * cote;
      ctx.strokeStyle = C.selection;
      ctx.lineWidth = Math.max(1.5, cote * 0.05);
      ctx.globalAlpha = 0.8;
      rectangleArrondi(x + 1, y + 1, cote - 2, cote - 2, cote * 0.16);
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

  /* Chaque geste est renvoyé à la vraie case. Le moteur voit exactement ce
     qu'il verrait d'un clic sur le plateau d'origine — aperçus de poussée,
     tracés de déplacement et messages compris. */
  function relayer(r, c, type) {
    const cellule = caseDuPlateauOrigine(r, c);
    if (!cellule) return;
    if (type === "click") { cellule.click(); return; }
    cellule.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  }

  function surSouris(evenement) {
    const rect = canvas.getBoundingClientRect();
    const px = (evenement.clientX - rect.left) * (canvas.width / rect.width);
    const py = (evenement.clientY - rect.top) * (canvas.height / rect.height);
    const trouvee = caseSousPoint(px, py);
    const change = !trouvee !== !survol
      || (trouvee && survol && (trouvee[0] !== survol[0] || trouvee[1] !== survol[1]));

    if (change) {
      if (survol) relayer(survol[0], survol[1], "mouseleave");
      survol = trouvee;
      if (survol) {
        relayer(survol[0], survol[1], "mouseenter");
        relayer(survol[0], survol[1], "mousemove");
      }
      demanderPeinture();
    }
  }

  function surClic(evenement) {
    evenement.preventDefault();
    if (survol) relayer(survol[0], survol[1], "click");
    demanderPeinture();
  }

  function surSortie() {
    if (survol) relayer(survol[0], survol[1], "mouseleave");
    survol = null;
    demanderPeinture();
  }

  /* ------------------------------------------------------------- CYCLE DE VIE */

  function dimensionner() {
    if (!canvas || !conteneur) return;
    const rect = conteneur.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    /* Le conteneur peut être plus haut que l'écran : sans borne, le plateau
       débordait par le bas et les dernières rangées devenaient inatteignables.
       On se limite donc AUSSI à ce que la fenêtre montre réellement. */
    const cote = Math.max(240, Math.floor(Math.min(
      rect.width || Infinity,
      rect.height || Infinity,
      window.innerWidth * 0.72,
      window.innerHeight * 0.84
    )));
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
    // Le clic droit sert à annuler dans le jeu : on le laisse passer tel quel.
    canvas.addEventListener("contextmenu", e => {
      if (!survol) return;
      e.preventDefault();
      relayer(survol[0], survol[1], "contextmenu");
    });

    /* Le plateau d'origine est repeint à chaque changement de jeu : l'observer
       revient à s'abonner aux événements du moteur sans y toucher. */
    const plateau = document.getElementById("board");
    if (plateau) {
      new MutationObserver(demanderPeinture)
        .observe(plateau, { childList: true, subtree: true, attributes: true });
    }
    window.addEventListener("resize", dimensionner);
  }

  function basculer(vers) {
    actif = vers === undefined ? !actif : !!vers;
    if (actif) construire();
    document.body.dataset.plateauTactique = actif ? "on" : "off";
    if (bouton) bouton.textContent = actif ? "VUE 3D" : "VUE 2D";
    if (actif) { dimensionner(); demanderPeinture(); }
  }

  let bouton = null;

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
      const cible = e.target;
      if (cible && /^(INPUT|TEXTAREA)$/.test(cible.tagName)) return;
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
