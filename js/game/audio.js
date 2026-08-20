 = null;
          state.crownStealTargetId = null;
          state.crownPickupArtifactId = null;
          state.selectedCharId = null;
          state.reachable = new Set();
          state.phase = "ACTION_SELECT";
          renderAll();
        } else if (state?.phase === "SMART_CHAR") {
          cancelSmartCharacterAction();
        } else {
          restoreUndoSnapshot();
        }
      }


      /* ==================================================================
         ILYOS — AUDIO
         ------------------------------------------------------------------
         Les deux pistes historiques étaient deux WAV en base64 inline :
         20 s en 18 kHz stéréo et 26 s en 16 kHz mono, soit 2,15 Mo gzip
         — 92 % du poids de js/game.js — pour environ cinq secondes de
         matériau réellement distinct, répété en boucle pendant toute la
         partie. Elles sont remplacées par un moteur génératif Web Audio :
         zéro octet, zéro requête, et une ambiance qui ne se répète jamais.

         Tout passe désormais par un seul graphe :

             voix génératives ─┐
             <audio> externe ──┼→ musicGain → musicDuck ─┐
                                                          ├→ masterGain
             bruitages ────────────→ effectsGain ────────┘      │
                                                                 ↓
             (départ réverbe partagé) → reverbDamp → reverb ──→ limiteur → sortie

         Conséquence utile : musique et bruitages ont enfin des gains
         séparés sur le même bus, donc le ducking et les fondus croisés
         deviennent possibles — ce que l'ancien <audio>.volume, hors du
         graphe Web Audio, interdisait.
         ================================================================== */

      /* Ambiances génératives. Chacune est une grammaire, pas un fichier :
         une fondamentale, une grille d'accords en demi-tons, les degrés
         autorisés pour les cloches, et les bornes du filtre. Changer un
         de ces nombres change la couleur de l'ambiance sans toucher au
         moteur. */
      const MUSIC_AMBIENCES = {
        ciel: {
          label: "Ciel clair",
          rootMidi: 50,                       // D3
          /* Mode lydien : c'est la quarte augmentée (le +6) qui donne
             l'impression de flotter plutôt que de se poser. */
          chords: [[0, 7, 16, 23], [-3, 4, 14, 21], [2, 9, 18, 26], [-5, 2, 11, 18]],
          bellDegrees: [0, 2, 4, 6, 7, 9, 11, 14, 16, 18],
          chordSeconds: 15,
          bellInterval: [1.7, 4.6],
          cutoff: [560, 1650],
          padGain: .085,
          bellGain: .085,
          subGain: .05,
          padWave: "sawtooth"
        },
        brume: {
          label: "Brume",
          rootMidi: 45,                       // A2
          // Dorien : mineur, mais la sixte majeure empêche que ce soit triste.
          chords: [[0, 7, 15, 22], [-2, 5, 12, 21], [3, 10, 15, 19], [-4, 3, 12, 19]],
          bellDegrees: [0, 2, 3, 5, 7, 9, 10, 12, 15, 17],
          chordSeconds: 18,
          bellInterval: [2.4, 6.2],
          cutoff: [380, 1080],
          padGain: .095,
          bellGain: .07,
          subGain: .07,
          padWave: "triangle"
        },
        nuit: {
          label: "Nuit",
          rootMidi: 41,                       // F2
          // Éolien, très espacé : les accords durent presque une demi-minute.
          chords: [[0, 7, 12, 19], [-3, 4, 12, 16], [-5, 2, 10, 14], [0, 5, 12, 17]],
          bellDegrees: [0, 3, 5, 7, 10, 12, 15, 19],
          chordSeconds: 24,
          bellInterval: [3.4, 8.5],
          cutoff: [300, 820],
          padGain: .1,
          bellGain: .055,
          subGain: .09,
          padWave: "triangle"
        }
      };

      /* Pistes audio réelles — vide par défaut, et c'est volontaire : le jeu
         ne télécharge aucun octet d'audio tant que ce registre est vide.

         Pour ajouter une vraie musique composée, déposer les fichiers dans
         assets/audio/ et déclarer l'entrée ici :

             theme: {
               label: "Thème principal",
               src: "./assets/audio/theme",     // sans extension
               formats: ["opus", "m4a"]         // par ordre de préférence
             }

         Elle apparaît alors automatiquement dans le menu Son, elle est
         chargée seulement quand le joueur la choisit, et elle passe par le
         même bus que le moteur génératif (donc mêmes volumes, même
         limiteur, même ducking). Aucun autre code n'est à toucher.
         Le service worker doit en revanche apprendre à les mettre en cache
         — voir sw.js, chantier séparé. */
      const MUSIC_FILES = {};

      const MUSIC_FILE_MIME = { opus: 'audio/ogg; codecs="opus"', ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: "audio/mpeg", webm: 'audio/webm; codecs="opus"' };

      /* Anciennes valeurs de réglage → nouvelles ambiances. Sans cette table,
         un joueur qui avait choisi "Sanctuaire mystique" se retrouverait
         silencieusement remis sur l'ambiance par défaut. */
      const MUSIC_TRACK_MIGRATION = { sky: "ciel", mystic: "brume", alternate: "auto" };
      const MUSIC_AUTO_SWITCH_SECONDS = 240;

      function musicTrackExists(value) {
        return value === "auto" || !!MUSIC_AMBIENCES[value] || !!MUSIC_FILES[value];
      }

      function normalizeMusicTrack(value) {
        const migrated = MUSIC_TRACK_MIGRATION[value] || value;
        return musicTrackExists(migrated) ? migrated : "auto";
      }

      function loadSoundSettings() {
        let storedVersion = null;
        try {
          const saved = JSON.parse(localStorage.getItem("ilyosSoundSettings") || "null");
          if (saved) {
            storedVersion = Number(saved.version || 0);
            const compatible = Number(saved.version || 0) >= SOUND_SETTINGS_VERSION;
            if (compatible && Number.isFinite(saved.master)) soundSettings.master = Math.min(1, Math.max(0, saved.master));
            if (compatible && Number.isFinite(saved.music)) soundSettings.music = Math.min(1, Math.max(0, saved.music));
            if (Number.isFinite(saved.effects)) soundSettings.effects = Math.min(1.6, Math.max(0, saved.effects));
            // Le choix de piste survit au changement de version : il est migré,
            // pas jeté (voir MUSIC_TRACK_MIGRATION).
            if (typeof saved.track === "string") soundSettings.track = normalizeMusicTrack(saved.track);
            if (typeof saved.enabled === "boolean") ambientEnabled = saved.enabled;
          }
        } catch (error) {
          console.warn("Réglages audio non récupérés.", error);
        }
        soundSettings.track = normalizeMusicTrack(soundSettings.track);
        currentMusicKey = resolveAmbienceKey();
        /* Réécriture immédiate dès que l'entrée stockée date d'une version
           antérieure : sinon l'ancienne valeur reste dans localStorage et la
           migration est refaite à chaque chargement. Comparer la piste avant
           et après normalisation ne suffit pas — elle a déjà été normalisée
           en sortant du bloc de lecture. */
        if (storedVersion !== null && storedVersion < SOUND_SETTINGS_VERSION) saveSoundSettings();
      }

      function saveSoundSettings() {
        try {
          localStorage.setItem("ilyosSoundSettings", JSON.stringify({
            ...soundSettings,
            version: SOUND_SETTINGS_VERSION,
            enabled: ambientEnabled
          }));
        } catch (error) {
          console.warn("Réglages audio non sauvegardés.", error);
        }
      }

      /* ---------- Le bus ---------- */

      /* Réverbe sans fichier : une réponse impulsionnelle bruitée à décroissance
         exponentielle suffit à un ConvolverNode. C'est ce qui donne au moteur
         sa profondeur — sans elle, les nappes sonnent comme un orgue de test.
         Les deux canaux sont décorrélés, d'où la largeur stéréo. */
      /* Longueur de la queue de réverbe. C'est le poste CPU dominant de tout le
         moteur audio — mesuré hors ligne sur ce graphe exact, en rendu de 10 s :
         ~1,6 % d'un cœur pour la synthèse seule, ~3,7 % avec une queue de 1,8 s,
         ~5,7 % avec 3,6 s. Le coût vit sur le fil audio, pas sur celui qui rend
         la 3D, donc il ne dispute rien à la scène — mais la marge est plus mince
         sur un téléphone, d'où le raccourcissement. */
      function reverbSeconds() {
        if (window.kaykit3D?.qualityMode === "performance") return 1.6;
        const cores = navigator.hardwareConcurrency || 4;
        const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
        if (cores <= 4 || smallScreen) return 2.2;
        return 3.6;
      }

      function buildReverbImpulse(ctx, seconds = reverbSeconds(), decay = 2.4) {
        const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
        const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
          const data = impulse.getChannelData(channel);
          for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
          }
        }
        return impulse;
      }

      function ensureAudio() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;

        if (!audioCtx && AudioContextClass) {
          audioCtx = new AudioContextClass();

          // Limiteur de sortie : réglages conservés de la version précédente,
          // ils tenaient déjà correctement les pics de poussée.
          effectsLimiter = audioCtx.createDynamicsCompressor();
          effectsLimiter.threshold.value = -10;
          effectsLimiter.knee.value = 8;
          effectsLimiter.ratio.value = 8;
          effectsLimiter.attack.value = 0.003;
          effectsLimiter.release.value = 0.14;
          effectsLimiter.connect(audioCtx.destination);

          masterGain = audioCtx.createGain();
          masterGain.connect(effectsLimiter);

          musicGain = audioCtx.createGain();
          musicDuck = audioCtx.createGain();
          musicDuck.gain.value = 1;
          musicGain.connect(musicDuck);
          musicDuck.connect(masterGain);

          // Conserve le nom historique : plusieurs fragments s'y réfèrent.
          effectsGain = audioCtx.createGain();
          effectsGain.connect(masterGain);

          reverbNode = audioCtx.createConvolver();
          reverbNode.buffer = buildReverbImpulse(audioCtx);
          reverbDamp = audioCtx.createBiquadFilter();
          reverbDamp.type = "lowpass";
          reverbDamp.frequency.value = 3200;
          reverbReturn = audioCtx.createGain();
          reverbReturn.gain.value = .85;
          reverbDamp.connect(reverbNode);
          reverbNode.connect(reverbReturn);
          reverbReturn.connect(masterGain);

          /* Un casque débranché, une sortie changée en cours de partie, ou un
             onglet mis en veille par le système suspendent le contexte sans
             prévenir le jeu. Sans reprise, le son ne revient jamais et il faut
             recharger la page. */
          audioCtx.addEventListener("statechange", () => {
            if (!ambientEnabled || audioCtx.state !== "suspended") return;
            audioCtx.resume().then(() => {
              if (!document.hidden) updateMusicSource(false);
            }).catch(() => { });
          });
        }

        updateSoundLevels();
      }

      /* Départ réverbe. Renvoie null si le graphe n'est pas prêt, pour que les
         appelants puissent simplement ignorer l'envoi. */
      function connectReverbSend(node, amount) {
        if (!audioCtx || !reverbDamp || amount <= 0) return null;
        const send = audioCtx.createGain();
        send.gain.value = amount;
        node.connect(send);
        send.connect(reverbDamp);
        return send;
      }

      function createPanner(pan) {
        if (!audioCtx || !audioCtx.createStereoPanner) return null;
        const panner = audioCtx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        return panner;
      }

      const midiToFreq = midi => 440 * Math.pow(2, (midi - 69) / 12);

      /* ---------- Moteur génératif ---------- */

      const music = {
        running: false,
        timer: null,
        ambienceKey: "ciel",
        chordIndex: 0,
        chord: null,
        nextChordTime: 0,
        nextBellTime: 0,
        nextAmbienceSwitch: 0,
        intensity: .2,
        voices: [],
        sub: null
      };

      const MUSIC_LOOKAHEAD_MS = 120;
      const MUSIC_SCHEDULE_AHEAD = .5;

      function resolveAmbienceKey() {
        if (MUSIC_AMBIENCES[soundSettings.track]) return soundSettings.track;
        if (soundSettings.track === "auto") {
          return MUSIC_AMBIENCES[currentMusicKey] ? currentMusicKey : "ciel";
        }
        return "ciel";
      }

      function currentAmbience() {
        return MUSIC_AMBIENCES[music.ambienceKey] || MUSIC_AMBIENCES.ciel;
      }

      const randomBetween = (min, max) => min + Math.random() * (max - min);
      const pickFrom = list => list[Math.floor(Math.random() * list.length)];

      /* Intensité 0 → 1, relue à chaque tick du planificateur. C'est le seul
         lien entre le moteur et les règles : il lit `state`, il ne le modifie
         jamais, et il tolère l'absence de partie en cours. */
      function musicIntensity() {
        if (!state) return .12;
        if (state.winner !== null) return .95;

        let value = .18;
        const scores = (state.players || []).map(player => player.score || 0);
        const bestScore = scores.length ? Math.max(...scores) : 0;
        if (bestScore >= 2) value += .34;
        else if (bestScore >= 1) value += .14;

        // Une couronne portée est le moment le plus tendu d'une partie.
        if (typeof characterCarriesCrown === "function") {
          const carried = (state.characters || []).some(character => characterCarriesCrown(character.id));
          if (carried) value += .28;
        }

        if ((state.turn || 0) > 24) value += .1;
        // Pendant le tour de l'IA, le joueur attend : on retire un peu de
        // densité pour que le plateau paraisse plus calme.
        if (state.aiThinking) value -= .12;

        return Math.max(0, Math.min(1, value));
      }

      /* Une partie dure vingt à trente minutes, soit plusieurs milliers de voix
         planifiées. Un nœud arrêté mais toujours connecté au graphe n'est pas
         libéré : sans ce nettoyage, le graphe grossit indéfiniment. `ended` de
         l'oscillateur est le seul signal fiable pour savoir quand couper. */
      function registerMusicVoice(stopAt, nodes, terminator) {
        const entry = { stopAt, nodes };
        music.voices.push(entry);
        if (terminator) {
          terminator.onended = () => {
            nodes.forEach(node => { try { node.disconnect(); } catch (error) { } });
            entry.nodes = [];
          };
        }
        // Purge paresseuse : les voix terminées sont retirées au fil de l'eau
        // plutôt que par un balayage périodique.
        if (music.voices.length > 64) {
          const now = audioCtx.currentTime;
          music.voices = music.voices.filter(voice => voice.stopAt > now);
        }
      }

      function scheduleMusicChord(time) {
        const ambience = currentAmbience();
        const chord = ambience.chords[music.chordIndex % ambience.chords.length];
        music.chord = chord;
        music.chordIndex++;

        const duration = ambience.chordSeconds;
        const attack = Math.min(4.5, duration * .35);
        const release = 2.2;
        const openness = .25 + music.intensity * .75;
        const cutoffPeak = ambience.cutoff[0] + (ambience.cutoff[1] - ambience.cutoff[0]) * openness;

        chord.forEach((semitone, index) => {
          const frequency = midiToFreq(ambience.rootMidi + semitone);
          // Deux oscillateurs désaccordés par note : c'est ce battement lent
          // qui distingue une nappe d'un simple accord d'oscillateurs.
          [-7, 7].forEach(detune => {
            const osc = audioCtx.createOscillator();
            osc.type = index === 0 ? "triangle" : ambience.padWave;
            osc.frequency.value = frequency;
            osc.detune.value = detune;

            const filter = audioCtx.createBiquadFilter();
            filter.type = "lowpass";
            filter.Q.value = .7;
            filter.frequency.setValueAtTime(ambience.cutoff[0], time);
            filter.frequency.linearRampToValueAtTime(cutoffPeak, time + duration * .55);
            filter.frequency.linearRampToValueAtTime(ambience.cutoff[0], time + duration + release);

            const gain = audioCtx.createGain();
            // Les notes aiguës de l'accord sont volontairement plus discrètes.
            const level = ambience.padGain * (index === 0 ? 1 : .62 / Math.sqrt(index));
            gain.gain.setValueAtTime(.0001, time);
            gain.gain.linearRampToValueAtTime(level, time + attack);
            gain.gain.setValueAtTime(level, time + duration - .4);
            gain.gain.linearRampToValueAtTime(.0001, time + duration + release);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(musicGain);
            const send = connectReverbSend(gain, .45);

            osc.start(time);
            osc.stop(time + duration + release + .2);
            registerMusicVoice(
              time + duration + release + .2,
              [osc, filter, gain, send].filter(Boolean),
              osc
            );
          });
        });
      }

      function scheduleMusicBell(time) {
        const ambience = currentAmbience();
        const chordTones = music.chord || ambience.chords[0];
        // Deux fois sur trois la cloche tombe sur une note de l'accord courant,
        // sinon sur un degré libre du mode : assez de surprise pour que l'oreille
        // ne prédise pas la suite, jamais assez pour sonner faux.
        const semitone = Math.random() < .66
          ? pickFrom(chordTones)
          : pickFrom(ambience.bellDegrees);
        const octave = 12 * (1 + Math.floor(Math.random() * 2));
        const frequency = midiToFreq(ambience.rootMidi + semitone + octave);
        const duration = randomBetween(2.4, 4.6);
        const level = ambience.bellGain * randomBetween(.55, 1) * (.55 + music.intensity * .45);

        const osc = audioCtx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = frequency;

        // Une quinte très en retrait donne le corps métallique sans passer par
        // une vraie synthèse FM.
        const partial = audioCtx.createOscillator();
        partial.type = "sine";
        partial.frequency.value = frequency * 3.01;
        const partialGain = audioCtx.createGain();
        partialGain.gain.value = .12;

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(.0001, time);
        gain.gain.exponentialRampToValueAtTime(Math.max(level, .001), time + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, time + duration);

        const panner = createPanner(randomBetween(-.75, .75));
        osc.connect(gain);
        partial.connect(partialGain);
        partialGain.connect(gain);

        const tail = panner || gain;
        if (panner) gain.connect(panner);
        tail.connect(musicGain);
        const send = connectReverbSend(tail, .8);

        osc.start(time);
        partial.start(time);
        osc.stop(time + duration + .1);
        partial.stop(time + duration + .1);
        registerMusicVoice(
          time + duration + .1,
          [osc, partial, partialGain, gain, panner, send].filter(Boolean),
          osc
        );
      }

      function ensureMusicSub() {
        const ambience = currentAmbience();
        if (music.sub) return;
        const osc = audioCtx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = midiToFreq(ambience.rootMidi - 12);
        const gain = audioCtx.createGain();
        gain.gain.value = .0001;
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start();
        music.sub = { osc, gain };
      }

      function updateMusicSubTarget() {
        if (!music.sub || !audioCtx) return;
        const ambience = currentAmbience();
        music.sub.osc.frequency.setTargetAtTime(midiToFreq(ambience.rootMidi - 12), audioCtx.currentTime, .8);
        const target = ambience.subGain * (.45 + music.intensity * .55);
        music.sub.gain.gain.setTargetAtTime(Math.max(target, .0001), audioCtx.currentTime, 1.2);
      }

      function musicTick() {
        if (!music.running || !audioCtx) return;
        const now = audioCtx.currentTime;
        const horizon = now + MUSIC_SCHEDULE_AHEAD;

        // Lissage : l'intensité suit l'état du jeu, mais lentement, pour que le
        // changement s'entende comme une dérive et non comme une bascule.
        music.intensity += (musicIntensity() - music.intensity) * .04;

        if (soundSettings.track === "auto" && now >= music.nextAmbienceSwitch) {
          const keys = Object.keys(MUSIC_AMBIENCES);
          const next = keys[(keys.indexOf(music.ambienceKey) + 1) % keys.length];
          music.ambienceKey = next;
          currentMusicKey = next;
          music.nextAmbienceSwitch = now + MUSIC_AUTO_SWITCH_SECONDS;
          updateSoundUI();
        }

        while (music.nextChordTime < horizon) {
          scheduleMusicChord(Math.max(music.nextChordTime, now + .05));
          music.nextChordTime = Math.max(music.nextChordTime, now + .05) + currentAmbience().chordSeconds;
        }

        while (music.nextBellTime < horizon) {
          scheduleMusicBell(Math.max(music.nextBellTime, now + .05));
          const ambience = currentAmbience();
          // Plus la partie est tendue, plus les cloches se resserrent.
          const density = 1 - music.intensity * .55;
          music.nextBellTime = Math.max(music.nextBellTime, now + .05)
            + randomBetween(ambience.bellInterval[0], ambience.bellInterval[1]) * density;
        }

        updateMusicSubTarget();
      }

      function startGenerativeMusic() {
        if (!audioCtx || music.running) return;
        music.ambienceKey = resolveAmbienceKey();
        currentMusicKey = music.ambienceKey;
        music.running = true;
        music.chordIndex = 0;
        music.intensity = musicIntensity();
        const now = audioCtx.currentTime;
        music.nextChordTime = now + .1;
        music.nextBellTime = now + 1.4;
        music.nextAmbienceSwitch = now + MUSIC_AUTO_SWITCH_SECONDS;
        ensureMusicSub();
        musicTick();
        music.timer = setInterval(musicTick, MUSIC_LOOKAHEAD_MS);
      }

      function stopGenerativeMusic({ immediate = false } = {}) {
        if (music.timer) { clearInterval(music.timer); music.timer = null; }
        music.running = false;
        if (!audioCtx) return;

        const now = audioCtx.currentTime;
        if (music.sub) {
          music.sub.gain.gain.cancelScheduledValues(now);
          music.sub.gain.gain.setTargetAtTime(.0001, now, immediate ? .05 : .4);
          const sub = music.sub;
          setTimeout(() => { try { sub.osc.stop(); sub.osc.disconnect(); sub.gain.disconnect(); } catch (error) { } }, immediate ? 200 : 1400);
          music.sub = null;
        }

        // Les voix déjà planifiées s'éteignent d'elles-mêmes ; on ne coupe
        // brutalement que si on nous le demande (changement d'ambiance).
        if (immediate) {
          music.voices.forEach(voice => voice.nodes.forEach(node => {
            try { if (node.stop) node.stop(); node.disconnect(); } catch (error) { }
          }));
          music.voices = [];
        }
      }

      /* ---------- Pistes audio réelles ---------- */

      function pickMusicFileSource(entry) {
        if (!entry?.src) return null;
        const probe = ambienceAudio || new Audio();
        const formats = entry.formats?.length ? entry.formats : ["opus", "m4a"];
        const supported = formats.find(format => {
          const mime = MUSIC_FILE_MIME[format];
          return mime && probe.canPlayType(mime) !== "";
        }) || formats[formats.length - 1];
        return `${entry.src}.${supported}`;
      }

      function ensureMusicElement() {
        if (ambienceAudio) return ambienceAudio;
        ambienceAudio = new Audio();
        ambienceAudio.preload = "none";
        ambienceAudio.loop = true;
        ambienceAudio.crossOrigin = "anonymous";
        ambienceAudio.addEventListener("ended", handleMusicEnded);
        if (audioCtx && !musicElementSource) {
          try {
            musicElementSource = audioCtx.createMediaElementSource(ambienceAudio);
            musicElementSource.connect(musicGain);
          } catch (error) {
            // Navigateur qui refuse la passerelle : la piste joue quand même,
            // simplement hors du bus (volume géré directement sur l'élément).
            console.warn("Passerelle Web Audio indisponible pour la musique.", error);
          }
        }
        return ambienceAudio;
      }

      function stopMusicFile() {
        if (ambienceAudio && !ambienceAudio.paused) ambienceAudio.pause();
      }

      /* Un seul point d'entrée pour « ce qui doit jouer maintenant » : soit une
         ambiance générative, soit un fichier, jamais les deux. */
      function updateMusicSource(force = false) {
        if (!ambientEnabled) return;

        const fileEntry = MUSIC_FILES[soundSettings.track];
        if (fileEntry) {
          stopGenerativeMusic({ immediate: true });
          const element = ensureMusicElement();
          const source = pickMusicFileSource(fileEntry);
          if (source && (force || element.getAttribute("src") !== source)) {
            element.pause();
            element.setAttribute("src", source);
            element.load();
          }
          element.play().catch(() => { });
          return;
        }

        stopMusicFile();
        const wanted = resolveAmbienceKey();
        if (force && music.running && wanted !== music.ambienceKey) {
          stopGenerativeMusic({ immediate: false });
        }
        if (!music.running) startGenerativeMusic();
        else if (wanted !== music.ambienceKey) {
          music.ambienceKey = wanted;
          currentMusicKey = wanted;
        }
      }

      function handleMusicEnded() {
        // Les fichiers bouclent d'eux-mêmes ; ce gestionnaire ne sert plus qu'aux
        // pistes déclarées non bouclées.
        if (!ambientEnabled || !MUSIC_FILES[soundSettings.track]) return;
        ambienceAudio?.play().catch(() => { });
      }

      function refreshMusicTrackOptions() {
        const select = els.musicTrackSelect;
        if (!select) return;
        const entries = [
          ["auto", "Alternance des ambiances"],
          ...Object.entries(MUSIC_AMBIENCES).map(([key, ambience]) => [key, ambience.label]),
          ...Object.entries(MUSIC_FILES).map(([key, file]) => [key, file.label || key])
        ];
        const signature = entries.map(([key]) => key).join("|");
        // Reconstruit seulement si la liste a changé : ajouter une piste dans
        // MUSIC_FILES suffit à la faire apparaître, sans toucher à index.html.
        if (select.dataset.ilyosTracks === signature) return;
        select.dataset.ilyosTracks = signature;
        select.innerHTML = entries
          .map(([key, label]) => `<option value="${key}">${label}</option>`)
          .join("");
      }

      function setMusicTrack(value) {
        const track = normalizeMusicTrack(value);
        soundSettings.track = track;
        if (MUSIC_AMBIENCES[track]) currentMusicKey = track;
        ensureAudio();
        updateSoundLevels();
        updateMusicSource(true);
        saveSoundSettings();
        updateSoundUI();
        if (ambientEnabled) startAmbient();
      }

      /* ---------- Volumes ---------- */

      function updateSoundLevels() {
        const enabledMultiplier = ambientEnabled ? 1 : 0;

        if (audioCtx && masterGain) {
          const now = audioCtx.currentTime;
          masterGain.gain.cancelScheduledValues(now);
          masterGain.gain.setTargetAtTime(soundSettings.master * enabledMultiplier, now, .02);
          musicGain.gain.setTargetAtTime(Math.min(1, soundSettings.music * .92), now, .05);
          effectsGain.gain.setTargetAtTime(Math.min(1.65, soundSettings.effects), now, .018);
        }

        // Piste externe qui n'a pas pu rejoindre le bus : repli sur le volume
        // de l'élément lui-même pour que les réglages restent honnêtes.
        if (ambienceAudio && !musicElementSource) {
          ambienceAudio.volume = Math.min(1, soundSettings.master * soundSettings.music * .92) * enabledMultiplier;
        }
      }

      /* Ducking : la musique recule brièvement pour laisser passer un événement
         important. Impossible avec l'ancien <audio> isolé du graphe. */
      function duckMusic(amount = .45, seconds = .9) {
        if (!audioCtx || !musicDuck) return;
        const now = audioCtx.currentTime;
        musicDuck.gain.cancelScheduledValues(now);
        musicDuck.gain.setTargetAtTime(1 - amount, now, .05);
        musicDuck.gain.setTargetAtTime(1, now + seconds, .35);
      }

      function updateSoundUI() {
        if (!els.soundBtn) return;
        els.soundBtn.textContent = ambientEnabled ? "🔊 SON ▾" : "🔇 SON ▾";
        els.soundBtn.classList.toggle("active", ambientEnabled);
        els.soundBtn.setAttribute("aria-pressed", ambientEnabled ? "true" : "false");

        if (els.soundToggleBtn) {
          els.soundToggleBtn.textContent = ambientEnabled ? "🔊 SON ACTIVÉ" : "🔇 SON COUPÉ";
          els.soundToggleBtn.classList.toggle("off", !ambientEnabled);
        }

        if (els.masterVolumeSlider) {
          els.masterVolumeSlider.value = Math.round(soundSettings.master * 100);
          els.musicVolumeSlider.value = Math.round(soundSettings.music * 100);
          els.effectsVolumeSlider.value = Math.round(soundSettings.effects * 100);
          refreshMusicTrackOptions();
          if (els.musicTrackSelect) els.musicTrackSelect.value = soundSettings.track;
          els.masterVolumeValue.textContent = `${Math.round(soundSettings.master * 100)} %`;
          els.musicVolumeValue.textContent = `${Math.round(soundSettings.music * 100)} %`;
          els.effectsVolumeValue.textContent = `${Math.round(soundSettings.effects * 100)} %`;
        }
      }

      async function startAmbient() {
        ensureAudio();
        if (!ambientEnabled) {
          updateSoundLevels();
          updateSoundUI();
          return;
        }

        try {
          if (audioCtx?.state === "suspended") await audioCtx.resume();
          updateSoundLevels();
          updateMusicSource(false);
        } catch (error) {
          console.warn("Le navigateur attend une interaction pour lancer la musique.", error);
        }
      }

      function stopAmbient() {
        ambientEnabled = false;
        stopGenerativeMusic({ immediate: false });
        stopMusicFile();
        updateSoundLevels();
        updateSoundUI();
        saveSoundSettings();
      }

      async function enableSound() {
        ambientEnabled = true;
        updateSoundLevels();
        updateSoundUI();
        saveSoundSettings();
        await startAmbient();
      }

      async function toggleSoundEnabled() {
        if (ambientEnabled) stopAmbient();
        else await enableSound();
      }

      /* Onglet en arrière-plan : la musique se tait, les réglages ne bougent pas.
         Sans ça, une partie laissée ouverte continue de synthétiser dans le vide. */
      document.addEventListener("visibilitychange", () => {
        if (!ambientEnabled || !audioCtx) return;
        if (document.hidden) {
          stopGenerativeMusic({ immediate: false });
          stopMusicFile();
        } else {
          updateMusicSource(false);
        }
      });

      function positionSoundMenu() {
        if (!els.soundBtn || !els.soundMenu || els.soundMenu.classList.contains("hidden")) return;
        const rect = els.soundBtn.getBoundingClientRect();
        const menuWidth = Math.min(310, window.innerWidth - 16);
        const left = Math.min(window.innerWidth - menuWidth - 8, Math.max(8, rect.left + rect.width - menuWidth));
        const top = Math.min(window.innerHeight - els.soundMenu.offsetHeight - 8, rect.bottom + 8);
        els.soundMenu.style.left = `${left}px`;
        els.soundMenu.style.top = `${Math.max(8, top)}px`;
        els.soundMenu.style.width = `${menuWidth}px`;
      }

      function openSoundMenu() {
        els.soundMenu.classList.remove("hidden");
        els.soundBtn.setAttribute("aria-expanded", "true");
        updateSoundUI();
        requestAnimationFrame(positionSoundMenu);
      }

      function closeSoundMenu() {
        els.soundMenu.classList.add("hidden");
        els.soundBtn.setAttribute("aria-expanded", "false");
      }

      function toggleSoundMenu(event) {
        event?.stopPropagation();
        if (els.soundMenu.classList.contains("hidden")) openSoundMenu();
        else closeSoundMenu();
      }

      function setSoundSetting(name, value) {
        soundSettings[name] = name === "effects"
          ? Math.min(1.6, Math.max(0, value / 100))
          : Math.min(1, Math.max(0, value / 100));
        updateSoundLevels();
        updateSoundUI();
        saveSoundSettings();
      }

      /* ---------- Bruitages ---------- */

      /* Les bruitages restent entièrement synthétisés — ils ne coûtent aucun
         octet — mais ce ne sont plus des paires de bips à hauteur fixe. Trois
         primitives remplacent l'ancien couple playTone/playNoise :

           sfxNoise  bruit à filtre balayé — toute la matière : pierre,
                     souffle, frottement, transitoire d'impact.
           sfxSweep  oscillateur à enveloppe de hauteur. Un sinus qui descend
                     de 250 à 44 Hz est un impact ; le même sinus à hauteur
                     fixe n'est qu'un bip. C'est là que se joue l'essentiel de
                     la différence avec la version précédente.
           sfxBell   partiels inharmoniques — cristal, cloche, couronne. Ce
                     sont les rapports non entiers qui font entendre du métal
                     plutôt qu'un orgue.

         Chaque son suit ensuite le même schéma que n'importe quel sound design
         de jeu : transitoire (le claquement), corps (la hauteur qui chute),
         queue (la réverbe). Le dosage de réverbe est propre à chaque son —
         une pierre qui se pose est sèche, la magie est noyée. */

      // Chaque son composite consomme 2 à 5 voix : le plafond tient compte
      // d'une poussée en chaîne qui déclencherait plusieurs sons à la suite.
      const SFX_MAX_VOICES = 22;
      let sfxActiveVoices = 0;

      function sfxVoiceAvailable() {
        if (sfxActiveVoices >= SFX_MAX_VOICES) return false;
        sfxActiveVoices++;
        return true;
      }

      function releaseSfxVoice(seconds) {
        setTimeout(() => { sfxActiveVoices = Math.max(0, sfxActiveVoices - 1); }, Math.max(60, seconds * 1000));
      }

      function sfxGraphReady() {
        if (!ambientEnabled) return false;
        ensureAudio();
        if (!audioCtx || !effectsGain) return false;
        if (audioCtx.state === "suspended") audioCtx.resume();
        return true;
      }

      /* Sortie commune : panoramique optionnel, départ réverbe dosé par son, et
         déconnexion de toute la chaîne quand la voix s'éteint. */
      function sfxRoute(terminator, gain, nodes, { pan, reverb = .16 } = {}, lifetime = .5) {
        const panner = Number.isFinite(pan) ? createPanner(pan) : null;
        const tail = panner || gain;
        if (panner) gain.connect(panner);
        tail.connect(effectsGain);
        const send = connectReverbSend(tail, reverb);
        const all = [...nodes, panner, send].filter(Boolean);
        terminator.onended = () => all.forEach(node => { try { node.disconnect(); } catch (error) { } });
        releaseSfxVoice(lifetime + .15);
      }

      /* Le bruit blanc est mis en cache par tranche de 50 ms : le remplir coûte
         un Math.random() par échantillon, et l'ancienne version en allouait un
         neuf à chaque poussée. */
      const noiseBuffers = new Map();
      function noiseBuffer(duration) {
        const slots = Math.max(1, Math.ceil(duration * 20));
        const cached = noiseBuffers.get(slots);
        if (cached && cached.sampleRate === audioCtx.sampleRate) return cached;
        const length = Math.floor(audioCtx.sampleRate * (slots / 20));
        const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
        noiseBuffers.set(slots, buffer);
        return buffer;
      }

      /* Texture papier. Un froissement n'est pas un souffle : c'est une nuée de
         micro-craquements irréguliers. Du bruit continu sous enveloppe lisse —
         ce que faisait la version précédente du son de fin de tour — donne du
         vent, jamais de la fibre. Le grain est donc fabriqué dans le tampon
         lui-même : des salves très courtes, d'amplitude aléatoire, séparées de
         quasi-silences. Trois tirages sont gardés en cache et choisis au hasard
         pour qu'une page ne se tourne jamais deux fois exactement pareil. */
      const paperBuffers = new Map();
      function paperBuffer(duration) {
        const slot = Math.max(1, Math.ceil(duration * 20));
        let variants = paperBuffers.get(slot);
        if (!variants || variants[0].sampleRate !== audioCtx.sampleRate) {
          const rate = audioCtx.sampleRate;
          const length = Math.floor(rate * (slot / 20));
          variants = [0, 1, 2].map(() => {
            const buffer = audioCtx.createBuffer(1, length, rate);
            const data = buffer.getChannelData(0);
            const grains = Math.max(6, Math.round((slot / 20) * 300));
            for (let g = 0; g < grains; g++) {
              // Position tirée au hasard : une répartition régulière
              // s'entendrait comme un bourdonnement à la fréquence de la grille.
              const start = Math.floor(Math.random() * length);
              const grainLength = Math.floor(rate * (.0006 + Math.random() * .0035));
              // Exposant > 1 : beaucoup de petits craquements, peu de gros.
              const amplitude = Math.pow(Math.random(), 1.7);
              for (let i = 0; i < grainLength && start + i < length; i++) {
                data[start + i] += (Math.random() * 2 - 1) * amplitude * (1 - i / grainLength);
              }
            }
            return buffer;
          });
          paperBuffers.set(slot, variants);
        }
        return variants[Math.floor(Math.random() * variants.length)];
      }

      function sfxNoise({
        duration = .2, gain = .3, from = 900, to = null, q = 1, type = "bandpass",
        attack = .004, delay = 0, baseDelay = 0, pan, reverb = .16, texture = "blanc"
      } = {}) {
        if (!sfxGraphReady() || !sfxVoiceAvailable()) return;
        const now = audioCtx.currentTime + baseDelay + delay;

        const source = audioCtx.createBufferSource();
        source.buffer = texture === "papier" ? paperBuffer(duration) : noiseBuffer(duration);

        const filter = audioCtx.createBiquadFilter();
        filter.type = type;
        filter.Q.value = q;
        filter.frequency.setValueAtTime(Math.max(20, from), now);
        // Le balayage du filtre est ce qui transforme un souffle plat en
        // matière : montant il ouvre, descendant il s'enfonce.
        if (to !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);

        const level = audioCtx.createGain();
        level.gain.setValueAtTime(.0001, now);
        level.gain.exponentialRampToValueAtTime(Math.max(gain, .001), now + attack);
        level.gain.exponentialRampToValueAtTime(.0001, now + duration);

        source.connect(filter);
        filter.connect(level);
        sfxRoute(source, level, [source, filter, level], { pan, reverb }, delay + duration);
        source.start(now);
        source.stop(now + duration + .02);
      }

      function sfxSweep({
        fromHz = 200, toHz = 60, duration = .3, gain = .3, type = "sine",
        attack = .006, delay = 0, baseDelay = 0, pan, reverb = .16, curve = "exp"
      } = {}) {
        if (!sfxGraphReady() || !sfxVoiceAvailable()) return;
        const now = audioCtx.currentTime + baseDelay + delay;

        const osc = audioCtx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(Math.max(20, fromHz), now);
        if (curve === "lin") osc.frequency.linearRampToValueAtTime(Math.max(20, toHz), now + duration);
        else osc.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), now + duration);
        // Léger désaccord par déclenchement : deux déplacements de suite ne
        // sonnent plus exactement pareil.
        osc.detune.value = (Math.random() * 2 - 1) * 12;

        const level = audioCtx.createGain();
        level.gain.setValueAtTime(.0001, now);
        level.gain.exponentialRampToValueAtTime(Math.max(gain, .001), now + attack);
        level.gain.exponentialRampToValueAtTime(.0001, now + duration);

        osc.connect(level);
        sfxRoute(osc, level, [osc, level], { pan, reverb }, delay + duration);
        osc.start(now);
        osc.stop(now + duration + .03);
      }

      /* Chaque famille d'action a sa propre signature de partiels. C'est le
         point qui manquait le plus : magie, invocation, couronne et fin de tour
         partageaient un seul timbre de cloche et ne se distinguaient que par la
         hauteur — donc pas du tout, une fois la partie lancée. Le timbre est ce
         qui permet de reconnaître une action sans regarder l'écran ; la hauteur
         ne fait que la nuancer. */
      const BELL_PROFILES = {
        // Magie : rapports franchement non entiers. Ça scintille, c'est instable.
        magie: [1, 2.76, 5.4, 8.93],
        // Invocation : harmoniques purs. Un gardien qui se matérialise est
        // solide et présent — contraste volontaire avec la magie.
        invocation: [1, 2, 3, 4],
        // Cérémonie : quasi harmonique, avec la tierce. Chaud et consonant.
        ceremonie: [1, 2, 2.99, 4.02],
        // Gong de fin de tour : deux partiels graves, très feutré.
        gong: [1, 2.4, 3.9],
        // Pierre : partiels bas et resserrés, sans brillance. Ce n'est pas du
        // métal — la roche résonne, elle ne chante pas.
        pierre: [1, 2.1, 3.32],
        // Acier : partiels serrés dans l'aigu et décroissance rapide — le cri
        // court d'une lame sur un bouclier, jamais le chant d'une cloche.
        acier: [1, 2.39, 3.68, 5.94]
      };

      /* Apparition d'un gardien : « physique » est la piste retenue après
         écoute comparée. Les deux autres ("souffle", "lumiere") restent
         implémentées et s'auditionnent par
         ILYOS_TEST.sfx("spawn", "souffle") — changer cette constante suffit à
         basculer le jeu sur l'une d'elles. */
      const SPAWN_VARIANT = "physique";
      const BELL_RATIOS = BELL_PROFILES.magie;

      function sfxBell({
        hz = 660, duration = .9, gain = .3, delay = 0, baseDelay = 0, pan, reverb = .5, ratios = BELL_RATIOS
      } = {}) {
        if (!sfxGraphReady() || !sfxVoiceAvailable()) return;
        const now = audioCtx.currentTime + baseDelay + delay;

        const level = audioCtx.createGain();
        level.gain.setValueAtTime(.0001, now);
        level.gain.exponentialRampToValueAtTime(Math.max(gain, .001), now + .006);
        level.gain.exponentialRampToValueAtTime(.0001, now + duration);

        const nodes = [];
        let first = null;
        ratios.forEach((ratio, index) => {
          const osc = audioCtx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = hz * ratio;
          const partial = audioCtx.createGain();
          // Les partiels aigus sont plus discrets, comme sur un vrai métal.
          partial.gain.value = 1 / (1 + index * 2.2);
          osc.connect(partial);
          partial.connect(level);
          osc.start(now);
          osc.stop(now + duration + .03);
          if (!first) first = osc;
          nodes.push(osc, partial);
        });

        sfxRoute(first, level, [...nodes, level], { pan, reverb }, delay + duration);
      }

      /* Position stéréo dérivée de la colonne jouée : une poussée à gauche du
         plateau s'entend à gauche. Volontairement modérée (±0,6) pour rester
         confortable au casque. */
      function panForCell(c) {
        if (!Number.isFinite(c)) return undefined;
        return Math.max(-1, Math.min(1, ((c - (GRID - 1) / 2) / ((GRID - 1) / 2)) * .6));
      }

      function playSfx(type, options = {}) {
        if (!ambientEnabled) return;
        const pan = panForCell(options.c);
        const at = {};
        if (Number.isFinite(pan)) at.pan = pan;
        // baseDelay décale tout le son sans toucher aux délais internes qui
        // articulent ses couches (transitoire, corps, queue).
        if (Number.isFinite(options.delay) && options.delay > 0) at.baseDelay = options.delay;

        switch (type) {
          case "card":
            // Papier : un frottement bref et haut, plus un clic très court.
            sfxNoise({ ...at, duration: .085, gain: .15, from: 3600, to: 1100, q: .7, type: "highpass", reverb: .06 });
            sfxSweep({ ...at, fromHz: 1750, toHz: 880, duration: .045, gain: .07, type: "triangle", reverb: .05 });
            break;

          case "island":
            /* Verrouillage : une pièce qui se cale dans son logement.
               Rien ne tombe dans ILYOS — les îles flottent — donc ni impact de
               carrière ni grave profond : les deux versions précédentes
               supposaient une gravité que la fiction du jeu n'a pas. Ici un
               claquement tactile, un calage de quelques millimètres, et une
               courte résonance de pierre. Volontairement bref : l'action
               revient à chaque tour. */
            sfxNoise({ ...at, duration: .045, gain: .34, from: 2200, to: 1100, q: 2.6, reverb: .08 });
            sfxSweep({ ...at, fromHz: 880, toHz: 560, duration: .035, gain: .2, type: "triangle", reverb: .06 });
            sfxSweep({ ...at, fromHz: 280, toHz: 132, duration: .14, gain: .38, delay: .045, reverb: .16 });
            sfxNoise({ ...at, duration: .1, gain: .16, from: 900, to: 380, q: 1.2, type: "lowpass", delay: .045, reverb: .18 });
            sfxBell({ ...at, hz: 130.81, duration: .38, gain: .16, delay: .07, reverb: .3, ratios: BELL_PROFILES.pierre });
            break;

          case "spawn":
            /* Trois pistes coexistent, le choix se fait à l'oreille. Voir
               SPAWN_VARIANT pour figer celle qui sera jouée en partie. */
            if ((options.variant || SPAWN_VARIANT) === "souffle") {
              // Une inspiration qui se referme sur une seule note chaude :
              // une présence qui s'installe, pas un carillon.
              sfxNoise({ ...at, duration: .32, gain: .2, from: 260, to: 1500, q: 1.5, attack: .2, reverb: .5 });
              sfxBell({ ...at, hz: 146.83, duration: 1.2, gain: .2, delay: .27, reverb: .55, ratios: BELL_PROFILES.invocation });
              sfxSweep({ ...at, fromHz: 73.42, toHz: 146.83, duration: .34, gain: .18, type: "triangle", delay: .27, reverb: .35 });
            } else if ((options.variant || SPAWN_VARIANT) === "lumiere") {
              // La piste magique, assumée franchement cette fois : montée
              // scintillante et accord qui s'ouvre pour de bon.
              sfxNoise({ ...at, duration: .36, gain: .23, from: 400, to: 5200, q: 1.8, attack: .24, reverb: .7 });
              [523.25, 783.99, 1046.5, 1567.98].forEach((hz, index) =>
                sfxBell({ ...at, hz, duration: 1.3 - index * .18, gain: .146 - index * .023, delay: .28 + index * .06, reverb: .85, ratios: BELL_PROFILES.magie }));
              sfxNoise({ ...at, duration: .18, gain: .133, from: 6800, to: 3200, q: .8, type: "highpass", delay: .28, reverb: .8 });
            } else {
              /* Arrivée physique — variante retenue. Resserrée : le cliquetis
                 tenait sur 85 ms et la résonance traînait jusqu'à 650 ms, ce
                 qui étirait l'apparition bien au-delà de ce que montre
                 l'écran. Ramenée à ~340 ms au total. */
              [0, .028, .052].forEach((delay, index) =>
                sfxNoise({ ...at, duration: .04, gain: .18 - index * .036, from: 3400 - index * 500, to: 1500, q: 1.8, type: "highpass", delay, reverb: .18 }));
              sfxNoise({ ...at, duration: .07, gain: .27, from: 1400, to: 480, q: 1.2, delay: .085, reverb: .15 });
              sfxSweep({ ...at, fromHz: 240, toHz: 96, duration: .15, gain: .30, type: "triangle", delay: .085, reverb: .16 });
              sfxBell({ ...at, hz: 196, duration: .26, gain: .107, delay: .1, reverb: .22, ratios: BELL_PROFILES.pierre });
            }
            break;

          case "move": {
            // Pas sur la pierre. Volontairement en retrait : c'est le son le
            // plus rejoué de toute la partie, il ne doit jamais fatiguer.
            // Le corps grave qu'il avait a été retiré : il empiétait sur celui
            // de la poussée, et c'est justement ce grave qui doit signer une
            // poussée. Le déplacement ne garde qu'un appui bref et mat.
            //
            // Alternance gauche/droite : un pas sur deux est légèrement plus
            // grave et un peu moins appuyé. Sans elle, une marche de quatre
            // cases sonne comme un métronome (voir playMovePath).
            const otherFoot = ((options.step || 0) % 2) === 1;
            const tune = otherFoot ? .88 : 1;
            const level = otherFoot ? .86 : 1;
            sfxNoise({ ...at, duration: .07, gain: .41 * level, from: 1600 * tune, to: 560 * tune, q: 1.3, reverb: .12 });
            sfxNoise({ ...at, duration: .05, gain: .22 * level, from: 300 * tune, to: 180 * tune, q: .9, type: "lowpass", delay: .015, reverb: .08 });
            break;
          }

          case "push":
            /* L'ancien son de rotation, repris À L'IDENTIQUE : deux frottements
               de pierre qui se croisent, l'un montant et l'autre descendant,
               plus un corps grave qui donne la masse.

               Le second frottement reste à 160 ms. C'est délibéré : je l'avais
               ramené à 50 ms pour fondre les deux en une seule attaque, mais
               l'écoute a tranché — l'espacement d'origine sonne mieux ici, la
               poussée n'est pas un impact sec mais un raclement qui dure.
               Ne pas « corriger » à nouveau sans écouter. */
            sfxNoise({ ...at, duration: .34, gain: .55, from: 320, to: 1250, q: 2.2, attack: .06, reverb: .3 });
            sfxNoise({ ...at, duration: .24, gain: .34, from: 1400, to: 520, q: 1.6, delay: .16, reverb: .3 });
            sfxSweep({ ...at, fromHz: 128, toHz: 96, duration: .4, gain: .16, type: "triangle", reverb: .22 });
            break;

          case "rotate":
            /* L'ancienne lame de la poussée, reprise à l'identique. Un seul
               impact : le sifflement n'est qu'une amorce d'air qui se referme
               sur la frappe à 40 ms, sous le seuil (~40 ms) au-delà duquel
               l'oreille entendrait deux événements distincts. */
            sfxNoise({ ...at, duration: .055, gain: .2, from: 1400, to: 3200, q: 1.6, attack: .022, reverb: .1 });
            sfxNoise({ ...at, duration: .05, gain: .22, from: 5200, to: 1900, q: .5, type: "highpass", delay: .04, reverb: .12 });
            sfxBell({ ...at, hz: 1244.51, duration: .42, gain: .1, delay: .04, reverb: .38, ratios: BELL_PROFILES.acier });
            sfxSweep({ ...at, fromHz: 190, toHz: 42, duration: .34, gain: .26, delay: .04, reverb: .2 });
            break;

          case "magic":
            // Cristal instable : partiels inharmoniques égrenés en arpège
            // montant, largement réverbérés. Le scintillement est la signature.
            [392, 587.33, 880, 1174.66].forEach((hz, index) =>
              sfxBell({ ...at, hz, duration: 1.1 + index * .25, gain: .2 - index * .025, delay: index * .075, reverb: .85, ratios: BELL_PROFILES.magie }));
            // Glissando poussé plus haut : la magie est la plus brillante des
            // deux familles cristallines, la couronne la plus chaude.
            sfxSweep({ ...at, fromHz: 520, toHz: 2600, duration: .5, gain: .11, reverb: .8 });
            break;

          case "crown":
            // Événement majeur : la musique recule le temps qu'on l'entende.
            // Timbre chaud et consonant — l'opposé du scintillement de la magie.
            duckMusic(.5, 1.1);
            // Souffle volontairement bridé dans l'aigu : c'est lui qui tirait le
            // timbre de la couronne au-dessus de celui de la magie, alors que
            // la cérémonie doit être la plus chaude des deux.
            sfxNoise({ duration: .5, gain: .13, from: 420, to: 1900, q: 1.2, attack: .18, reverb: .7 });
            // Le profil « cérémonie » est quasi harmonique : ses partiels se
            // renforcent au lieu de se disperser comme ceux de la magie, donc
            // il faut moins de gain pour le même niveau perçu.
            [329.63, 493.88, 659.25].forEach((hz, index) =>
              sfxBell({ hz, duration: 1.8 - index * .25, gain: .19 - index * .03, delay: index * .1, reverb: .75, ratios: BELL_PROFILES.ceremonie }));
            break;

          case "turn":
            /* Page qui se tourne, en trois temps : la page est saisie et se
               soulève, elle bascule, elle retombe. Le grain vient du tampon
               (texture "papier") — la version précédente appliquait une
               enveloppe lisse à du bruit continu, ce qui donnait du vent.
               Toujours aucune hauteur définie : ce son revient à chaque tour et
               ne doit jamais pouvoir jurer avec la musique générative. */
            sfxNoise({ texture: "papier", duration: .1, gain: .53, from: 2200, to: 4200, q: .8, attack: .01, reverb: .03 });
            sfxNoise({ texture: "papier", duration: .19, gain: .60, from: 4600, to: 1300, q: .7, attack: .03, delay: .07, reverb: .04 });
            sfxNoise({ texture: "papier", duration: .12, gain: .35, from: 1500, to: 500, q: .9, type: "lowpass", delay: .21, reverb: .05 });
            break;

          case "victory":
            // Fanfare cérémonielle, même timbre que la couronne — c'est le même
            // monde narratif — mais quatre notes montantes et une queue longue.
            duckMusic(.35, 2.6);
            [329.63, 493.88, 659.25, 987.77].forEach((hz, index) =>
              sfxBell({ hz, duration: 2.4, gain: .23, delay: index * .15, reverb: .8, ratios: BELL_PROFILES.ceremonie }));
            sfxNoise({ duration: 1.2, gain: .1, from: 500, to: 4500, q: 1, attack: .5, reverb: .85 });
            break;

          case "crownTake":
            /* Ramasser la couronne. Volontairement LÉGER : le son "crown" est
               désormais réservé au point marqué, et l'entendre à chaque
               ramassage laissait croire qu'un point venait d'être inscrit.
               Deux notes qui montent, or et bref — un objet qu'on saisit. */
            sfxNoise({ ...at, duration: .12, gain: .12, from: 900, to: 3400, q: 1.4, attack: .04, reverb: .35 });
            [783.99, 1174.66].forEach((hz, index) =>
              sfxBell({ ...at, hz, duration: .5 - index * .12, gain: .12 - index * .03, delay: index * .07, reverb: .5, ratios: BELL_PROFILES.ceremonie }));
            break;

          case "crownDrop":
            /* Poser la couronne : le miroir exact du ramassage, en descendant.
               C'est cette symétrie qui rend les deux gestes lisibles sans
               regarder le plateau. */
            [1174.66, 783.99].forEach((hz, index) =>
              sfxBell({ ...at, hz, duration: .45 + index * .2, gain: .1 + index * .02, delay: index * .07, reverb: .45, ratios: BELL_PROFILES.ceremonie }));
            sfxNoise({ ...at, duration: .14, gain: .11, from: 2200, to: 700, q: 1.2, type: "lowpass", delay: .07, reverb: .3 });
            break;

          case "fall":
            // Chute : la hauteur s'effondre sur près d'une seconde, le vent
            // suit, la réverbe reste grande ouverte — le gardien part vers les
            // nuages, on doit l'entendre s'éloigner.
            duckMusic(.4, 1.1);
            // Deux glissandos descendants simultanés donnaient un sifflement
            // de dessin animé. Le tonal se réduit à un seul corps qui s'éloigne
            // et c'est l'air qui porte la chute : le gardien s'enfonce dans les
            // nuages, il ne glisse pas sur un toboggan.
            sfxNoise({ ...at, duration: 1.15, gain: .34, from: 2600, to: 240, q: .6, type: "lowpass", attack: .09, reverb: .8 });
            sfxSweep({ ...at, fromHz: 240, toHz: 46, duration: 1.05, gain: .22, type: "triangle", reverb: .75 });
            sfxNoise({ ...at, duration: .5, gain: .12, from: 900, to: 180, q: 2.4, delay: .5, reverb: .85 });
            break;

          case "error":
            // Impossibilité : sourd, bref, sans réverbe. Ce n'est pas une
            // punition, juste une porte fermée.
            sfxSweep({ fromHz: 165, toHz: 116, duration: .17, gain: .185, type: "square", reverb: .02 });
            sfxNoise({ duration: .1, gain: .085, from: 400, to: 160, q: 1.4, type: "lowpass", reverb: .04 });
            break;

          case "undo":
            // Retour en arrière : le souffle monte au lieu de descendre.
            sfxNoise({ duration: .2, gain: .14, from: 500, to: 2200, q: 1.6, attack: .07, reverb: .25 });
            sfxSweep({ fromHz: 620, toHz: 880, duration: .16, gain: .16, reverb: .2 });
            break;

          default:
            sfxBell({ hz: 520, duration: .35, gain: .2, reverb: .25 });
        }
      }

      /* Un déplacement traverse souvent plusieurs cases, et un seul bruit de pas
         pour un trajet de quatre cases sonnait faux — on voyait le gardien
         marcher sans l'entendre. Chaque case reçoit donc son pas.

         Les pas sont planifiés d'un coup, via le décalage `delay` des
         primitives, donc calés à l'échantillon près sur l'horloge audio plutôt
         qu'à la merci d'une file de setTimeout. La cadence reprend celle de
         l'animation (walkDuration dans ui.js : une amorce puis ~340 ms par
         case), et le panoramique suit la colonne réellement traversée : une
         marche vers la gauche du plateau se déplace vers la gauche. */
      function playMovePath(path, walkDuration) {
        if (!ambientEnabled) return;
        const steps = Array.isArray(path) ? path.filter(cell => Array.isArray(cell)) : [];
        if (!steps.length) { playSfx("move"); return; }

        // Amorce identique à celle absorbée par la séquence 3D avant que le
        // gardien ne se mette réellement en marche.
        const lead = .14;
        const span = Math.max(.12, (walkDuration || 0) / 1000 - lead);
        const perStep = Math.max(.1, span / steps.length);

        steps.forEach(([, c], index) => {
          playSfx("move", { c, step: index, delay: lead + index * perStep });
        });
      }

