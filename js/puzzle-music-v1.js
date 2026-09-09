/* ILYOS — musique dédiée au Cabinet d'énigmes.

   Séquence volontairement simple :
     Intro.mp3 → 2.mp3 → 3.mp3 → 2.mp3 → 3.mp3…

   L'Intro ne rejoue pas quand le joueur recommence une énigme ou revient à
   l'écran des Sanctuaires. Le lecteur s'arrête seulement quand il quitte
   complètement le mode Puzzle. Les bruitages du jeu restent actifs.

   Les trois fichiers sont chargés à la demande depuis assets/audio/music/.
   Si les fichiers ne sont pas encore présents, le système audio normal d'ILYOS
   continue de fonctionner sans erreur bloquante. */
(function installPuzzleMusicV1(){
  if (window.__ILYOS_PUZZLE_MUSIC_V1__) return;
  window.__ILYOS_PUZZLE_MUSIC_V1__ = true;

  const TRACKS = [
    './assets/audio/music/Intro.mp3',
    './assets/audio/music/2.mp3',
    './assets/audio/music/3.mp3'
  ];
  const RESTORE_KEY = 'ilyos.puzzle.music.restore.v1';
  const SOUND_SETTINGS_KEY = 'ilyosSoundSettings';
  const PUZZLE_GAIN = 2.8;

  let active = false;
  let audio = null;
  let trackIndex = 0;
  let originalMusicPercent = null;
  let gameMusicMuted = false;
  let internalSliderUpdate = false;
  let stopTimer = 0;
  let errorCount = 0;
  let pausedByVisibility = false;
  let syncTimer = 0;

  function clamp(value, min, max){
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function readSoundSettings(){
    try {
      return JSON.parse(localStorage.getItem(SOUND_SETTINGS_KEY) || 'null') || {};
    } catch (_) {
      return {};
    }
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
    try {
      localStorage.setItem(RESTORE_KEY, JSON.stringify({ musicPercent: originalMusicPercent }));
    } catch (_) { }
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
    const restore = Number.isFinite(originalMusicPercent) ? originalMusicPercent : null;
    if (restore !== null) dispatchMusicSlider(restore);
    gameMusicMuted = false;
    try { localStorage.removeItem(RESTORE_KEY); } catch (_) { }
  }

  function recoverInterruptedSession(){
    let restore = null;
    try { restore = JSON.parse(localStorage.getItem(RESTORE_KEY) || 'null'); } catch (_) { }
    const percent = Number(restore?.musicPercent);
    if (!Number.isFinite(percent)) return;
    setSavedMusicPercent(percent);
    try { localStorage.removeItem(RESTORE_KEY); } catch (_) { }
  }

  function syncDisplayedVolume(){
    if (!active || !Number.isFinite(originalMusicPercent)) return;
    const slider = document.getElementById('musicVolumeSlider');
    if (slider && document.activeElement !== slider) {
      slider.value = String(Math.round(originalMusicPercent));
    }
    const label = document.getElementById('musicVolumeValue');
    if (label) label.textContent = `${Math.round(originalMusicPercent)} %`;
  }

  function syncAudioState(){
    if (!active || !audio) return;
    const saved = readSoundSettings();
    const master = Number.isFinite(Number(saved.master)) ? clamp(saved.master, 0, 1) : .5;
    const music = Number.isFinite(originalMusicPercent)
      ? clamp(originalMusicPercent / 100, 0, 1)
      : .15;
    audio.volume = clamp(master * music * PUZZLE_GAIN, 0, 1);
    audio.muted = saved.enabled === false;
    syncDisplayedVolume();
  }

  function nextTrackIndex(){
    if (trackIndex === 0) return 1;
    return trackIndex === 1 ? 2 : 1;
  }

  function playCurrentTrack(){
    if (!active || !audio) return;
    audio.src = TRACKS[trackIndex];
    audio.load();
    syncAudioState();
    const attempt = audio.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        const retry = () => {
          if (!active || !audio) return;
          audio.play().catch(() => { });
        };
        window.addEventListener('pointerdown', retry, { once: true, capture: true });
      });
    }
  }

  function advanceTrack(){
    if (!active) return;
    trackIndex = nextTrackIndex();
    playCurrentTrack();
  }

  function puzzleSurfaceVisible(){
    return !!document.getElementById('puzzleMenu')
      || !!document.body?.classList.contains('puzzle-mode');
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
      if (errorCount >= TRACKS.length) {
        console.warn('Musique Puzzle indisponible : les fichiers audio sont absents ou illisibles.');
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

  window.addEventListener('ilyos-puzzle-requested', startPuzzleMusic);
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootObserver, { once: true });
  } else {
    bootObserver();
  }

  window.ILYOS_PUZZLE_MUSIC = {
    start: startPuzzleMusic,
    stop: stopPuzzleMusic,
    get active(){ return active; },
    get track(){ return active ? trackIndex : -1; }
  };
})();
