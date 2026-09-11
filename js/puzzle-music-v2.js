/* ILYOS — musique dédiée au Cabinet d'énigmes, V2.

   Séquence générale : Intro.mp3 → 2.mp3 → 3.mp3 → 2.mp3 → 3.mp3…
   Cas spécial : au lancement de « L'archipel des neuf mensonges » (puzzle 17),
   la piste neuf-mensonges.mp3 joue une seule fois, puis la playlist reprend.
   Les bruitages restent actifs et les réglages Son d'ILYOS sont respectés. */
(function installPuzzleMusicV2(){
  if (window.__ILYOS_PUZZLE_MUSIC_V2__) return;
  window.__ILYOS_PUZZLE_MUSIC_V2__ = true;

  const TRACKS = [
    './assets/audio/music/Intro.mp3',
    './assets/audio/music/2.mp3',
    './assets/audio/music/3.mp3'
  ];
  const SPECIAL_TRACK = './assets/audio/music/neuf-mensonges.mp3';
  /* L'ARCHIPEL DES NEUF MENSONGES, désigné par son IDENTIFIANT et non par son
     rang. L'ordre de campagne n'est plus celui des identifiants — le fichier de
     définitions l'annonce en tête — et `p17-neuf-mensonges` occupe aujourd'hui
     la vingt-deuxième place, donc l'index 21. La valeur 16 gravée ici visait en
     réalité `p21-la-releve` : l'intro de la Confluence se serait jouée sur le
     mauvais Sanctuaire. Résolu au clic, le rang suivra tout réordonnancement. */
  const SPECIAL_PUZZLE_ID = 'p17-neuf-mensonges';

  function specialPuzzleIndex(){
    try {
      const liste = window.ILYOS_PUZZLE?.list?.();
      if (!Array.isArray(liste)) return -1;
      return liste.findIndex(entree => entree && entree.id === SPECIAL_PUZZLE_ID);
    } catch (_) { return -1; }
  }
  const RESTORE_KEY = 'ilyos.puzzle.music.restore.v2';
  /* Marqueur de l'ANCIEN contrôleur. Un joueur interrompu pendant que la V1
     jouait a laissé son volume de musique à zéro et cette clé derrière lui.
     Ne lire que la clé V2 le condamnerait à un jeu silencieux, sans qu'il
     puisse deviner pourquoi. On consomme donc les deux. */
  const RESTORE_KEY_V1 = 'ilyos.puzzle.music.restore.v1';
  const SOUND_SETTINGS_KEY = 'ilyosSoundSettings';
  const PUZZLE_GAIN = 2.8;

  let active = false;
  let audio = null;
  let trackIndex = 0;
  let specialPlaying = false;
  let resumeTrackIndex = 1;
  let originalMusicPercent = null;
  let gameMusicMuted = false;
  let internalSliderUpdate = false;
  let stopTimer = 0;
  let errorCount = 0;
  let pausedByVisibility = false;
  let syncTimer = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

  function readSoundSettings(){
    try { return JSON.parse(localStorage.getItem(SOUND_SETTINGS_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function writeSoundSettings(settings){
    try { localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(settings)); } catch (_) { }
  }

  function rememberOriginalVolume(){
    const slider = document.getElementById('musicVolumeSlider');
    const saved = readSoundSettings();
    const sliderValue = slider ? Number(slider.value) : NaN;
    const savedValue = Number(saved.music);
    originalMusicPercent = Number.isFinite(sliderValue)
      ? clamp(sliderValue, 0, 100)
      : Number.isFinite(savedValue)
        ? clamp(savedValue * 100, 0, 100)
        : 15;
    updateRestoreMarker();
  }

  function updateRestoreMarker(){
    if (!Number.isFinite(originalMusicPercent)) return;
    try {
      localStorage.setItem(RESTORE_KEY, JSON.stringify({ musicPercent: originalMusicPercent }));
    } catch (_) { }
  }

  function setSavedMusicPercent(percent){
    const saved = readSoundSettings();
    saved.music = clamp(percent, 0, 100) / 100;
    writeSoundSettings(saved);
  }

  function dispatchMusicSlider(percent){
    const slider = document.getElementById('musicVolumeSlider');
    if (!slider) {
      setSavedMusicPercent(percent);
      return;
    }
    internalSliderUpdate = true;
    slider.value = String(Math.round(clamp(percent, 0, 100)));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    internalSliderUpdate = false;
  }

  function muteGameMusic(){
    if (gameMusicMuted) return;
    gameMusicMuted = true;
    dispatchMusicSlider(0);
    syncDisplayedVolume();
  }

  function restoreGameMusic(){
    if (Number.isFinite(originalMusicPercent)) dispatchMusicSlider(originalMusicPercent);
    gameMusicMuted = false;
    try { localStorage.removeItem(RESTORE_KEY); } catch (_) { }
  }

  function recoverInterruptedSession(){
    /* La clé V2 d'abord : c'est la session la plus récente qui fait foi. */
    for (const cle of [RESTORE_KEY, RESTORE_KEY_V1]) {
      let restore = null;
      try { restore = JSON.parse(localStorage.getItem(cle) || 'null'); } catch (_) { }
      const percent = Number(restore?.musicPercent);
      if (!Number.isFinite(percent)) continue;
      setSavedMusicPercent(percent);
      try { localStorage.removeItem(cle); } catch (_) { }
      /* Les deux clés sont retirées : en garder une ferait resurgir un vieux
         volume à la prochaine ouverture. */
      try { localStorage.removeItem(cle === RESTORE_KEY ? RESTORE_KEY_V1 : RESTORE_KEY); } catch (_) { }
      return;
    }
  }

  function syncDisplayedVolume(){
    if (!active || !Number.isFinite(originalMusicPercent)) return;
    const slider = document.getElementById('musicVolumeSlider');
    if (slider && document.activeElement !== slider) slider.value = String(Math.round(originalMusicPercent));
    const label = document.getElementById('musicVolumeValue');
    if (label) label.textContent = `${Math.round(originalMusicPercent)} %`;
  }

  function syncAudioState(){
    if (!active || !audio) return;
    const saved = readSoundSettings();
    const master = Number.isFinite(Number(saved.master)) ? clamp(saved.master, 0, 1) : .5;
    const music = Number.isFinite(originalMusicPercent) ? clamp(originalMusicPercent / 100, 0, 1) : .15;
    audio.volume = clamp(master * music * PUZZLE_GAIN, 0, 1);
    audio.muted = saved.enabled === false;
    syncDisplayedVolume();
  }

  function nextTrackIndex(){
    if (trackIndex === 0) return 1;
    return trackIndex === 1 ? 2 : 1;
  }

  function playSource(src){
    if (!active || !audio) return;
    audio.src = src;
    audio.load();
    syncAudioState();
    const attempt = audio.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        const retry = () => {
          if (active && audio) audio.play().catch(() => { });
        };
        window.addEventListener('pointerdown', retry, { once: true, capture: true });
      });
    }
  }

  function playCurrentTrack(){
    specialPlaying = false;
    playSource(TRACKS[trackIndex]);
  }

  function playSpecialTrack(){
    if (!active || !audio) return;
    resumeTrackIndex = trackIndex === 0 ? 1 : trackIndex;
    specialPlaying = true;
    errorCount = 0;
    playSource(SPECIAL_TRACK);
  }

  function advanceTrack(){
    if (!active) return;
    if (specialPlaying) {
      specialPlaying = false;
      trackIndex = resumeTrackIndex;
      playCurrentTrack();
      return;
    }
    trackIndex = nextTrackIndex();
    playCurrentTrack();
  }

  function puzzleSurfaceVisible(){
    return !!document.getElementById('puzzleMenu') || !!document.body?.classList.contains('puzzle-mode');
  }

  function scheduleStopOutsidePuzzles(){
    if (!active) return;
    clearTimeout(stopTimer);
    if (puzzleSurfaceVisible()) return;
    stopTimer = window.setTimeout(() => {
      if (active && !puzzleSurfaceVisible()) stopPuzzleMusic();
    }, 900);
  }

  function startPuzzleMusic(){
    clearTimeout(stopTimer);
    if (active) return;

    active = true;
    trackIndex = 0;
    specialPlaying = false;
    resumeTrackIndex = 1;
    errorCount = 0;
    rememberOriginalVolume();

    audio = new Audio();
    audio.preload = 'auto';
    audio.loop = false;
    audio.addEventListener('canplay', () => {
      errorCount = 0;
      muteGameMusic();
      syncAudioState();
    });
    audio.addEventListener('ended', advanceTrack);
    audio.addEventListener('error', () => {
      errorCount++;
      if (specialPlaying) {
        console.warn('Intro spéciale des Neuf Mensonges indisponible.');
        specialPlaying = false;
        trackIndex = resumeTrackIndex;
        playCurrentTrack();
        return;
      }
      if (errorCount >= TRACKS.length) {
        console.warn('Musique Puzzle indisponible : fichiers audio absents ou illisibles.');
        stopPuzzleMusic();
        return;
      }
      advanceTrack();
    });

    syncTimer = window.setInterval(syncAudioState, 250);
    playCurrentTrack();
    window.setTimeout(scheduleStopOutsidePuzzles, 1200);
  }

  function stopPuzzleMusic(){
    if (!active && !gameMusicMuted) return;
    active = false;
    specialPlaying = false;
    clearTimeout(stopTimer);
    clearInterval(syncTimer);
    syncTimer = 0;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio = null;
    }
    restoreGameMusic();
    originalMusicPercent = null;
    pausedByVisibility = false;
  }

  document.addEventListener('click', event => {
    const card = event.target?.closest?.('.pz-card[data-index]');
    if (!card) return;
    const vise = specialPuzzleIndex();
    if (vise < 0 || Number(card.dataset.index) !== vise) return;
    playSpecialTrack();
  }, true);

  document.addEventListener('input', event => {
    if (!active || internalSliderUpdate || event.target?.id !== 'musicVolumeSlider') return;
    event.stopImmediatePropagation();
    originalMusicPercent = clamp(event.target.value, 0, 100);
    updateRestoreMarker();
    setSavedMusicPercent(0);
    const label = document.getElementById('musicVolumeValue');
    if (label) label.textContent = `${Math.round(originalMusicPercent)} %`;
    syncAudioState();
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (!active || !audio) return;
    if (document.hidden) {
      pausedByVisibility = !audio.paused;
      audio.pause();
    } else if (pausedByVisibility) {
      pausedByVisibility = false;
      audio.play().catch(() => { });
    }
  });

  /* La musique ne démarre PLUS à l'ouverture du menu des Voies : elle
     accompagne une énigme, pas une liste. C'est puzzleStart qui la lance
     désormais (voir js/game/puzzle.js), donc au premier Sanctuaire réellement
     ouvert — et elle continue ensuite de l'un à l'autre.
     `startPuzzleMusic` reste exporté par ILYOS_PUZZLE_MUSIC.start. */
  window.addEventListener('pagehide', () => {
    if (gameMusicMuted) restoreGameMusic();
  });

  function bootObserver(){
    const root = document.body || document.documentElement;
    if (!root) return;
    new MutationObserver(scheduleStopOutsidePuzzles).observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  recoverInterruptedSession();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootObserver, { once: true });
  else bootObserver();

  window.ILYOS_PUZZLE_MUSIC = {
    start: startPuzzleMusic,
    stop: stopPuzzleMusic,
    playNeufMensonges: playSpecialTrack,
    get active(){ return active; },
    get track(){ return specialPlaying ? 'neuf-mensonges' : (active ? trackIndex : -1); }
  };
})();
