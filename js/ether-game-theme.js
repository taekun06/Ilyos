/* ILYOS — Éther enchanté : passe visuelle temporaire issue du laboratoire.
   Aucun gameplay : ce fichier ne fait que retuner les objets Three.js déjà
   créés par kaykit3d.js. À replier dans kaykit3d.js quand la DA sera figée. */
(() => {
  'use strict';
  if (window.__ILYOS_ETHER_GAME_THEME__) return;
  window.__ILYOS_ETHER_GAME_THEME__ = true;

  const THEME = Object.freeze({
    zone: {
      bright: '#70FFF0',
      dark: '#0F6974',
      thickness: 0.075,
      veilOpacity: 0
    },
    selection: {
      warm: '#FFE39A',
      ether: '#78FFF0',
      ringIntensity: 1.34,
      beamIntensity: 1.08,
      particleIntensity: 1.18
    },
    push: {
      color: '#2AB966',
      destination: '#5C3A0A',
      link: '#F5B55B',
      highlight: '#FFE7B3',
      ringSize: 1.07,
      opacity: 0.57,
      linkIntensity: 0.9
    },
    death: {
      halo: '#E6A24B',
      spriteSize: 1.03,
      haloSize: 0.94,
      opacity: 0.84
    }
  });

  // Couleurs actuellement créées par kaykit3d.js. Elles servent uniquement à
  // reconnaître le rôle d'un objet la première fois qu'il apparaît ; ensuite
  // le rôle est mémorisé sur l'objet, même après recoloration.
  const LEGACY = Object.freeze({
    moveBright: 0x7fd8ff,
    moveDark: 0x0d3a56,
    pushTarget: 0xce8b55,
    pushDestination: 0xff8a32,
    pushHighlight: 0xffd08a,
    pushLink: 0xffa044,
    deathHalo: 0xffa13d,
    selectionSoft: 0xffe9a8,
    selectionRing: 0xfff09a,
    selectionRune: 0x67c8ea
  });

  /* Couleurs lues une fois : color.set('#…') relisait la chaîne à chaque image
     et pour chaque objet. copy() d'une couleur déjà construite donne la même
     valeur sans rien allouer. */
  const COULEURS = new Map();
  const couleur = css => {
    let c = COULEURS.get(css);
    if (!c && window.THREE?.Color) { c = new THREE.Color(css); COULEURS.set(css, c); }
    return c;
  };
  const poser = (color, css) => { const c = couleur(css); if (c) color.copy(c); else color.set(css); };

  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  const materialsOf = object => {
    if (!object?.material) return [];
    return Array.isArray(object.material) ? object.material : [object.material];
  };
  const materialHex = material => material?.color?.getHex ? material.color.getHex() : null;

  function rememberScale(object) {
    if (!object?.scale) return null;
    object.userData ||= {};
    if (!object.userData.__etherBaseScale) {
      object.userData.__etherBaseScale = {
        x: object.scale.x,
        y: object.scale.y,
        z: object.scale.z
      };
    }
    return object.userData.__etherBaseScale;
  }

  function scaleFromBase(object, multiplier) {
    const base = rememberScale(object);
    if (!base) return;
    object.scale.set(base.x * multiplier, base.y * multiplier, base.z * multiplier);
  }

  // beam/particules ont leur opacité animée par le moteur à chaque frame. On
  // multiplie la valeur fraîche sans la remultiplier si le moteur ne l'a pas
  // changée depuis notre dernière passe.
  function multiplyAnimatedOpacity(material, multiplier, slot) {
    if (!material) return;
    material.userData ||= {};
    const previousApplied = material.userData[slot];
    const current = Number(material.opacity);
    if (Number.isFinite(previousApplied) && Math.abs(current - previousApplied) < 1e-5) return;
    const next = clamp01(current * multiplier);
    material.opacity = next;
    material.userData[slot] = next;
  }

  function applyCharacterSelection(kaykit) {
    kaykit.characterVisuals?.forEach?.(visual => {
      const halo = visual?.halo;
      if (!halo) return;

      if (halo.ring?.material?.color) {
        poser(halo.ring.material.color, THEME.selection.warm);
        halo.ring.material.opacity = clamp01(0.95 * THEME.selection.ringIntensity);
      }
      if (halo.beamMaterial?.color) {
        poser(halo.beamMaterial.color, THEME.selection.ether);
        multiplyAnimatedOpacity(halo.beamMaterial, THEME.selection.beamIntensity, '__etherBeamOpacity');
      }
      halo.particles?.forEach?.(particle => {
        const material = particle?.material;
        if (!material) return;
        if (material.color) poser(material.color, THEME.selection.ether);
        multiplyAnimatedOpacity(material, THEME.selection.particleIntensity, '__etherParticleOpacity');
      });
    });

    // Harmonise les petits anneaux/runes de sélection déjà présents dans le
    // moteur, sans créer de couche supplémentaire.
    (kaykit.animatedObjects || []).forEach(object => {
      materialsOf(object).forEach(material => {
        if (!material?.color) return;
        object.userData ||= {};
        let role = object.userData.__etherSelectionRole;
        if (!role) {
          const hex = materialHex(material);
          if (hex === LEGACY.selectionSoft || hex === LEGACY.selectionRing) role = 'warm';
          else if (hex === LEGACY.selectionRune) role = 'ether';
          if (role) object.userData.__etherSelectionRole = role;
        }
        if (role === 'warm') poser(material.color, THEME.selection.warm);
        else if (role === 'ether') poser(material.color, THEME.selection.ether);
      });
    });
  }

  function applyMoveZone(kaykit) {
    const group = kaykit.moveZoneGroup;
    if (!group) return;
    const thicknessRatio = THEME.zone.thickness / 0.12;

    group.traverse?.(object => {
      if (!object?.isMesh || !object.material?.color) return;
      object.userData ||= {};
      let role = object.userData.__etherMoveRole;
      if (!role) {
        const hex = materialHex(object.material);
        if (hex === LEGACY.moveBright) role = 'bright';
        else if (hex === LEGACY.moveDark) role = 'dark';
        if (role) object.userData.__etherMoveRole = role;
      }
      if (!role) return;

      poser(object.material.color, role === 'bright' ? THEME.zone.bright : THEME.zone.dark);
      // addKayKitMoveZone utilise PlaneGeometry(longueur, epaisseur) : l'axe Y
      // local est donc exactement l'épaisseur du ruban, même après rotation.
      const base = rememberScale(object);
      if (base) object.scale.y = base.y * thicknessRatio;
    });
  }

  function identifyActionRole(object, kaykit) {
    object.userData ||= {};
    if (object.userData.__etherActionRole) return object.userData.__etherActionRole;

    if (object.isSprite && object.material?.map && kaykit.pushDeathTexture && object.material.map === kaykit.pushDeathTexture) {
      object.userData.__etherActionRole = 'deathSprite';
      object.userData.__etherWasEmphasized = Number(object.material.opacity) >= 0.95;
      return 'deathSprite';
    }

    if (!object.isMesh || !object.material?.color) return null;
    const hex = materialHex(object.material);
    const geometryType = object.geometry?.type || '';
    let role = null;

    if (geometryType === 'TorusGeometry' && hex === LEGACY.pushTarget) role = 'pushTarget';
    else if (geometryType === 'TorusGeometry' && hex === LEGACY.pushDestination) role = 'pushDestination';
    else if (geometryType === 'TorusGeometry' && hex === LEGACY.pushHighlight) role = 'pushHighlight';
    else if (geometryType === 'TorusGeometry' && hex === LEGACY.deathHalo) {
      role = 'deathHalo';
      object.userData.__etherWasEmphasized = Number(object.material.opacity) > 0.7;
    } else if ((geometryType === 'CylinderGeometry' || geometryType === 'ConeGeometry') && hex === LEGACY.pushLink) {
      role = 'pushLink';
    }

    if (role) object.userData.__etherActionRole = role;
    return role;
  }

  function applyActionPreviews(kaykit) {
    const group = kaykit.actionPreviewGroup;
    if (!group) return;

    group.traverse?.(object => {
      const role = identifyActionRole(object, kaykit);
      if (!role) return;

      if (role === 'pushTarget') {
        poser(object.material.color, THEME.push.color);
        object.material.opacity = THEME.push.opacity;
        scaleFromBase(object, THEME.push.ringSize);
        return;
      }

      if (role === 'pushDestination') {
        poser(object.material.color, THEME.push.destination);
        object.material.opacity = THEME.push.opacity;
        scaleFromBase(object, THEME.push.ringSize);
        return;
      }

      if (role === 'pushHighlight') {
        poser(object.material.color, THEME.push.highlight);
        object.material.opacity = Math.min(1, THEME.push.opacity * 1.62);
        scaleFromBase(object, THEME.push.ringSize);
        return;
      }

      if (role === 'pushLink') {
        poser(object.material.color, THEME.push.link);
        object.material.opacity = clamp01(0.98 * THEME.push.linkIntensity);
        return;
      }

      if (role === 'deathHalo') {
        poser(object.material.color, THEME.death.halo);
        object.material.opacity = object.userData.__etherWasEmphasized
          ? Math.min(1, THEME.death.opacity * 1.18)
          : THEME.death.opacity;
        scaleFromBase(object, THEME.death.haloSize);
        return;
      }

      if (role === 'deathSprite') {
        object.material.opacity = object.userData.__etherWasEmphasized ? 1 : THEME.death.opacity;
        scaleFromBase(object, THEME.death.spriteSize);
      }
    });
  }

  function applyTheme() {
    const kaykit = window.kaykit3D;
    if (!kaykit) return;
    applyCharacterSelection(kaykit);
    applyMoveZone(kaykit);
    applyActionPreviews(kaykit);
  }

  /* Plus de boucle propre : la boucle de rendu de kaykit3d.js appelle apply()
     au début de chaque image qu'elle dessine. L'ancienne boucle tournait à
     chaque rafraîchissement de l'écran, menu et onglet masqué compris. */
  window.ILYOS_ETHER_THEME = {
    values: THEME,
    apply: applyTheme
  };
  console.info('[ILYOS] Éther gameplay theme active', THEME);
})();
