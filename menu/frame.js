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

  function send(type,detail){ parent.postMessage({source:'ilyos-menu',type,detail}, location.origin); }
  function ensureSelections(mode){
    const c=cfg[mode]; if(!c) return {};
    if(!selections[mode]) selections[mode]={};
    (c.controls||[]).forEach(control=>{
      if(!(control.key in selections[mode])) selections[mode][control.key]=control.default;
    });
    return selections[mode];
  }
  function optionLabel(control,value){
    const hit=(control.options||[]).find(([v])=>String(v)===String(value));
    return hit ? hit[1] : String(value ?? '');
  }
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
  function difficultyMeter(value){
    const levels={easy:1,normal:2,hard:3,expert:4};
    const n=levels[value]||0;
    return `<span class="difficulty-meter" aria-hidden="true">${[1,2,3,4].map(i=>`<i class="${i<=n?'on':''}"></i>`).join('')}</span>`;
  }
  function teamBlock(values){
    if(selectedMode!=='team') return '';
    const safe=k=>String(values[k]||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<div class="team-summary"><div class="team team-gold"><b>ÉQUIPE OR</b><span>${safe('name1')} · ${safe('name3')}</span></div><div class="team-vs">VS</div><div class="team team-violet"><b>ÉQUIPE VIOLETTE</b><span>${safe('name2')} · ${safe('name4')}</span></div><div class="team-goal">OBJECTIF · 3 COURONNES</div></div>`;
  }
  function stepControl(control,direction){
    if(control.fixed || control.editable || !control.options?.length) return;
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
    desc.textContent=c.description||'';
    play.textContent=playLabel();

    const controls=(c.controls||[]).map(control=>{
      if(control.editable){
        const shown=String(values[control.key]??control.default??'');
        const isCode=control.kind==='code';
        return `<div class="field ${isCode?'code-field':''}" data-key="${control.key}"><div class="label">${control.label}</div><div class="control editable-control"><input class="value editable-value" data-edit="${control.key}" data-kind="${control.kind||'text'}" maxlength="${isCode?8:18}" value="${shown==='AUTO'?'':shown.replace(/"/g,'&quot;')}" placeholder="${shown==='AUTO'?'AUTO':'NOM'}" autocomplete="off" spellcheck="false"></div></div>`;
      }
      const fixed=!!control.fixed || (control.options||[]).length<2;
      const meter=control.key==='difficulty'?difficultyMeter(values[control.key]):'';
      return `<div class="field" data-key="${control.key}"><div class="label">${control.label}</div><div class="control"><button type="button" data-step="-1" data-key="${control.key}" ${fixed?'disabled':''} aria-label="Précédent">‹</button><div class="value"><span class="value-text">${optionLabel(control,values[control.key])}</span>${meter}</div><button type="button" data-step="1" data-key="${control.key}" ${fixed?'disabled':''} aria-label="Suivant">›</button></div></div>`;
    }).join('');

    panel.innerHTML=`<div class="mode-name">${c.label}</div>${teamBlock(values)}${controls}<div class="dots">${[0,1,2,3].map(i=>`<span class="dot ${i===c.dot?'on':''}"></span>`).join('')}</div>`;
    panel.dataset.mode=mode;

    panel.querySelectorAll('[data-step]').forEach(btn=>btn.addEventListener('click',()=>{
      const control=(c.controls||[]).find(item=>item.key===btn.dataset.key);
      btn.classList.remove('tap'); void btn.offsetWidth; btn.classList.add('tap');
      if(control) stepControl(control,Number(btn.dataset.step)||1);
    }));
    panel.querySelectorAll('[data-edit]').forEach(input=>{
      const update=()=>{
        const isCode=input.dataset.kind==='code';
        let raw=input.value;
        raw=isCode ? raw.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8) : raw.replace(/[<>]/g,'').slice(0,18);
        input.value=raw;
        values[input.dataset.edit]=raw||(isCode?'AUTO':'JOUEUR');
        if(selectedMode==='team') render(selectedMode,false);
        notifySettings();
      };
      input.addEventListener('input',update);
      input.addEventListener('change',update);
    });

    if(emit){ send('mode',{mode,config:c}); notifySettings(); }
  }

  function flash(){veil.classList.remove('run');void veil.offsetWidth;veil.classList.add('run')}
  function openMode(card){
    document.querySelectorAll('.card').forEach(x=>x.classList.remove('selected'));
    card.classList.add('selected');home.classList.add('launching');render(card.dataset.mode,true);
    setTimeout(flash,220);
    setTimeout(()=>{home.classList.remove('active');duel.classList.add('active');duel.classList.remove('enter');void duel.offsetWidth;duel.classList.add('enter')},650);
    setTimeout(()=>{home.classList.remove('launching');card.classList.remove('selected')},1280);
  }

  function openRules(){
    modalTitle.textContent='RÈGLES D’ILYOS';
    modalBody.innerHTML=`<div class="rules-grid"><section><b>OBJECTIF</b><p>Validez 3 couronnes avant votre adversaire.</p></section><section><b>VOTRE TOUR</b><p>Posez une île, puis utilisez vos actions de déplacement, poussée et magie.</p></section><section><b>COURONNES</b><p>Récupérez, transmettez et ramenez les couronnes jusqu’à votre zone de validation.</p></section><section><b>2 CONTRE 2</b><p>Les deux partenaires partagent le même score. La première équipe à 3 couronnes gagne.</p></section></div>`;
    modal.classList.add('open');
  }
  function openComingSoon(label){
    modalTitle.textContent=label;
    modalBody.innerHTML='<div class="coming-soon">BIENTÔT</div>';
    modal.classList.add('open');
  }

  document.querySelectorAll('.card').forEach(card=>card.addEventListener('click',()=>openMode(card)));
  document.getElementById('back').addEventListener('click',()=>{flash();setTimeout(()=>{duel.classList.remove('active','enter');home.classList.add('active')},430)});
  play.addEventListener('click',()=>{
    play.classList.remove('pressed'); void play.offsetWidth; play.classList.add('pressed');
    send('play',{mode:selectedMode,config:cfg[selectedMode],values:{...ensureSelections(selectedMode)}});
  });
  document.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>{
    const action=btn.dataset.action;
    if(action==='rules'||action==='help') return openRules();
    if(action==='tutorial') return openComingSoon('TUTORIEL');
    if(action==='credits') return openComingSoon('CRÉDITS');
    send('action',{action});
  }));

  function setPointer(e){const x=(e.clientX/Math.max(innerWidth,1)-.5)*2,y=(e.clientY/Math.max(innerHeight,1)-.5)*2;document.documentElement.style.setProperty('--mx',x.toFixed(3));document.documentElement.style.setProperty('--my',y.toFixed(3))}
  addEventListener('pointermove',setPointer,{passive:true});

  const canvas=document.getElementById('particles'),ctx=canvas.getContext('2d'); let pts=[];
  function resize(){const w=innerWidth,h=innerHeight,d=Math.min(devicePixelRatio||1,2);canvas.width=w*d;canvas.height=h*d;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(d,0,0,d,0,0);pts=Array.from({length:64},()=>({x:Math.random()*w,y:Math.random()*h,r:.5+Math.random()*1.5,v:.07+Math.random()*.18,a:.14+Math.random()*.46,p:Math.random()*6.28}))}
  function draw(t){const w=innerWidth,h=innerHeight;ctx.clearRect(0,0,w,h);for(const p of pts){p.y-=p.v;p.x+=Math.sin(t*.00035+p.p)*.07;if(p.y<-8){p.y=h+8;p.x=Math.random()*w}const a=p.a*(.65+.35*Math.sin(t*.002+p.p));ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.28);ctx.fillStyle=`rgba(255,215,125,${a})`;ctx.fill()}requestAnimationFrame(draw)}
  addEventListener('resize',resize);resize();requestAnimationFrame(draw);render(selectedMode,true);send('ready',{});
})();
