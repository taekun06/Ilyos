      /* =====================================================================
         PROGRESSION DU JOUEUR — niveau, XP, quêtes et offrande du jour

         Chaque partie terminée rapporte de l'XP, perdue, nulle ou gagnée ; la
         victoire en rapporte davantage, la première du jour encore plus. Le
         niveau ne redescend jamais. Les quêtes, l'offrande du jour et la
         collection de cosmétiques vivent dans ce même profil ; la saison
         viendra s'y brancher.

         Le profil vit sur l'appareil, sous une seule clé. La sauvegarde est
         automatique : pas d'export, pas d'import, rien à demander au joueur.
         navigator.storage.persist() demande au navigateur de ne pas effacer
         ces données de lui-même quand l'espace manque.

         Le calcul se fait sur les compteurs FINAUX de la partie : les
         annulations sont donc prises en compte sans effort, et les parties
         simulées par l'IA (ilyosSimulationActive) n'atteignent jamais l'écran
         de fin qui déclenche ce module.
         ===================================================================== */

      const PROGRESSION_STORAGE_KEY = "ilyos-profil-v1";
      const PROGRESSION_VERSION = 1;
      /* Valeurs de départ, à régler sur le jeu réel (étape 5 du plan). */
      const PROGRESSION_XP = {
        partie: 50,
        victoire: 50,
        nul: 25,
        premiereVictoireDuJour: 100,
        puzzle: 40,
        puzzleRejoue: 10,
        puzzleRejouesParJour: 3,
        tutoriel: 150
      };
      const PROGRESSION_DIFFICULTE = { easy: .8, normal: 1, hard: 1.25, expert: 1.5 };
      const PROGRESSION_DIFFICULTE_NOM = { easy: "Facile", normal: "Normal", hard: "Difficile", expert: "Expert" };
      /* Une partie de moins de quatre manches rapporte moitié moins : on ne
         farme pas l'XP en bâclant des parties. */
      const PROGRESSION_MANCHES_MIN = 4;
      /* La journée de jeu commence à 4 h, heure locale : une partie tardive
         compte encore pour la veille. */
      const PROGRESSION_HEURE_BASCULE = 4;

      /* QUÊTES. Chacune se compte sur un « événement » : la fin d'une partie
         (bilan, compteurs finaux) ou un puzzle résolu. Trois quêtes du jour au
         plus : chaque nouvelle journée complète les places libres, et une
         quête non faite reste en attente — manquer un jour ne fait rien
         perdre. « requiert » : jamais de quête dans un mode jamais essayé. */
      const PROGRESSION_QUETES_JOUR = [
        { type: "parties", cible: 2, xp: 75, texte: "Terminer 2 parties", compte: e => e.partie ? 1 : 0 },
        { type: "poussees", cible: 6, xp: 75, texte: "Pousser 6 fois", compte: e => e.stats ? e.stats.poussees || 0 : 0 },
        { type: "couronnes", cible: 3, xp: 75, texte: "Ramasser 3 couronnes", compte: e => e.stats ? e.stats.couronnes || 0 : 0 },
        { type: "iles", cible: 8, xp: 75, texte: "Poser 8 îles", compte: e => e.iles || 0 },
        { type: "sansChute", cible: 1, xp: 100, texte: "Gagner sans qu'un de ses gardiens tombe",
          compte: e => e.resultat === "victoire" && e.stats && !e.stats.chutes ? 1 : 0 },
        { type: "cpuFort", cible: 1, xp: 150, texte: "Battre le CPU Difficile ou Expert", requiert: "solo",
          compte: e => e.resultat === "victoire" && (e.difficulte === "hard" || e.difficulte === "expert") ? 1 : 0 },
        { type: "grand", cible: 1, xp: 75, texte: "Jouer en 13×13 ou en duel symétrique",
          compte: e => e.partie && (e.taille === 13 || e.plateau === "symmetric") ? 1 : 0 },
        { type: "puzzle", cible: 1, xp: 75, texte: "Résoudre un puzzle", compte: e => e.puzzle ? 1 : 0 },
        { type: "ensemble", cible: 1, xp: 100, texte: "Jouer en ligne ou en 2 contre 2", requiert: "multi",
          compte: e => e.partie && (e.mode === "online" || e.mode === "team") ? 1 : 0 }
      ];
      const PROGRESSION_QUETES_SEMAINE = [
        { type: "victoires", cible: 5, xp: 300, texte: "Gagner 5 parties", compte: e => e.resultat === "victoire" ? 1 : 0 },
        { type: "poussees", cible: 30, xp: 300, texte: "Pousser 30 fois", compte: e => e.stats ? e.stats.poussees || 0 : 0 },
        { type: "parties", cible: 8, xp: 300, texte: "Terminer 8 parties", compte: e => e.partie ? 1 : 0 },
        { type: "puzzles", cible: 3, xp: 250, texte: "Résoudre 3 puzzles", compte: e => e.puzzle ? 1 : 0 }
      ];
      const PROGRESSION_QUETES_MAX = 3;

      /* OFFRANDE DU JOUR : un calendrier de 7 cases qui compte les jours de
         présence, pas les jours consécutifs. Revenir après une absence reprend
         simplement à la case suivante ; rien ne retombe à zéro. */
      const PROGRESSION_OFFRANDES = [
        { xp: 30, texte: "30 XP" },
        { xp: 40, texte: "40 XP" },
        { xp: 50, texte: "50 XP" },
        { vent: 2, texte: "Vent porteur : +50 % d'XP sur 2 parties" },
        { xp: 60, texte: "60 XP" },
        { xp: 75, texte: "75 XP" },
        { xp: 150, texte: "150 XP" }
      ];
      const PROGRESSION_VENT_BONUS = .5;

      /* COLLECTION. Les cosmétiques ne changent rien aux règles : ils
         habillent le joueur de l'appareil (sa couleur, ses gardiens, son
         titre) et son ciel. Tous viennent d'assets déjà présents (KayKit et
         bandes de ciel CC0, voir docs/ASSETS.md). Chacun se débloque par un
         niveau ou par un exploit, et son déblocage est calculé à partir du
         profil : rien à stocker, rien qui puisse se désynchroniser. Le premier
         de chaque catégorie est l'apparence d'origine, toujours disponible.
         « valeur » est ce que le rendu consomme : une couleur, une clé de
         KAYKIT_ASSETS, une variante de KAYKIT_SKY_BAND_VARIANTS. */
      const PROGRESSION_COLLECTION = [
        { cle: "couleur", nom: "Couleur", objets: [
          { id: "or", nom: "Or d'Ilyos", valeur: "#ddb653", niveau: 1 },
          { id: "corail", nom: "Corail de l'aube", valeur: "#f2865e", niveau: 3 },
          { id: "lagon", nom: "Lagon", valeur: "#38c6cf", niveau: 6 },
          { id: "braise", nom: "Braise", valeur: "#e2503f", niveau: 10 },
          { id: "givre", nom: "Givre", valeur: "#dfeaff", niveau: 15 },
          { id: "rose", nom: "Rose d'aube", valeur: "#ff8fb8", saison: { id: "s1", palier: 3 } },
          { id: "saphir", nom: "Saphir", valeur: "#4f7dff", saison: { id: "s1", palier: 13 } },
          { id: "rubis", nom: "Rubis", valeur: "#c72d6b", saison: { id: "s1", palier: 23 } }
        ] },
        { cle: "heros", nom: "Gardiens", objets: [
          { id: "chevalier", nom: "Chevalier", valeur: "hero0", image: "assets/collection/heros-knight.webp", niveau: 1 },
          { id: "rodeuse", nom: "Rôdeuse", valeur: "hero2", image: "assets/collection/heros-rogue.webp", portrait: "assets/collection/portrait-rogue.webp", niveau: 4 },
          { id: "capuche", nom: "Rôdeuse encapuchonnée", valeur: "hero2Hooded", image: "assets/collection/heros-rogue-hooded.webp", portrait: "assets/collection/portrait-rogue-hooded.webp", niveau: 8 },
          { id: "barbare", nom: "Barbare", valeur: "hero3", image: "assets/collection/heros-barbarian.webp", portrait: "assets/collection/portrait-barbarian.webp", niveau: 12 },
          { id: "squelette", nom: "Squelette guerrier", valeur: "heroSkeletonWarrior", image: "assets/collection/heros-skeleton-warrior.webp", portrait: "assets/collection/portrait-skeleton-warrior.webp", saison: { id: "s1", palier: 10 } },
          { id: "squelette-rodeur", nom: "Squelette rôdeur", valeur: "heroSkeletonRogue", image: "assets/collection/heros-skeleton-rogue.webp", portrait: "assets/collection/portrait-skeleton-rogue.webp", saison: { id: "s1", palier: 20 } },
          { id: "squelette-mage", nom: "Squelette mage", valeur: "heroSkeletonMage", image: "assets/collection/heros-skeleton-mage.webp", portrait: "assets/collection/portrait-skeleton-mage.webp", saison: { id: "s1", palier: 28 } }
        ] },
        { cle: "ciel", nom: "Ciel", objets: [
          { id: "aube", nom: "Aube dorée", valeur: "blend0223", image: "assets/sky/sky-band-blend-02-23.webp", niveau: 1 },
          { id: "azur", nom: "Azur profond", valeur: "sky05", image: "assets/sky/sky-band-05.webp", niveau: 5 },
          { id: "rose", nom: "Rose des vents", valeur: "blend0223v2", image: "assets/sky/sky-band-blend-02-23-v2.webp", niveau: 9 },
          { id: "nuit", nom: "Nuit étoilée", valeur: "sky11", image: "assets/sky/sky-band-11.webp", niveau: 13 },
          { id: "crepuscule", nom: "Crépuscule", valeur: "sky23", image: "assets/sky/sky-band-23.webp", saison: { id: "s1", palier: 5 } },
          { id: "aurore", nom: "Aurore boréale", valeur: "sky14", image: "assets/sky/sky-band-14.webp", saison: { id: "s1", palier: 15 } },
          { id: "or-ancien", nom: "Or ancien", valeur: "sky02", image: "assets/sky/sky-band-02.webp", saison: { id: "s1", palier: 25 } }
        ] },
        { cle: "titre", nom: "Titre", objets: [
          { id: "voyageur", nom: "Voyageur des îles", niveau: 1 },
          { id: "pousseur", nom: "Pousseur de nuages", niveau: 5 },
          { id: "fidele", nom: "Fidèle de l'offrande", exploit: { cle: "offrandes", cible: 7, texte: "Recevoir 7 offrandes" } },
          { id: "enigmes", nom: "Esprit des énigmes", exploit: { cle: "puzzles", cible: 5, texte: "Résoudre 5 puzzles" } },
          { id: "expert", nom: "Tombeur d'Expert", exploit: { cle: "expert", cible: 1, texte: "Battre le CPU Expert" } },
          { id: "gardien", nom: "Gardien de l'aube", niveau: 20 },
          { id: "eveille", nom: "Âme éveillée", saison: { id: "s1", palier: 1 } },
          { id: "brise", nom: "Brise-nuages", saison: { id: "s1", palier: 8 } },
          { id: "heraut", nom: "Héraut de l'aube", saison: { id: "s1", palier: 18 } },
          { id: "phenix", nom: "Phénix d'Ilyos", saison: { id: "s1", palier: 27 } }
        ] },
        /* Îles du plateau, lues par la scène 3D (kaykit3d.js). */
        /* L'ancien id "herbe" (cubes) n'existe plus : un profil qui l'avait
           équipé par défaut passe aux îles flottantes, le nouveau rendu de base. */
        { cle: "plateau", nom: "Îles", objets: [
          { id: "flottantes", nom: "Îles flottantes", valeur: "gazon", image: "assets/collection/iles-flottantes.webp", niveau: 1 },
          { id: "kaykit", nom: "Îles KayKit", valeur: "kaykit", image: "assets/collection/iles-herbe.webp", niveau: 1 },
          { id: "archipel", nom: "Archipel de pierre", valeur: "archipel", image: "assets/collection/iles-archipel.webp", saison: { id: "s1", palier: 29 } }
        ] },
        /* Roche sous l'herbe des îles flottantes, avec sa gamme d'herbes (kaykit3d.js). */
        { cle: "roche", nom: "Roche des îles", objets: [
          { id: "basalte", nom: "Basalte nuit", valeur: "basalte", image: "assets/collection/roche-basalte.webp", niveau: 1 },
          { id: "ardoise", nom: "Ardoise", valeur: "ardoise", image: "assets/collection/roche-ardoise.webp", saison: { id: "s1", palier: 6 } },
          { id: "mousse", nom: "Mousse", valeur: "mousse", image: "assets/collection/roche-mousse.webp", saison: { id: "s1", palier: 12 } },
          { id: "gres", nom: "Grès", valeur: "gres", image: "assets/collection/roche-gres.webp", saison: { id: "s1", palier: 16 } },
          { id: "calcaire", nom: "Calcaire", valeur: "calcaire", image: "assets/collection/roche-calcaire.webp", saison: { id: "s1", palier: 19 } },
          { id: "ombre", nom: "Roche d'ombre", valeur: "ombre", image: "assets/collection/roche-ombre.webp", saison: { id: "s1", palier: 26 } }
        ] },
        /* Effet de la fenêtre de victoire, quand le joueur de l'appareil gagne. */
        { cle: "effet", nom: "Effet de victoire", objets: [
          { id: "sobre", nom: "Sobre", niveau: 1 },
          { id: "etincelles", nom: "Étincelles dorées", valeur: "etincelles", niveau: 7 },
          { id: "plumes", nom: "Plume de phénix", valeur: "plumes", saison: { id: "s1", palier: 30 } }
        ] }
      ];

      /* SAISONS : une piste gratuite de 30 paliers sur 8 semaines. Toute l'XP
         gagnée pendant la saison la fait avancer ; un palier tous les
         xpParPalier points. Chaque palier donne quelque chose : un cosmétique
         de saison (déclaré plus haut avec « saison: { id, palier } »), un
         vent porteur ou un coffre d'XP. Après le palier 30, chaque palier
         donne encore un vent porteur. Ce qui est gagné reste acquis après la
         fin de la saison. Les dates sont des journées de jeu (bascule à 4 h) :
         une nouvelle saison se publie comme une mise à jour du site. */
      const PROGRESSION_SAISONS = [
        {
          id: "s1", numero: 1, nom: "L'Éveil des îles", debut: "2026-10-01", fin: "2026-11-26", xpParPalier: 500,
          paliers: [
            { cosmetique: "titre:eveille" }, { vent: 1 }, { cosmetique: "couleur:rose" }, { xp: 150 },
            { cosmetique: "ciel:crepuscule" }, { cosmetique: "roche:ardoise" }, { xp: 150 }, { cosmetique: "titre:brise" },
            { vent: 1 }, { cosmetique: "heros:squelette" }, { xp: 200 }, { cosmetique: "roche:mousse" },
            { cosmetique: "couleur:saphir" }, { xp: 200 }, { cosmetique: "ciel:aurore" }, { cosmetique: "roche:gres" },
            { xp: 200 }, { cosmetique: "titre:heraut" }, { cosmetique: "roche:calcaire" }, { cosmetique: "heros:squelette-rodeur" },
            { xp: 250 }, { vent: 2 }, { cosmetique: "couleur:rubis" }, { xp: 250 },
            { cosmetique: "ciel:or-ancien" }, { cosmetique: "roche:ombre" }, { cosmetique: "titre:phenix" }, { cosmetique: "heros:squelette-mage" },
            { cosmetique: "plateau:archipel" }, { cosmetique: "effet:plumes" }
          ],
          apres: { vent: 1 }
        }
      ];

      let progressionDernierePartie = null;
      let progressionPersistanceDemandee = false;

      /* XP nécessaire pour passer du niveau n au niveau n + 1. */
      function progressionXpPourPasser(niveau) {
        return Math.min(1000, 150 + 50 * Math.max(1, Math.floor(niveau)));
      }

      function progressionNiveauDepuisXp(xpTotal) {
        let reste = Math.max(0, Math.floor(Number(xpTotal) || 0));
        let niveau = 1;
        while (reste >= progressionXpPourPasser(niveau)) {
          reste -= progressionXpPourPasser(niveau);
          niveau++;
        }
        return { niveau, xpDansNiveau: reste, xpPourSuivant: progressionXpPourPasser(niveau) };
      }

      function progressionJour(date = new Date()) {
        const decale = new Date(date.getTime() - PROGRESSION_HEURE_BASCULE * 3600 * 1000);
        const deux = n => String(n).padStart(2, "0");
        return `${decale.getFullYear()}-${deux(decale.getMonth() + 1)}-${deux(decale.getDate())}`;
      }

      function progressionProfilVide() {
        return {
          version: PROGRESSION_VERSION,
          /* Nom choisi par le joueur, affiché dans le panneau Progression. */
          pseudo: null,
          xp: 0,
          parties: 0,
          victoires: 0,
          derniereVictoireJour: null,
          puzzles: { jour: null, rejoues: 0 },
          tutorielRecompense: false,
          modes: {},
          quetes: { jour: null, actives: [], changeeLe: null, semaine: null },
          offrande: { prochaine: 0, dernierJour: null, vent: 0 },
          exploits: { offrandes: 0, expert: 0 },
          /* XP de chaque saison et dernier palier dont la récompense est donnée. */
          saisons: {},
          equipement: progressionEquipementParDefaut(),
          /* Objets déjà montrés au joueur : les autres portent « nouveau ». */
          vus: progressionCollectionParDefaut()
        };
      }

      function progressionCharger() {
        let brut = null;
        try { brut = JSON.parse(localStorage.getItem(PROGRESSION_STORAGE_KEY) || "null"); } catch (_) { }
        const profil = progressionProfilVide();
        if (!brut || typeof brut !== "object") return profil;
        /* Fusion champ par champ : un profil d'une version antérieure garde ce
           qu'il connaît et reçoit les valeurs par défaut du reste. */
        profil.pseudo = progressionPseudoValide(brut.pseudo);
        if (Number.isFinite(brut.xp) && brut.xp >= 0) profil.xp = Math.floor(brut.xp);
        if (Number.isFinite(brut.parties)) profil.parties = brut.parties;
        if (Number.isFinite(brut.victoires)) profil.victoires = brut.victoires;
        if (typeof brut.derniereVictoireJour === "string") profil.derniereVictoireJour = brut.derniereVictoireJour;
        if (brut.puzzles && typeof brut.puzzles === "object") {
          profil.puzzles.jour = typeof brut.puzzles.jour === "string" ? brut.puzzles.jour : null;
          profil.puzzles.rejoues = Number.isFinite(brut.puzzles.rejoues) ? brut.puzzles.rejoues : 0;
        }
        profil.tutorielRecompense = brut.tutorielRecompense === true;
        if (brut.modes && typeof brut.modes === "object") profil.modes = { ...brut.modes };
        const q = brut.quetes;
        if (q && typeof q === "object") {
          profil.quetes.jour = typeof q.jour === "string" ? q.jour : null;
          profil.quetes.changeeLe = typeof q.changeeLe === "string" ? q.changeeLe : null;
          profil.quetes.actives = Array.isArray(q.actives)
            ? q.actives.filter(a => a && progressionModeleQuete(PROGRESSION_QUETES_JOUR, a.type)).slice(0, PROGRESSION_QUETES_MAX)
            : [];
          profil.quetes.semaine = q.semaine && progressionModeleQuete(PROGRESSION_QUETES_SEMAINE, q.semaine.type) ? q.semaine : null;
        }
        const o = brut.offrande;
        if (o && typeof o === "object") {
          profil.offrande.prochaine = Number.isInteger(o.prochaine) ? ((o.prochaine % 7) + 7) % 7 : 0;
          profil.offrande.dernierJour = typeof o.dernierJour === "string" ? o.dernierJour : null;
          profil.offrande.vent = Number.isFinite(o.vent) ? Math.max(0, o.vent) : 0;
        }
        const ex = brut.exploits;
        if (ex && typeof ex === "object") {
          profil.exploits.offrandes = Number.isFinite(ex.offrandes) ? ex.offrandes : 0;
          profil.exploits.expert = Number.isFinite(ex.expert) ? ex.expert : 0;
        } else {
          /* Profil d'avant la collection : les offrandes déjà reçues comptent. */
          profil.exploits.offrandes = profil.offrande.prochaine;
        }
        if (brut.equipement && typeof brut.equipement === "object") {
          PROGRESSION_COLLECTION.forEach(categorie => {
            const id = brut.equipement[categorie.cle];
            if (categorie.objets.some(objet => objet.id === id)) profil.equipement[categorie.cle] = id;
          });
        }
        if (brut.saisons && typeof brut.saisons === "object") {
          PROGRESSION_SAISONS.forEach(saison => {
            const sv = brut.saisons[saison.id];
            if (sv && Number.isFinite(sv.xp)) profil.saisons[saison.id] = { xp: Math.max(0, sv.xp), paye: Number.isInteger(sv.paye) ? sv.paye : 0 };
          });
        }
        if (Array.isArray(brut.vus)) profil.vus = [...new Set([...profil.vus, ...brut.vus.filter(v => typeof v === "string")])];
        return profil;
      }

      /* COMPTE EN LIGNE : pseudo + mot de passe (fonction Netlify /api/compte).
         L'appareil garde seulement le pseudo et un jeton ; le mot de passe ne
         sert qu'à créer le compte ou à s'y reconnecter sur un autre appareil.
         Chaque enregistrement du profil part au serveur après quelques
         secondes de calme. Au lancement, le profil le plus avancé (en XP)
         l'emporte : une progression n'est jamais écrasée par une plus petite. */
      const PROGRESSION_COMPTE_KEY = "ilyos-compte-v1";
      /* Sur Netlify (et en local) la fonction est sur le même site. Ailleurs
         (taekun.fr, GitHub Pages), on l'appelle chez Netlify : la production
         d'abord, puis une préversion qui la porte tant que la production est
         figée (crédits Netlify épuisés). Les comptes sont les mêmes partout
         (magasin Netlify Blobs commun au site). */
      const PROGRESSION_COMPTE_URLS = (() => {
        const hote = location.hostname;
        if (/netlify\.app$/.test(hote) || hote === "localhost" || hote === "127.0.0.1" || location.protocol === "file:") return ["/api/compte"];
        return [
          "https://batbat.netlify.app/api/compte",
          "https://deploy-preview-PREVIEW--batbat.netlify.app/api/compte"
        ];
      })();
      let progressionCompteUrlBonne = 0;
      let progressionEnvoiMinuteur = null;

      function progressionCompteLire() {
        try {
          const c = JSON.parse(localStorage.getItem(PROGRESSION_COMPTE_KEY) || "null");
          return c && typeof c.pseudo === "string" && typeof c.jeton === "string" ? c : null;
        } catch (_) { return null; }
      }

      function progressionCompteEcrire(compte) {
        try {
          if (compte) localStorage.setItem(PROGRESSION_COMPTE_KEY, JSON.stringify(compte));
          else localStorage.removeItem(PROGRESSION_COMPTE_KEY);
        } catch (_) { }
      }

      async function progressionCompteAppel(corps, keepalive = false) {
        /* text/plain : requête « simple », sans aller-retour CORS préalable. */
        const essayer = async url => {
          const reponse = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
            body: JSON.stringify(corps),
            keepalive
          });
          if (reponse.status === 404 || reponse.status === 405) return null;
          const donnees = await reponse.json().catch(() => null);
          return donnees && typeof donnees === "object" ? donnees : { ok: false, erreur: "serveur" };
        };
        let erreur = "indisponible";
        for (let i = 0; i < PROGRESSION_COMPTE_URLS.length; i++) {
          const indice = (progressionCompteUrlBonne + i) % PROGRESSION_COMPTE_URLS.length;
          try {
            const r = await essayer(PROGRESSION_COMPTE_URLS[indice]);
            if (r) { progressionCompteUrlBonne = indice; return r; }
          } catch (_) { erreur = "reseau"; }
        }
        return { ok: false, erreur };
      }

      function progressionCompteEnvoyer(keepalive = false) {
        clearTimeout(progressionEnvoiMinuteur);
        progressionEnvoiMinuteur = null;
        const compte = progressionCompteLire();
        if (!compte) return Promise.resolve(null);
        const texte = localStorage.getItem(PROGRESSION_STORAGE_KEY);
        if (!texte || texte === compte.envoye) return Promise.resolve(null);
        let profil = null;
        try { profil = JSON.parse(texte); } catch (_) { return Promise.resolve(null); }
        return progressionCompteAppel({ action: "sauver", pseudo: compte.pseudo, jeton: compte.jeton, profil }, keepalive).then(r => {
          const actuel = progressionCompteLire();
          if (r.ok && actuel && actuel.jeton === compte.jeton) progressionCompteEcrire({ ...actuel, envoye: texte });
          else if (r.erreur === "jeton") progressionCompteEcrire(null);
          return r;
        });
      }

      function progressionCompteProgrammerEnvoi() {
        if (!progressionCompteLire()) return;
        clearTimeout(progressionEnvoiMinuteur);
        progressionEnvoiMinuteur = setTimeout(() => progressionCompteEnvoyer(), 3000);
      }

      try {
        window.addEventListener("pagehide", () => { if (progressionEnvoiMinuteur) progressionCompteEnvoyer(true); });
      } catch (_) { }

      /* Garde le profil le plus avancé des deux, au nom du compte. */
      function progressionCompteFusionner(pseudo, profilServeur) {
        const local = progressionCharger();
        let texte = null;
        if (profilServeur && typeof profilServeur === "object" && (Number(profilServeur.xp) || 0) > local.xp) {
          texte = JSON.stringify({ ...profilServeur, pseudo });
          try { localStorage.setItem(PROGRESSION_STORAGE_KEY, texte); } catch (_) { }
          const compte = progressionCompteLire();
          if (compte) progressionCompteEcrire({ ...compte, envoye: texte });
          return "serveur";
        }
        local.pseudo = pseudo;
        progressionEnregistrer(local);
        return "local";
      }

      /* Le nom du voyageur suffit : nouveau nom = nouveau compte, nom connu
         = sa progression revient. Un nom sécurisé demande son mot de passe. */
      async function progressionEntrer(pseudo, motDePasse) {
        const nom = progressionPseudoValide(pseudo);
        if (!nom) return { ok: false, erreur: "pseudo" };
        const profil = progressionCharger();
        profil.pseudo = nom;
        const corps = { action: "entrer", pseudo: nom, profil };
        if (motDePasse) corps.motDePasse = motDePasse;
        const r = await progressionCompteAppel(corps);
        if (!r.ok) return r;
        progressionCompteEcrire({ pseudo: r.pseudo, jeton: r.jeton, protege: !!r.protege, envoye: r.nouveau ? JSON.stringify(profil) : null });
        if (r.nouveau) { progressionEnregistrer(profil); return { ok: true, pseudo: r.pseudo, garde: "local" }; }
        const garde = progressionCompteFusionner(r.pseudo, r.profil);
        if (garde === "local") await progressionCompteEnvoyer();
        return { ok: true, pseudo: r.pseudo, garde };
      }

      async function progressionSecuriser(motDePasse) {
        const compte = progressionCompteLire();
        if (!compte) return { ok: false, erreur: "sans-compte" };
        const r = await progressionCompteAppel({ action: "securiser", pseudo: compte.pseudo, jeton: compte.jeton, motDePasse });
        if (r.ok) progressionCompteEcrire({ ...progressionCompteLire(), protege: true });
        else if (r.erreur === "jeton") progressionCompteEcrire(null);
        return r;
      }

      async function progressionCreerCompte(pseudo, motDePasse) {
        const nom = progressionPseudoValide(pseudo);
        if (!nom) return { ok: false, erreur: "pseudo" };
        const profil = progressionCharger();
        profil.pseudo = nom;
        const r = await progressionCompteAppel({ action: "creer", pseudo: nom, motDePasse, profil });
        if (!r.ok) return r;
        progressionCompteEcrire({ pseudo: r.pseudo, jeton: r.jeton, envoye: JSON.stringify(profil) });
        progressionEnregistrer(profil);
        return { ok: true, pseudo: r.pseudo };
      }

      async function progressionConnecter(pseudo, motDePasse) {
        const nom = progressionPseudoValide(pseudo);
        if (!nom) return { ok: false, erreur: "pseudo" };
        const r = await progressionCompteAppel({ action: "connexion", pseudo: nom, motDePasse });
        if (!r.ok) return r;
        progressionCompteEcrire({ pseudo: r.pseudo, jeton: r.jeton, envoye: null });
        const garde = progressionCompteFusionner(r.pseudo, r.profil);
        return { ok: true, pseudo: r.pseudo, garde };
      }

      /* Au lancement : récupère le profil du compte s'il est plus avancé,
         sinon envoie celui de l'appareil. */
      async function progressionSynchroniser() {
        const compte = progressionCompteLire();
        if (!compte) return progressionRattacher();
        const r = await progressionCompteAppel({ action: "lire", pseudo: compte.pseudo, jeton: compte.jeton });
        if (!r.ok) {
          if (r.erreur === "jeton") progressionCompteEcrire(null);
          return r;
        }
        if (typeof r.protege === "boolean") progressionCompteEcrire({ ...progressionCompteLire(), protege: r.protege });
        const garde = progressionCompteFusionner(r.pseudo, r.profil);
        if (garde === "local") await progressionCompteEnvoyer();
        return { ok: true, garde };
      }

      /* Un nom choisi sans sauvegarde en ligne (serveur injoignable à ce
         moment-là) y est rattaché tout seul au lancement suivant, s'il est
         encore libre. Sinon l'icône nuage reste là pour le faire à la main. */
      async function progressionRattacher() {
        const profil = progressionCharger();
        const nom = progressionPseudoValide(profil.pseudo);
        if (!nom) return { ok: false, erreur: "sans-compte" };
        const r = await progressionCompteAppel({ action: "entrer", pseudo: nom, profil, seulementNouveau: true });
        if (!r.ok || !r.nouveau) return r.ok ? { ok: false, erreur: "pseudo-pris" } : r;
        progressionCompteEcrire({ pseudo: r.pseudo, jeton: r.jeton, protege: false, envoye: JSON.stringify(profil) });
        return { ok: true, garde: "local", rattache: true };
      }

      function progressionDeconnecter() {
        progressionCompteEcrire(null);
      }

      /* Pseudo : 2 à 16 caractères, lettres (accents compris), chiffres,
         espace, tiret, point ou souligné. Renvoie null s'il ne convient pas. */
      function progressionPseudoValide(nom) {
        if (typeof nom !== "string") return null;
        const propre = nom.normalize("NFC").replace(/\s+/g, " ").trim();
        return /^[\p{L}\p{N} ._-]{2,16}$/u.test(propre) ? propre : null;
      }

      function progressionDefinirPseudo(nom) {
        const pseudo = progressionPseudoValide(nom);
        if (!pseudo) return null;
        const profil = progressionCharger();
        profil.pseudo = pseudo;
        progressionEnregistrer(profil);
        return pseudo;
      }

      function progressionEnregistrer(profil) {
        try { localStorage.setItem(PROGRESSION_STORAGE_KEY, JSON.stringify(profil)); } catch (_) { }
        progressionCompteProgrammerEnvoi();
        if (!progressionPersistanceDemandee) {
          progressionPersistanceDemandee = true;
          try { navigator.storage?.persist?.().catch(() => { }); } catch (_) { }
        }
      }

      /* ---------- Quêtes ---------------------------------------------- */
      function progressionModeleQuete(catalogue, type) {
        return catalogue.find(modele => modele.type === type) || null;
      }

      /* Le lundi de la semaine du jour donné, comme clé de semaine. */
      function progressionSemaine(jour) {
        const [a, m, j] = jour.split("-").map(Number);
        const date = new Date(a, m - 1, j, 12);
        date.setDate(date.getDate() - (date.getDay() + 6) % 7);
        return progressionJour(new Date(date.getTime() + PROGRESSION_HEURE_BASCULE * 3600 * 1000));
      }

      function progressionQuetePermise(profil, modele) {
        if (modele.requiert === "solo") return !!profil.modes.solo;
        if (modele.requiert === "multi") return !!(profil.modes.online || profil.modes.team);
        return true;
      }

      function progressionTirerQuete(profil, exclus) {
        const choix = PROGRESSION_QUETES_JOUR.filter(modele =>
          !exclus.includes(modele.type) && progressionQuetePermise(profil, modele));
        if (!choix.length) return null;
        const modele = choix[Math.floor(Math.random() * choix.length)];
        return { type: modele.type, fait: 0, finie: false };
      }

      /* Nouvelle journée : les quêtes finies s'en vont, les places libres se
         remplissent. Nouvelle semaine : une nouvelle quête de la semaine. */
      function progressionRenouvelerQuetes(profil, jour = progressionJour()) {
        const q = profil.quetes;
        let change = false;
        if (q.jour !== jour) {
          q.actives = q.actives.filter(a => !a.finie);
          while (q.actives.length < PROGRESSION_QUETES_MAX) {
            const nouvelle = progressionTirerQuete(profil, q.actives.map(a => a.type));
            if (!nouvelle) break;
            q.actives.push(nouvelle);
          }
          q.jour = jour;
          change = true;
        }
        const semaine = progressionSemaine(jour);
        if (!q.semaine || q.semaine.cle !== semaine) {
          const modele = PROGRESSION_QUETES_SEMAINE[Math.floor(Math.random() * PROGRESSION_QUETES_SEMAINE.length)];
          q.semaine = { cle: semaine, type: modele.type, fait: 0, finie: false };
          change = true;
        }
        return change;
      }

      /* Fait avancer chaque quête sur un événement ; renvoie celles qui
         viennent de s'achever, avec leur XP (pas encore ajoutée). */
      function progressionAvancerQuetes(profil, evenement) {
        const finies = [];
        const avancer = (quete, catalogue) => {
          const modele = quete && progressionModeleQuete(catalogue, quete.type);
          if (!modele || quete.finie) return;
          const pas = Math.max(0, Number(modele.compte(evenement)) || 0);
          if (!pas) return;
          quete.fait = Math.min(modele.cible, (quete.fait || 0) + pas);
          if (quete.fait >= modele.cible) {
            quete.finie = true;
            finies.push({ texte: modele.texte, xp: modele.xp, semaine: catalogue === PROGRESSION_QUETES_SEMAINE });
          }
        };
        profil.quetes.actives.forEach(quete => avancer(quete, PROGRESSION_QUETES_JOUR));
        avancer(profil.quetes.semaine, PROGRESSION_QUETES_SEMAINE);
        return finies;
      }

      /* Vue lisible des quêtes, pour la fenêtre de fin et le menu. */
      function progressionVueQuetes(profil) {
        const vue = (quete, catalogue) => {
          const modele = quete && progressionModeleQuete(catalogue, quete.type);
          return modele ? { texte: modele.texte, xp: modele.xp, cible: modele.cible,
            fait: Math.min(modele.cible, quete.fait || 0), finie: !!quete.finie } : null;
        };
        return {
          jour: profil.quetes.actives.map(q => vue(q, PROGRESSION_QUETES_JOUR)).filter(Boolean),
          semaine: vue(profil.quetes.semaine, PROGRESSION_QUETES_SEMAINE),
          changementDispo: profil.quetes.changeeLe !== progressionJour()
            && profil.quetes.actives.some(q => !q.finie)
        };
      }

      /* Une fois par jour, remplacer une quête non finie par une autre. */
      function progressionChangerQuete(index) {
        const profil = progressionCharger();
        progressionRenouvelerQuetes(profil);
        const jour = progressionJour();
        const quete = profil.quetes.actives[index];
        if (!quete || quete.finie || profil.quetes.changeeLe === jour) return false;
        const exclus = profil.quetes.actives.map(a => a.type);
        const nouvelle = progressionTirerQuete(profil, exclus);
        if (!nouvelle) return false;
        profil.quetes.actives[index] = nouvelle;
        profil.quetes.changeeLe = jour;
        progressionEnregistrer(profil);
        return true;
      }

      /* ---------- Collection ------------------------------------------ */
      function progressionEquipementParDefaut() {
        const equipement = {};
        PROGRESSION_COLLECTION.forEach(categorie => { equipement[categorie.cle] = categorie.objets[0].id; });
        return equipement;
      }

      function progressionCollectionParDefaut() {
        return PROGRESSION_COLLECTION.map(categorie => `${categorie.cle}:${categorie.objets[0].id}`);
      }

      function progressionObjet(cleCategorie, id) {
        const categorie = PROGRESSION_COLLECTION.find(c => c.cle === cleCategorie);
        return categorie ? categorie.objets.find(objet => objet.id === id) || null : null;
      }

      /* Puzzles résolus au moins une fois : lus dans la sauvegarde du cabinet
         d'énigmes, qui les compte déjà (même ceux d'avant la collection). */
      function progressionPuzzlesResolus() {
        try {
          return Object.values(puzzleLoadProgress()).filter(entree => entree && entree.solved).length;
        } catch (_) { return 0; }
      }

      /* Où en est le joueur pour un objet : débloqué ou non, et le chemin. */
      function progressionCondition(profil, objet, niveau, puzzles) {
        if (objet.saison) {
          const saison = progressionSaison(objet.saison.id);
          const palier = saison ? progressionPalierAtteint(profil, saison) : 0;
          return { debloque: palier >= objet.saison.palier,
            texte: `Saison ${saison ? saison.numero : ""} · palier ${objet.saison.palier}`,
            fait: Math.min(palier, objet.saison.palier), cible: objet.saison.palier, saison: true };
        }
        if (objet.exploit) {
          const valeur = objet.exploit.cle === "puzzles" ? puzzles : (profil.exploits[objet.exploit.cle] || 0);
          return { debloque: valeur >= objet.exploit.cible, texte: objet.exploit.texte,
            fait: Math.min(valeur, objet.exploit.cible), cible: objet.exploit.cible };
        }
        return { debloque: niveau >= (objet.niveau || 1), texte: `Niveau ${objet.niveau || 1}` };
      }

      /* puzzlesEnPlus : un puzzle résolu à l'instant, pas encore inscrit. */
      function progressionVueCollection(profil, puzzlesEnPlus = 0) {
        const niveau = progressionNiveauDepuisXp(profil.xp).niveau;
        const puzzles = progressionPuzzlesResolus() + puzzlesEnPlus;
        const vus = new Set(profil.vus);
        return PROGRESSION_COLLECTION.map(categorie => ({
          cle: categorie.cle,
          nom: categorie.nom,
          objets: categorie.objets.map(objet => {
            const condition = progressionCondition(profil, objet, niveau, puzzles);
            return {
              id: objet.id, nom: objet.nom, valeur: objet.valeur || null, image: objet.image || null,
              ...condition,
              equipe: profil.equipement[categorie.cle] === objet.id,
              nouveau: condition.debloque && !vus.has(`${categorie.cle}:${objet.id}`)
            };
          })
        }));
      }

      /* Clés « categorie:id » de tout ce qui est débloqué. */
      function progressionDebloques(profil, puzzlesEnPlus = 0) {
        const cles = [];
        progressionVueCollection(profil, puzzlesEnPlus).forEach(categorie => categorie.objets.forEach(objet => {
          if (objet.debloque) cles.push(`${categorie.cle}:${objet.id}`);
        }));
        return cles;
      }

      function progressionNouveautes(profil) {
        const vus = new Set(profil.vus);
        return progressionDebloques(profil).filter(cle => !vus.has(cle)).length;
      }

      /* Ce qu'un gain vient d'ouvrir, pour l'annoncer dans la fenêtre de fin. */
      function progressionNouveauxObjets(avant, profil, puzzlesEnPlus = 0) {
        const deja = new Set(avant);
        return progressionDebloques(profil, puzzlesEnPlus).filter(cle => !deja.has(cle)).map(cle => {
          const [categorie, id] = cle.split(":");
          const objet = progressionObjet(categorie, id);
          return { categorie, id, nom: objet.nom, valeur: objet.valeur || null, image: objet.portrait || objet.image || null };
        });
      }

      function progressionMarquerVus() {
        const profil = progressionCharger();
        const avant = profil.vus.length;
        profil.vus = [...new Set([...profil.vus, ...progressionDebloques(profil)])];
        if (profil.vus.length !== avant) progressionEnregistrer(profil);
      }

      /* Équiper un objet débloqué. Le ciel et les îles changent aussitôt si la
         scène 3D existe ; couleur et gardiens s'appliquent à la prochaine partie. */
      function progressionEquiper(cleCategorie, id) {
        const profil = progressionCharger();
        const vue = progressionVueCollection(profil).find(c => c.cle === cleCategorie);
        const objet = vue && vue.objets.find(o => o.id === id);
        if (!objet || !objet.debloque) return false;
        profil.equipement[cleCategorie] = id;
        if (!profil.vus.includes(`${cleCategorie}:${id}`)) profil.vus.push(`${cleCategorie}:${id}`);
        progressionEnregistrer(profil);
        if (cleCategorie === "ciel") {
          try { if (kaykit3D) window.ILYOS_SKY?.variante?.(objet.valeur); } catch (_) { }
        }
        if (cleCategorie === "plateau") kaykitChoisirIles(objet.valeur);
        if (cleCategorie === "roche") kaykitChoisirRoche(objet.valeur);
        return true;
      }

      function progressionValeurEquipee(profil, cleCategorie) {
        const objet = progressionObjet(cleCategorie, profil.equipement[cleCategorie]);
        return objet ? objet.valeur || objet.nom : null;
      }

      /* Ciel du profil, lu par la scène 3D à son ouverture (kaykit3d.js). */
      function progressionCielEquipe() {
        try { return progressionValeurEquipee(progressionCharger(), "ciel"); } catch (_) { return null; }
      }

      /* Îles du profil, lues par la scène 3D à son ouverture (kaykit3d.js). */
      function progressionPlateauEquipe() {
        try { return progressionValeurEquipee(progressionCharger(), "plateau"); } catch (_) { return null; }
      }

      /* Roche des îles du profil, lue par la scène 3D à son ouverture (kaykit3d.js). */
      function progressionRocheEquipee() {
        try { return progressionValeurEquipee(progressionCharger(), "roche"); } catch (_) { return null; }
      }

      /* Apparence équipée sur cet appareil, en identifiants du catalogue :
         c'est ce qui voyage avec le « hello » d'une partie en ligne. */
      function progressionApparenceLocale() {
        try {
          const equipement = progressionCharger().equipement;
          return { couleur: equipement.couleur, heros: equipement.heros, titre: equipement.titre };
        } catch (_) { return null; }
      }

      /* Habille un joueur d'après une apparence (locale ou reçue en ligne).
         Seuls les identifiants du catalogue sont acceptés ; les choix par
         défaut ne changent rien, pour que l'adversaire garde sa couleur et
         son mage habituels. Une couleur déjà portée par un autre joueur est
         ignorée. */
      function progressionAppliquerApparence(joueur, apparence, joueurs = []) {
        if (!joueur || !apparence || typeof apparence !== "object") return;
        const defaut = progressionEquipementParDefaut();
        const choisi = cle => {
          const id = typeof apparence[cle] === "string" ? apparence[cle] : "";
          return id && id !== defaut[cle] ? progressionObjet(cle, id) : null;
        };
        const couleur = choisi("couleur");
        if (couleur && !joueurs.some(j => j !== joueur && String(j.color).toLowerCase() === couleur.valeur.toLowerCase())) {
          joueur.color = couleur.valeur;
        }
        const heros = choisi("heros");
        if (heros) joueur.heros = heros.valeur;
        const titre = choisi("titre");
        if (titre) joueur.titre = titre.nom;
      }

      /* Partie locale (solo, duel, 2 contre 2) : le premier humain, celui de
         l'appareil, porte sa couleur, son gardien et son titre. En ligne,
         voir createOnlineGame() (core.js). */
      function progressionHabillerJoueurs(joueurs) {
        try {
          const moi = joueurs.find(joueur => !joueur.isAI);
          if (moi) progressionAppliquerApparence(moi, progressionApparenceLocale(), joueurs);
        } catch (_) { }
      }

      /* Portrait du HUD pour un gardien choisi dans la collection. */
      function progressionPortraitDuJoueur(joueur) {
        if (!joueur || !joueur.heros) return null;
        const categorie = PROGRESSION_COLLECTION.find(c => c.cle === "heros");
        const objet = categorie.objets.find(o => o.valeur === joueur.heros);
        return objet ? objet.portrait || null : null;
      }

      /* ---------- Saison ---------------------------------------------- */
      function progressionSaison(id) {
        return PROGRESSION_SAISONS.find(saison => saison.id === id) || null;
      }

      /* La saison en cours, ou à défaut la dernière terminée (pour montrer ce
         qui a été gagné). Aucune si aucune n'a commencé. */
      function progressionSaisonCourante(jour = progressionJour()) {
        const commencees = PROGRESSION_SAISONS.filter(saison => saison.debut <= jour);
        return commencees[commencees.length - 1] || null;
      }

      function progressionSaisonActive(saison, jour = progressionJour()) {
        return !!saison && saison.debut <= jour && jour < saison.fin;
      }

      function progressionPalierAtteint(profil, saison) {
        const xp = profil.saisons[saison.id]?.xp || 0;
        return Math.floor(xp / saison.xpParPalier);
      }

      function progressionRecompensePalier(saison, n) {
        return saison.paliers[n - 1] || saison.apres;
      }

      function progressionTexteRecompense(recompense) {
        if (recompense.cosmetique) {
          const [categorie, id] = recompense.cosmetique.split(":");
          return progressionObjet(categorie, id)?.nom || "";
        }
        if (recompense.vent) return `Vent porteur : ${recompense.vent} partie${recompense.vent > 1 ? "s" : ""} à +50 %`;
        return `Coffre de ${recompense.xp} XP`;
      }

      /* XP gagnée pendant la saison : avance la piste et donne les
         récompenses des paliers franchis (les cosmétiques n'ont rien à
         donner : leur déblocage se lit sur le palier). Renvoie les paliers. */
      function progressionAvancerSaison(profil, xp, jour = progressionJour()) {
        const saison = progressionSaisonCourante(jour);
        if (!progressionSaisonActive(saison, jour) || !(xp > 0)) return [];
        const etat = profil.saisons[saison.id] || (profil.saisons[saison.id] = { xp: 0, paye: 0 });
        etat.xp += Math.round(xp);
        const franchis = [];
        while (etat.paye < Math.floor(etat.xp / saison.xpParPalier)) {
          etat.paye++;
          const recompense = progressionRecompensePalier(saison, etat.paye);
          if (recompense.vent) profil.offrande.vent += recompense.vent;
          /* Le coffre compte pour le niveau, pas pour la saison : pas de
             réaction en chaîne d'un palier à l'autre. */
          if (recompense.xp) profil.xp += recompense.xp;
          franchis.push({ palier: etat.paye, texte: progressionTexteRecompense(recompense), cosmetique: !!recompense.cosmetique });
        }
        return franchis;
      }

      function progressionVueSaison(profil) {
        const saison = progressionSaisonCourante();
        if (!saison) return null;
        const jour = progressionJour();
        const xp = profil.saisons[saison.id]?.xp || 0;
        const palier = Math.floor(xp / saison.xpParPalier);
        const [a, m, j] = saison.fin.split("-").map(Number);
        const [a2, m2, j2] = jour.split("-").map(Number);
        const joursRestants = Math.max(0, Math.round((Date.UTC(a, m - 1, j) - Date.UTC(a2, m2 - 1, j2)) / 86400000));
        return {
          id: saison.id, numero: saison.numero, nom: saison.nom,
          active: progressionSaisonActive(saison, jour), joursRestants,
          palier, xpDansPalier: xp - palier * saison.xpParPalier, xpParPalier: saison.xpParPalier,
          paliers: saison.paliers.map((recompense, i) => {
            const vue = { palier: i + 1, texte: progressionTexteRecompense(recompense), obtenu: palier >= i + 1 };
            if (recompense.cosmetique) {
              const [categorie, id] = recompense.cosmetique.split(":");
              const objet = progressionObjet(categorie, id);
              Object.assign(vue, { categorie, valeur: objet.valeur || null, image: objet.image || null });
            } else vue.categorie = recompense.vent ? "vent" : "coffre";
            return vue;
          })
        };
      }

      /* ---------- Offrande du jour ------------------------------------- */
      function progressionOffrandeDispo(profil) {
        return profil.offrande.dernierJour !== progressionJour();
      }

      function progressionReclamerOffrande() {
        const profil = progressionCharger();
        if (!progressionOffrandeDispo(profil)) return null;
        const indice = profil.offrande.prochaine;
        const offrande = PROGRESSION_OFFRANDES[indice];
        profil.offrande.dernierJour = progressionJour();
        profil.offrande.prochaine = (indice + 1) % PROGRESSION_OFFRANDES.length;
        if (offrande.vent) profil.offrande.vent += offrande.vent;
        const avant = progressionDebloques(profil);
        profil.exploits.offrandes++;
        const changement = progressionAjouterXp(profil, offrande.xp || 0);
        progressionEnregistrer(profil);
        if (offrande.xp) progressionJournalNoter({ type: "bonus", libelle: "Offrande", xp: offrande.xp });
        return { indice, texte: offrande.texte, ...changement, debloques: progressionNouveauxObjets(avant, profil) };
      }

      /* ---------- Journal des parties --------------------------------
         Gardé sur l'appareil, à part du profil : il montre au joueur ses
         dernières parties et son rythme, et sert à régler la cadence de la
         progression (étape 5 du plan). Les 200 dernières entrées. */
      const PROGRESSION_JOURNAL_KEY = "ilyos-journal-v1";
      const PROGRESSION_JOURNAL_MAX = 200;

      function progressionJournalCharger() {
        try {
          const liste = JSON.parse(localStorage.getItem(PROGRESSION_JOURNAL_KEY) || "[]");
          return Array.isArray(liste) ? liste.filter(entree => entree && typeof entree === "object") : [];
        } catch (_) { return []; }
      }

      function progressionJournalNoter(entree) {
        try {
          const liste = progressionJournalCharger();
          liste.push({ t: Date.now(), jour: progressionJour(), ...entree });
          localStorage.setItem(PROGRESSION_JOURNAL_KEY, JSON.stringify(liste.slice(-PROGRESSION_JOURNAL_MAX)));
        } catch (_) { }
      }

      /* Ce que montre l'onglet Journal : les 14 derniers jours (XP et parties),
         le bilan des 7 derniers, les dernières parties et, pendant une saison,
         la date où la piste serait finie au rythme actuel. */
      function progressionVueJournal(maintenant = new Date(), liste = progressionJournalCharger(), profil = progressionCharger()) {
        const jourDe = decalage => progressionJour(new Date(maintenant.getTime() - decalage * 86400000));
        const jours = [];
        for (let i = 13; i >= 0; i--) jours.push({ jour: jourDe(i), xp: 0, parties: 0 });
        const parJour = new Map(jours.map(j => [j.jour, j]));
        liste.forEach(entree => {
          const j = parJour.get(entree.jour);
          if (!j) return;
          j.xp += Number(entree.xp) || 0;
          if (entree.type === "partie") j.parties++;
        });
        const semaine = new Set(jours.slice(-7).map(j => j.jour));
        const recentes = liste.filter(e => e.type === "partie" && semaine.has(e.jour));
        const durees = recentes.map(e => e.duree).filter(d => d > 0);
        const xpSemaine = jours.slice(-7).reduce((somme, j) => somme + j.xp, 0);
        const bilan = {
          parties: recentes.length,
          victoires: recentes.filter(e => e.resultat === "victoire").length,
          xpParPartie: recentes.length ? Math.round(recentes.reduce((s, e) => s + (Number(e.xp) || 0), 0) / recentes.length) : 0,
          dureeMoyenne: durees.length ? Math.round(durees.reduce((s, d) => s + d, 0) / durees.length) : null,
          joursJoues: jours.slice(-7).filter(j => j.xp > 0).length,
          xpParJour: Math.round(xpSemaine / 7)
        };

        let rythme = null;
        const saison = progressionVueSaison(profil);
        if (saison && saison.active && saison.palier < saison.paliers.length) {
          const reste = (saison.paliers.length - saison.palier) * saison.xpParPalier - saison.xpDansPalier;
          if (bilan.xpParJour > 0) {
            const joursNecessaires = Math.ceil(reste / bilan.xpParJour);
            const fin = new Date(maintenant.getTime() + joursNecessaires * 86400000);
            const atteint = Math.min(saison.paliers.length, saison.palier
              + Math.floor((saison.xpDansPalier + bilan.xpParJour * saison.joursRestants) / saison.xpParPalier));
            rythme = { reste, joursNecessaires, date: progressionJour(fin),
              aTemps: joursNecessaires <= saison.joursRestants, palierFinal: atteint, total: saison.paliers.length };
          } else {
            rythme = { reste, joursNecessaires: null, total: saison.paliers.length };
          }
        }

        const dernieres = liste.filter(e => e.type === "partie").slice(-12).reverse();
        return { jours, bilan, rythme, dernieres, total: liste.filter(e => e.type === "partie").length };
      }

      /* Moteur pur : le gain d'une partie, ligne par ligne, sans rien écrire.
         bilan = { resultat: "victoire" | "nul" | "defaite",
                   difficulte: "easy" | … | null (aucun CPU adverse),
                   manches }
         dejaGagneAujourdhui : le profil a déjà sa première victoire du jour. */
      function progressionCalculerGainPartie(bilan, dejaGagneAujourdhui = false) {
        const lignes = [{ libelle: "Partie terminée", xp: PROGRESSION_XP.partie }];
        if (bilan.resultat === "victoire") lignes.push({ libelle: "Victoire", xp: PROGRESSION_XP.victoire });
        else if (bilan.resultat === "nul") lignes.push({ libelle: "Match nul", xp: PROGRESSION_XP.nul });

        let total = lignes.reduce((somme, ligne) => somme + ligne.xp, 0);
        const facteur = PROGRESSION_DIFFICULTE[bilan.difficulte];
        if (facteur && facteur !== 1) {
          const avant = total;
          total = Math.round(total * facteur);
          lignes.push({ libelle: `CPU ${PROGRESSION_DIFFICULTE_NOM[bilan.difficulte]} ×${String(facteur).replace(".", ",")}`, xp: total - avant });
        }
        if ((Number(bilan.manches) || 0) < PROGRESSION_MANCHES_MIN) {
          const avant = total;
          total = Math.round(total / 2);
          lignes.push({ libelle: "Partie très courte ×0,5", xp: total - avant });
        }
        if (bilan.resultat === "victoire" && !dejaGagneAujourdhui) {
          lignes.push({ libelle: "Première victoire du jour", xp: PROGRESSION_XP.premiereVictoireDuJour });
          total += PROGRESSION_XP.premiereVictoireDuJour;
        }
        return { lignes, total };
      }

      /* Ajoute de l'XP au profil et dit ce qui a changé. */
      function progressionAjouterXp(profil, xp, jour = progressionJour()) {
        const avant = progressionNiveauDepuisXp(profil.xp);
        profil.xp += Math.max(0, Math.round(xp));
        const paliers = progressionAvancerSaison(profil, xp, jour);
        const apres = progressionNiveauDepuisXp(profil.xp);
        return { avant, apres, niveauxGagnes: apres.niveau - avant.niveau, paliers };
      }

      /* Le joueur dont cet appareil tient le profil : en ligne, sa place ; en
         local, le premier humain (en duel local et en 2 contre 2, le siège 1).
         Aucun humain (IA contre IA) : pas de progression. */
      function progressionJoueurDeLAppareil() {
        if (!state || !Array.isArray(state.players)) return null;
        if (state.onlineMode) return Number.isInteger(localPlayerIndex) ? state.players[localPlayerIndex] || null : null;
        return state.players.find(joueur => !joueur.isAI) || null;
      }

      function progressionModeDeLaPartie() {
        if (state.onlineMode) return "online";
        if (state.players.length === 4) return "team";
        return state.soloMode ? "solo" : "duel";
      }

      /* Pendant la partie : prévenir dès qu'une quête est remplie, sans rien
         enregistrer (le compte officiel se fait sur les compteurs finaux).
         Appelée par compterStatistique (core.js). */
      let progressionAnnoncees = { partie: null, types: new Set() };
      function progressionSuiviEnJeu(indexJoueur, cle) {
        try {
          if (cle !== "poussees" && cle !== "couronnes") return;
          if (!state || state.winner !== null || progressionContexteHorsJeu()) return;
          const moi = progressionJoueurDeLAppareil();
          if (!moi || moi.id !== indexJoueur) return;
          if (progressionAnnoncees.partie !== state) progressionAnnoncees = { partie: state, types: new Set() };
          const profil = progressionCharger();
          progressionRenouvelerQuetes(profil);
          const enCours = statistiquesDuJoueur(indexJoueur)[cle] || 0;
          const verifier = (quete, catalogue, cleAnnonce) => {
            const modele = quete && progressionModeleQuete(catalogue, quete.type);
            if (!modele || quete.finie || modele.type !== cle) return;
            if (progressionAnnoncees.types.has(cleAnnonce)) return;
            const total = (quete.fait || 0) + enCours;
            if (total >= modele.cible) {
              progressionAnnoncees.types.add(cleAnnonce);
              showToast(`✦ Quête accomplie : ${modele.texte} (+${modele.xp} XP en fin de partie)`);
            }
          };
          profil.quetes.actives.forEach(q => verifier(q, PROGRESSION_QUETES_JOUR, `j-${q.type}`));
          verifier(profil.quetes.semaine, PROGRESSION_QUETES_SEMAINE, `s-${cle}`);
        } catch (_) { }
      }

      function progressionContexteHorsJeu() {
        if (ilyosSimulationActive) return true;
        try { if (TUTO.active) return true; } catch (_) { }
        try { if (EVEIL.active) return true; } catch (_) { }
        try { if (PUZZLE.active) return true; } catch (_) { }
        return false;
      }

      /* Appelée par l'écran de fin (showVictory, showEgalite). vainqueur =
         le joueur gagnant, ou null pour un match nul. */
      function progressionFinPartie(vainqueur) {
        let gain = null;
        try {
          if (!state || progressionDernierePartie === state || progressionContexteHorsJeu()) {
            if (progressionDernierePartie !== state) progressionRendreVictoire(null);
            return;
          }
          const moi = progressionJoueurDeLAppareil();
          if (!moi) { progressionRendreVictoire(null); return; }
          progressionDernierePartie = state;

          const resultat = !vainqueur ? "nul" : (vainqueur === moi || memeEquipe(vainqueur.id, moi.id) ? "victoire" : "defaite");
          const difficultes = state.players.filter(j => j.isAI && j.aiDifficulty).map(j => j.aiDifficulty);
          const difficulte = difficultes.sort((a, b) => (PROGRESSION_DIFFICULTE[b] || 0) - (PROGRESSION_DIFFICULTE[a] || 0))[0] || null;

          const profil = progressionCharger();
          const debloquesAvant = progressionDebloques(profil);
          const jour = progressionJour();
          const mode = progressionModeDeLaPartie();
          profil.modes[mode] = true;
          progressionRenouvelerQuetes(profil, jour);
          gain = progressionCalculerGainPartie(
            { resultat, difficulte, manches: state.round },
            profil.derniereVictoireJour === jour
          );
          if (profil.offrande.vent > 0) {
            const bonus = Math.round(gain.total * PROGRESSION_VENT_BONUS);
            gain.lignes.push({ libelle: "Vent porteur +50 %", xp: bonus });
            gain.total += bonus;
            profil.offrande.vent--;
          }
          const finies = progressionAvancerQuetes(profil, {
            partie: true, resultat, difficulte, mode,
            taille: Number(state.boardSize || GRID), plateau: state.startingBoardMode,
            stats: { ...statistiquesDuJoueur(moi.id) }, iles: ilesPoseesPar(moi.id)
          });
          finies.forEach(quete => {
            gain.lignes.push({ libelle: `Quête : ${quete.texte}`, xp: quete.xp, quete: true });
            gain.total += quete.xp;
          });
          const changement = progressionAjouterXp(profil, gain.total);
          profil.parties++;
          if (resultat === "victoire") { profil.victoires++; profil.derniereVictoireJour = jour; }
          if (resultat === "victoire" && difficulte === "expert") profil.exploits.expert++;
          progressionEnregistrer(profil);
          progressionJournalNoter({ type: "partie", mode, difficulte, resultat, manches: state.round,
            duree: state.debutPartie ? Math.round((Date.now() - state.debutPartie) / 1000) : null,
            xp: gain.total, quetes: finies.length, niveau: changement.apres.niveau });
          gain = { ...gain, ...changement, quetes: progressionVueQuetes(profil),
            debloques: progressionNouveauxObjets(debloquesAvant, profil),
            saison: progressionVueSaison(profil),
            effet: resultat === "victoire" ? progressionObjet("effet", profil.equipement.effet)?.valeur || null : null,
            titre: progressionObjet("titre", profil.equipement.titre)?.nom || null };
        } catch (erreur) {
          console.warn("[ILYOS] progression : gain non calculé", erreur);
          gain = null;
        }
        progressionRendreVictoire(gain);
      }

      /* Récompense hors partie (puzzle, tutoriel) : un toast, pas de fenêtre. */
      function progressionGainHorsPartie(profil, xp, libelle, debloquesAvant = null, puzzlesEnPlus = 0) {
        if (!(xp > 0)) { progressionEnregistrer(profil); return; }
        const changement = progressionAjouterXp(profil, xp);
        progressionEnregistrer(profil);
        progressionJournalNoter({ type: "bonus", libelle, xp });
        try {
          const nouveaux = debloquesAvant ? progressionNouveauxObjets(debloquesAvant, profil, puzzlesEnPlus) : [];
          showToast((changement.niveauxGagnes > 0
            ? `${libelle} : +${xp} XP · Niveau ${changement.apres.niveau} atteint !`
            : `${libelle} : +${xp} XP`)
            + (changement.paliers.length ? ` · Saison : palier ${changement.paliers[changement.paliers.length - 1].palier}` : "")
            + (nouveaux.length ? ` · Débloqué : ${nouveaux.map(o => o.nom).join(", ")}` : ""));
        } catch (_) { }
      }

      /* Appelée par puzzleRecordSolved. Première résolution : XP pleine ;
         ensuite une petite somme, trois fois par jour au plus. */
      function progressionPuzzleResolu(premiereFois) {
        try {
          const profil = progressionCharger();
          /* Le puzzle n'est inscrit qu'après cet appel : un premier succès
             compte donc d'avance pour « Résoudre 5 puzzles » (puzzlesEnPlus). */
          const debloquesAvant = progressionDebloques(profil);
          let xp = PROGRESSION_XP.puzzle;
          if (!premiereFois) {
            const jour = progressionJour();
            if (profil.puzzles.jour !== jour) profil.puzzles = { jour, rejoues: 0 };
            if (profil.puzzles.rejoues >= PROGRESSION_XP.puzzleRejouesParJour) xp = 0;
            else { profil.puzzles.rejoues++; xp = PROGRESSION_XP.puzzleRejoue; }
          }
          progressionRenouvelerQuetes(profil);
          const finies = progressionAvancerQuetes(profil, { puzzle: true });
          finies.forEach(quete => { xp += quete.xp; });
          progressionGainHorsPartie(profil, xp, finies.length
            ? `Quête accomplie : ${finies.map(q => q.texte).join(", ")}`
            : (premiereFois ? "Puzzle résolu" : "Puzzle rejoué"), debloquesAvant, premiereFois ? 1 : 0);
        } catch (erreur) {
          console.warn("[ILYOS] progression : puzzle non compté", erreur);
        }
      }

      /* Appelée à la fin de chaque tutoriel ; ne paie qu'une seule fois. */
      function progressionTutorielTermine() {
        try {
          const profil = progressionCharger();
          if (profil.tutorielRecompense) return;
          profil.tutorielRecompense = true;
          progressionGainHorsPartie(profil, PROGRESSION_XP.tutoriel, "Tutoriel terminé", progressionDebloques(profil));
        } catch (erreur) {
          console.warn("[ILYOS] progression : tutoriel non compté", erreur);
        }
      }

      /* Bloc de la fenêtre de fin, sous le bilan : emblème du niveau, gain
         qui se compte, barre qui se remplit, détail en pastilles. Un niveau
         franchi fait briller l'emblème. */
      function progressionRendreVictoire(gain) {
        const carte = els.victoryModal && els.victoryModal.querySelector(".victory-card");
        if (!carte) return;
        let bloc = carte.querySelector(".progression-gain");
        if (!gain) { if (bloc) bloc.remove(); return; }
        if (!bloc) {
          bloc = document.createElement("div");
          carte.insertBefore(bloc, carte.querySelector(".modal-actions") || null);
        }
        const { avant, apres, niveauxGagnes } = gain;
        const monte = niveauxGagnes > 0;
        bloc.className = `progression-gain${monte ? " progression-monte" : ""}`;
        const part = info => Math.round(100 * info.xpDansNiveau / info.xpPourSuivant);
        /* La barre part de l'état d'avant la partie ; si un niveau est
           franchi, elle repart de zéro dans le nouveau niveau. */
        const depart = monte ? 0 : part(avant);
        const quetesHtml = progressionHtmlQuetes(gain.quetes);
        const autresPaliers = (gain.paliers || []).filter(p => !p.cosmetique)
          .map(p => ({ categorie: "saison", nom: p.texte, palier: p.palier }));
        const debloquesHtml = progressionHtmlDebloques([...(gain.debloques || []), ...autresPaliers]);
        const saisonHtml = progressionHtmlSaison(gain.saison, gain.paliers);
        const pastilles = gain.lignes.filter(ligne => !ligne.quete).map(ligne =>
          `<li${ligne.xp < 0 ? ' class="progression-moins"' : ""}><span>${ligne.libelle}</span><b>${ligne.xp >= 0 ? "+" : "−"}${Math.abs(ligne.xp)}</b></li>`).join("");
        bloc.innerHTML = `
          <div class="progression-embleme" aria-hidden="true">
            <span class="progression-rayons"></span>
            <span class="progression-hexagone">
              <small>NIV.</small><strong>${apres.niveau}</strong>
            </span>
          </div>
          <div class="progression-corps">
            <div class="progression-tete">
              <span class="progression-titre">${monte ? `Niveau ${apres.niveau} atteint&nbsp;!` : `Niveau ${apres.niveau}`}</span>
              <span class="progression-total">+<b>0</b> XP</span>
            </div>
            <div class="progression-barre" role="progressbar" aria-valuemin="0"
                 aria-valuemax="${apres.xpPourSuivant}" aria-valuenow="${apres.xpDansNiveau}"
                 aria-label="Progression vers le niveau ${apres.niveau + 1}">
              <i style="width:${depart}%"></i>
            </div>
            <small class="progression-reste">${apres.xpDansNiveau} / ${apres.xpPourSuivant} XP · niveau ${apres.niveau + 1} ensuite</small>
            <ul class="progression-lignes">${pastilles}</ul>
          </div>
          ${saisonHtml}
          ${debloquesHtml}
          ${quetesHtml}`;
        const barre = bloc.querySelector(".progression-barre i");
        const compteur = bloc.querySelector(".progression-total b");
        const duree = 1200, debut = performance.now();
        const compter = maintenant => {
          const t = Math.min(1, (maintenant - debut) / duree);
          compteur.textContent = String(Math.round(gain.total * (1 - Math.pow(1 - t, 3))));
          if (t < 1) requestAnimationFrame(compter);
        };
        requestAnimationFrame(() => requestAnimationFrame(maintenant => {
          barre.style.width = `${part(apres)}%`;
          const barreSaison = bloc.querySelector(".progression-saison-barre i");
          if (barreSaison) barreSaison.style.width = barreSaison.dataset.fin;
          compter(maintenant);
        }));
        progressionLancerEffet(gain.effet);
      }

      /* Ligne de saison sous le niveau : palier, barre vers le suivant. */
      function progressionHtmlSaison(vue, paliers) {
        if (!vue || !vue.active) return "";
        const franchi = paliers && paliers.length;
        const pct = Math.round(100 * vue.xpDansPalier / vue.xpParPalier);
        return `<div class="progression-saison${franchi ? " progression-saison-franchie" : ""}">
          <span class="progression-saison-nom"><small>Saison ${vue.numero}</small>${franchi ? `Palier ${vue.palier} atteint&nbsp;!` : `Palier ${vue.palier}`}</span>
          <span class="progression-saison-barre"><i style="width:${franchi ? 0 : pct}%" data-fin="${pct}%"></i></span>
          <b>${vue.xpDansPalier}/${vue.xpParPalier}</b>
        </div>`;
      }

      /* Effet de victoire équipé : une pluie de plumes ou d'étincelles par
         dessus la fenêtre de fin, quelques secondes, puis plus rien. */
      function progressionLancerEffet(effet) {
        const modal = els.victoryModal;
        if (!modal) return;
        modal.querySelector(".progression-effet")?.remove();
        if (!effet) return;
        try { if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return; } catch (_) { }
        const couche = document.createElement("div");
        couche.className = `progression-effet progression-effet-${effet}`;
        couche.setAttribute("aria-hidden", "true");
        const nombre = effet === "plumes" ? 26 : 40;
        let html = "";
        for (let i = 0; i < nombre; i++) {
          const x = Math.round(Math.random() * 100);
          const retard = (Math.random() * 2.4).toFixed(2);
          const duree = (effet === "plumes" ? 4.2 + Math.random() * 2.6 : 2.2 + Math.random() * 1.6).toFixed(2);
          const taille = (effet === "plumes" ? .7 + Math.random() * .7 : .5 + Math.random() * .9).toFixed(2);
          const derive = Math.round((Math.random() - .5) * 160);
          html += `<i style="--x:${x}%;--retard:${retard}s;--duree:${duree}s;--taille:${taille};--derive:${derive}px"></i>`;
        }
        couche.innerHTML = html;
        modal.appendChild(couche);
        setTimeout(() => couche.remove(), 9500);
      }

      /* Ce que la partie vient d'ouvrir dans la collection : une vignette
         par objet (pastille de couleur, portrait, ciel ou titre). */
      function progressionVignette(objet) {
        if (objet.categorie === "couleur") return `<i class="progression-vignette progression-vignette-couleur" style="--c:${objet.valeur}"></i>`;
        if (objet.image) return `<i class="progression-vignette progression-vignette-${objet.categorie}" style="background-image:url('${objet.image}')"></i>`;
        if (objet.categorie === "saison") return `<i class="progression-vignette progression-vignette-saison">${objet.palier}</i>`;
        if (objet.categorie === "effet") return `<i class="progression-vignette progression-vignette-titre">✦</i>`;
        return `<i class="progression-vignette progression-vignette-titre">❦</i>`;
      }

      function progressionHtmlDebloques(objets) {
        if (!objets || !objets.length) return "";
        const categories = { couleur: "Couleur", heros: "Gardien", ciel: "Ciel", plateau: "Îles", roche: "Roche des îles", titre: "Titre", effet: "Effet de victoire", saison: "Palier de saison" };
        return `<div class="progression-debloques">
          <div class="progression-debloques-tete"><b>Débloqué</b><small>À équiper dans le menu, Progression › Collection</small></div>
          <ul>${objets.map(objet => `<li>${progressionVignette(objet)}<span><small>${categories[objet.categorie] || ""}</small>${objet.nom}</span></li>`).join("")}</ul>
        </div>`;
      }

      /* Quêtes sous le gain : une ligne par quête, sa barre, et l'éclat
         « accomplie » pour celles de la partie. */
      function progressionHtmlQuetes(vue) {
        if (!vue) return "";
        const ligne = (q, semaine) => {
          const pct = Math.round(100 * q.fait / q.cible);
          return `<li class="${q.finie ? "progression-quete-finie" : ""}">
            <span class="progression-quete-texte">${semaine ? "<em>Semaine</em> " : ""}${q.texte}</span>
            <span class="progression-quete-barre"><i style="width:${pct}%"></i></span>
            <b>${q.finie ? `✓ +${q.xp}` : `${q.fait}/${q.cible}`}</b>
          </li>`;
        };
        const lignes = vue.jour.map(q => ligne(q, false)).join("") + (vue.semaine ? ligne(vue.semaine, true) : "");
        return lignes ? `<ul class="progression-quetes">${lignes}</ul>` : "";
      }

      window.ILYOS_PROGRESSION = {
        profil: () => {
          const profil = progressionCharger();
          return { ...profil, ...progressionNiveauDepuisXp(profil.xp) };
        },
        calculerGainPartie: progressionCalculerGainPartie,
        xpPourPasser: progressionXpPourPasser,
        niveauDepuisXp: progressionNiveauDepuisXp,
        jour: date => progressionJour(date ? new Date(date) : new Date()),
        semaine: jour => progressionSemaine(jour),
        /* Pour le menu : renouvelle les quêtes du jour si besoin, puis dit
           tout ce qu'il faut afficher. */
        etat: () => {
          const profil = progressionCharger();
          if (progressionRenouvelerQuetes(profil)) progressionEnregistrer(profil);
          return {
            ...progressionNiveauDepuisXp(profil.xp),
            titre: progressionObjet("titre", profil.equipement.titre)?.nom || null,
            pseudo: profil.pseudo,
            heros: progressionObjet("heros", profil.equipement.heros)?.image || null,
            nouveautes: progressionNouveautes(profil),
            saison: progressionVueSaison(profil),
            quetes: progressionVueQuetes(profil),
            offrande: {
              dispo: progressionOffrandeDispo(profil),
              prochaine: profil.offrande.prochaine,
              vent: profil.offrande.vent,
              cases: PROGRESSION_OFFRANDES.map(o => o.texte),
              details: PROGRESSION_OFFRANDES.map(o => ({ xp: o.xp || 0, vent: o.vent || 0 }))
            }
          };
        },
        collection: () => progressionVueCollection(progressionCharger()),
        equiper: progressionEquiper,
        saisons: PROGRESSION_SAISONS,
        marquerVus: progressionMarquerVus,
        definirPseudo: progressionDefinirPseudo,
        pseudoValide: progressionPseudoValide,
        compte: () => {
          const c = progressionCompteLire();
          return c ? { pseudo: c.pseudo, enLigne: true, protege: !!c.protege, aJour: c.envoye === localStorage.getItem(PROGRESSION_STORAGE_KEY) } : null;
        },
        creerCompte: progressionCreerCompte,
        connecter: progressionConnecter,
        entrer: progressionEntrer,
        securiser: progressionSecuriser,
        synchroniser: progressionSynchroniser,
        deconnecter: progressionDeconnecter,
        reclamerOffrande: progressionReclamerOffrande,
        changerQuete: progressionChangerQuete,
        avancerQuetes: (profil, evenement) => progressionAvancerQuetes(profil, evenement),
        renouvelerQuetes: (profil, jour) => progressionRenouvelerQuetes(profil, jour),
        profilVide: progressionProfilVide,
        /* Pour les bancs : ajouter de l'XP à un profil donné, un jour donné. */
        ajouterXp: (profil, xp, jour) => progressionAjouterXp(profil, xp, jour),
        journal: () => progressionVueJournal(),
        /* Pour les bancs : la vue calculée sur une liste et une date données. */
        vueJournal: (liste, date, profil) => progressionVueJournal(date ? new Date(date) : new Date(), liste, profil || progressionCharger()),
        cleJournal: PROGRESSION_JOURNAL_KEY,
        cle: PROGRESSION_STORAGE_KEY
      };
