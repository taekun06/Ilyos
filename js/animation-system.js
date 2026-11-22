/*
 * ILYOS — Système d'animation des gardiens (V76)
 * ------------------------------------------------------------------
 * Ce module est volontairement AUTONOME : il ne connaît ni l'état du jeu,
 * ni la grille, ni les règles. Il ne dépend que de THREE. Le moteur de jeu
 * (js/game.js) lui envoie des INTENTIONS déjà validées par la logique, et
 * ce module se contente de choisir un clip et de le fondre proprement.
 *
 * Raison d'être : avant cette version, chaque resynchronisation de la scène
 * détruisait les personnages ET leurs AnimationMixer, et l'Idle était joué
 * puis figé (`action.paused = true`) sans que son mixer ne soit jamais mis à
 * jour. Les gardiens restaient donc immobiles dans une pose unique. Isoler la
 * machine à états ici permet de la faire survivre aux resynchronisations.
 */
(() => {
  "use strict";

  const THREE = window.THREE;
  if (!THREE) return;

  /* ------------------------------------------------------------------
   * 1. États d'animation
   * ------------------------------------------------------------------ */
  const STATES = {
    SPAWN: "SPAWN",
    IDLE: "IDLE",
    IDLE_VARIANT: "IDLE_VARIANT",
    SELECTED: "SELECTED",
    TURN: "TURN",
    MOVE: "MOVE",
    PUSH_WINDUP: "PUSH_WINDUP",
    PUSH: "PUSH",
    PUSH_RECOVERY: "PUSH_RECOVERY",
    MAGIC_CAST: "MAGIC_CAST",
    HIT: "HIT",
    FALL: "FALL",
    CROWN_PICKUP: "CROWN_PICKUP",
    CROWN_CARRY: "CROWN_CARRY",
    CROWN_DROP: "CROWN_DROP",
    SCORE: "SCORE",
    VICTORY: "VICTORY"
  };

  /* ------------------------------------------------------------------
   * 2. Table intention -> clips KayKit
   * ------------------------------------------------------------------
   * Les noms EXACTS listés ici ont été relevés dans les GLB livrés avec le
   * projet (assets/kaykit/characters/*.glb — 76 clips par personnage, pack
   * "KayKit Character Animations" déjà intégré au rig Rig_Medium). On ne
   * suppose jamais qu'un nom existe : `resolveClip` teste les candidats dans
   * l'ordre et retombe sur les motifs génériques si le modèle diffère.
   *
   * `exact`   : noms de clips préférés, dans l'ordre de priorité.
   * `pattern` : filet de sécurité si aucun nom exact n'est présent.
   * `loop`    : true = boucle infinie, false = joué une fois puis retour Idle.
   */
  const CLIP_TABLE = {
    [STATES.SPAWN]: {
      exact: ["Jump_Land", "Lie_StandUp", "Interact"],
      pattern: [/land/i, /standup/i, /spawn/i],
      loop: false
    },
    [STATES.IDLE]: {
      exact: ["Idle", "Unarmed_Idle"],
      pattern: [/^idle/i, /idle/i, /breath/i],
      loop: true
    },
    // Variantes neutres : servent à désynchroniser les gardiens entre eux.
    // Volontairement discrètes — ILYOS est un jeu de stratégie, la vie du
    // plateau ne doit jamais capter le regard pendant une décision.
    [STATES.IDLE_VARIANT]: {
      exact: ["Unarmed_Idle", "Idle"],
      pattern: [/idle/i],
      loop: true
    },
    // Posture plus attentive pour le gardien sélectionné.
    [STATES.SELECTED]: {
      exact: ["2H_Melee_Idle", "Blocking", "Unarmed_Idle", "Idle"],
      pattern: [/melee_idle/i, /block/i, /idle/i],
      loop: true
    },
    [STATES.TURN]: {
      exact: ["Idle", "Unarmed_Idle"],
      pattern: [/idle/i],
      loop: true
    },
    [STATES.MOVE]: {
      exact: ["Walking_A", "Walking_B", "Walking_C"],
      pattern: [/walk/i, /run/i],
      loop: true
    },
    // Course : réservée aux déplacements de 2 cases ou plus.
    RUN: {
      exact: ["Running_A", "Running_B"],
      pattern: [/run/i, /walk/i],
      loop: true
    },
    [STATES.PUSH_WINDUP]: {
      exact: ["Spellcast_Raise", "Interact"],
      pattern: [/raise/i],
      loop: false
    },
    // La poussée est à mains nues dans ILYOS : un coup d'épaule/paume, pas un
    // coup d'épée. `Unarmed_Melee_Attack_Punch_*` est le geste le plus lisible.
    [STATES.PUSH]: {
      exact: [
        "Unarmed_Melee_Attack_Punch_A",
        "Unarmed_Melee_Attack_Punch_B",
        "1H_Melee_Attack_Stab",
        "1H_Melee_Attack_Chop"
      ],
      pattern: [/punch/i, /attack/i, /strike/i, /melee/i, /push/i],
      loop: false
    },
    [STATES.PUSH_RECOVERY]: {
      exact: ["Idle", "Unarmed_Idle"],
      pattern: [/idle/i],
      loop: true
    },
    [STATES.MAGIC_CAST]: {
      exact: ["Spellcast_Shoot", "Spellcast_Long", "Spellcasting", "Spellcast_Raise"],
      pattern: [/spellcast/i, /cast/i, /spell/i, /magic/i],
      loop: false
    },
    [STATES.HIT]: {
      exact: ["Hit_A", "Hit_B", "Block_Hit"],
      pattern: [/^hit/i, /hurt/i, /damage/i],
      loop: false
    },
    // `fixed` : toujours le premier clip disponible, sans variation par graine.
    // Une chute doit se lire de façon identique pour tous les gardiens, et
    // `Jump_Idle` est la seule pose réellement aérienne du pack — les clips
    // Death_* jouent un effondrement au sol, incohérent en plein vol.
    [STATES.FALL]: {
      exact: ["Jump_Idle", "Death_A", "Death_B"],
      pattern: [/jump_idle/i, /fall/i, /death/i],
      loop: false,
      fixed: true
    },
    [STATES.CROWN_PICKUP]: {
      exact: ["PickUp", "Interact", "Use_Item"],
      pattern: [/pickup/i, /pick_up/i, /interact/i],
      loop: false
    },
    // Porter la couronne ne doit PAS déformer la pose : le rig KayKit n'a pas
    // de clip "carry" propre, et forcer un clip d'objet tenu casse la lisibilité
    // du gardien. La couronne est attachée à l'os de la tête côté moteur, ce qui
    // suffit à la faire suivre parfaitement l'animation en cours.
    [STATES.CROWN_CARRY]: {
      exact: ["Idle", "Unarmed_Idle"],
      pattern: [/idle/i],
      loop: true
    },
    [STATES.CROWN_DROP]: {
      exact: ["Throw", "Interact", "PickUp"],
      pattern: [/throw/i, /interact/i],
      loop: false
    },
    [STATES.SCORE]: {
      exact: ["Cheer", "Interact"],
      pattern: [/cheer/i, /victory/i, /celebr/i],
      loop: false
    },
    [STATES.VICTORY]: {
      exact: ["Cheer"],
      pattern: [/cheer/i, /victory/i, /wave/i, /dance/i],
      loop: false
    }
  };

  // Clips à ne jamais choisir via un motif générique : ils placent le
  // personnage dans une pose durable (assis, couché, T-Pose) dont la machine
  // à états ne saurait pas revenir proprement.
  const FORBIDDEN_FALLBACK = /t-pose|_pose$|sit_|lie_|death_._pose/i;

  /* ------------------------------------------------------------------
   * 3. Durées de transition (secondes)
   * ------------------------------------------------------------------ */
  const FADE = {
    default: 0.14,
    toIdle: 0.18,
    toAction: 0.10,
    toMove: 0.12,
    spawn: 0.20
  };

  /* ------------------------------------------------------------------
   * 4. Accessibilité — prefers-reduced-motion
   * ------------------------------------------------------------------ */
  let reducedMotionQuery = null;
  try {
    reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  } catch (_) { reducedMotionQuery = null; }
  const prefersReducedMotion = () => !!reducedMotionQuery?.matches;

  /* ------------------------------------------------------------------
   * 5. Bus d'événements visuels
   * ------------------------------------------------------------------
   * Le gameplay reste autoritaire : il émet un événement APRÈS avoir validé
   * une action. Le rendu s'y abonne. Aucun listener ne peut modifier l'état
   * du jeu — les charges utiles sont figées avant diffusion.
   */
  function createEventBus() {
    const listeners = new Map();
    return {
      on(name, handler) {
        if (typeof handler !== "function") return () => {};
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(handler);
        return () => listeners.get(name)?.delete(handler);
      },
      off(name, handler) { listeners.get(name)?.delete(handler); },
      emit(name, payload) {
        const set = listeners.get(name);
        if (!set || !set.size) return;
        const frozen = payload && typeof payload === "object" ? Object.freeze({ ...payload }) : payload;
        set.forEach(handler => {
          try { handler(frozen); }
          catch (error) { console.warn(`[ILYOS_VISUAL_EVENTS] listener "${name}" en échec`, error); }
        });
      },
      names: () => [...listeners.keys()]
    };
  }

  const events = createEventBus();

  /* ------------------------------------------------------------------
   * 6. Résolution d'un clip
   * ------------------------------------------------------------------ */
  function buildClipIndex(clips) {
    const index = new Map();
    (clips || []).forEach(clip => {
      if (clip?.name) index.set(clip.name, clip);
    });
    return index;
  }

  function resolveClip(clipIndex, stateName, variantSeed = 0) {
    const spec = CLIP_TABLE[stateName];
    if (!spec || !clipIndex?.size) return null;

    // 1. Noms exacts, dans l'ordre de préférence. Pour les états qui acceptent
    //    plusieurs variantes équivalentes (marche, coup de poing), on décale
    //    l'entrée dans la liste avec la graine du personnage : deux gardiens
    //    voisins ne jouent pas exactement le même clip.
    const availableExact = spec.exact.filter(name => clipIndex.has(name));
    if (availableExact.length) {
      if (spec.fixed) return clipIndex.get(availableExact[0]);
      const offset = Math.floor(Math.abs(variantSeed) * availableExact.length) % availableExact.length;
      return clipIndex.get(availableExact[offset]) || clipIndex.get(availableExact[0]);
    }

    // 2. Filet de sécurité par motif, en excluant les poses durables.
    const all = [...clipIndex.values()];
    for (const pattern of spec.pattern) {
      const matches = all.filter(clip => pattern.test(clip.name || "") && !FORBIDDEN_FALLBACK.test(clip.name || ""));
      if (matches.length) {
        const offset = Math.floor(Math.abs(variantSeed) * matches.length) % matches.length;
        return matches[offset];
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------
   * 7. KayKitCharacterAnimator
   * ------------------------------------------------------------------
   * Une instance par gardien, créée UNE SEULE FOIS et conservée dans le
   * registre `characterVisuals` du moteur. Elle survit aux resynchronisations.
   */
  class KayKitCharacterAnimator {
    /**
     * @param {THREE.Object3D} target racine du modèle skinné cloné
     * @param {THREE.AnimationClip[]} clips clips du GLTF source
     * @param {object} options { seed, id, assetKey }
     */
    constructor(target, clips, { seed = Math.random(), id = "", assetKey = "" } = {}) {
      this.id = String(id);
      this.assetKey = assetKey;
      this.seed = Math.abs(seed % 1);
      this.target = target;
      this.mixer = new THREE.AnimationMixer(target);
      this.clipIndex = buildClipIndex(clips);
      this.actions = new Map();          // clip.name -> AnimationAction (mise en cache)
      this.state = null;
      this.current = null;               // AnimationAction en cours
      this.currentClipName = null;
      this.queuedIdleState = STATES.IDLE;
      this.locked = false;               // true pendant une action non bouclée
      this.destroyed = false;
      // Chaque gardien respire à son propre rythme : une vitesse strictement
      // identique sur tout le plateau se remarque immédiatement (effet "banc de
      // poissons"). ±6 % suffit à casser la synchronisation sans qu'aucun
      // personnage ne paraisse ralenti ou accéléré.
      this.idleTimeScale = 0.92 + this.seed * 0.13;
      this._onFinished = this._onFinished.bind(this);
      this.mixer.addEventListener("finished", this._onFinished);
      this._variantTimer = 4 + this.seed * 9;
    }

    /** Liste des clips réellement disponibles sur ce personnage. */
    listClips() { return [...this.clipIndex.keys()]; }

    hasState(stateName) { return !!resolveClip(this.clipIndex, stateName, this.seed); }

    _action(clip) {
      if (!clip) return null;
      let action = this.actions.get(clip.name);
      if (!action) {
        action = this.mixer.clipAction(clip);
        this.actions.set(clip.name, action);
      }
      return action;
    }

    /**
     * Joue un état avec crossfade.
     * @param {string} stateName clé de STATES (ou "RUN")
     * @param {object} opts
     *   - fade      : durée du fondu en secondes
     *   - timeScale : vitesse de lecture
     *   - force     : rejoue même si l'état est déjà actif
     *   - offset    : point de départ dans le clip, en fraction [0..1]
     *   - onFinish  : callback à la fin d'un clip non bouclé
     *   - returnTo  : état à jouer une fois le clip non bouclé terminé
     */
    play(stateName, opts = {}) {
      if (this.destroyed) return null;
      const spec = CLIP_TABLE[stateName];
      if (!spec) return null;

      const isLoop = spec.loop;
      // Une action non bouclée en cours ne doit pas être écrasée par un simple
      // retour à l'Idle : sans ce verrou, une resynchronisation de scène au
      // milieu d'un coup de poing coupait l'animation à mi-geste.
      if (this.locked && !opts.force && isLoop) return this.current;
      if (this.state === stateName && !opts.force && isLoop) return this.current;

      const clip = resolveClip(this.clipIndex, stateName, this.seed);
      if (!clip) {
        // Aucun clip compatible : on ne casse pas la pose en cours, on signale.
        if (!isLoop && typeof opts.onFinish === "function") opts.onFinish();
        return this.current;
      }

      const next = this._action(clip);
      if (!next) return this.current;

      const fade = Number.isFinite(opts.fade)
        ? opts.fade
        : (isLoop ? (stateName === STATES.MOVE ? FADE.toMove : FADE.toIdle) : FADE.toAction);

      next.reset();
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(
        Number.isFinite(opts.timeScale)
          ? opts.timeScale
          : (isLoop && (stateName === STATES.IDLE || stateName === STATES.IDLE_VARIANT || stateName === STATES.CROWN_CARRY)
            ? this.idleTimeScale
            : 1)
      );
      next.setLoop(isLoop ? THREE.LoopRepeat : THREE.LoopOnce, isLoop ? Infinity : 1);
      next.clampWhenFinished = !isLoop;

      // Décalage de phase : sans lui, tous les gardiens démarrent leur Idle sur
      // la même image et respirent à l'unisson.
      if (Number.isFinite(opts.offset)) {
        next.time = clip.duration * THREE.MathUtils.clamp(opts.offset, 0, 0.999);
      }

      if (this.current && this.current !== next) {
        this.current.crossFadeTo(next, fade, false);
        next.play();
      } else {
        next.fadeIn(fade).play();
      }

      this.current = next;
      this.currentClipName = clip.name;
      this.state = stateName;
      this.locked = !isLoop;
      this._pendingFinish = isLoop ? null : {
        action: next,
        onFinish: typeof opts.onFinish === "function" ? opts.onFinish : null,
        returnTo: opts.returnTo || null
      };
      return next;
    }

    /**
     * Retour à l'état neutre. `carrying` et `selected` choisissent la posture.
     */
    toIdle({ selected = false, carrying = false, fade = FADE.toIdle } = {}) {
      const target = selected && this.hasState(STATES.SELECTED)
        ? STATES.SELECTED
        : (carrying ? STATES.CROWN_CARRY : STATES.IDLE);
      this.queuedIdleState = target;
      if (this.locked) return this.current;   // l'action en cours finira d'elle-même
      if (this.state === target) return this.current;
      return this.play(target, { fade });
    }

    /**
     * Fin d'un clip non bouclé : on enchaîne sur l'état neutre demandé, via
     * l'événement natif du mixer plutôt qu'un setTimeout approximatif.
     */
    _onFinished(event) {
      const pending = this._pendingFinish;
      if (!pending || event.action !== pending.action) return;
      this._pendingFinish = null;
      this.locked = false;
      const { onFinish, returnTo } = pending;
      if (onFinish) {
        try { onFinish(); }
        catch (error) { console.warn("[ILYOS_ANIM] onFinish en échec", error); }
      }
      if (this.destroyed) return;
      const next = returnTo || this.queuedIdleState || STATES.IDLE;
      if (CLIP_TABLE[next]?.loop) this.play(next, { fade: FADE.toIdle });
    }

    /** Durée réelle du clip associé à un état, en secondes (0 si absent). */
    durationOf(stateName) {
      const clip = resolveClip(this.clipIndex, stateName, this.seed);
      return clip ? clip.duration : 0;
    }

    /**
     * Ajuste la vitesse d'une locomotion pour coller à la vitesse réelle du
     * tween : c'est ce qui évite que les pieds glissent sur le sol.
     * @param {number} cells nombre de cases parcourues
     * @param {number} durationMs durée du déplacement
     */
    matchLocomotionSpeed(stateName, cells, durationMs) {
      const clip = resolveClip(this.clipIndex, stateName, this.seed);
      if (!clip || !clip.duration) return 1;
      // Un cycle de marche KayKit couvre approximativement une case du plateau.
      const expected = (durationMs / 1000) / Math.max(1, cells);
      const scale = clip.duration / Math.max(0.12, expected);
      return THREE.MathUtils.clamp(scale, 0.55, 2.4);
    }

    /**
     * Petite variation neutre occasionnelle, uniquement quand le gardien est
     * réellement au repos. Reste rare et courte par choix : la lisibilité
     * tactique passe avant l'animation d'ambiance.
     */
    tickIdleVariation(delta) {
      if (this.locked || prefersReducedMotion()) return;
      if (this.state !== STATES.IDLE) return;
      this._variantTimer -= delta;
      if (this._variantTimer > 0) return;
      this._variantTimer = 9 + Math.random() * 12;
      if (!this.hasState(STATES.IDLE_VARIANT)) return;
      if (this.currentClipName === resolveClip(this.clipIndex, STATES.IDLE_VARIANT, this.seed)?.name) return;
      this.play(STATES.IDLE_VARIANT, { fade: 0.35, offset: Math.random() * 0.8 });
      // Retour à l'Idle standard après quelques secondes.
      this._variantReturn = 3 + Math.random() * 3;
    }

    update(delta) {
      if (this.destroyed) return;
      this.mixer.update(delta);
      if (this._variantReturn != null) {
        this._variantReturn -= delta;
        if (this._variantReturn <= 0) {
          this._variantReturn = null;
          if (!this.locked && this.state === STATES.IDLE_VARIANT) this.play(STATES.IDLE, { fade: 0.4 });
        }
      } else {
        this.tickIdleVariation(delta);
      }
    }

    destroy() {
      this.destroyed = true;
      try {
        this.mixer.removeEventListener("finished", this._onFinished);
        this.mixer.stopAllAction();
        this.mixer.uncacheRoot(this.target);
      } catch (_) { /* mixer déjà libéré */ }
      this.actions.clear();
      this.current = null;
    }
  }

  /* ------------------------------------------------------------------
   * 8. Pool d'objets FX
   * ------------------------------------------------------------------
   * Les impacts, poussières et halos sont créés à chaque poussée. Sans pool,
   * chaque action alloue de la géométrie et un matériau, ce qui provoque des
   * à-coups du GC sur mobile.
   */
  class FxPool {
    constructor(factory, { max = 24 } = {}) {
      this.factory = factory;
      this.max = max;
      this.free = [];
      this.busy = new Set();
    }
    acquire() {
      const item = this.free.pop() || this.factory();
      this.busy.add(item);
      return item;
    }
    release(item) {
      if (!this.busy.delete(item)) return;
      item.parent?.remove(item);
      if (this.free.length < this.max) this.free.push(item);
      else item.geometry?.dispose?.();
    }
    releaseAll() { [...this.busy].forEach(item => this.release(item)); }
  }

  /* ------------------------------------------------------------------
   * 9. Utilitaires d'easing partagés
   * ------------------------------------------------------------------ */
  const easing = {
    easeOutCubic: t => 1 - Math.pow(1 - t, 3),
    easeOutQuint: t => 1 - Math.pow(1 - t, 5),
    easeInOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    // Léger dépassement puis retour : donne du poids à une île qui se pose.
    easeOutBack: (t, overshoot = 1.24) => {
      const c3 = overshoot + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2);
    },
    smoothstep: t => t * t * (3 - 2 * t)
  };

  /* ------------------------------------------------------------------
   * 10. Export
   * ------------------------------------------------------------------ */
  window.ILYOS_ANIM = {
    STATES,
    CLIP_TABLE,
    FADE,
    KayKitCharacterAnimator,
    FxPool,
    easing,
    resolveClip,
    buildClipIndex,
    prefersReducedMotion,
    events
  };
  // Alias public demandé par la spécification d'intégration.
  window.ILYOS_VISUAL_EVENTS = events;
})();
