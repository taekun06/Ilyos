/* ILYOS menu configuration — edit labels and game mappings here. */
window.ILYOS_MENU_CONFIG = {
  defaultMode: 'solo',
  modes: {
    solo: {
      label: 'SOLO', subtitle: 'Affrontez l’IA', playerCount: '1',
      description: "Affrontez l’IA dans un duel stratégique sur les îles du ciel.",
      fields: [['PLATEAU','CLASSIQUE'],['PREMIER JOUEUR','ALÉATOIRE'],['DIFFICULTÉ IA','NORMAL']], dot: 1
    },
    duel: {
      label: 'DUEL LOCAL', subtitle: '2 joueurs', playerCount: '2',
      description: "Deux joueurs s’affrontent sur le même appareil.",
      fields: [['PLATEAU','CLASSIQUE'],['PREMIER JOUEUR','ALÉATOIRE'],['FORMAT','2 JOUEURS LOCAL']], dot: 0
    },
    team: {
      label: '2 CONTRE 2', subtitle: 'Équipes', playerCount: '4',
      description: "Deux équipes, un score commun : 3 couronnes pour gagner.",
      fields: [['PLATEAU','CLASSIQUE'],['PREMIÈRE ÉQUIPE','ALÉATOIRE'],['OBJECTIF','3 COURONNES']], dot: 2
    },
    online: {
      label: 'EN LIGNE', subtitle: 'Joueurs du monde', playerCount: 'online',
      description: "Créez ou rejoignez une partie à distance.",
      fields: [['SESSION','CRÉER'],['CODE','AUTO'],['PLATEAU','CLASSIQUE']], dot: 3
    }
  }
};
