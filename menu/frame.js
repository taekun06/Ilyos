/* ILYOS isolated menu frame. Communicates with parent only through postMessage. */
(function(){
  const home=document.getElementById('home');
  const duel=document.getElementById('duel');
  const veil=document.getElementById('veil');
  const panel=document.getElementById('panel');
  const desc=document.getElementById('desc');
  const cfg=(window.ILYOS_MENU_CONFIG&&window.ILYOS_MENU_CONFIG.modes)||{};
  let selectedMode=window.ILYOS_MENU_CONFIG?.defaultMode||'solo';
  const selections={};

  function send(type,detail){ parent.postMessage({source:'ilyos-menu',type,detail}, location.origin); }

  function ensureSelections(mode){
    const c=cfg[mode];
    if(!c) return {};
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

    const controls=(c.controls||[]).map(control=>{
      if(control.editable){
        const shown=String(values[control.key]??control.default??'');
        return `<div class="field" data-key="${control.key}"><div class="label">${control.label}</div><div class="control editable-control"><input class="value editable-value" data-edit="${control.key}" maxlength="8" value="${shown==='AUTO'?'':shown}" placeholder="${shown==='AUTO'?'AUTO':'CODE'}" autocomplete="off" spellcheck="false"></div></div>`;
      }
      const fixed=!!control.fixed || (control.options||[]).length<2;
      return `<div class="field" data-key="${control.key}"><div class="label">${control.label}</div><div class="control"><button type="button" data-step="-1" data-key="${control.key}" ${fixed?'disabled':''} aria-label="Précédent">‹</button><div class="value">${optionLabel(control,values[control.key])}</div><button type="button" data-step="1" data-key="${control.key}" ${fixed?'disabled':''} aria-label="Suivant">›</button></div></div>`;
    }).join('');

    panel.innerHTML=`<div class="mode-name">${c.label}</div>${controls}<div class="dots">${[0,1,2,3].map(i=>`<span class="dot ${i===c.dot?'on':''}"></span>`).join('')}</div>`;

    panel.querySelectorAll('[data-step]').forEach(btn=>btn.addEventListener('click',()=>{
      const control=(c.controls||[]).find(item=>item.key===btn.dataset.key);
      if(control) stepControl(control,Number(btn.dataset.step)||1);
    }));
    panel.querySelectorAll('[data-edit]').forEach(input=>{
      const update=()=>{
        const raw=input.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
        input.value=raw;
        values[input.dataset.edit]=raw||'AUTO';
        notifySettings();
      };
      input.addEventListener('input',update);
      input.addEventListener('change',update);
    });

    if(emit){
      send('mode',{mode,config:c});
      notifySettings();
    }
  }

  function flash(){veil.classList.remove('run');void veil.offsetWidth;veil.classList.add('run')}
  function openMode(card){
    document.querySelectorAll('.card').forEach(x=>x.classList.remove('selected'));
    card.classList.add('selected');home.classList.add('launching');render(card.dataset.mode,true);
    setTimeout(flash,220);
    setTimeout(()=>{home.classList.remove('active');duel.classList.add('active');duel.classList.remove('enter');void duel.offsetWidth;duel.classList.add('enter')},650);
    setTimeout(()=>{home.classList.remove('launching');card.classList.remove('selected')},1280);
  }

  document.querySelectorAll('.card').forEach(card=>card.addEventListener('click',()=>openMode(card)));
  document.getElementById('back').addEventListener('click',()=>{flash();setTimeout(()=>{duel.classList.remove('active','enter');home.classList.add('active')},430)});
  document.getElementById('play').addEventListener('click',()=>send('play',{mode:selectedMode,config:cfg[selectedMode],values:{...ensureSelections(selectedMode)}}));
  document.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>send('action',{action:btn.dataset.action})));

  function setPointer(e){const x=(e.clientX/Math.max(innerWidth,1)-.5)*2,y=(e.clientY/Math.max(innerHeight,1)-.5)*2;document.documentElement.style.setProperty('--mx',x.toFixed(3));document.documentElement.style.setProperty('--my',y.toFixed(3))}
  addEventListener('pointermove',setPointer,{passive:true});

  const canvas=document.getElementById('particles'),ctx=canvas.getContext('2d'); let pts=[];
  function resize(){const w=innerWidth,h=innerHeight,d=Math.min(devicePixelRatio||1,2);canvas.width=w*d;canvas.height=h*d;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(d,0,0,d,0,0);pts=Array.from({length:64},()=>({x:Math.random()*w,y:Math.random()*h,r:.5+Math.random()*1.5,v:.07+Math.random()*.18,a:.14+Math.random()*.46,p:Math.random()*6.28}))}
  function draw(t){const w=innerWidth,h=innerHeight;ctx.clearRect(0,0,w,h);for(const p of pts){p.y-=p.v;p.x+=Math.sin(t*.00035+p.p)*.07;if(p.y<-8){p.y=h+8;p.x=Math.random()*w}const a=p.a*(.65+.35*Math.sin(t*.002+p.p));ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.28);ctx.fillStyle=`rgba(255,215,125,${a})`;ctx.fill()}requestAnimationFrame(draw)}
  addEventListener('resize',resize);resize();requestAnimationFrame(draw);render(selectedMode,true);send('ready',{});
})();
