/* ILYOS menu configuration — visual choices + mappings only. */
window.ILYOS_MENU_CONFIG = {
  defaultMode: 'solo',
  modes: {
    solo: {
      label: 'SOLO', subtitle: 'Affrontez le CPU', playerCount: '1', playLabel: "AFFRONTER LE CPU",
      description: "Affrontez le CPU dans un duel stratégique sur les îles du ciel.", dot: 1,
      controls: [
        { key:'board', label:'PLATEAU', default:'classic', options:[['classic','CLASSIQUE'],['symmetric','DUEL SYMÉTRIQUE']] },
        { key:'size', label:'TAILLE', default:'11', options:[['11','11×11'],['13','13×13']] },
        { key:'timer', label:'TEMPS PAR TOUR', default:'0', options:[['0','SANS LIMITE'],['60','1 MINUTE'],['120','2 MINUTES'],['180','3 MINUTES'],['300','5 MINUTES']] },
        { key:'difficulty', label:'DIFFICULTÉ CPU', default:'normal', options:[['easy','FACILE'],['normal','NORMAL'],['hard','DIFFICILE'],['expert','EXPERT']] }
      ]
    },
    duel: {
      label: 'DUEL LOCAL', subtitle: '2 joueurs', playerCount: '2', playLabel: 'LANCER LE DUEL',
      description: "Deux joueurs s’affrontent sur le même appareil.", dot: 0,
      controls: [
        { key:'board', label:'PLATEAU', default:'classic', options:[['classic','CLASSIQUE'],['symmetric','DUEL SYMÉTRIQUE']] },
        { key:'size', label:'TAILLE', default:'11', options:[['11','11×11'],['13','13×13']] },
        { key:'timer', label:'TEMPS PAR TOUR', default:'0', options:[['0','SANS LIMITE'],['60','1 MINUTE'],['120','2 MINUTES'],['180','3 MINUTES'],['300','5 MINUTES']] },
        { key:'name1', label:'JOUEUR 1', default:'JOUEUR 1', editable:true, kind:'name' },
        { key:'name2', label:'JOUEUR 2', default:'JOUEUR 2', editable:true, kind:'name' }
      ]
    },
    team: {
      label: '2 CONTRE 2', subtitle: 'Équipes', playerCount: '4', playLabel: 'LANCER LE 2 CONTRE 2',
      description: "Deux équipes s’affrontent avec un score commun. Première équipe à 3 couronnes.", dot: 2,
      controls: [
        { key:'board', label:'PLATEAU', default:'classic', options:[['classic','CLASSIQUE']], fixed:true },
        { key:'size', label:'TAILLE', default:'11', options:[['11','11×11'],['13','13×13']] },
        { key:'name1', label:'JOUEUR 1', default:'JOUEUR 1', editable:true, kind:'name' },
        { key:'name2', label:'JOUEUR 2', default:'JOUEUR 2', editable:true, kind:'name' },
        { key:'name3', label:'JOUEUR 3', default:'JOUEUR 3', editable:true, kind:'name' },
        { key:'name4', label:'JOUEUR 4', default:'JOUEUR 4', editable:true, kind:'name' }
      ]
    },
    online: {
      label: 'EN LIGNE', subtitle: 'Joueurs du monde', playerCount: 'online', playLabel: 'CRÉER LA PARTIE',
      description: "Créez un salon ou rejoignez un autre joueur avec un code de partie.", dot: 3,
      controls: [
        { key:'role', label:'SESSION', default:'host', options:[['host','CRÉER'],['guest','REJOINDRE']] },
        { key:'name1', label:'VOTRE NOM', default:'JOUEUR 1', editable:true, kind:'name' },
        { key:'roomCode', label:'CODE', default:'AUTO', editable:true, kind:'code' },
        { key:'board', label:'PLATEAU', default:'classic', options:[['classic','CLASSIQUE'],['symmetric','DUEL SYMÉTRIQUE']] },
        { key:'size', label:'TAILLE', default:'11', options:[['11','11×11'],['13','13×13']] },
        { key:'timer', label:'TEMPS PAR TOUR', default:'0', options:[['0','SANS LIMITE'],['60','1 MINUTE'],['120','2 MINUTES'],['180','3 MINUTES'],['300','5 MINUTES']] }
      ]
    }
  }
};
