/* ILYOS V12 — garde visuelle anti-double déplacement IA.
   Aucun gameplay n'est modifié. Pendant un déplacement 3D de l'IA, le tween
   KayKit arrive environ 80 ms avant le callback logique. Dans cette petite
   fenêtre, une resynchronisation pouvait recaler le gardien sur son ancienne
   case puis le faire glisser une seconde fois vers la nouvelle. Cette garde
   maintient simplement le visuel sur sa destination pendant ce laps de temps. */
(function(){
  if (window.__ILYOS_AI_MOVE_TAIL_GUARD_V12__) return;
  window.__ILYOS_AI_MOVE_TAIL_GUARD_V12__ = true;

  const CELL_SPACING = .925;
  const BOARD_CENTER = 5;
  let frame = 0;

  function gameIsAITurn(){
    return document.getElementById('gameScreen')?.classList.contains('ai-turn');
  }

  function pinCompletedMoveTails(){
    const k = window.kaykit3D;
    if (!k?.pendingActionAnimations || !k?.characterVisuals) return;
    const now = performance.now();

    k.pendingActionAnimations.forEach((pending,id)=>{
      if (pending?.intent !== 'move' || !pending.target) return;
      if (now > Number(pending.expires || 0) + 140) return;
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
  }

  function loop(){
    if (!gameIsAITurn()) { frame = 0; return; }
    pinCompletedMoveTails();
    frame = requestAnimationFrame(loop);
  }

  function ensureLoop(){
    if (!frame && gameIsAITurn()) frame = requestAnimationFrame(loop);
  }

  function boot(){
    const game = document.getElementById('gameScreen');
    if (!game) return;
    new MutationObserver(ensureLoop).observe(game,{attributes:true,attributeFilter:['class']});
    ensureLoop();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();