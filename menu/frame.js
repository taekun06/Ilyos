/* ILYOS isolated menu frame. Communicates with parent only through postMessage. */
(function(){
  const home=document.getElementById('home');
  const duel=document.getElementById('duel');
  const veil=document.getElementById('veil');
  const panel=document.getElementById('panel');
  const desc=document.getElementById('desc');
  const play=document.getElementById('play');
  const cfg=(window.ILYOS_MENU_CONFIG&&window.ILYOS_MENU_CONFIG.modes)||{};
  let selectedMode=window.ILYOS_MENU_CONFIG?.defaultMode||'solo';
  const selections={};

  const modal=document.createElement('div');
  modal.className='menu-modal';
  modal.innerHTML=`<div class="menu-modal-card"><button class="menu-modal-close" type="button" aria-label="Fermer">×</button><div class="menu-modal-title"></div><div class="menu-modal-body"></div></div>`;
  document.body.appendChild(modal);
  const modalTitle=modal.querySelector('.menu-modal-title');
  const modalBody=modal.querySelector('.menu-modal-body');
  modal.querySelector('.menu-modal-close').addEventListener('click',()=>modal.classList.remove('open'));
  modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});

  function fullscreenDocument(){
    try{return parent?.document||document}catch(_){return document}
  }
  function requestSiteFullscreen(){
    const doc=fullscreenDocument();
    try{ parent.ILYOS_pleinEcranQuitte=false; }catch(_){}
    if(doc.fullscreenElement) return;
    const el=doc.documentElement;
    const req=el.requestFullscreen||el.webkitRequestFullscreen;
    if(!req) return;
    try{ const p=req.call(el); if(p&&p.catch) p.catch(()=>{}); }catch(e){}
  }
  document.addEventListener('click', requestSiteFullscreen, {once:true, capture:true});

  function exitSiteFullscreen(){
    const doc=fullscreenDocument();
    /* Quitté volontairement : le jeu ne le redemandera pas au toucher suivant. */
    try{ parent.ILYOS_pleinEcranQuitte=true; }catch(_){}
    const exit=doc.exitFullscreen||doc.webkitExitFullscreen;
    if(!exit) return;
    try{ const p=exit.call(doc); if(p&&p.catch) p.catch(()=>{}); }catch(e){}
  }
  function toggleFullscreen(){
    if(fullscreenDocument().fullscreenElement) exitSiteFullscreen();
    else requestSiteFullscreen();
  }
  function syncFullscreenButtons(){
    const active=!!fullscreenDocument().fullscreenElement;
    ['fullscreenBtnHome','fullscreenBtnDuel'].forEach(id=>{
      const btn=document.getElementById(id);
      if(!btn) return;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-label', active ? 'Quitter le plein écran' : 'Plein écran');
      btn.title = active ? 'Quitter le plein écran' : 'Plein écran';
      if(btn.id==='fullscreenBtnDuel') btn.textContent = active ? '⛶ QUITTER LE PLEIN ÉCRAN' : '⛶ PLEIN ÉCRAN';
    });
  }
  fullscreenDocument().addEventListener('fullscreenchange', syncFullscreenButtons);
  fullscreenDocument().addEventListener('webkitfullscreenchange', syncFullscreenButtons);

  function send(type,detail){ parent.postMessage({source:'ilyos-menu',type,detail}, location.origin); }

  function checkResumableSession(){
    const btn=document.getElementById('resumeHomeBtn');
    if(!btn) return;
    try{
      const saved=JSON.parse(localStorage.getItem('ilyos-local-session-v22')||'null');
      btn.hidden=!(saved?.state && !saved.state.onlineMode);
    }catch(_){ btn.hidden=true; }
  }
  checkResumableSession();

  /* Progression du joueur : lue dans le jeu parent (window.ILYOS_PROGRESSION,
     même origine). Le profil s'écrit dans le document parent ; l'événement
     « storage » arrive donc ici à chaque gain, sans rien relayer. */
  function progressionApi(){ try{ return parent?.ILYOS_PROGRESSION||null; }catch(_){ return null; } }
  function renderProfileBadge(){
    const badge=document.getElementById('profilBadge');
    const pill=document.getElementById('offrandePill');
    if(!badge) return;
    let etat=null;
    try{ etat=progressionApi()?.etat?.()||null; }catch(_){ etat=null; }
    if(!etat){ badge.hidden=true; if(pill) pill.hidden=true; return; }
    const part=Math.round(100*etat.xpDansNiveau/Math.max(1,etat.xpPourSuivant));
    badge.querySelector('.profil-num').textContent=String(etat.niveau);
    badge.querySelector('.profil-mot').textContent=etat.pseudo||'NIVEAU';
    badge.querySelector('.profil-anneau').style.setProperty('--p',`${part}%`);
    badge.querySelector('.profil-xp').textContent=`${etat.xpDansNiveau} / ${etat.xpPourSuivant} XP`;
    badge.title=`${etat.xpDansNiveau} / ${etat.xpPourSuivant} XP vers le niveau ${etat.niveau+1}`;
    badge.querySelector('.profil-alerte').hidden=!etat.offrande.dispo&&!etat.nouveautes;
    badge.hidden=false;
    if(pill) pill.hidden=!etat.offrande.dispo;
    if(modal.classList.contains('open')&&modal.dataset.vue==='progression'&&modal.dataset.onglet!=='collection') renderProgressionPanel(etat);
  }
  /* Aperçu d'un objet de la collection : pastille de couleur, portrait du
     gardien, bande de ciel ou plaque de titre. */
  function collectionApercu(cle,objet){
    if(cle==='couleur') return `<span class="coll-apercu coll-gemme" style="--c:${safeText(objet.valeur)}"></span>`;
    if(cle==='heros') return `<span class="coll-apercu coll-portrait"><img src="../${safeText(objet.image)}" alt="" loading="lazy"></span>`;
    if(cle==='ciel') return `<span class="coll-apercu coll-ciel" style="background-image:url('../${safeText(objet.image)}')"></span>`;
    if(cle==='plateau'||cle==='roche') return `<span class="coll-apercu coll-ciel coll-iles" style="background-image:url('../${safeText(objet.image)}')"></span>`;
    if(cle==='effet') return `<span class="coll-apercu coll-effet coll-effet-${safeText(objet.valeur||'sobre')}"><i></i><i></i><i></i><i></i><i></i></span>`;
    return `<span class="coll-apercu coll-plaque"><span>${safeText(objet.nom)}</span></span>`;
  }
  function collectionObjetHtml(cle,objet){
    const etatTexte=objet.equipe?'ÉQUIPÉ':(objet.debloque?'ÉQUIPER':`🔒 ${safeText(objet.texte)}${objet.cible?` · ${objet.fait}/${objet.cible}`:''}`);
    return `<li class="coll-objet${objet.debloque?'':' verrou'}${objet.equipe?' equipe':''}"><button type="button" data-cat="${cle}" data-id="${safeText(objet.id)}"${objet.debloque&&!objet.equipe?'':' disabled'} aria-pressed="${objet.equipe}">${collectionApercu(cle,objet)}<b>${safeText(objet.nom)}</b><small>${etatTexte}</small>${objet.nouveau?'<em class="coll-nouveau">NOUVEAU</em>':''}</button></li>`;
  }
  function collectionHtml(categories){
    const notes={couleur:'Vos pions, drapeaux et villages.',heros:'Les gardiens de votre camp.',ciel:'Le ciel autour du plateau.',plateau:'Les îles du plateau.',titre:'Affiché avec votre niveau.',roche:'La roche et l’herbe des îles.',effet:'Quand vous gagnez une partie.'};
    return categories.map(c=>`<section class="coll-section"><h3>${safeText(c.nom.toUpperCase())}<small>${notes[c.cle]||''}</small></h3><ul class="coll-grille coll-grille-${c.cle}">${c.objets.map(o=>collectionObjetHtml(c.cle,o)).join('')}</ul></section>`).join('')
      +'<p class="coll-note">Couleur et gardiens s’appliquent en solo, en duel et en 2 contre 2, à partir de la prochaine partie.</p>';
  }
  /* Piste de saison : une case par palier, l'aperçu de sa récompense. */
  function saisonApercu(p){
    if(p.categorie==='couleur') return `<span class="sp-apercu sp-gemme" style="--c:${safeText(p.valeur)}"></span>`;
    if(p.categorie==='heros') return `<span class="sp-apercu sp-portrait"><img src="../${safeText(p.image)}" alt="" loading="lazy"></span>`;
    if(p.categorie==='ciel'||p.categorie==='plateau'||p.categorie==='roche') return `<span class="sp-apercu sp-ciel" style="background-image:url('../${safeText(p.image)}')"></span>`;
    if(p.categorie==='titre') return `<span class="sp-apercu sp-plaque"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18l-2 3 2 3H3l2-3-2-3Z" fill="#2b1a05" opacity=".85"/><path d="M8 5l4-2 4 2M8 19l4 2 4-2" stroke="#2b1a05" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg></span>`;
    if(p.categorie==='effet') return `<span class="sp-apercu sp-effet"></span>`;
    if(p.categorie==='vent') return `<span class="sp-apercu sp-vent"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#effcff" stroke-width="2" stroke-linecap="round"><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h7"/></svg></span>`;
    return `<span class="sp-apercu sp-coffre"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v1H3v-1Z" fill="#7a4b12"/><rect x="3" y="11" width="18" height="8" rx="1.5" fill="#5a3509"/><rect x="10" y="9.5" width="4" height="5" rx="1" fill="#ffe9a8"/><path d="M3 11h18" stroke="#ffe9a8" stroke-width="1.2"/></svg></span>`;
  }
  /* Piste de saison « Archipel » : un îlot KayKit par palier, relié au
     suivant par un fil d'or ; la récompense flotte au-dessus. Les paliers
     multiples de 5 portent le château. Tout est statique (aucune boucle). */
  const ILOTS_PISTE=['foret','maison','puits','moulin','tour','marche','eglise','taverne','arbre'];
  function saisonHtml(v){
    if(!v) return '<p class="coll-note">Aucune saison en cours.</p>';
    const fini=v.palier>=v.paliers.length;
    const pct=fini?100:Math.round(100*v.xpDansPalier/Math.max(1,v.xpParPalier));
    const courant=Math.min(v.palier+1,v.paliers.length);
    const pas=150, haut=[64,0,48,12];
    const pts=v.paliers.map((p,i)=>[i*pas+pas/2,(p.palier%5===0?40:haut[i%4])+150]);
    let d=`M${pts[0][0]} ${pts[0][1]}`;
    for(let i=1;i<pts.length;i++){const [a,b]=pts[i-1],[c,e]=pts[i];d+=` C${a+60} ${b},${c-60} ${e},${c} ${e}`}
    const avance=Math.max(0,Math.min(1,(v.palier-1+(fini?0:pct/100))/(pts.length-1)));
    const cases=v.paliers.map((p,i)=>{
      const etat=p.obtenu?'obtenu':(p.palier===courant?'courant':'futur');
      const ilot=p.palier%5===0?'chateau':ILOTS_PISTE[i%ILOTS_PISTE.length];
      return `<li class="ar-etape ${etat}${p.palier%5===0?' grand':''}" style="left:${i*pas}px;top:${pts[i][1]-150}px" data-palier="${p.palier}"><small>${p.palier}</small><span class="ar-prix">${saisonApercu(p)}</span><img class="ar-ilot" src="../assets/progression/ilot-${ilot}.webp" alt="" loading="lazy" draggable="false"><b>${safeText(p.categorie==='vent'?'Vent porteur':p.texte.replace(/^Coffre de /,'Coffre · '))}</b></li>`;
    }).join('');
    const duree=v.active?(v.joursRestants>1?`Encore ${v.joursRestants} jours`:'Dernier jour'):'Saison terminée';
    const largeur=pts.length*pas;
    return `<section class="ar-saison-tete"><div class="ar-palier"><small>PALIER</small><b>${v.palier}</b></div><div class="ar-saison-nom"><small>SAISON ${v.numero} · PASSE GRATUIT</small><b>${safeText(v.nom)}</b><span>${duree}</span></div><div class="ar-saison-barre"><div class="pp-barre"><i style="width:${pct}%"></i></div><small>${fini?`Piste terminée · un vent porteur tous les ${v.xpParPalier} XP`:`${v.xpDansPalier} / ${v.xpParPalier} XP`}</small></div></section>
      <div class="ar-piste"><ol style="width:${largeur}px"><svg class="ar-fil" viewBox="0 0 ${largeur} 330" width="${largeur}" height="330" aria-hidden="true"><path d="${d}" class="ar-fil-fond"/><path d="${d}" class="ar-fil-or" pathLength="1000" stroke-dasharray="${Math.round(avance*1000)} 2000"/></svg>${cases}</ol></div>`;
  }
  /* Journal : les parties notées sur cet appareil (js/game/progression.js). */
  const JOURNAL_MODES={solo:'Contre le CPU',duel:'Duel',team:'2 contre 2',online:'En ligne'};
  const JOURNAL_NIVEAUX={easy:'Facile',normal:'Normal',hard:'Difficile',expert:'Expert'};
  const JOURNAL_RESULTATS={victoire:'VICTOIRE',defaite:'DÉFAITE',nul:'NUL'};
  const JOURNAL_MOIS=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  function journalDate(jour,aujourdhui,hier){
    if(jour===aujourdhui) return 'Aujourd’hui';
    if(jour===hier) return 'Hier';
    const [,m,j]=String(jour).split('-').map(Number);
    return m?`${j} ${JOURNAL_MOIS[m-1]}`:'';
  }
  function journalDuree(s){
    if(!(s>0)) return '';
    const min=Math.round(s/60);
    return min<1?'< 1 min':(min<60?`${min} min`:`${Math.floor(min/60)} h ${String(min%60).padStart(2,'0')}`);
  }
  function journalHtml(v){
    if(!v) return '';
    const b=v.bilan;
    const aujourdhui=v.jours[v.jours.length-1].jour, hier=v.jours[v.jours.length-2].jour;
    const max=Math.max(1,...v.jours.map(j=>j.xp));
    const lettres=['D','L','M','M','J','V','S'];
    const barres=v.jours.map(j=>{
      const [a,m,d]=j.jour.split('-').map(Number);
      const lettre=lettres[new Date(Date.UTC(a,m-1,d)).getUTCDay()];
      const h=j.xp?Math.max(5,Math.round(74*j.xp/max)):0;
      return `<li class="jn-jour${j.jour===aujourdhui?' auj':''}${j.xp?'':' vide'}" title="${journalDate(j.jour,aujourdhui,hier)} : ${j.xp} XP, ${j.parties} partie${j.parties>1?'s':''}"><span class="jn-xp">${j.xp||''}</span><i style="height:${h}%"></i><small>${lettre}</small></li>`;
    }).join('');
    const taux=b.parties?Math.round(100*b.victoires/b.parties):0;
    const tuiles=[
      ['PARTIES',b.parties,`${b.joursJoues} jour${b.joursJoues>1?'s':''} sur 7`],
      ['VICTOIRES',b.parties?`${taux} %`:'–',b.parties?`${b.victoires} sur ${b.parties}`:'aucune partie'],
      ['XP PAR PARTIE',b.parties?b.xpParPartie:'–',`${b.xpParJour} XP par jour`],
      ['DURÉE MOYENNE',b.dureeMoyenne?journalDuree(b.dureeMoyenne):'–','par partie']
    ].map(([t,val,sous])=>`<li><small>${t}</small><b>${val}</b><span>${sous}</span></li>`).join('');
    let rythme='';
    const r=v.rythme;
    if(r){
      const texte=r.joursNecessaires===null
        ?`Encore ${r.reste} XP jusqu’au palier ${r.total}. Jouez une partie pour voir votre rythme.`
        :(r.aTemps
          ?`À votre rythme, le palier ${r.total} tombe vers le <b>${journalDate(r.date,aujourdhui,hier)}</b>, avant la fin de la saison.`
          :`À votre rythme, vous finirez la saison vers le <b>palier ${r.palierFinal}</b> sur ${r.total}.`);
      rythme=`<div class="jn-rythme${r.aTemps?' a-temps':''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17c4-1 6-5 9-9 2 3 4 5 9 6"/><circle cx="12" cy="8" r="2.2"/></svg><p>${texte}</p></div>`;
    }
    const lignes=v.dernieres.map(e=>{
      const sous=[e.difficulte?JOURNAL_NIVEAUX[e.difficulte]:'',e.manches?`${e.manches} manche${e.manches>1?'s':''}`:'',journalDuree(e.duree)].filter(Boolean).join(' · ');
      return `<li class="jn-partie ${safeText(e.resultat)}"><em>${JOURNAL_RESULTATS[e.resultat]||''}</em><div><b>${safeText(JOURNAL_MODES[e.mode]||'Partie')}</b><small>${safeText(sous)}</small></div><span class="jn-quand">${journalDate(e.jour,aujourdhui,hier)}</span><strong>+${Number(e.xp)||0} XP</strong></li>`;
    }).join('');
    return `<section><h3>CES 7 DERNIERS JOURS</h3><ul class="jn-tuiles">${tuiles}</ul></section>
      ${rythme}
      <section><h3>XP GAGNÉE · 14 JOURS</h3><ol class="jn-graphe">${barres}</ol></section>
      <section><h3>DERNIÈRES PARTIES${v.total>v.dernieres.length?` <small class="jn-total">${v.total} au total</small>`:''}</h3>${lignes?`<ul class="jn-parties">${lignes}</ul>`:'<p class="coll-note">Aucune partie notée pour l’instant. Vos parties terminées apparaîtront ici.</p>'}</section>
      <p class="coll-note">Le journal reste sur cet appareil.</p>`;
  }
  const PP_ICONES={
    progression:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h10l3 3v15H6z" fill="currentColor" opacity=".9"/><path d="M9 9h7M9 13h7M9 17h4" stroke="#140d04" stroke-width="1.6" stroke-linecap="round"/></svg>',
    saison:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18l-7-4-7 4z" fill="currentColor"/></svg>',
    collection:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 6 6 1-4.5 4.3 1 6.2L12 16.6 6.5 19.5l1-6.2L3 9l6-1z" fill="currentColor"/></svg>',
    journal:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>',
    vent:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h7"/></svg>',
    ile:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5 12 6l9 3.5-9 3.5z" fill="currentColor"/><path d="M5 11.2l7 2.8 7-2.8-7 9z" fill="currentColor" opacity=".55"/></svg>',
    epee:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 3H21v6.5L10 20.5 3.5 14z" fill="currentColor"/><path d="m3 21 4-4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  /* Les sept îlots de l'offrande : le hameau de la semaine se construit. */
  const ILOTS_OFFRANDE=['foret','maison','puits','moulin','marche','taverne','chateau'];
  function anneauSvg(part,ep){
    const r=18-ep/2, l=2*Math.PI*r;
    return `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="${r}" class="pp-anneau-fond" stroke-width="${ep}"/><circle cx="20" cy="20" r="${r}" class="pp-anneau-plein" stroke-width="${ep}" stroke-dasharray="${l.toFixed(1)}" stroke-dashoffset="${((1-part)*l).toFixed(1)}" transform="rotate(-90 20 20)"/></svg>`;
  }
  function gainHtml(d){
    return d.vent?`<span class="ar-gain ar-vent">${PP_ICONES.vent}×${d.vent}</span>`:`<span class="ar-gain">${d.xp}<small>XP</small></span>`;
  }
  function offrandeHtml(o){
    const details=o.details||o.cases.map(()=>({xp:0,vent:0}));
    return `<ol class="ar-semaine">${details.map((d,i)=>{
      const recue=i<o.prochaine, aujourdhui=i===o.prochaine;
      const etat=recue?'recue':(aujourdhui?(o.dispo?'prete':'demain'):'futur');
      const bas=aujourdhui&&o.dispo?'<button type="button" class="offrande-prendre">RECEVOIR</button>':`<small class="ar-jour">${aujourdhui?'DEMAIN':`JOUR ${i+1}`}</small>`;
      return `<li class="ar-ilot-jour ${etat}${i===6?' dernier':''}">${recue?`<i class="ar-sceau">${PP_ICONES.check}</i>`:''}<img src="../assets/progression/ilot-${ILOTS_OFFRANDE[i]}.webp" alt="" draggable="false">${gainHtml(d)}${bas}</li>`;
    }).join('')}</ol>`;
  }
  function queteIcone(texte){
    if(/île|ile/i.test(texte)) return PP_ICONES.ile;
    if(/puzzle|énigme/i.test(texte)) return PP_ICONES.collection;
    return PP_ICONES.epee;
  }
  function queteCarte(q,index,changer){
    const part=q.fait/Math.max(1,q.cible);
    const bouton=changer&&!q.finie?`<button type="button" class="quete-changer" data-index="${index}" title="Changer cette quête (une fois par jour)" aria-label="Changer cette quête">↻</button>`:'';
    return `<li class="quete${q.finie?' finie':''}"><span class="ar-rond">${anneauSvg(Math.min(1,part),3.4)}${q.finie?PP_ICONES.check:queteIcone(q.texte)}</span><span class="ar-quete-texte"><b>${safeText(q.texte)}</b><small>${q.finie?'Accomplie':`${q.fait} / ${q.cible}`}</small></span><span class="quete-xp">+${q.xp} XP</span>${bouton}</li>`;
  }
  function semaineHtml(q){
    if(!q) return '';
    const pct=Math.round(100*q.fait/Math.max(1,q.cible));
    return `<div class="ar-hebdo${q.finie?' finie':''}"><em>SEMAINE</em><b>${safeText(q.texte)}</b><div class="ar-hebdo-barre"><i style="width:${pct}%"></i></div><small>${q.finie?'Accomplie':`${q.fait} / ${q.cible}`}</small><span>+${q.xp} XP</span></div>`;
  }
  /* Le moment de l'offrande : l'îlot du jour monte dans la lumière, une
     seule fois (pas de boucle), puis on revient au panneau. */
  function momentOffrande(r,etat,conteneur,apres){
    const card=conteneur||modal.querySelector('.menu-modal-card');
    card.querySelector('.ar-moment')?.remove();
    const d=(etat.offrande.details||[])[r.indice]||{};
    const titre=d.vent?'VENT PORTEUR':`+${d.xp} XP`;
    const sous=d.vent?`+50 % d’XP sur tes ${d.vent} prochaines parties`:(r.niveauxGagnes>0?`Niveau ${r.apres.niveau} atteint !`:'Ajouté à ton niveau et à ta saison');
    const mini=ILOTS_OFFRANDE.map((nom,i)=>`<i class="${i<r.indice?'recue':(i===r.indice?'neuve':'futur')}"><img src="../assets/progression/ilot-${nom}.webp" alt=""></i>`).join('');
    const ouverts=r.debloques?.length?`<p class="ar-moment-debloque">Débloqué : ${r.debloques.map(x=>safeText(x.nom)).join(', ')}</p>`:'';
    const el=document.createElement('div');
    el.className='ar-moment';
    el.innerHTML=`<div class="ar-rayons" aria-hidden="true"></div><small class="ar-moment-titre">OFFRANDE · JOUR ${r.indice+1}</small><img class="ar-moment-ilot" src="../assets/progression/ilot-${ILOTS_OFFRANDE[r.indice]}.webp" alt=""><div class="ar-recompense">${d.vent?PP_ICONES.vent:''}<div><b>${titre}</b><span>${sous}</span></div></div>${ouverts}<div class="ar-moment-semaine">${mini}</div><button type="button" class="ar-continuer">CONTINUER</button>`;
    card.appendChild(el);
    const fermer=()=>{ el.remove(); apres?.(); };
    el.querySelector('.ar-continuer').addEventListener('click',fermer);
    el.querySelector('.ar-continuer').focus({preventScroll:true});
  }
  function teteHtml(etat){
    const part=etat.xpDansNiveau/Math.max(1,etat.xpPourSuivant);
    const nom=etat.pseudo?safeText(etat.pseudo):'Voyageur';
    return `<div class="ar-tete">${etat.heros?`<div class="ar-heros"><img src="../${safeText(etat.heros)}" alt=""></div>`:''}<div class="ar-blason">${anneauSvg(part,3)}<b>${etat.niveau}</b></div><div class="ar-identite"><small>NIVEAU ${etat.niveau}${etat.titre?` · <i>${safeText(etat.titre)}</i>`:''}</small><h2>${nom}${compteBouton()}</h2><div class="pp-barre"><i style="width:${Math.round(100*part)}%"></i></div><em>${etat.xpDansNiveau} / ${etat.xpPourSuivant} XP${etat.offrande.vent?` · <span class="ar-vent-actif">${PP_ICONES.vent} Vent porteur : ${etat.offrande.vent} partie${etat.offrande.vent>1?'s':''}</span>`:''}</em></div></div>`;
  }
  /* COMPTE : le nom du voyageur suffit pour retrouver sa progression en
     ligne. Depuis le panneau, le joueur peut la sécuriser par un mot de
     passe ; ce nom demande alors son mot de passe sur un autre appareil. */
  const NUAGE_SVG='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.5 4.5 0 0 0 7 18z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  const CADENAS_SVG=ouvert=>`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="${ouvert?'M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2':'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  function compteBouton(){
    const c=progressionApi()?.compte?.();
    if(c&&c.protege) return `<span class="ar-nuage en-ligne" title="Progression sécurisée" aria-label="Progression sécurisée">${CADENAS_SVG(false)}</span>`;
    if(c) return `<button type="button" class="ar-nuage ar-securiser-ouvrir" title="Sécuriser ma progression" aria-label="Sécuriser ma progression">${CADENAS_SVG(true)}</button>`;
    return `<button type="button" class="ar-nuage ar-compte-ouvrir" title="Sauvegarder ma progression en ligne" aria-label="Sauvegarder ma progression en ligne">${NUAGE_SVG}<i>!</i></button>`;
  }
  const COMPTE_ERREURS={
    pseudo:'2 à 16 lettres ou chiffres.',
    'mot-de-passe':'6 caractères au moins pour le mot de passe.',
    'mot-de-passe-requis':'Ce voyageur est protégé : entre son mot de passe.',
    identifiants:'Mot de passe incorrect.',
    pause:'Trop d’essais : réessaie dans 15 minutes.',
    reseau:'Sauvegarde en ligne injoignable pour l’instant.'
  };
  function compteFormHtml(classe,valeur){
    return `<form class="${classe} compte-form" novalidate>
      <span class="cf-titre">Nom du voyageur</span>
      <input name="pseudo" maxlength="16" autocomplete="username" spellcheck="false" placeholder="Ton nom" aria-label="Nom du voyageur" value="${safeText(valeur||'')}">
      <input name="mdp" type="password" maxlength="128" autocomplete="current-password" placeholder="Son mot de passe" aria-label="Mot de passe" hidden>
      <small class="ar-pseudo-erreur" role="alert" hidden></small>
      <button type="submit" class="ar-continuer">COMMENCER</button>
      <button type="button" class="cf-lien cf-hors-ligne" hidden>Jouer sans compte</button>
    </form>`;
  }
  function brancherCompteForm(form,options,apres){
    const api=()=>progressionApi();
    const pseudo=form.elements.pseudo, mdp=form.elements.mdp;
    const erreur=form.querySelector('.ar-pseudo-erreur'), envoyer=form.querySelector('[type=submit]');
    const horsLigne=form.querySelector('.cf-hors-ligne');
    if(options.bouton) envoyer.textContent=options.bouton;
    const montrer=code=>{ erreur.textContent=COMPTE_ERREURS[code]||COMPTE_ERREURS.reseau; erreur.hidden=false; options.ajuster?.(); };
    /* Un autre nom ne demande plus le mot de passe du précédent. */
    pseudo.addEventListener('input',()=>{ if(!mdp.hidden){ mdp.hidden=true; mdp.value=''; erreur.hidden=true; options.ajuster?.(); } });
    horsLigne.addEventListener('click',()=>{ if(api()?.definirPseudo?.(pseudo.value)) apres({ok:true,horsLigne:true}); else montrer('pseudo'); });
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      if(envoyer.disabled) return;
      erreur.hidden=true;
      if(!api()?.pseudoValide?.(pseudo.value)){ montrer('pseudo'); pseudo.focus(); return; }
      if(!mdp.hidden&&!mdp.value){ montrer('mot-de-passe-requis'); mdp.focus(); return; }
      envoyer.disabled=true; const texte=envoyer.textContent; envoyer.textContent='…';
      const r=await api()?.entrer?.(pseudo.value,mdp.hidden?undefined:mdp.value)||{ok:false,erreur:'reseau'};
      envoyer.disabled=false; envoyer.textContent=texte;
      if(r.ok){ apres(r); return; }
      if(r.erreur==='mot-de-passe-requis'){ mdp.hidden=false; setTimeout(()=>mdp.focus({preventScroll:true}),0); }
      montrer(r.erreur);
      /* Quelle que soit l'erreur, on peut toujours jouer sans compte. */
      horsLigne.hidden=false;
      options.ajuster?.();
    });
  }
  function retourPanneau(){
    const nouvel=progressionApi()?.etat?.();
    if(nouvel&&nouvel.pseudo) renderProgressionPanel(nouvel);
    renderProfileBadge();
  }
  function renderCompte(etat){
    modalTitle.textContent='';
    modalBody.innerHTML=`<div class="progression-panel"><div class="ar-pseudo"><img src="../assets/progression/ilot-chateau.webp" alt="" class="ar-pseudo-ilot">${compteFormHtml('ar-compte',etat.pseudo)}</div></div>`;
    const form=modalBody.querySelector('.compte-form');
    brancherCompteForm(form,{bouton:'VALIDER'},retourPanneau);
    form.elements.pseudo.focus({preventScroll:true});
  }
  /* Sécuriser : un mot de passe, désormais demandé pour ce nom. */
  function renderSecuriser(etat){
    modalTitle.textContent='';
    modalBody.innerHTML=`<div class="progression-panel"><div class="ar-pseudo"><img src="../assets/progression/ilot-chateau.webp" alt="" class="ar-pseudo-ilot">
      <form class="ar-compte compte-form" novalidate>
        <span class="cf-titre">Sécurise ta progression</span>
        <p class="cf-note">Avec un mot de passe, toi seul pourras retrouver <b>${safeText(etat.pseudo||'')}</b> sur un autre appareil. Il ne peut pas être récupéré : note-le bien.</p>
        <input name="mdp" type="password" maxlength="128" autocomplete="new-password" placeholder="Crée un mot de passe" aria-label="Crée un mot de passe">
        <small class="ar-pseudo-erreur" role="alert" hidden></small>
        <button type="submit" class="ar-continuer">SÉCURISER</button>
        <button type="button" class="cf-lien cf-plus-tard">Plus tard</button>
      </form></div></div>`;
    const form=modalBody.querySelector('.compte-form'), mdp=form.elements.mdp;
    const erreur=form.querySelector('.ar-pseudo-erreur'), envoyer=form.querySelector('[type=submit]');
    form.querySelector('.cf-plus-tard').addEventListener('click',retourPanneau);
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      if(envoyer.disabled) return;
      if(mdp.value.length<6){ erreur.textContent=COMPTE_ERREURS['mot-de-passe']; erreur.hidden=false; mdp.focus(); return; }
      envoyer.disabled=true; envoyer.textContent='…';
      const r=await progressionApi()?.securiser?.(mdp.value)||{ok:false,erreur:'reseau'};
      envoyer.disabled=false; envoyer.textContent='SÉCURISER';
      if(r.ok){ retourPanneau(); return; }
      erreur.textContent=COMPTE_ERREURS[r.erreur]||COMPTE_ERREURS.reseau; erreur.hidden=false;
    });
    mdp.focus({preventScroll:true});
  }
  function renderProgressionPanel(etat,annonce){
    if(!etat.pseudo) return renderCompte(etat);
    const onglet=['collection','saison','journal'].includes(modal.dataset.onglet)?modal.dataset.onglet:'progression';
    modalTitle.textContent='';
    const tete=teteHtml(etat);
    const ongletsListe=[['progression','QUÊTES',etat.offrande.dispo],etat.saison?['saison','SAISON',false]:null,['collection','COLLECTION',etat.nouveautes>0],['journal','JOURNAL',false]].filter(Boolean);
    const onglets=`<div class="pp-onglets" role="tablist">${ongletsListe.map(([cle,lib,pastille])=>`<button type="button" role="tab" data-onglet="${cle}" aria-selected="${onglet===cle}">${PP_ICONES[cle]}<span>${lib}</span>${pastille?'<i class="pp-pastille"></i>':''}</button>`).join('')}</div>`;
    const entete=`<div class="ar-entete">${tete}${onglets}</div>`;
    const bindPseudo=()=>{
      modalBody.querySelector('.ar-compte-ouvrir')?.addEventListener('click',()=>renderCompte(progressionApi()?.etat?.()||etat));
      modalBody.querySelector('.ar-securiser-ouvrir')?.addEventListener('click',()=>renderSecuriser(progressionApi()?.etat?.()||etat));
    };
    if(onglet==='journal'){
      modalBody.innerHTML=`<div class="progression-panel">${entete}${journalHtml(progressionApi()?.journal?.())}</div>`;
      bindProgressionTabs(); bindPseudo();
      return;
    }
    if(onglet==='saison'){
      modalBody.innerHTML=`<div class="progression-panel">${entete}${saisonHtml(etat.saison)}</div>`;
      bindProgressionTabs(); bindPseudo();
      const piste=modalBody.querySelector('.ar-piste');
      const cible=piste?.querySelector('.courant')||[...(piste?.querySelectorAll('.obtenu')||[])].pop();
      if(piste&&cible) piste.scrollLeft=Math.max(0,cible.offsetLeft-piste.clientWidth/2+cible.clientWidth/2);
      return;
    }
    if(onglet==='collection'){
      const categories=progressionApi()?.collection?.()||[];
      modalBody.innerHTML=`<div class="progression-panel">${entete}${annonce?`<div class="pp-annonce">${safeText(annonce)}</div>`:''}${collectionHtml(categories)}</div>`;
      bindProgressionTabs(); bindPseudo();
      modalBody.querySelectorAll('.coll-objet button:not([disabled])').forEach(btn=>btn.addEventListener('click',()=>{
        if(!progressionApi()?.equiper?.(btn.dataset.cat,btn.dataset.id)) return;
        const nom=btn.querySelector('b')?.textContent||'';
        const nouvel=progressionApi()?.etat?.();
        if(nouvel) renderProgressionPanel(nouvel,`${nom} équipé.`);
      }));
      /* Les « nouveau » restent visibles pendant cette visite, puis s'éteignent. */
      try{ progressionApi()?.marquerVus?.(); }catch(_){}
      return;
    }
    modalBody.innerHTML=`<div class="progression-panel">
      ${entete}
      ${annonce?`<div class="pp-annonce">${safeText(annonce)}</div>`:''}
      <section><h3>OFFRANDE DU JOUR <small>Un îlot par jour : le septième porte le château.</small></h3>${offrandeHtml(etat.offrande)}</section>
      <section><h3>QUÊTES DU JOUR</h3><ul class="quetes">${etat.quetes.jour.map((q,i)=>queteCarte(q,i,etat.quetes.changementDispo)).join('')||'<li class="quete vide">Nouvelles quêtes demain.</li>'}</ul>${semaineHtml(etat.quetes.semaine)}</section>
    </div>`;
    bindProgressionTabs(); bindPseudo();
    modalBody.querySelector('.offrande-prendre')?.addEventListener('click',()=>{
      const r=progressionApi()?.reclamerOffrande?.();
      const nouvel=progressionApi()?.etat?.();
      if(nouvel) renderProgressionPanel(nouvel);
      if(r&&nouvel) momentOffrande(r,nouvel);
      renderProfileBadge();
    });
    modalBody.querySelectorAll('.quete-changer').forEach(btn=>btn.addEventListener('click',()=>{
      if(progressionApi()?.changerQuete?.(Number(btn.dataset.index))){
        const nouvel=progressionApi()?.etat?.();
        if(nouvel) renderProgressionPanel(nouvel,'Quête remplacée.');
      }
    }));
  }
  function bindProgressionTabs(){
    modalBody.querySelectorAll('.pp-onglets [data-onglet]').forEach(btn=>btn.addEventListener('click',()=>{
      if(modal.dataset.onglet===btn.dataset.onglet) return;
      modal.dataset.onglet=btn.dataset.onglet;
      const etat=progressionApi()?.etat?.();
      if(etat) renderProgressionPanel(etat);
      renderProfileBadge();
    }));
  }
  function openProgression(onglet){
    const etat=progressionApi()?.etat?.();
    if(!etat) return;
    modal.dataset.vue='progression';
    /* Le badge mène à la collection quand elle a du nouveau ; sinon aux quêtes. */
    modal.dataset.onglet=onglet||(etat.nouveautes&&!etat.offrande.dispo?'collection':'progression');
    modal.querySelector('.menu-modal-card').classList.add('progression-card');
    renderProgressionPanel(etat);
    modal.classList.add('open');
  }
  /* ÉCRAN D'OUVERTURE : le logo sur le ciel du menu, puis
     - la première fois : le choix du pseudo ;
     - ensuite : le chemin de saison depuis la dernière visite (le fil d'or
       avance une fois jusqu'au palier actuel) et l'offrande du jour si elle
       attend. Une fois par session ; un clic sur JOUER ouvre le menu.
     Les navigateurs pilotés par les tests (navigator.webdriver) passent
     directement au menu, sauf avec ?ouverture=1. */
  const OUVERTURE_VU='ilyos-ouverture-saison';
  function ouvertureVoulue(){
    try{
      const force=/[?&]ouverture=1/.test(parent.location.search)||/[?&]ouverture=1/.test(location.search);
      if(force) return true;
      if(navigator.webdriver) return false;
      return sessionStorage.getItem('ilyos-ouverture-faite')!=='1';
    }catch(_){ return false; }
  }
  function ouvertureChemin(v,depuis){
    const pas=132, voisins=[-2,-1,0,1,2,3];
    const centre=Math.min(Math.max(v.palier,2),v.paliers.length-3);
    const liste=voisins.map(d=>v.paliers[centre+d-1]).filter(Boolean);
    const haut=[40,6,34,0,30,8];
    const pts=liste.map((p,i)=>[i*pas+pas/2,(p.palier%5===0?14:haut[i%6])+120]);
    let d=`M${pts[0][0]} ${pts[0][1]}`;
    for(let i=1;i<pts.length;i++){const [a,b]=pts[i-1],[c,e]=pts[i];d+=` C${a+52} ${b},${c-52} ${e},${c} ${e}`}
    const frac=pal=>{const i=liste.findIndex(p=>p.palier>=pal);return i<0?1:Math.max(0,i/(liste.length-1));};
    const avant=Math.max(0,frac(Math.max(1,depuis))), apres=frac(Math.max(1,v.palier));
    const cases=liste.map((p,i)=>{
      const neuf=p.obtenu&&p.palier>depuis;
      const etat=p.obtenu?'obtenu':(p.palier===v.palier+1?'courant':'futur');
      const ilot=p.palier%5===0?'chateau':ILOTS_PISTE[(p.palier-1)%ILOTS_PISTE.length];
      return `<li class="ar-etape ${etat}${neuf?' neuf':''}${p.palier%5===0?' grand':''}" style="left:${i*pas-9}px;top:${pts[i][1]-120}px"><small>${p.palier}</small><span class="ar-prix">${saisonApercu(p)}</span><img class="ar-ilot" src="../assets/progression/ilot-${ilot}.webp" alt=""><b>${safeText(p.categorie==='vent'?'Vent porteur':p.texte.replace(/^Coffre de /,'Coffre · '))}</b></li>`;
    }).join('');
    const w=liste.length*pas;
    return `<div class="ouv-chemin"><ol style="width:${w}px"><svg class="ar-fil" viewBox="0 0 ${w} 300" width="${w}" height="300" aria-hidden="true"><path d="${d}" class="ar-fil-fond"/><path d="${d}" class="ar-fil-or ouv-fil" pathLength="1000" style="--avant:${Math.round(avant*1000)};--apres:${Math.round(apres*1000)}" stroke-dasharray="${Math.round(apres*1000)} 2000"/></svg>${cases}</ol></div>`;
  }
  function montrerOuverture(){
    const etat=progressionApi()?.etat?.();
    if(!etat) return;
    try{ sessionStorage.setItem('ilyos-ouverture-faite','1'); }catch(_){}
    let depuis=0;
    try{ depuis=Number(localStorage.getItem(OUVERTURE_VU))||0; }catch(_){}
    const el=document.createElement('div');
    el.className='ouverture';
    const fermer=()=>{
      try{ if(etat.saison) localStorage.setItem(OUVERTURE_VU,String(etat.saison.palier)); }catch(_){}
      el.classList.add('fin');
      window.removeEventListener('resize',ajuster);
      setTimeout(()=>el.remove(),450);
      renderProfileBadge();
    };
    const premiere=!etat.pseudo;
    let corps='';
    if(premiere){
      corps=compteFormHtml('ouv-pseudo','');
    }
    el.innerHTML=`<div class="ouv-fond" aria-hidden="true"></div><img class="ouv-logo" src="./assets/ilyos-logo.svg?v=celestes-2" alt="ILYOS, les îles célestes"><div class="ouv-corps">${corps}</div>`;
    document.body.appendChild(el);
    /* Fenêtre basse : le contenu rétrécit pour tenir sans défilement. */
    const ajuster=()=>{
      const z=el.querySelector('.ouv-corps'); if(!z||!el.isConnected) return;
      z.style.zoom='';
      const trop=el.scrollHeight-el.clientHeight;
      if(trop>0){ const h=z.offsetHeight; z.style.zoom=String(Math.max(.55,(h-trop-6)/h).toFixed(3)); }
    };
    el.querySelector('.ouv-logo').addEventListener('load',ajuster);
    window.addEventListener('resize',ajuster);
    if(premiere){
      const form=el.querySelector('.ouv-pseudo');
      setTimeout(()=>form.elements.pseudo.focus({preventScroll:true}),400);
      brancherCompteForm(form,{ajuster},fermer);
      ajuster();
    }else{
      const zone=el.querySelector('.ouv-corps');
      const salut=`<p class="ouv-salut">Bon retour, <b>${safeText(etat.pseudo)}</b></p>`;
      /* Étape 2 : quêtes du jour et chemin de saison, puis ENTRÉE. */
      const etape2=()=>{
        const e=progressionApi()?.etat?.()||etat, v=e.saison;
        const gagnes=v?v.paliers.filter(p=>p.obtenu&&p.palier>depuis).length:0;
        const quetes=e.quetes.jour.map((q,i)=>queteCarte(q,i,false)).join('');
        zone.innerHTML=`${salut}
          ${quetes?`<div class="ouv-bloc"><h3>QUÊTES DU JOUR</h3><ul class="quetes">${quetes}</ul></div>`:''}
          ${v?`<div class="ouv-saison"><div class="ouv-saison-tete"><span class="ar-palier"><small>PALIER</small><b>${v.palier}</b></span><span><small>SAISON ${v.numero}</small><b>${safeText(v.nom)}</b><em>${gagnes?`${gagnes} palier${gagnes>1?'s':''} gagné${gagnes>1?'s':''} depuis ta dernière visite`:`${v.xpDansPalier} / ${v.xpParPalier} XP vers le palier ${v.palier+1}`}</em></span></div>${ouvertureChemin(v,depuis)}</div>`:''}
          <button type="button" class="ar-continuer ouv-jouer">ENTRÉE</button>`;
        zone.classList.remove('ouv-entre'); void zone.offsetWidth; zone.classList.add('ouv-entre');
        zone.querySelector('.ouv-jouer').addEventListener('click',fermer);
        zone.querySelector('.ouv-jouer').focus({preventScroll:true});
        ajuster();
      };
      /* Étape 1 : l'offrande du jour, si elle attend. */
      if(etat.offrande.dispo){
        el.classList.add('ouv-avec-offrande');
        zone.innerHTML=`${salut}<div class="ouv-bloc ouv-offrande-bloc"><h3>OFFRANDE DU JOUR</h3>${offrandeHtml(etat.offrande)}</div>`;
        ajuster();
        zone.querySelector('.offrande-prendre').addEventListener('click',()=>{
          const r=progressionApi()?.reclamerOffrande?.();
          const nouvel=progressionApi()?.etat?.();
          renderProfileBadge();
          if(r&&nouvel) momentOffrande(r,nouvel,el,()=>{ el.classList.remove('ouv-avec-offrande'); etape2(); });
          else etape2();
        });
      }else etape2();
    }
  }
  (function waitProgression(tries){
    if(progressionApi()){
      renderProfileBadge();
      /* Récupère d'abord la progression du compte (2,5 s au plus). */
      const sync=progressionApi().synchroniser?.()||Promise.resolve();
      Promise.race([sync,new Promise(r=>setTimeout(r,2500))]).catch(()=>{}).then(()=>{ renderProfileBadge(); if(ouvertureVoulue()) montrerOuverture(); });
    }
    else if(tries>0) setTimeout(()=>waitProgression(tries-1),250);
  })(40);
  window.addEventListener('storage',e=>{ if(!e.key||e.key==='ilyos-profil-v1') renderProfileBadge(); });
  document.addEventListener('visibilitychange',renderProfileBadge);
  document.getElementById('profilBadge')?.addEventListener('click',()=>openProgression());
  document.getElementById('offrandePill')?.addEventListener('click',()=>openProgression('progression'));
  function ensureSelections(mode){
    const c=cfg[mode]; if(!c) return {};
    if(!selections[mode]) selections[mode]={};
    (c.controls||[]).forEach(control=>{
      if(!(control.key in selections[mode])) selections[mode][control.key]=control.default;
    });
    return selections[mode];
  }
  function optionLabel(control,value){
    const hit=(control?.options||[]).find(([v])=>String(v)===String(value));
    return hit ? hit[1] : String(value ?? '');
  }
  function controlByKey(mode,key){ return (cfg[mode]?.controls||[]).find(control=>control.key===key); }
  function labelFor(mode,key,value){ return optionLabel(controlByKey(mode,key),value); }
  function safeText(value){return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function notifySettings(){
    const c=cfg[selectedMode];
    send('settings',{mode:selectedMode,playerCount:c?.playerCount,values:{...ensureSelections(selectedMode)}});
  }

  function playLabel(){
    const c=cfg[selectedMode];
    const values=ensureSelections(selectedMode);
    if(selectedMode==='online') return values.role==='guest' ? 'REJOINDRE LA PARTIE' : 'CRÉER LA PARTIE';
    return c?.playLabel||'JOUER';
  }
  function playSubLabel(){
    const values=ensureSelections(selectedMode);
    if(selectedMode==='solo') return 'ENTRER DANS L’ARÈNE';
    if(selectedMode==='duel') return 'QUE LE DUEL COMMENCE';
    if(selectedMode==='team') return '3 COURONNES POUR GAGNER';
    if(selectedMode==='online') return values.role==='guest' ? 'SE CONNECTER AU SALON' : 'OUVRIR LE SALON';
    return '';
  }

  function difficultyLevel(value){ return ({easy:1,normal:2,hard:3,expert:4})[value]||1; }
  function difficultyLights(value){
    const level=difficultyLevel(value);
    return `<div class="difficulty-lights" aria-label="Niveau ${level} sur 4">${[1,2,3,4].map(i=>`<i class="${i<=level?'on':''}"></i>`).join('')}</div>`;
  }

  function duelContext(mode,values){
    if(mode==='solo') return {kicker:'DUEL CONTRE LE CPU',leftTop:'CHEVALIER OR',leftBottom:'VOUS',rightTop:'MAGE VIOLET',rightBottom:labelFor(mode,'difficulty',values.difficulty)};
    if(mode==='duel') return {kicker:'FACE À FACE LOCAL',leftTop:'CHEVALIER OR',leftBottom:values.name1||'JOUEUR 1',rightTop:'MAGE VIOLET',rightBottom:values.name2||'JOUEUR 2'};
    if(mode==='team'){
      const ia=({ai24:[2,4],ai234:[2,3,4]})[values.seats]||[];
      const nom=i=>ia.includes(i)?'IA':(values['name'+i]||'J'+i);
      return {kicker:'BATAILLE D’ÉQUIPES',leftTop:'ÉQUIPE OR',leftBottom:`${nom(1)} + ${nom(3)}`,rightTop:'ÉQUIPE VIOLETTE',rightBottom:`${nom(2)} + ${nom(4)}`};
    }
    return {kicker:values.role==='guest'?'REJOINDRE UN DUEL':'OUVRIR UN DUEL',leftTop:'CHEVALIER OR',leftBottom:values.name1||'VOUS',rightTop:'MAGE VIOLET',rightBottom:values.role==='guest'?'HÔTE':'INVITÉ'};
  }

  function duelHeader(mode,values){
    const c=cfg[mode];
    const ctx=duelContext(mode,values);
    return `<div class="duel-panel-head">
      <div class="duelist duelist-gold"><span class="duelist-gem"></span><small>${safeText(ctx.leftTop)}</small><b>${safeText(ctx.leftBottom)}</b></div>
      <div class="duel-medallion"><span class="duel-spark">✦</span><b>${safeText(c.label)}</b><small>${safeText(ctx.kicker)}</small></div>
      <div class="duelist duelist-violet"><span class="duelist-gem"></span><small>${safeText(ctx.rightTop)}</small><b>${safeText(ctx.rightBottom)}</b></div>
    </div>`;
  }

  function recap(mode,values){
    const items=[];
    if(values.board!=null && mode!=='team') items.push(['PLATEAU',labelFor(mode,'board',values.board)]);
    if(values.size!=null) items.push(['TAILLE',labelFor(mode,'size',values.size)]);
    if(values.timer!=null) items.push(['TOUR',labelFor(mode,'timer',values.timer)]);
    if(mode==='solo') items.push(['CPU',labelFor(mode,'difficulty',values.difficulty)]);
    if(mode==='team'&&values.seats&&values.seats!=='none') items.push(['CPU',labelFor(mode,'difficulty',values.difficulty)]);
    if(mode==='team'&&values.villages==='team') items.push(['GARDIENS','EN COMMUN']);
    if(mode==='team') items.push(['OBJECTIF','3 COURONNES']);
    if(mode==='online') items.push(['SESSION',values.role==='guest'?'REJOINDRE':'CRÉER']);
    return `<div class="match-recap">${items.map(([k,v])=>`<span><small>${safeText(k)}</small><b>${safeText(v)}</b></span>`).join('')}</div>`;
  }

  function editableField(control,values,extra=''){
    const shown=String(values[control.key]??control.default??'');
    const isCode=control.kind==='code';
    const placeholder=isCode?(shown==='AUTO'?'AUTO':'CODE'):'NOM';
    const value=shown==='AUTO'?'':safeText(shown);
    return `<div class="field editable-field ${extra}" data-key="${control.key}"><div class="label">${control.label}</div><div class="control editable-control"><input class="value editable-value" data-edit="${control.key}" data-kind="${control.kind||'text'}" maxlength="${isCode?8:18}" value="${value}" placeholder="${placeholder}" autocomplete="off" spellcheck="false"></div></div>`;
  }

  function selectorField(control,values,extra=''){
    const fixed=!!control.fixed || (control.options||[]).length<2;
    return `<div class="field selector-field ${extra}" data-key="${control.key}"><div class="label">${control.label}</div><div class="control"><button type="button" data-step="-1" data-key="${control.key}" ${fixed?'disabled':''} aria-label="Précédent">‹</button><div class="value"><span class="value-text">${safeText(optionLabel(control,values[control.key]))}</span></div><button type="button" data-step="1" data-key="${control.key}" ${fixed?'disabled':''} aria-label="Suivant">›</button></div></div>`;
  }

  function difficultyZone(mode,values){
    if(mode!=='solo') return '';
    const control=controlByKey(mode,'difficulty');
    return `<div class="difficulty-zone" data-key="difficulty">
      <div class="difficulty-zone-label">DIFFICULTÉ CPU</div>
      <div class="difficulty-selector">
        <button type="button" data-step="-1" data-key="difficulty" aria-label="Difficulté précédente">‹</button>
        <b>${safeText(optionLabel(control,values.difficulty))}</b>
        <button type="button" data-step="1" data-key="difficulty" aria-label="Difficulté suivante">›</button>
      </div>
      ${difficultyLights(values.difficulty)}
    </div>`;
  }

  function playerNames(mode,controls,values){
    const names=controls.filter(control=>control.editable&&control.kind==='name');
    if(mode==='duel'&&names.length>=2){
      return `<div class="duel-name-grid">
        <div class="duel-name-card gold-name"><div class="guardian-mark">♜</div>${editableField(names[0],values,'compact-name')}</div>
        <div class="duel-name-card violet-name"><div class="guardian-mark">♝</div>${editableField(names[1],values,'compact-name')}</div>
      </div>`;
    }
    if(mode==='team'&&names.length>=4){
      return `<div class="team-name-grid">
        <div class="team-name-card team-name-gold"><div class="team-name-title">ÉQUIPE OR</div>${editableField(names[0],values,'compact-name')}${editableField(names[2],values,'compact-name')}</div>
        <div class="team-name-card team-name-violet"><div class="team-name-title">ÉQUIPE VIOLETTE</div>${editableField(names[1],values,'compact-name')}${editableField(names[3],values,'compact-name')}</div>
      </div>`;
    }
    return names.map(control=>editableField(control,values)).join('');
  }

  function stepControl(control,direction){
    if(!control || control.fixed || control.editable || !control.options?.length) return;
    const values=control.options.map(([value])=>String(value));
    const current=String(ensureSelections(selectedMode)[control.key]);
    let index=Math.max(0,values.indexOf(current));
    index=(index+direction+values.length)%values.length;
    selections[selectedMode][control.key]=values[index];
    render(selectedMode,false);
    notifySettings();
  }

  function render(mode,emit=true){
    const c=cfg[mode]; if(!c) return;
    selectedMode=mode;
    const values=ensureSelections(mode);
    const controls=c.controls||[];
    duel.dataset.mode=mode;
    document.body.dataset.duelMode=mode;
    if(mode==='online'){
      renderEnLigne();
      if(emit){ send('mode',{mode,config:c}); notifySettings(); }
      return;
    }
    desc.textContent=c.description||'';
    play.innerHTML=`<span class="play-main">${safeText(playLabel())}</span><small>${safeText(playSubLabel())}</small>`;

    const bodyControls=controls.filter(control=>{
      if(control.editable&&control.kind==='name') return false;
      if(mode==='solo'&&control.key==='difficulty') return false;
      if(mode==='team'&&control.key==='difficulty'&&values.seats==='none') return false;
      return true;
    });
    const renderedControls=bodyControls.map(control=>control.editable?editableField(control,values):selectorField(control,values)).join('');
    const names=playerNames(mode,controls,values);

    panel.innerHTML=`${duelHeader(mode,values)}
      <div class="duel-panel-body">${renderedControls}${names}</div>
      ${difficultyZone(mode,values)}
      ${recap(mode,values)}
      <div class="dots">${[0,1,2,3].map(i=>`<span class="dot ${i===c.dot?'on':''}"></span>`).join('')}</div>`;
    panel.dataset.mode=mode;

    panel.querySelectorAll('[data-step]').forEach(btn=>btn.addEventListener('click',()=>{
      const control=controls.find(item=>item.key===btn.dataset.key);
      btn.classList.remove('tap'); void btn.offsetWidth; btn.classList.add('tap');
      stepControl(control,Number(btn.dataset.step)||1);
    }));

    panel.querySelectorAll('[data-edit]').forEach(input=>{
      const update=()=>{
        const isCode=input.dataset.kind==='code';
        let raw=input.value;
        raw=isCode ? raw.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8) : raw.replace(/[<>]/g,'').slice(0,18);
        input.value=raw;
        values[input.dataset.edit]=raw||(isCode?'AUTO':'JOUEUR');
        notifySettings();
      };
      input.addEventListener('input',update);
      input.addEventListener('change',()=>{update();render(selectedMode,false)});
    });

    if(emit){ send('mode',{mode,config:c}); notifySettings(); }
  }

  /* ─── EN LIGNE « Face-à-face » ───────────────────────────────────────
     Le mode EN LIGNE a son propre écran : choix CRÉER / REJOINDRE, puis
     salle d'attente (code du salon, copier, partager le lien, annuler).
     La logique réseau reste dans le jeu (core.js) : le cadre envoie « play »
     comme les autres modes et reçoit l'état du salon par « online-status ».
     Hôte = chevalier or, invité = mage violet, comme en partie. */
  const enLigne=document.createElement('div');
  enLigne.className='en-ligne';
  duel.appendChild(enLigne);
  let elVue='config';
  let elStatut={message:'',type:'',code:''};
  let elNomPret=false;
  const EL_NOMS_DEFAUT=['','JOUEUR','JOUEUR 1','JOUEUR 2'];

  function elNomParDefaut(role){
    let pseudo='';
    try{ pseudo=progressionApi()?.etat?.()?.pseudo||''; }catch(_){}
    pseudo=String(pseudo).replace(/[<>]/g,'').slice(0,18).toLocaleUpperCase('fr-FR');
    return pseudo||(role==='guest'?'JOUEUR 2':'JOUEUR 1');
  }
  function elValeurs(){
    const v=ensureSelections('online');
    if(!elNomPret||EL_NOMS_DEFAUT.includes(String(v.name1||'').trim())){ v.name1=elNomParDefaut(v.role); elNomPret=true; }
    return v;
  }
  function elCodeSaisi(v){ return v.roomCode&&v.roomCode!=='AUTO' ? v.roomCode : ''; }
  function elSessionSauvee(){
    try{
      const s=JSON.parse(localStorage.getItem('ilyos-online-session-v1')||'null');
      return s?.roomCode&&s?.role ? s : null;
    }catch(_){ return null; }
  }
  function elLien(code){
    try{ const u=new URL(parent.location.href); u.search=''; u.hash=''; u.searchParams.set('salon',code); return u.toString(); }
    catch(_){ return ''; }
  }
  function elSiege(couleur,nom,role,eteint){
    return `<div class="el-siege ${couleur}${eteint?' eteint':''}"><div class="el-anneau"><div class="el-portrait"></div></div><b>${nom}</b><span class="el-role el-nu">${role}</span></div>`;
  }
  function elPoints(){ return '<span class="el-pts" aria-hidden="true"><i></i><i></i><i></i></span>'; }
  function elTuiles(code,{min=6,curseur=false}={}){
    const n=Math.max(min,code.length);
    let h='';
    for(let i=0;i<n;i++){
      const c=code[i];
      h+=c?`<i>${safeText(c)}</i>`:`<i class="vide${curseur&&i===code.length?' cur':''}"></i>`;
    }
    return h;
  }
  function elReglage(key,v){
    const control=controlByKey('online',key);
    const court={board:'PLATEAU',size:'TAILLE',timer:'TOUR'}[key];
    return `<div class="el-chip field" data-key="${key}"><span class="el-lab el-nu">${court}</span><div class="el-fl"><button type="button" data-step="-1" data-key="${key}" aria-label="${court} précédent">‹</button><b>${safeText(optionLabel(control,v[key]))}</b><button type="button" data-step="1" data-key="${key}" aria-label="${court} suivant">›</button></div></div>`;
  }
  function elRecap(v){
    return `<div class="el-reglages">${['board','size','timer'].map(key=>`<div class="el-chip"><span class="el-lab el-nu">${{board:'PLATEAU',size:'TAILLE',timer:'TOUR'}[key]}</span><b>${safeText(labelFor('online',key,v[key]))}</b></div>`).join('')}</div>`;
  }
  function elOnglets(invite){
    return `<div class="el-onglets field" data-key="role" role="tablist">
      <button type="button" role="tab" data-step="-1" data-role="host" aria-selected="${!invite}" class="${invite?'':'on'}">✦ CRÉER<small>OUVRIR UN SALON</small></button>
      <button type="button" role="tab" data-step="1" data-role="guest" aria-selected="${invite}" class="${invite?'on v':''}">⚿ REJOINDRE<small>AVEC UN CODE</small></button></div>`;
  }
  function elChampNom(v){
    return `<div class="el-centre field" data-key="name1"><span class="el-lab el-nu">VOTRE NOM</span><input class="el-nom" data-el="nom" maxlength="18" value="${safeText(v.name1)}" placeholder="NOM" autocomplete="off" spellcheck="false" aria-label="Votre nom"></div>`;
  }
  function elReprise(){
    const s=elSessionSauvee();
    return s?`<button type="button" class="el-btn petit el-reprendre el-pad" data-el="reprendre">↻ REPRENDRE LA PARTIE ${safeText(s.roomCode)}</button>`:'';
  }

  function elCadreCreer(v){
    const nom=safeText(v.name1);
    return `<div class="el-cadre">${elOnglets(false)}
      <div class="el-tete">${elSiege('o',nom,'VOUS · HÔTE')}${elChampNom(v)}${elSiege('v','?','VOTRE AMI',true)}</div>
      <div class="el-sep"></div>
      <div class="el-reglages">${elReglage('board',v)}${elReglage('size',v)}${elReglage('timer',v)}</div>
      <button type="button" class="el-jouer el-pad" data-el="jouer"><b>OUVRIR LE SALON</b><small>UN CODE À PARTAGER</small></button>
      ${elReprise()}</div>`;
  }
  function elCadreRejoindre(v){
    const nom=safeText(v.name1);
    const code=elCodeSaisi(v);
    return `<div class="el-cadre rej">${elOnglets(true)}
      <div class="el-tete">${elSiege('o','?','L’HÔTE',true)}${elChampNom(v)}${elSiege('v',nom,'VOUS · INVITÉ')}</div>
      <div class="el-sep"></div>
      <div class="el-centre field" data-key="roomCode"><span class="el-lab el-nu">CODE REÇU</span>
        <div class="el-code" data-el="tuiles">${elTuiles(code,{curseur:true})}<input data-el="code" maxlength="8" value="${safeText(code)}" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" aria-label="Code du salon"></div></div>
      <button type="button" class="el-jouer v el-pad" data-el="jouer" ${code.length<4?'disabled':''}><b>REJOINDRE</b><small>ENTRER DANS LE SALON</small></button>
      ${elReprise()}</div>`;
  }
  function elMessageErreur(){
    return elStatut.type==='error'&&elStatut.message ? `<p class="el-info erreur" role="alert">${safeText(elStatut.message)}</p>` : '';
  }
  function elCadreSalon(v){
    const code=elStatut.code||'';
    const lien=code?elLien(code):'';
    return `<div class="el-cadre">
      <div class="el-entete"><span>◆</span><b>SALON OUVERT</b><span>◆</span></div>
      <div class="el-tete">${elSiege('o',safeText(v.name1),'HÔTE')}
        <div class="el-centre"><span class="el-lab el-nu">ENVOIE CE CODE À TON AMI</span><div class="el-code">${elTuiles(code)}</div>
          <div class="el-act"><button type="button" class="el-btn el-pad" data-el="copier" ${code?'':'disabled'}>⧉ COPIER</button><button type="button" class="el-btn el-pad" data-el="partager" ${code?'':'disabled'}>↗ PARTAGER LE LIEN</button></div>
          ${elMessageErreur()}</div>
        <div class="el-siege v eteint"><div class="el-anneau"><div class="el-portrait"></div></div><b class="el-attente">EN ATTENTE${elPoints()}</b><span class="el-role el-nu">VOTRE AMI</span></div></div>
      <div class="el-sep"></div>${elRecap(v)}
      <div class="el-barre"><button type="button" class="el-btn petit el-pad" data-el="annuler">← ANNULER</button><span class="el-lien">${safeText(lien.replace(/^https?:\/\//,''))}</span></div></div>`;
  }
  function elCadreConnexion(v){
    const code=elCodeSaisi(v);
    return `<div class="el-cadre rej">
      <div class="el-entete"><span>◆</span><b>SALON ${safeText(code)}</b><span>◆</span></div>
      <div class="el-tete">${elSiege('o','L’HÔTE','',false)}
        <div class="el-centre"><span class="el-vs" aria-hidden="true">⚔</span><b class="el-attente">CONNEXION${elPoints()}</b></div>
        ${elSiege('v',safeText(v.name1),'VOUS · INVITÉ')}</div>
      <div class="el-sep"></div>
      ${elMessageErreur()||'<p class="el-info">L’hôte a choisi le plateau. La partie démarre dès que vous êtes reliés.</p>'}
      <div class="el-barre"><button type="button" class="el-btn petit el-pad" data-el="annuler">← ANNULER</button><span></span></div></div>`;
  }

  function renderEnLigne(){
    const v=elValeurs();
    const invite=v.role==='guest';
    const cadre=elVue==='attente'
      ? (invite?elCadreConnexion(v):elCadreSalon(v))
      : (invite?elCadreRejoindre(v):elCadreCreer(v));
    enLigne.innerHTML=`<img class="el-logo" src="./assets/ilyos-logo.svg?v=celestes-2" alt="ILYOS">${cadre}`;
    cablerEnLigne(v);
  }

  function elRetour(bouton,texte){
    const avant=bouton.innerHTML;
    bouton.textContent=texte;
    setTimeout(()=>{ if(bouton.isConnected) bouton.innerHTML=avant; },1600);
  }
  async function elCopier(texte){
    try{ await navigator.clipboard.writeText(texte); return true; }
    catch(_){
      const zone=document.createElement('textarea');
      zone.value=texte; zone.setAttribute('readonly',''); zone.style.position='fixed'; zone.style.opacity='0';
      document.body.appendChild(zone); zone.select();
      let ok=false; try{ ok=document.execCommand('copy'); }catch(__){}
      zone.remove(); return ok;
    }
  }
  function annulerEnLigne(rendre=true){
    send('action',{action:'online-cancel'});
    elVue='config';
    elStatut={message:'',type:'',code:''};
    if(rendre) renderEnLigne();
  }
  function lancerEnLigne(v){
    const invite=v.role==='guest';
    if(invite&&elCodeSaisi(v).length<4){ enLigne.querySelector('[data-el="code"]')?.focus(); return; }
    const values={...v};
    if(!invite) values.roomCode='AUTO';
    if(!String(values.name1||'').trim()) values.name1=elNomParDefaut(v.role);
    elVue='attente';
    elStatut={message:'',type:'',code:invite?elCodeSaisi(v):''};
    renderEnLigne();
    send('play',{mode:'online',config:cfg.online,values});
  }

  function cablerEnLigne(v){
    enLigne.querySelectorAll('[data-role]').forEach(btn=>btn.addEventListener('click',()=>{
      if(v.role===btn.dataset.role) return;
      const nomAuto=String(v.name1)===elNomParDefaut(v.role);
      v.role=btn.dataset.role;
      if(nomAuto) v.name1=elNomParDefaut(v.role);
      renderEnLigne(); notifySettings();
    }));
    enLigne.querySelectorAll('.el-chip [data-step]').forEach(btn=>btn.addEventListener('click',()=>{
      stepControl(controlByKey('online',btn.dataset.key),Number(btn.dataset.step)||1);
    }));
    const nom=enLigne.querySelector('[data-el="nom"]');
    nom?.addEventListener('input',()=>{
      const brut=nom.value.replace(/[<>]/g,'').slice(0,18);
      if(brut!==nom.value) nom.value=brut;
      v.name1=brut.trim()?brut.toLocaleUpperCase('fr-FR'):elNomParDefaut(v.role);
      const cible=enLigne.querySelector(v.role==='guest'?'.el-siege.v b':'.el-siege.o b');
      if(cible) cible.textContent=v.name1;
      notifySettings();
    });
    const code=enLigne.querySelector('[data-el="code"]');
    if(code){
      const tuiles=enLigne.querySelector('[data-el="tuiles"]');
      const jouer=enLigne.querySelector('[data-el="jouer"]');
      const maj=()=>{
        const brut=code.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
        if(brut!==code.value) code.value=brut;
        v.roomCode=brut||'AUTO';
        tuiles.querySelectorAll('i').forEach(i=>i.remove());
        tuiles.insertAdjacentHTML('afterbegin',elTuiles(brut,{curseur:true}));
        if(jouer) jouer.disabled=brut.length<4;
        notifySettings();
      };
      code.addEventListener('input',maj);
      code.addEventListener('focus',()=>tuiles.classList.add('focus'));
      code.addEventListener('blur',()=>tuiles.classList.remove('focus'));
      code.addEventListener('keydown',e=>{ if(e.key==='Enter') lancerEnLigne(v); });
    }
    enLigne.querySelector('[data-el="jouer"]')?.addEventListener('click',()=>lancerEnLigne(v));
    enLigne.querySelector('[data-el="reprendre"]')?.addEventListener('click',()=>send('action',{action:'online-resume'}));
    enLigne.querySelector('[data-el="annuler"]')?.addEventListener('click',()=>annulerEnLigne());
    enLigne.querySelector('[data-el="copier"]')?.addEventListener('click',async e=>{
      const btn=e.currentTarget;
      if(elStatut.code&&await elCopier(elStatut.code)) elRetour(btn,'✓ COPIÉ');
    });
    enLigne.querySelector('[data-el="partager"]')?.addEventListener('click',async e=>{
      const btn=e.currentTarget;
      const lien=elStatut.code?elLien(elStatut.code):'';
      if(!lien) return;
      if(navigator.share){
        try{ await navigator.share({title:'ILYOS',text:`Rejoins-moi sur ILYOS : salon ${elStatut.code}`,url:lien}); return; }
        catch(err){ if(err?.name==='AbortError') return; }
      }
      if(await elCopier(lien)) elRetour(btn,'✓ LIEN COPIÉ');
    });
  }

  /* L'état du salon, relayé par le jeu (js/version-bootstrap.js). */
  addEventListener('message',e=>{
    if(e.origin!==location.origin||e.source!==parent) return;
    const m=e.data||{};
    if(m.source!=='ilyos-jeu'||m.type!=='online-status') return;
    const d=m.detail||{};
    if(d.code) elStatut.code=String(d.code).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
    elStatut.message=String(d.message||'');
    elStatut.type=String(d.type||'');
    if(selectedMode==='online'&&elVue==='attente') renderEnLigne();
  });

  /* Lien partagé (…/?salon=CODE) : on arrive directement sur REJOINDRE,
     code déjà rempli. Le paramètre est retiré de l'adresse aussitôt. */
  function ouvrirSalonDuLien(){
    let code='';
    try{
      const u=new URL(parent.location.href);
      code=(u.searchParams.get('salon')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
      if(u.searchParams.has('salon')){ u.searchParams.delete('salon'); parent.history.replaceState(parent.history.state,'',u.pathname+u.search+u.hash); }
    }catch(_){}
    if(code.length<4) return;
    const v=ensureSelections('online');
    v.role='guest'; v.roomCode=code; elNomPret=false;
    render('online',true);
    home.classList.remove('active'); duel.classList.add('active','enter');
  }

  function flash(){veil.classList.remove('run');void veil.offsetWidth;veil.classList.add('run')}
  function openMode(card){
    document.querySelectorAll('.card').forEach(x=>x.classList.remove('selected'));
    card.classList.add('selected'); home.classList.add('launching'); render(card.dataset.mode,true);
    setTimeout(flash,220);
    setTimeout(()=>{home.classList.remove('active');duel.classList.add('active');duel.classList.remove('enter');void duel.offsetWidth;duel.classList.add('enter')},650);
    setTimeout(()=>{home.classList.remove('launching');card.classList.remove('selected')},1280);
  }

  function openRules(){
    resetModalView();
    modalTitle.textContent='RÈGLES D’ILYOS';
    modalBody.innerHTML=`<div class="rules-grid"><section><b>OBJECTIF</b><p>Validez 3 couronnes avant votre adversaire.</p></section><section><b>VOTRE TOUR</b><p>Posez une île, puis utilisez vos actions de déplacement, poussée et magie.</p></section><section><b>COURONNES</b><p>Récupérez, transmettez et ramenez les couronnes jusqu’à votre zone de validation.</p></section><section><b>2 CONTRE 2</b><p>Les deux partenaires partagent le même score. La première équipe à 3 couronnes gagne.</p></section></div>`;
    modal.classList.add('open');
  }
  /* Les crédits. Les packs KayKit sont libres d'usage mais leur auteur mérite
     d'être nommé, et les trois bibliothèques qui font tourner le jeu aussi.
     Même structure que les règles, donc même mise en forme sans une ligne de
     CSS supplémentaire. */
  function openCredits(){
    resetModalView();
    modalTitle.textContent='CRÉDITS';
    modalBody.innerHTML=`<div class="rules-grid">`
      +`<section><b>MODÈLES 3D</b><p>KayKit — Medieval Builder, Adventurers et Dungeon Remastered, par Kay Lousberg. Packs libres d’usage.</p></section>`
      +`<section><b>MOTEUR 3D</b><p>Three.js, avec GLTFLoader, SkeletonUtils et OrbitControls.</p></section>`
      +`<section><b>PARTIES EN LIGNE</b><p>PeerJS, pour la connexion directe entre deux navigateurs.</p></section>`
      +`<section><b>TYPOGRAPHIE</b><p>Cinzel Decorative, Almendra, Nunito Sans et Inter.</p></section>`
      +`<section><b>SON</b><p>Musique et bruitages entièrement synthétisés dans le navigateur, sans aucun fichier audio.</p></section>`
      +`<section><b>JEU</b><p>ILYOS — règles, développement et direction artistique par taekun06.</p></section>`
      +`</div>`;
    modal.classList.add('open');
  }

  function resetModalView(){modal.querySelector('.ar-moment')?.remove();delete modal.dataset.vue;delete modal.dataset.onglet;modal.querySelector('.menu-modal-card').classList.remove('progression-card')}
  function openComingSoon(label){resetModalView();modalTitle.textContent=label;modalBody.innerHTML='<div class="coming-soon">BIENTÔT</div>';modal.classList.add('open')}

  document.querySelectorAll('.card').forEach(card=>card.addEventListener('click',()=>openMode(card)));
  document.getElementById('back').addEventListener('click',()=>{if(selectedMode==='online'&&elVue==='attente') annulerEnLigne(false);flash();setTimeout(()=>{duel.classList.remove('active','enter');home.classList.add('active')},430)});
  play.addEventListener('click',()=>{
    play.classList.remove('pressed'); void play.offsetWidth; play.classList.add('pressed');
    send('play',{mode:selectedMode,config:cfg[selectedMode],values:{...ensureSelections(selectedMode)}});
  });
  /* Groupes du menu d'accueil (DÉCOUVERTE, DÉFIS, ⚙) : un bouton ouvre son
     panneau, un seul ouvert à la fois ; un clic ailleurs, Échap ou le choix
     d'une entrée le referment. */
  const boutonsGroupe=[...document.querySelectorAll('[data-groupe]')];
  function fermerGroupes(sauf){
    boutonsGroupe.forEach(b=>{
      if(b===sauf) return;
      b.setAttribute('aria-expanded','false');b.classList.remove('is-active');
      const panneau=document.getElementById(b.getAttribute('aria-controls'));
      if(panneau) panneau.hidden=true;
    });
  }
  boutonsGroupe.forEach(b=>b.addEventListener('click',e=>{
    e.stopPropagation();
    const panneau=document.getElementById(b.getAttribute('aria-controls'));
    const ouvrir=!!panneau?.hidden;
    fermerGroupes(b);
    if(!panneau) return;
    panneau.hidden=!ouvrir;b.setAttribute('aria-expanded',String(ouvrir));b.classList.toggle('is-active',ouvrir);
  }));
  document.addEventListener('click',e=>{if(!e.target.closest?.('.nav-groupe')) fermerGroupes()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape') fermerGroupes()});
  document.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>{
    const action=btn.dataset.action;
    if(btn.closest('.groupe-panneau')) fermerGroupes();
    if(action==='fullscreen') return toggleFullscreen();
    if(action==='rules'||action==='help') return openRules();
    if(action==='tutorial'){ send('action',{action}); return; }
    if(action==='credits') return openCredits();
    if(action==='rotation') return window.ILYOS_ROTATION_MENU?.ouvrir();
    send('action',{action});
  }));
  syncFullscreenButtons();

  function setPointer(e){const x=(e.clientX/Math.max(innerWidth,1)-.5)*2,y=(e.clientY/Math.max(innerHeight,1)-.5)*2;document.documentElement.style.setProperty('--mx',x.toFixed(3));document.documentElement.style.setProperty('--my',y.toFixed(3))}
  addEventListener('pointermove',setPointer,{passive:true});

  const canvas=document.getElementById('particles'),ctx=canvas.getContext('2d'); let pts=[];
  function resize(){
    const w=innerWidth,h=innerHeight,d=Math.min(devicePixelRatio||1,2);
    canvas.width=w*d;canvas.height=h*d;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(d,0,0,d,0,0);
    // Densité proportionnelle à la surface : un compte fixe devenait trop
    // clairsemé en plein écran (surface bien plus grande, même nombre de
    // points). Bornes pour rester léger en petite fenêtre et dense en grand.
    const count=Math.round(Math.min(320,Math.max(140,(w*h)/6000)));
    pts=Array.from({length:count},()=>({x:Math.random()*w,y:Math.random()*h,r:.6+Math.random()*2.1,v:.05+Math.random()*.20,a:.22+Math.random()*.58,p:Math.random()*6.28}));
  }
  // Au plus 60 dessins par seconde : sur un écran 144 Hz, la boucle redessinait
  // jusqu'à 320 points 144 fois par seconde, menu immobile (mesuré le 22/10 :
  // plus d'un cœur occupé). Les pas sont comptés en images de 60 Hz, pour une
  // dérive à la même vitesse sur tous les écrans.
  // Pendant la partie, le menu reste chargé dans son cadre masqué
  // (display:none) : ses particules s'y redessinaient quand même 60 fois par
  // seconde, pour rien (mesuré le 31/10). Rien n'est dessiné tant qu'il est caché.
  function menuMasque(){const f=window.frameElement;return !!(f&&(f.hidden||!f.isConnected))}
  const PARTICULES_IMAGE_MS=1000/60;let derniere=0;
  function draw(t){requestAnimationFrame(draw);if(menuMasque()){derniere=0;return}if(derniere&&t-derniere<PARTICULES_IMAGE_MS-2)return;const pas=derniere?Math.min(4,(t-derniere)/PARTICULES_IMAGE_MS):1;derniere=t;const w=innerWidth,h=innerHeight;ctx.clearRect(0,0,w,h);for(const p of pts){p.y-=p.v*pas;p.x+=Math.sin(t*.00035+p.p)*.07*pas;if(p.y<-8){p.y=h+8;p.x=Math.random()*w}const a=p.a*(.65+.35*Math.sin(t*.002+p.p));ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.28);ctx.fillStyle=`rgba(255,225,150,${a})`;ctx.fill()}}
  addEventListener('resize',resize);
  // Le passage plein écran ne déclenche pas toujours un 'resize' assez tôt
  // (ou avec les bonnes dimensions) selon le navigateur : on refait le calcul
  // explicitement sur fullscreenchange pour que la densité reste correcte.
  fullscreenDocument().addEventListener('fullscreenchange',resize);
  fullscreenDocument().addEventListener('webkitfullscreenchange',resize);
  resize();requestAnimationFrame(draw);render(selectedMode,true);send('ready',{});
  ouvrirSalonDuLien();
})();
