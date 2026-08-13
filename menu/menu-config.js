/* ILYOS menu configuration — visual choices + mappings only. */
window.ILYOS_MENU_CONFIG = {
  defaultMode: 'solo',
  modes: {
    solo: {
      label: 'SOLO', subtitle: 'Affrontez l’IA', playerCount: '1',
      description: "Affrontez l’IA dans un duel stratégique sur les îles du ciel.", dot: 1,
      controls: [
        { key:'board', label:'PLATEAU', default:'classic', options:[['classic','CLASSIQUE'],['symmetric','DUEL SYMÉTRIQUE']] },
        { key:'timer', label:'TEMPS PAR TOUR', default:'0', options:[['0','SANS LIMITE'],['60','1 MINUTE'],['120','2 MINUTES'],['180','3 MINUTES'],['300','5 MINUTES']] },
        { key:'difficulty', label:'DIFFICULTÉ IA', default:'normal', options:[['easy','FACILE'],['normal','NORMAL'],['hard','DIFFICILE'],['expert','EXPERT']] }
      ]
    },
    duel: {
      label: 'DUEL LOCAL', subtitle: '2 joueurs', playerCount: '2',
      description: "Deux joueurs s’affrontent sur le même appareil.", dot: 0,
      controls: [
        { key:'board', label:'PLATEAU', default:'classic', options:[['classic','CLASSIQUE'],['symmetric','DUEL SYMÉTRIQUE']] },
        { key:'timer', label:'TEMPS PAR TOUR', default:'0', options:[['0','SANS LIMITE'],['60','1 MINUTE'],['120','2 MINUTES'],['180','3 MINUTES'],['300','5 MINUTES']] },
        { key:'format', label:'FORMAT', default:'local2', options:[['local2','2 JOUEURS LOCAL']], fixed:true }
      ]
    },
    team: {
      label: '2 CONTRE 2', subtitle: 'Équipes', playerCount: '4',
      description: "Deux équipes, un score commun : 3 couronnes pour gagner.", dot: 2,
      controls: [
        { key:'board', label:'PLATEAU', default:'classic', options:[['classic','CLASSIQUE']], fixed:true },
        { key:'format', label:'FORMAT', default:'team2v2', options:[['team2v2','2 CONTRE 2']], fixed:true },
        { key:'goal', label:'OBJECTIF', default:'3', options:[['3','3 COURONNES']], fixed:true }
      ]
    },
    online: {
      label: 'EN LIGNE', subtitle: 'Joueurs du monde', playerCount: 'online',
      description: "Créez ou rejoignez une partie à distance.", dot: 3,
      controls: [
        { key:'role', label:'SESSION', default:'host', options:[['host','CRÉER'],['guest','REJOINDRE']] },
        { key:'roomCode', label:'CODE', default:'AUTO', editable:true },
        { key:'board', label:'PLATEAU', default:'classic', options:[['classic','CLASSIQUE'],['symmetric','DUEL SYMÉTRIQUE']] }
      ]
    }
  }
};
