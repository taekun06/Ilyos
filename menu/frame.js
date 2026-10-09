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
    if(doc.fullscreenElement) return;
    const el=doc.documentElement;
    const req=el.requestFullscreen||el.webkitRequestFullscreen;
    if(!req) return;
    try{ const p=req.call(el); if(p&&p.catch) p.catch(()=>{}); }catch(e){}
  }
  document.addEventListener('click', requestSiteFullscreen, {once:true, capture:true});

  function exitSiteFullscreen(){
    const doc=fullscreenDocument();
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
    badge.querySelector('.profil-anneau').style.setProperty('--p',`${part}%`);
    badge.querySelector('.profil-xp').textContent=`${etat.xpDansNiveau} / ${etat.xpPourSuivant} XP`;
    badge.title=`${etat.xpDansNiveau} / ${etat.xpPourSuivant} XP vers le niveau ${etat.niveau+1}`;
    badge.querySelector('.profil-alerte').hidden=!etat.offrande.dispo&&!etat.nouveautes;
    badge.hidden=false;
    if(pill) pill.hidden=!etat.offrande.dispo;
    if(modal.classList.contains('open')&&modal.dataset.vue==='progression'&&modal.dataset.onglet!=='collection') renderProgressionPanel(etat);
  }
  function cellLabel(texte){ return /^Vent/.test(texte)?'VENT PORTEUR':texte; }
  function questHtml(q,index,semaine,changer){
    const pct=Math.round(100*q.fait/Math.max(1,q.cible));
    const bouton=changer&&!q.finie&&!semaine?`<button type="button" class="quete-changer" data-index="${index}" title="Changer cette quête (une fois par jour)" aria-label="Changer cette quête">↻</button>`:'';
    return `<li class="quete${q.finie?' finie':''}${semaine?' semaine':''}"><div class="quete-haut"><span class="quete-texte">${safeText(q.texte)}</span><span class="quete-xp">${q.finie?'✓ ':''}+${q.xp} XP</span>${bouton}</div><div class="quete-barre"><i style="width:${pct}%"></i></div><small>${q.finie?'Accomplie':`${q.fait} / ${q.cible}`}</small></li>`;
  }
  /* Aperçu d'un objet de la collection : pastille de couleur, portrait du
     gardien, bande de ciel ou plaque de titre. */
  function collectionApercu(cle,objet){
    if(cle==='couleur') return `<span class="coll-apercu coll-gemme" style="--c:${safeText(objet.valeur)}"></span>`;
    if(cle==='heros') return `<span class="coll-apercu coll-portrait"><img src="../${safeText(objet.image)}" alt="" loading="lazy"></span>`;
    if(cle==='ciel') return `<span class="coll-apercu coll-ciel" style="background-image:url('../${safeText(objet.image)}')"></span>`;
    if(cle==='plateau') return `<span class="coll-apercu coll-ciel coll-iles" style="background-image:url('../${safeText(objet.image)}')"></span>`;
    if(cle==='effet') return `<span class="coll-apercu coll-effet coll-effet-${safeText(objet.valeur||'sobre')}"><i></i><i></i><i></i><i></i><i></i></span>`;
    return `<span class="coll-apercu coll-plaque"><span>${safeText(objet.nom)}</span></span>`;
  }
  function collectionObjetHtml(cle,objet){
    const etatTexte=objet.equipe?'ÉQUIPÉ':(objet.debloque?'ÉQUIPER':`🔒 ${safeText(objet.texte)}${objet.cible?` · ${objet.fait}/${objet.cible}`:''}`);
    return `<li class="coll-objet${objet.debloque?'':' verrou'}${objet.equipe?' equipe':''}"><button type="button" data-cat="${cle}" data-id="${safeText(objet.id)}"${objet.debloque&&!objet.equipe?'':' disabled'} aria-pressed="${objet.equipe}">${collectionApercu(cle,objet)}<b>${safeText(objet.nom)}</b><small>${etatTexte}</small>${objet.nouveau?'<em class="coll-nouveau">NOUVEAU</em>':''}</button></li>`;
  }
  function collectionHtml(categories){
    const notes={couleur:'Vos pions, drapeaux et villages.',heros:'Les gardiens de votre camp.',ciel:'Le ciel autour du plateau.',plateau:'Les îles du plateau.',titre:'Affiché avec votre niveau.',effet:'Quand vous gagnez une partie.'};
    return categories.map(c=>`<section class="coll-section"><h3>${safeText(c.nom.toUpperCase())}<small>${notes[c.cle]||''}</small></h3><ul class="coll-grille coll-grille-${c.cle}">${c.objets.map(o=>collectionObjetHtml(c.cle,o)).join('')}</ul></section>`).join('')
      +'<p class="coll-note">Couleur et gardiens s’appliquent en solo, en duel et en 2 contre 2, à partir de la prochaine partie.</p>';
  }
  /* Piste de saison : une case par palier, l'aperçu de sa récompense. */
  function saisonApercu(p){
    if(p.categorie==='couleur') return `<span class="sp-apercu sp-gemme" style="--c:${safeText(p.valeur)}"></span>`;
    if(p.categorie==='heros') return `<span class="sp-apercu sp-portrait"><img src="../${safeText(p.image)}" alt="" loading="lazy"></span>`;
    if(p.categorie==='ciel'||p.categorie==='plateau') return `<span class="sp-apercu sp-ciel" style="background-image:url('../${safeText(p.image)}')"></span>`;
    if(p.categorie==='titre') return `<span class="sp-apercu sp-plaque"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18l-2 3 2 3H3l2-3-2-3Z" fill="#2b1a05" opacity=".85"/><path d="M8 5l4-2 4 2M8 19l4 2 4-2" stroke="#2b1a05" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg></span>`;
    if(p.categorie==='effet') return `<span class="sp-apercu sp-effet"></span>`;
    if(p.categorie==='vent') return `<span class="sp-apercu sp-vent"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#effcff" stroke-width="2" stroke-linecap="round"><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h7"/></svg></span>`;
    return `<span class="sp-apercu sp-coffre"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v1H3v-1Z" fill="#7a4b12"/><rect x="3" y="11" width="18" height="8" rx="1.5" fill="#5a3509"/><rect x="10" y="9.5" width="4" height="5" rx="1" fill="#ffe9a8"/><path d="M3 11h18" stroke="#ffe9a8" stroke-width="1.2"/></svg></span>`;
  }
  function saisonHtml(v){
    if(!v) return '<p class="coll-note">Aucune saison en cours.</p>';
    const pct=Math.round(100*v.xpDansPalier/Math.max(1,v.xpParPalier));
    const courant=Math.min(v.palier+1,v.paliers.length);
    const cases=v.paliers.map(p=>`<li class="sp-case${p.obtenu?' obtenu':''}${p.palier===courant&&!p.obtenu?' courant':''}${p.palier%5===0?' grand':''}" data-palier="${p.palier}"><small>${p.palier}</small>${saisonApercu(p)}<b>${safeText(p.texte)}</b><span>${p.obtenu?'✓ OBTENU':(p.palier===courant?`${v.xpDansPalier} / ${v.xpParPalier}`:'')}</span></li>`).join('');
    const duree=v.active?(v.joursRestants>1?`Encore ${v.joursRestants} jours`:'Dernier jour'):'Saison terminée';
    return `<section class="sp-tete"><div><small>SAISON ${v.numero} · PASSE GRATUIT</small><b>${safeText(v.nom)}</b><span>${duree}</span></div><div class="sp-palier"><small>PALIER</small><b>${v.palier}</b></div></section>
      <div class="sp-progres"><div class="pp-barre"><i style="width:${v.palier>=v.paliers.length?100:pct}%"></i></div><small>${v.palier>=v.paliers.length?`Piste terminée · chaque palier donne encore un vent porteur · ${v.xpDansPalier} / ${v.xpParPalier} XP`:`${v.xpDansPalier} / ${v.xpParPalier} XP vers le palier ${v.palier+1}`}</small></div>
      <ol class="sp-piste">${cases}</ol>
      <p class="coll-note">Toute l’XP gagnée pendant la saison la fait avancer : un palier tous les ${v.xpParPalier} XP. Ce qui est gagné reste à vous.</p>`;
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
  function renderProgressionPanel(etat,annonce){
    const onglet=['collection','saison','journal'].includes(modal.dataset.onglet)?modal.dataset.onglet:'progression';
    const part=Math.round(100*etat.xpDansNiveau/Math.max(1,etat.xpPourSuivant));
    modalTitle.textContent='PROGRESSION';
    const tete=`<div class="pp-niveau"><span class="profil-anneau pp-anneau" style="--p:${part}%"><b>${etat.niveau}</b></span><div class="pp-niveau-texte"><b>NIVEAU ${etat.niveau}</b>${etat.titre?`<span class="pp-titre">${safeText(etat.titre)}</span>`:''}<div class="pp-barre"><i style="width:${part}%"></i></div><small>${etat.xpDansNiveau} / ${etat.xpPourSuivant} XP vers le niveau ${etat.niveau+1}${etat.offrande.vent?` · Vent porteur actif (${etat.offrande.vent} partie${etat.offrande.vent>1?'s':''})`:''}</small></div></div>`;
    const onglets=`<div class="pp-onglets" role="tablist"><button type="button" role="tab" data-onglet="progression" aria-selected="${onglet==='progression'}">QUÊTES<span class="pp-long"> ET OFFRANDE</span>${etat.offrande.dispo?'<i class="pp-pastille">!</i>':''}</button>${etat.saison?`<button type="button" role="tab" data-onglet="saison" aria-selected="${onglet==='saison'}">SAISON</button>`:''}<button type="button" role="tab" data-onglet="collection" aria-selected="${onglet==='collection'}">COLLECTION${etat.nouveautes?`<i class="pp-pastille">${etat.nouveautes}</i>`:''}</button><button type="button" role="tab" data-onglet="journal" aria-selected="${onglet==='journal'}">JOURNAL</button></div>`;
    if(onglet==='journal'){
      modalBody.innerHTML=`<div class="progression-panel">${tete}${onglets}${journalHtml(progressionApi()?.journal?.())}</div>`;
      bindProgressionTabs();
      return;
    }
    if(onglet==='saison'){
      modalBody.innerHTML=`<div class="progression-panel">${tete}${onglets}${saisonHtml(etat.saison)}</div>`;
      bindProgressionTabs();
      const piste=modalBody.querySelector('.sp-piste');
      const cible=piste?.querySelector('.courant')||piste?.querySelector('.obtenu:last-of-type');
      if(piste&&cible) piste.scrollLeft=Math.max(0,cible.offsetLeft-piste.clientWidth/2+cible.clientWidth/2);
      return;
    }
    if(onglet==='collection'){
      const categories=progressionApi()?.collection?.()||[];
      modalBody.innerHTML=`<div class="progression-panel">${tete}${onglets}${annonce?`<div class="pp-annonce">${safeText(annonce)}</div>`:''}${collectionHtml(categories)}</div>`;
      bindProgressionTabs();
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
    const o=etat.offrande;
    const recue=i=>i<o.prochaine;
    const cases=o.cases.map((texte,i)=>{
      const courante=i===o.prochaine;
      const classe=recue(i)?'recue':(courante?(o.dispo?'prete':'demain'):'');
      const bas=recue(i)?'✓':(courante?(o.dispo?'<button type="button" class="offrande-prendre">RÉCUPÉRER</button>':'DEMAIN'):'');
      return `<li class="offrande-case ${classe}${i===6?' grande':''}"><small>JOUR ${i+1}</small><b>${safeText(cellLabel(texte))}</b><span>${bas}</span></li>`;
    }).join('');
    modalBody.innerHTML=`<div class="progression-panel">
      ${tete}${onglets}
      ${annonce?`<div class="pp-annonce">${safeText(annonce)}</div>`:''}
      <section><h3>OFFRANDE DU JOUR</h3><ol class="offrande-cases">${cases}</ol></section>
      <section><h3>QUÊTES DU JOUR</h3><ul class="quetes">${etat.quetes.jour.map((q,i)=>questHtml(q,i,false,etat.quetes.changementDispo)).join('')||'<li class="quete vide">Nouvelles quêtes demain.</li>'}</ul></section>
      ${etat.quetes.semaine?`<section><h3>QUÊTE DE LA SEMAINE</h3><ul class="quetes">${questHtml(etat.quetes.semaine,0,true,false)}</ul></section>`:''}
    </div>`;
    bindProgressionTabs();
    modalBody.querySelector('.offrande-prendre')?.addEventListener('click',()=>{
      const r=progressionApi()?.reclamerOffrande?.();
      const nouvel=progressionApi()?.etat?.();
      const ouverts=r?.debloques?.length?` · Débloqué : ${r.debloques.map(d=>d.nom).join(', ')}`:'';
      if(nouvel) renderProgressionPanel(nouvel,r?`Offrande reçue : ${r.texte}${r.niveauxGagnes>0?` · Niveau ${r.apres.niveau} atteint !`:''}${ouverts}`:null);
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
  (function waitProgression(tries){
    if(progressionApi()) renderProfileBadge();
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

  function resetModalView(){delete modal.dataset.vue;delete modal.dataset.onglet;modal.querySelector('.menu-modal-card').classList.remove('progression-card')}
  function openComingSoon(label){resetModalView();modalTitle.textContent=label;modalBody.innerHTML='<div class="coming-soon">BIENTÔT</div>';modal.classList.add('open')}

  document.querySelectorAll('.card').forEach(card=>card.addEventListener('click',()=>openMode(card)));
  document.getElementById('back').addEventListener('click',()=>{flash();setTimeout(()=>{duel.classList.remove('active','enter');home.classList.add('active')},430)});
  play.addEventListener('click',()=>{
    play.classList.remove('pressed'); void play.offsetWidth; play.classList.add('pressed');
    send('play',{mode:selectedMode,config:cfg[selectedMode],values:{...ensureSelections(selectedMode)}});
  });
  document.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>{
    const action=btn.dataset.action;
    if(action==='fullscreen') return toggleFullscreen();
    if(action==='rules'||action==='help') return openRules();
    if(action==='tutorial'){ send('action',{action}); return; }
    if(action==='credits') return openCredits();
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
  function draw(t){const w=innerWidth,h=innerHeight;ctx.clearRect(0,0,w,h);for(const p of pts){p.y-=p.v;p.x+=Math.sin(t*.00035+p.p)*.07;if(p.y<-8){p.y=h+8;p.x=Math.random()*w}const a=p.a*(.65+.35*Math.sin(t*.002+p.p));ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.28);ctx.fillStyle=`rgba(255,225,150,${a})`;ctx.fill()}requestAnimationFrame(draw)}
  addEventListener('resize',resize);
  // Le passage plein écran ne déclenche pas toujours un 'resize' assez tôt
  // (ou avec les bonnes dimensions) selon le navigateur : on refait le calcul
  // explicitement sur fullscreenchange pour que la densité reste correcte.
  fullscreenDocument().addEventListener('fullscreenchange',resize);
  fullscreenDocument().addEventListener('webkitfullscreenchange',resize);
  resize();requestAnimationFrame(draw);render(selectedMode,true);send('ready',{});
})();
