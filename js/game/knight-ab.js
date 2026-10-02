      // Prototype opt-in : aucune requête Meshy ni interface en mode normal.
      (function installKnightAB() {
        if (new URLSearchParams(location.search).get('knightAB') !== '1') return;
        const meshPath = './assets/prototypes/knight-sentinel/Knight_Sentinel.glb';
        const launch = document.createElement('button');
        launch.id = 'knight-ab-launch';
        launch.textContent = 'Comparer Knight A/B';
        launch.style.cssText = 'position:fixed;right:16px;top:16px;z-index:99999;padding:12px;background:#172737;color:white;border:1px solid #d6b879;border-radius:8px';
        document.body.append(launch);
        let active = false;
        // Installer avant les gardes clavier des tutoriels, qui capturent Échap.
        let modalKeyboard = null;
        window.addEventListener('keydown', event => modalKeyboard?.(event), true);
        launch.onclick = async () => {
          if (active) return;
          const k = kaykit3D;
          const hero = k && [...k.characterVisuals.values()].find(v => v.assetKey === 'hero0' && v.wrapper.visible);
          if (!hero || els.gameScreen.classList.contains('hidden')) {
            launch.textContent = 'Démarrez une partie avec un Knight, puis cliquez ici';
            return;
          }
          if (!k.assets.has('hero0')) {
            launch.textContent = 'Le GLB KayKit Knight doit être chargé pour comparer';
            return;
          }
          active = true;
          const dialog = document.createElement('dialog');
          dialog.id = 'knight-ab-dialog';
          dialog.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;border:0;padding:0;background:#101a26;color:white;z-index:100000;font:14px system-ui';
          dialog.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center" data-viewport></div><section style="position:absolute;top:12px;left:12px;right:12px;padding:12px;background:#101a26ed;border:1px solid #7e91a5;border-radius:8px"><strong>Prototype Knight — même case, caméra et lumière</strong><div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0"><button data-a>A · KayKit actuel</button><button data-b disabled>B · Knight Sentinel</button><label>Orientation import Meshy <select data-yaw><option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label><label>Zoom commun <input data-zoom type="range" min="1" max="4" step="0.1" value="1"></label><button data-close>Fermer</button></div><div data-status role="status">Chargement du GLB Meshy…</div><div data-stats></div><small>Pose de repos figée ; hauteur identique, proportions conservées. L’orientation Meshy reste à vérifier visuellement.</small></section>';
          document.body.append(dialog);
          dialog.showModal();
          const $ = selector => dialog.querySelector(selector);
          const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
          renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
          for (const key of ['outputEncoding', 'toneMapping', 'toneMappingExposure', 'physicallyCorrectLights']) renderer[key] = k.renderer[key];
          renderer.shadowMap.enabled = k.renderer.shadowMap.enabled;
          renderer.shadowMap.type = k.renderer.shadowMap.type;
          $('[data-viewport]').append(renderer.domElement);
          // Copie figée du décor réel. Les ressources du plateau restent partagées,
          // jamais modifiées ni libérées par ce prototype.
          const scene = k.scene.clone(true);
          // clone() attribue de nouveaux UUID : retrouver le groupe par son index.
          const rootIndex = k.scene.children.indexOf(k.root);
          const characterIndex = k.root.children.indexOf(k.characterGroup);
          const snapshotCharacters = scene.children[rootIndex].children[characterIndex];
          snapshotCharacters.clear();
          const camera = k.camera.clone();
          const baseZoom = camera.zoom;
          const originalAspect = camera.aspect;
          const knight = cloneKayKitAsset('hero0', { maxWidth: .63, maxHeight: 1.02, targetFloor: 0 });
          knight.name = 'knight-ab-a';
          styleKnightMetalArmor(knight);
          const knightBox = new THREE.Box3().setFromObject(knight);
          const targetHeight = knightBox.max.y - knightBox.min.y;
          const anchor = new THREE.Group();
          anchor.position.copy(hero.wrapper.position);
          anchor.quaternion.copy(hero.wrapper.quaternion);
          anchor.add(knight);
          snapshotCharacters.add(anchor);
          const centerButton = document.createElement('button');
          centerButton.textContent = 'Centrer sur le Knight';
          $('[data-close]').before(centerButton);
          const originalPosition = camera.position.clone();
          const originalTarget = k.orbit.target.clone();
          centerButton.onclick = () => {
            scene.updateMatrixWorld(true);
            const target = anchor.getWorldPosition(new THREE.Vector3());
            target.y += targetHeight / 2;
            camera.position.copy(originalPosition).add(target.sub(originalTarget));
            draw();
          };
          let sentinel = null, disposed = false, selected = 'a';
          const ownMaterials = new Set();
          knight.traverse(n => {
            if (n.isMesh) (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => ownMaterials.add(m));
          });
          const draw = () => { if (!disposed) renderer.render(scene, camera); };
          const resize = () => {
            const width = Math.min(innerWidth, innerHeight * originalAspect);
            renderer.setSize(width, width / originalAspect);
            draw();
          };
          const triangles = model => {
            let count = 0;
            model.traverse(n => { if (n.isMesh) count += (n.geometry.index?.count || n.geometry.attributes.position?.count || 0) / 3; });
            return Math.round(count).toLocaleString('fr-FR');
          };
          $('[data-stats]').textContent = `KayKit : ≈ ${triangles(knight)} triangles. Taille du fichier en cours de mesure.`;
          fetch('./assets/kaykit/characters/Knight.glb').then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.arrayBuffer();
          }).then(b => {
            if (!disposed) $('[data-stats]').textContent = `KayKit : ${(b.byteLength / 1048576).toFixed(2)} Mio · ≈ ${triangles(knight)} triangles.`;
          }).catch(() => {});
          const select = value => {
            if (value === 'b' && !sentinel) return;
            selected = value;
            knight.visible = value === 'a';
            if (sentinel) sentinel.visible = value === 'b';
            $('[data-a]').setAttribute('aria-pressed', String(value === 'a'));
            $('[data-b]').setAttribute('aria-pressed', String(value === 'b'));
            draw();
          };
          $('[data-a]').onclick = () => select('a');
          $('[data-b]').onclick = () => select('b');
          $('[data-zoom]').oninput = e => {
            camera.zoom = baseZoom * Number(e.target.value);
            camera.updateProjectionMatrix();
            draw();
          };
          $('[data-yaw]').onchange = e => {
            if (sentinel) sentinel.rotation.y = THREE.MathUtils.degToRad(Number(e.target.value));
            draw();
          };
          const releaseSentinel = root => {
            const textures = new Set(), materials = new Set(), geometries = new Set();
            root.traverse(n => {
              if (!n.isMesh) return;
              geometries.add(n.geometry);
              (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => {
                materials.add(m);
                Object.values(m).forEach(v => { if (v?.isTexture) textures.add(v); });
              });
              n.skeleton?.dispose();
            });
            [...textures, ...materials, ...geometries].forEach(v => v.dispose());
          };
          const abort = new AbortController();
          const keyboard = event => {
            // Le jeu écoute aussi Échap : isoler les raccourcis de la fenêtre.
            event.stopImmediatePropagation();
            if (event.key === 'Escape') { event.preventDefault(); close(); }
          };
          const close = () => {
            if (disposed) return;
            disposed = true;
            abort.abort();
            window.removeEventListener('resize', resize);
            modalKeyboard = null;
            ownMaterials.forEach(m => m.dispose());
            knight.traverse(n => n.skeleton?.dispose());
            if (sentinel) releaseSentinel(sentinel);
            renderer.dispose();
            renderer.forceContextLoss();
            dialog.close();
            dialog.remove();
            active = false;
          };
          $('[data-close]').onclick = close;
          dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
          window.addEventListener('resize', resize);
          modalKeyboard = keyboard;
          select('a');
          resize();
          try {
            const response = await fetch(meshPath, { cache: 'no-store', signal: abort.signal });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const bytes = await response.arrayBuffer();
            if (bytes.byteLength < 12 || new DataView(bytes).getUint32(0, true) !== 0x46546c67) throw new Error('Le fichier reçu n’est pas un GLB');
            const gltf = await new Promise((resolve, reject) => new THREE.GLTFLoader().parse(bytes, new URL('.', new URL(meshPath, location.href)).href, resolve, reject));
            if (disposed) { releaseSentinel(gltf.scene); return; }
            const model = gltf.scene;
            const box = new THREE.Box3().setFromObject(model);
            const height = box.max.y - box.min.y;
            if (!Number.isFinite(height) || height <= 0) { releaseSentinel(model); throw new Error('Hauteur du modèle invalide'); }
            model.scale.multiplyScalar(targetHeight / height);
            model.updateMatrixWorld(true);
            const scaled = new THREE.Box3().setFromObject(model);
            const center = scaled.getCenter(new THREE.Vector3());
            model.position.sub(new THREE.Vector3(center.x, scaled.min.y, center.z));
            sentinel = new THREE.Group();
            sentinel.name = 'knight-ab-b';
            sentinel.add(model);
            sentinel.rotation.y = THREE.MathUtils.degToRad(Number($('[data-yaw]').value));
            addShadowFlags(sentinel);
            anchor.add(sentinel);
            $('[data-b]').disabled = false;
            $('[data-status]').textContent = `Meshy chargé : ${(bytes.byteLength / 1048576).toFixed(2)} Mio · ≈ ${triangles(model)} triangles · ${gltf.animations.length} clips (non joués).`;
            select(selected);
          } catch (error) {
            if (!disposed) $('[data-status]').textContent = `Meshy indisponible (${error.message}). Déposez le GLB autonome dans assets/prototypes/knight-sentinel/Knight_Sentinel.glb, puis fermez et rouvrez le comparateur.`;
          }
        };
      })();
