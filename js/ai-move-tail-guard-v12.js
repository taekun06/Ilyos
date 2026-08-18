/* ILYOS V12 — garde visuelle anti-double déplacement IA.
   Aucun gameplay n'est modifié. Pendant un déplacement 3D, le tween KayKit
   arrive environ 80 ms avant le callback logique. Dans cette petite fenêtre,
   une resynchronisation pouvait recaler le gardien sur son ancienne case puis
   le faire glisser une seconde fois vers la nouvelle. Cette garde maintient
   simplement le visuel sur sa destination pendant ce laps de temps.

   V12.1 : la garde se coupait dès que la classe "ai-turn" disparaissait — or
   c'est exactement au tout dernier déplacement d'un tour IA (juste avant que
   cette classe soit retirée) que la course est la plus susceptible de se
   produire, laissant passer le double glissement malgré la garde. Elle tourne
   désormais tant qu'une animation de déplacement est en attente de
   confirmation logique, sans dépendre de la classe de tour, avec une marge
   plus large. */
(function(){
  if (window.__ILYOS_AI_MOVE_TAIL_GUARD_V12__) return;
  window.__ILYOS_AI_MOVE_TAIL_GUARD_V12__ = true;

  const CELL_SPACING = .925;
  const BOARD_CENTER = 5;
  const GUARD_BUFFER_MS = 320;
  let frame = 0;

  function gameVisible(){
    const game = document.getElementById('gameScreen');
    return !!game && !game.classList.contains('hidden');
  }

  function pinCompletedMoveTails(){
    const k = window.kaykit3D;
    if (!k?.pendingActionAnimations || !k?.characterVisuals) return false;
    const now = performance.now();
    let stillPending = false;

    k.pendingActionAnimations.forEach((pending,id)=>{
      if (pending?.intent !== 'move' || !pending.target) return;
      const withinGuardWindow = now <= Number(pending.expires || 0) + GUARD_BUFFER_MS;
      if (!withinGuardWindow) return;
      stillPending = true;

      const visual = k.characterVisuals.get(String(id)) || k.characterVisuals.get(id);
      // Tant que playCharacterMove pilote le modèle, on ne touche à rien.
      if (!visual?.wrapper || visual.move || visual.fall) return;

      const r = Number(pending.target.r);
      const c = Number(pending.target.c);
      if (!Number.isFinite(r) || !Number.isFinite(c)) return;
      const x = (c - BOARD_CENTER) * CELL_SPACING;
      const z = (r - BOARD_CENTER) * CELL_SPACING;

      // On ne modifie que X/Z : la hauteur de surface reste celle gérée par le
      // moteur KayKit. Cela suffit à empêcher le bref retour à l'ancienne case.
      visual.wrapper.position.x = x;
      visual.wrapper.position.z = z;
    });

    return stillPending;
  }

  function loop(){
    if (!gameVisible()) { frame = 0; return; }
    const stillPending = pinCompletedMoveTails();
    // On continue tant qu'une animation de déplacement est dans sa fenêtre de
    // garde, indépendamment du tour en cours (IA ou joueur) — la course
    // décrite plus haut n'est pas spécifique à l'IA, seulement plus visible
    // pendant ses tours enchaînés.
    frame = stillPending ? requestAnimationFrame(loop) : 0;
  }

  function ensureLoop(){
    if (!frame && gameVisible()) frame = requestAnimationFrame(loop);
  }

  function boot(){
    const game = document.getElementById('gameScreen');
    if (!game) return;
    new MutationObserver(ensureLoop).observe(game,{attributes:true,attributeFilter:['class']});
    // Filet de sécurité léger : un nouveau déplacement peut être mis en file
    // sans que la classe de #gameScreen ne change (ex. tour du joueur local).
    // Le coût est négligeable : la boucle s'arrête d'elle-même dès que
    // pendingActionAnimations ne contient plus rien à garder.
    setInterval(ensureLoop, 250);
    ensureLoop();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
