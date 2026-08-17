/* ILYOS — Character Materials V1
   Passe strictement visuelle Knight/Mage.

   But : neutraliser les recolorations destructives faites après le chargement
   KayKit sans toucher aux GLB, textures, animations, ombres, caméra ou gameplay.

   Principe : la scène source stockée dans kaykit3D.assets reste l'autorité.
   Lorsqu'un CharacterVisual est créé, ses matériaux sont d'abord restaurés
   depuis le clone source (couleur + propriétés physiques), puis un accent de
   faction est appliqué par nom de MESH (Knight_Body, Mage_Cape, ...), jamais
   par nom de matériau — KayKit partage un seul matériau texturé par
   personnage, donc s'en remettre au nom du matériau ne permettrait plus
   aucune distinction. Chaque mesh possède déjà son propre clone de matériau
   (voir "cloned" dans kaykit3d.js/createCharacterVisual) avant l'exécution de
   cette passe : teinter un mesh ne déteint donc jamais sur les autres. La
   tête (peau/visage) est explicitement exclue de toute teinte.
*/
(function installIlyosCharacterMaterialsV1(){
  if (window.__ILYOS_CHARACTER_MATERIALS_V1__) return;
  window.__ILYOS_CHARACTER_MATERIALS_V1__ = true;

  const PALETTE = Object.freeze({
    mageViolet: 0x8052bc,
    mageVioletLight: 0xb991e5,
    mageVioletDeep: 0x43256f,
    mageCyan: 0x55c8d0,
    knightSteel: 0xaeb2b0,
    knightSteelShadow: 0x72797b,
    knightIvory: 0xddd7c8,
    knightGold: 0xddb653,
    knightGoldLight: 0xf4db93
  });

  const runtime = {
    kaykit: null,
    registry: null,
    nativeSet: null,
    applied: new Map(),
    audits: new Map()
  };

  function materialArray(material){
    if (!material) return [];
    return Array.isArray(material) ? material : [material];
  }

  function collectMeshes(root){
    const out = [];
    root?.traverse?.(node => {
      if (node?.isMesh && node.material) out.push(node);
    });
    return out;
  }

  function materialLabel(mesh, material){
    /* Les noms KayKit utilisent "_" comme séparateur ("Knight_Head") : on le
       convertit en espace pour que les regex \b (limite de mot) fonctionnent
       correctement sur "head", "body", etc. */
    return `${mesh?.name || ''} ${material?.name || ''}`.replace(/[_-]/g, ' ').trim().toLowerCase();
  }

  function copyColor(target, source){
    if (target?.color && source?.color) target.color.copy(source.color);
  }

  function copyEmissive(target, source){
    if (target?.emissive && source?.emissive) target.emissive.copy(source.emissive);
  }

  function restoreNativeMaterial(target, source){
    if (!target || !source) return;

    /* Important : on ne remplace pas la texture du clone. GLTFLoader/SkeletonUtils
       la partage déjà correctement avec la source. On restaure uniquement les
       propriétés que styleMagePalette/styleKnightMetalArmor peuvent altérer. */
    copyColor(target, source);
    copyEmissive(target, source);

    if ('roughness' in target && Number.isFinite(source.roughness)) target.roughness = source.roughness;
    if ('metalness' in target && Number.isFinite(source.metalness)) target.metalness = source.metalness;
    if ('emissiveIntensity' in target && Number.isFinite(source.emissiveIntensity)) target.emissiveIntensity = source.emissiveIntensity;

    target.needsUpdate = true;
  }

  function applyMageAccent(mesh, material, sourceMaterial){
    if (!material) return null;

    /* KayKit Mage n'a qu'un seul matériau texturé ("mage_texture") partagé
       par tous les meshes du personnage (corps, cape, chapeau, tête...).
       Le partage du nom de matériau ne veut PAS dire partage de l'instance :
       kaykit3d.js clone un matériau par mesh avant d'enregistrer le visuel
       (voir "cloned" dans createCharacterVisual), donc teinter le clone d'un
       mesh ne déteint jamais sur les autres. On peut donc recolorer par nom
       de MESH ("Mage_Head", "Mage_Body", ...) même si le matériau est texturé,
       à condition d'exclure explicitement la tête (peau/visage). */
    const label = materialLabel(mesh, material);
    if (/(?:^|\b)head(?:\b|$)/.test(label)) return null;
    if (/(?:^|\b)(spellbook|book|staff|wand|paper)(?:\b|$)/.test(label)) return null;

    const isGem = /(?:^|\b)(gem|orb|crystal|magic|arcane|jewel)(?:\b|$)/.test(label);
    if (isGem) {
      if (material.color) material.color.setHex(PALETTE.mageCyan);
      if ('roughness' in material) material.roughness = .20;
      if ('metalness' in material) material.metalness = .18;
      if (material.emissive) material.emissive.setHex(PALETTE.mageCyan);
      if ('emissiveIntensity' in material) material.emissiveIntensity = .16;
      material.needsUpdate = true;
      return 'mage-magic-accent';
    }

    const isTrim = /(?:^|\b)(hat|hood|cape)(?:\b|$)/.test(label);
    if (material.color) material.color.setHex(isTrim ? PALETTE.mageVioletLight : PALETTE.mageViolet);
    if ('roughness' in material) material.roughness = .66;
    if ('metalness' in material) material.metalness = 0;
    if (material.emissive) material.emissive.setHex(PALETTE.mageVioletDeep);
    if ('emissiveIntensity' in material) material.emissiveIntensity = .025;
    material.needsUpdate = true;
    return isTrim ? 'mage-trim-accent' : 'mage-garment-accent';
  }

  function applyKnightAccent(mesh, material, sourceMaterial){
    if (!material) return null;

    /* Même principe que le Mage : un seul "knight_texture" partagé par nom,
       mais un clone de matériau par mesh (garanti avant l'enregistrement du
       visuel). On recolore donc par nom de MESH, en excluant la tête pour ne
       jamais teinter la peau/le visage. */
    const label = materialLabel(mesh, material);
    if (/(?:^|\b)head(?:\b|$)/.test(label)) return null;

    const isGoldAccent = /(?:^|\b)(trim|emblem|badge|buckle|ornament|gold|jewel)(?:\b|$)/.test(label);
    if (isGoldAccent) {
      if (material.color) material.color.setHex(PALETTE.knightGold);
      if ('roughness' in material) material.roughness = .38;
      if ('metalness' in material) material.metalness = .34;
      if (material.emissive) material.emissive.setHex(0x3a2a0d);
      if ('emissiveIntensity' in material) material.emissiveIntensity = .025;
      material.needsUpdate = true;
      return 'knight-gold-accent';
    }

    /* Casque, cape, corps, bras, jambes, armes et boucliers : acier chaud. */
    if (material.color) material.color.setHex(PALETTE.knightSteel);
    if ('roughness' in material) material.roughness = .48;
    if ('metalness' in material) material.metalness = .38;
    if (material.emissive) material.emissive.setHex(0x15191a);
    if ('emissiveIntensity' in material) material.emissiveIntensity = .015;
    material.needsUpdate = true;
    return 'knight-warm-steel';
  }

  function inspectAsset(kaykit, assetKey){
    const source = kaykit?.assets?.get?.(assetKey);
    if (!source) return { assetKey, loaded:false, meshes:[] };

    const meshes = collectMeshes(source).map((mesh, meshIndex) => ({
      meshIndex,
      mesh: mesh.name || '(sans nom)',
      materials: materialArray(mesh.material).map((material, materialIndex) => ({
        materialIndex,
        material: material?.name || '(sans nom)',
        textured: !!material?.map,
        texture: material?.map?.name || material?.map?.source?.data?.src || (material?.map ? '(texture GLB)' : null),
        color: material?.color?.getHexString ? `#${material.color.getHexString()}` : null,
        roughness: Number.isFinite(material?.roughness) ? material.roughness : null,
        metalness: Number.isFinite(material?.metalness) ? material.metalness : null,
        emissive: material?.emissive?.getHexString ? `#${material.emissive.getHexString()}` : null,
        emissiveIntensity: Number.isFinite(material?.emissiveIntensity) ? material.emissiveIntensity : null
      }))
    }));

    return { assetKey, loaded:true, meshes };
  }

  function restoreAndPolishVisual(kaykit, visual){
    if (!visual?.wrapper || !['hero0','hero1'].includes(visual.assetKey)) return visual;

    const source = kaykit?.assets?.get?.(visual.assetKey);
    if (!source) return visual;

    const sourceMeshes = collectMeshes(source);
    const targetMeshes = collectMeshes(visual.wrapper);
    const count = Math.min(sourceMeshes.length, targetMeshes.length);
    let restored = 0;
    const accents = [];

    for (let i = 0; i < count; i++) {
      const sourceMesh = sourceMeshes[i];
      const targetMesh = targetMeshes[i];
      const sourceMaterials = materialArray(sourceMesh.material);
      const targetMaterials = materialArray(targetMesh.material);
      const materialCount = Math.min(sourceMaterials.length, targetMaterials.length);

      for (let j = 0; j < materialCount; j++) {
        const sourceMaterial = sourceMaterials[j];
        const targetMaterial = targetMaterials[j];
        restoreNativeMaterial(targetMaterial, sourceMaterial);
        restored++;

        const accent = visual.assetKey === 'hero1'
          ? applyMageAccent(targetMesh, targetMaterial, sourceMaterial)
          : applyKnightAccent(targetMesh, targetMaterial, sourceMaterial);
        if (accent) accents.push({ mesh:targetMesh.name || '(sans nom)', material:targetMaterial.name || '(sans nom)', accent });
      }
    }

    visual.wrapper.userData = visual.wrapper.userData || {};
    visual.wrapper.userData.ilyosCharacterMaterialsV1 = true;
    runtime.applied.set(String(visual.id), {
      id:String(visual.id),
      assetKey:visual.assetKey,
      restoredMaterials:restored,
      accents,
      sourceMeshCount:sourceMeshes.length,
      targetMeshCount:targetMeshes.length
    });
    runtime.audits.set(visual.assetKey, inspectAsset(kaykit, visual.assetKey));
    return visual;
  }

  function patchRegistry(kaykit){
    const registry = kaykit?.characterVisuals;
    if (!registry || registry.__ilyosCharacterMaterialsV1) return;

    const nativeSet = registry.set;
    Object.defineProperty(registry, '__ilyosCharacterMaterialsV1', { value:true, configurable:true });
    registry.set = function(key, visual){
      restoreAndPolishVisual(kaykit, visual);
      return nativeSet.call(this, key, visual);
    };

    registry.forEach(visual => restoreAndPolishVisual(kaykit, visual));
    runtime.registry = registry;
    runtime.nativeSet = nativeSet;
  }

  function patchKaykit(kaykit){
    if (!kaykit) return;
    runtime.kaykit = kaykit;
    patchRegistry(kaykit);
  }

  /* Le moteur expose kaykit3D plus tard, lors de la création réelle de la scène.
     Un accessor permet de se brancher exactement à cet instant, sans polling,
     interval ni boucle par frame. */
  const descriptor = Object.getOwnPropertyDescriptor(window, 'kaykit3D');
  if (!descriptor || descriptor.configurable) {
    let current = window.kaykit3D;
    Object.defineProperty(window, 'kaykit3D', {
      configurable:true,
      enumerable:true,
      get(){ return current; },
      set(value){ current = value; patchKaykit(value); }
    });
    if (current) patchKaykit(current);
  } else if (window.kaykit3D) {
    patchKaykit(window.kaykit3D);
  }

  window.ILYOS_CHARACTER_MATERIAL_AUDIT = {
    palette: PALETTE,
    report(){
      const k = runtime.kaykit || window.kaykit3D;
      const knight = inspectAsset(k, 'hero0');
      const mage = inspectAsset(k, 'hero1');
      runtime.audits.set('hero0', knight);
      runtime.audits.set('hero1', mage);
      return {
        knight,
        mage,
        applied:[...runtime.applied.values()],
        rule:'Les matériaux sont restaurés depuis le GLB source puis teintés par nom de mesh (clone par mesh, jamais la tête).'
      };
    },
    reapply(){
      const k = runtime.kaykit || window.kaykit3D;
      if (!k?.characterVisuals) return 0;
      let count = 0;
      k.characterVisuals.forEach(visual => { restoreAndPolishVisual(k, visual); count++; });
      return count;
    }
  };
})();
