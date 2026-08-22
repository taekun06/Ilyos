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
    if(mode==='team') return {kicker:'BATAILLE D’ÉQUIPES',leftTop:'ÉQUIPE OR',leftBottom:`${values.name1||'J1'} + ${values.name3||'J3'}`,rightTop:'ÉQUIPE VIOLETTE',rightBottom:`${values.name2||'J2'} + ${values.name4||'J4'}`};
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
    modalTitle.textContent='RÈGLES D’ILYOS';
    modalBody.innerHTML=`<div class="rules-grid"><section><b>OBJECTIF</b><p>Validez 3 couronnes avant votre adversaire.</p></section><section><b>VOTRE TOUR</b><p>Posez une île, puis utilisez vos actions de déplacement, poussée et magie.</p></section><section><b>COURONNES</b><p>Récupérez, transmettez et ramenez les couronnes jusqu’à votre zone de validation.</p></section><section><b>2 CONTRE 2</b><p>Les deux partenaires partagent le même score. La première équipe à 3 couronnes gagne.</p></section></div>`;
    modal.classList.add('open');
  }
  function openComingSoon(label){modalTitle.textContent=label;modalBody.innerHTML='<div class="coming-soon">BIENTÔT</div>';modal.classList.add('open')}

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
    if(action==='tutorial') return openComingSoon('TUTORIEL');
    if(action==='credits') return openComingSoon('CRÉDITS');
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
