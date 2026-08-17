/* ILYOS — HUD Organique V2 / FINAL V8
   Complément purement visuel : portraits KayKit + Undo SVG.
   Aucun gameplay, aucune règle, aucun compteur Undo. */
(function(){
  if (window.__ILYOS_HUD_FINAL_V8__) return;
  window.__ILYOS_HUD_FINAL_V8__ = true;

  const KNIGHT_URL = './assets/kaykit/characters/Knight.glb';
  const MAGE_URL = './assets/kaykit/characters/Mage.glb';
  const undoSvg = `<svg class="ov2-undo-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M17 17H8V8"/><path d="M9 16c5-7 16-10 24-5 8 5 11 15 7 24-4 8-14 12-23 8"/></svg>`;

  function waitForHud(){
    const root = document.getElementById('ilyosHudOrganicV2');
    if (!root) {
      requestAnimationFrame(waitForHud);
      return;
    }
    installUndo(root);
    installPortraits(root);
  }

  function installUndo(root){
    const undo = root.querySelector('#ov2Undo');
    if (!undo || undo.dataset.v8Undo === '1') return;
    undo.dataset.v8Undo = '1';
    undo.innerHTML = undoSvg;
    undo.setAttribute('aria-label','Annuler');
    undo.setAttribute('title','Annuler');
  }

  function installPortraits(root){
    const left = root.querySelector('.ov2-left .ov2-avatar');
    const right = root.querySelector('.ov2-right .ov2-avatar');
    if (!left || !right) return;
    if (left.dataset.kaykitRequested === '1' && right.dataset.kaykitRequested === '1') return;
    left.dataset.kaykitRequested = '1';
    right.dataset.kaykitRequested = '1';

    if (!window.THREE || !THREE.GLTFLoader) {
      // Les scripts Three/GLTF peuvent finir après le HUD. On réessaie sans bloquer le jeu.
      left.dataset.kaykitRequested = '0';
      right.dataset.kaykitRequested = '0';
      setTimeout(()=>installPortraits(root),180);
      return;
    }

    renderPortrait(KNIGHT_URL,{yaw:-0.36,pitch:0.02,zoom:1.12})
      .then(src=>applyPortrait(left,src,'Chevalier KayKit'))
      .catch(err=>console.warn('[ILYOS HUD] portrait Knight indisponible',err));

    renderPortrait(MAGE_URL,{yaw:0.30,pitch:0.02,zoom:1.08})
      .then(src=>applyPortrait(right,src,'Mage KayKit'))
      .catch(err=>console.warn('[ILYOS HUD] portrait Mage indisponible',err));
  }

  function applyPortrait(host,src,label){
    if (!host || !src) return;
    const img = new Image();
    img.className = 'ov2-kaykit-portrait';
    img.alt = '';
    img.setAttribute('aria-label',label);
    img.src = src;
    host.appendChild(img);
    host.classList.add('ov2-kaykit-ready');
  }

  function renderPortrait(url,opts={}){
    return new Promise((resolve,reject)=>{
      const loader = new THREE.GLTFLoader();
      loader.load(url,(gltf)=>{
        let renderer;
        try{
          const model = gltf.scene;
          const scene = new THREE.Scene();

          // Pose visuelle stable pour un portrait 2D. Le modèle n'est jamais ajouté au gameplay.
          model.rotation.y = opts.yaw || 0;
          model.rotation.x = opts.pitch || 0;
          scene.add(model);

          // Éclairage proche du rendu clair du jeu actuel.
          scene.add(new THREE.HemisphereLight(0xffffff,0x415568,2.25));
          const key = new THREE.DirectionalLight(0xffedc0,3.2);
          key.position.set(3.2,5.5,4.2);
          scene.add(key);
          const fill = new THREE.DirectionalLight(0x9fc9ff,1.65);
          fill.position.set(-4,2.2,3.5);
          scene.add(fill);
          const rim = new THREE.DirectionalLight(0xffffff,1.05);
          rim.position.set(1.5,3,-5);
          scene.add(rim);

          // Centre le personnage et cadre principalement tête + buste, tout en gardant sa silhouette reconnaissable.
          model.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          model.position.sub(center);
          model.position.y -= size.y * 0.06;
          model.updateMatrixWorld(true);

          const aspect = 1;
          const fov = 24;
          const camera = new THREE.PerspectiveCamera(fov,aspect,0.01,100);
          const maxDim = Math.max(size.x,size.y,size.z);
          const distance = (maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(fov/2)))) / (opts.zoom || 1.08);
          camera.position.set(0,size.y * 0.06,distance * 1.06);
          camera.lookAt(0,size.y * 0.03,0);

          renderer = new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
          renderer.setSize(196,196,false);
          renderer.setClearColor(0x000000,0);
          if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
          if ('outputEncoding' in renderer && THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
          if ('toneMapping' in renderer && THREE.ACESFilmicToneMapping) {
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.18;
          }

          renderer.render(scene,camera);
          const src = renderer.domElement.toDataURL('image/png');

          model.traverse(obj=>{
            if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
            const materials = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
            materials.forEach(mat=>{
              // Les textures du GLB sont partagées uniquement dans ce chargement de portrait.
              Object.keys(mat).forEach(k=>{
                const value = mat[k];
                if (value && value.isTexture && value.dispose) value.dispose();
              });
              if (mat.dispose) mat.dispose();
            });
          });
          renderer.dispose();
          resolve(src);
        } catch(err){
          try{ renderer?.dispose(); }catch(_){ }
          reject(err);
        }
      },undefined,reject);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',waitForHud,{once:true});
  else waitForHud();
})();
