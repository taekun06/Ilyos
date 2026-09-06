/* Éditeur visuel opt-in. Profils locaux, aucune modification des règles. */
(() => {
  'use strict';
  if (new URLSearchParams(location.search).get('visualEditor') !== '1' || window.ILYOS_VISUAL_EDITOR) return;
  const baseURL = document.currentScript.src;
  const storageKey = 'ilyos.visual-editor.v1';
  const fields = [
    ['Scène', 'scene.exposure', 'Exposition', .96, .3, 2, .01],
    ['Sélection', 'selection.color', 'Couleur anneau', '#FFE39A'],
    ['Sélection', 'selection.ether', 'Colonne et particules', '#78FFF0'],
    ['Sélection', 'selection.ring', 'Intensité anneau ×', 1, 0, 2, .01],
    ['Sélection', 'selection.beam', 'Intensité colonne ×', 1, 0, 3, .02],
    ['Sélection', 'selection.particles', 'Intensité particules ×', 1, 0, 3, .02],
    ['Déplacement', 'zone.bright', 'Contour clair', '#70FFF0'],
    ['Déplacement', 'zone.dark', 'Contour sombre', '#0F6974'],
    ['Déplacement', 'zone.width', 'Épaisseur ×', 1, .2, 3, .02],
    ['Poussée', 'push.target', 'Cible poussable', '#D9743A'],
    ['Poussée', 'push.destination', 'Destination', '#D9743A'],
    ['Poussée', 'push.hover', 'Destination survolée', '#FFE7B3'],
    ['Poussée', 'push.size', 'Taille anneaux ×', 1, .4, 2, .01],
    ['Poussée', 'push.opacity', 'Opacité anneaux ×', 1, 0, 2, .01],
    ['Chute', 'death.style', 'Dessin du crâne', 'current', ['current', 'ether']],
    ['Chute', 'death.color', 'Couleur crâne actuel', '#C94A44'],
    ['Chute', 'death.halo', 'Couleur Éther', '#E6A24B'],
    ['Chute', 'death.size', 'Taille crâne ×', 1, .4, 2, .01],
    ['Chute', 'death.opacity', 'Opacité ×', 1, 0, 1.5, .01],
    ['Chute', 'death.rings', 'Cercles Éther', true],
    ['Chute', 'death.haloSize', 'Taille cercles ×', 1, .4, 2, .01]
  ];
  let values = {}, enabled = true;
  const inputs = new Map();
  const effects = new Map();
  let lastScene = null, lastStatus = 0;
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = new URL('../css/visual-editor.css', baseURL).href;
  document.head.append(css);
  const panel = document.createElement('aside');
  panel.id = 'ilyosVisualEditor';
  panel.setAttribute('aria-label', 'Atelier visuel');
  panel.innerHTML = `<header><div><small>ILYOS · OUTIL LOCAL</small><h2>Atelier visuel</h2></div><button type="button" id="veCollapse" aria-expanded="true" aria-controls="veBody">Réduire</button></header>
    <div id="veBody"><p>Régle les effets pendant une partie en 3D. Seuls les réglages marqués « modifié » remplacent le rendu du jeu.</p>
    <label class="ve-switch"><input id="veEnabled" type="checkbox" checked> Voir mes réglages</label>
    <div class="ve-actions"><button id="veEther" type="button">Essayer Éther</button><button id="veReset" type="button">Tout réinitialiser</button></div>
    <p id="veSceneStatus" role="status">Lance une partie en 3D pour voir les effets.</p><div id="veFields"></div>
    <div class="ve-actions"><button id="veSave" type="button">Sauvegarder</button><button id="veLoad" type="button">Recharger</button><button id="veExport" type="button">Exporter JSON</button><button id="veImport" type="button">Importer JSON</button></div>
    <input id="veFile" type="file" accept=".json,application/json" hidden>
    <p id="veNotice" role="status">Les essais restent dans cet atelier. Le jeu normal conserve son rendu.</p></div>`;
  document.body.append(panel);
  const $ = id => panel.querySelector('#' + id);
  const notice = message => { $('veNotice').textContent = message; };
  // Empêche les raccourcis globaux du jeu de consommer la saisie du panneau.
  ['keydown', 'keyup', 'pointerdown', 'pointerup', 'click', 'wheel'].forEach(type => panel.addEventListener(type, event => event.stopPropagation()));
  const groups = new Map();
  for (const [section, key, label, fallback, min, max, step] of fields) {
    if (!groups.has(section)) {
      const group = document.createElement('details'); group.open = section === 'Chute';
      const summary = document.createElement('summary'); summary.textContent = section;
      group.append(summary); $('veFields').append(group); groups.set(section, group);
    }
    const row = document.createElement('div'); row.className = 've-row';
    const caption = document.createElement('label'); caption.htmlFor = 've-' + key; caption.textContent = label;
    const input = document.createElement(Array.isArray(min) ? 'select' : 'input'); input.id = caption.htmlFor;
    if (Array.isArray(min)) {
      for (const value of min) { const option = document.createElement('option'); option.value = value; option.textContent = value === 'ether' ? 'Éther du laboratoire' : 'Crâne du jeu'; input.append(option); }
    } else if (typeof fallback === 'boolean') input.type = 'checkbox';
    else if (typeof fallback === 'number') { input.type = 'range'; input.min = min; input.max = max; input.step = step; }
    else input.type = 'color';
    const output = document.createElement('output'); output.htmlFor = input.id;
    const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = '↺'; reset.title = 'Rétablir : ' + label; reset.setAttribute('aria-label', reset.title);
    reset.addEventListener('click', () => { delete values[key]; sync(); });
    input.addEventListener('input', () => { values[key] = typeof fallback === 'boolean' ? input.checked : typeof fallback === 'number' ? Number(input.value) : input.value; sync(); });
    row.append(caption, output, input, reset); groups.get(section).append(row);
    inputs.set(key, { input, output, row });
  }
  function sync() {
    for (const [, key, , fallback] of fields) {
      const { input, output, row } = inputs.get(key), value = values[key] ?? fallback;
      if (typeof fallback === 'boolean') input.checked = value; else input.value = value;
      row.classList.toggle('ve-changed', key in values);
      output.textContent = (typeof value === 'number' ? value.toFixed(2) + ' · ' : '') + (key in values ? 'modifié' : 'jeu');
    }
    $('veEnabled').checked = enabled;
  }
  function validate(profile) {
    if (!profile || profile.schema !== 'ilyos-visual-editor' || profile.version !== 1 || !profile.values || typeof profile.values !== 'object' || Array.isArray(profile.values)) throw new Error('Profil incompatible : format Atelier visuel v1 attendu.');
    const clean = {};
    for (const [key, value] of Object.entries(profile.values)) {
      const field = fields.find(field => field[1] === key);
      if (!field) throw new Error('Réglage inconnu : ' + key);
      const [, , , fallback, min, max] = field;
      const valid = Array.isArray(min) ? min.includes(value) : typeof fallback === 'number' ? typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max : typeof fallback === 'boolean' ? typeof value === 'boolean' : typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
      if (!valid) throw new Error('Valeur invalide : ' + key);
      clean[key] = value;
    }
    return clean;
  }
  const profile = () => ({ schema: 'ilyos-visual-editor', version: 1, values: { ...values } });
  function load(text) { values = validate(JSON.parse(text)); enabled = true; sync(); notice('Profil chargé dans l’atelier.'); }
  $('veEnabled').onchange = event => { enabled = event.target.checked; notice(enabled ? 'Tes réglages sont affichés.' : 'Comparaison : rendu original du jeu.'); };
  $('veCollapse').onclick = () => { const collapsed = !$('veBody').hidden; $('veBody').hidden = collapsed; $('veCollapse').textContent = collapsed ? 'Ouvrir' : 'Réduire'; $('veCollapse').setAttribute('aria-expanded', String(!collapsed)); };
  $('veReset').onclick = () => { values = {}; enabled = true; sync(); notice('Rendu initial rétabli. La sauvegarde reste disponible avec Recharger.'); };
  $('veEther').onclick = () => {
    values = { 'selection.color': '#FFE39A', 'selection.ether': '#78FFF0', 'zone.bright': '#70FFF0', 'zone.dark': '#0F6974', 'push.target': '#1B9A4D', 'push.destination': '#D8863F', 'push.hover': '#FFE0A3', 'death.style': 'ether', 'death.halo': '#E6A24B', 'death.rings': true, 'death.size': 1.25 };
    enabled = true; sync(); notice('Variante Éther appliquée aux effets présents dans la partie.');
  };
  $('veSave').onclick = () => { try { localStorage.setItem(storageKey, JSON.stringify(profile())); notice('Profil sauvegardé dans ce navigateur pour cet atelier.'); } catch (_) { notice('Sauvegarde indisponible. Utilise Exporter JSON.'); } };
  $('veLoad').onclick = () => { try { const text = localStorage.getItem(storageKey); if (!text) return notice('Aucune sauvegarde locale.'); load(text); } catch (error) { notice(error.message); } };
  $('veExport').onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(profile(), null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'ilyos-visuels.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notice('Profil exporté. Il pourra être importé ici ou intégré au projet.'); };
  $('veImport').onclick = () => $('veFile').click();
  $('veFile').onchange = async event => { try { const file = event.target.files[0]; if (!file) return; if (file.size > 65536) throw new Error('Profil trop volumineux (maximum 64 Ko).'); load(await file.text()); } catch (error) { notice(error.message); } finally { event.target.value = ''; } };
  sync();

  function disposeEffect(effect) {
    effect.group.parent?.remove(effect.group);
    effect.group.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
    effect.texture?.dispose();
  }
  // Modifications temporaires, restaurées en ordre inverse même si le rendu échoue.
  function apply(kaykit) {
    const undo = [], seen = new Set(); let count = 0;
    const set = (object, property, value) => { const before = object[property]; undo.push(() => { object[property] = before; }); object[property] = value; };
    const color = (material, hex) => { if (!material?.color || hex === undefined) return; const before = material.color.clone(); undo.push(() => material.color.copy(before)); material.color.set(hex); };
    const scale = (object, multiplier, axis) => { if (multiplier === undefined) return; const before = object.scale.clone(); undo.push(() => object.scale.copy(before)); if (axis) object.scale[axis] *= multiplier; else object.scale.multiplyScalar(multiplier); };
    const opacity = (material, multiplier) => { if (material && multiplier !== undefined) set(material, 'opacity', Math.max(0, Math.min(1, material.opacity * multiplier))); };
    const restore = () => { for (let i = undo.length - 1; i >= 0; i--) undo[i](); };
    try {
      if (lastScene !== kaykit.scene) { effects.forEach(disposeEffect); effects.clear(); lastScene = kaykit.scene; }
      if (enabled) {
        if (values['scene.exposure'] !== undefined) set(kaykit.renderer, 'toneMappingExposure', values['scene.exposure']);
        kaykit.characterVisuals?.forEach(visual => {
          const halo = visual.halo; if (!halo) return;
          color(halo.ring?.material, values['selection.color']); opacity(halo.ring?.material, values['selection.ring']);
          color(halo.beamMaterial, values['selection.ether']); opacity(halo.beamMaterial, values['selection.beam']);
          halo.particles?.forEach(particle => { color(particle.material, values['selection.ether']); opacity(particle.material, values['selection.particles']); });
        });
        for (const group of [kaykit.moveZoneGroup, kaykit.actionPreviewGroup]) group?.traverse(object => {
          const role = object.userData.visualRole;
          if (!role || !object.material) return;
          count++;
          if (role.startsWith('zone.')) { color(object.material, values[role]); scale(object, values['zone.width'], 'y'); }
          else if (role.startsWith('push.')) { color(object.material, values[role]); scale(object, values['push.size']); opacity(object.material, values['push.opacity']); }
          else if (role === 'death.sprite') {
            if (values['death.style'] === 'ether') {
              seen.add(object);
              let effect = effects.get(object);
              if (!effect) { effect = createEtherDeath(); effects.set(object, effect); kaykit.scene.add(effect.group); }
              updateEtherDeath(effect, object, kaykit.camera, values);
              set(effect.group, 'visible', true); set(object, 'visible', false);
            } else { color(object.material, values['death.color']); scale(object, values['death.size']); opacity(object.material, values['death.opacity']); }
          }
        });
      }
      for (const [object, effect] of effects) if (!seen.has(object)) { disposeEffect(effect); effects.delete(object); }
      if (performance.now() - lastStatus > 750) { $('veSceneStatus').textContent = `${count} marqueur(s) présent(s). Sélectionne un gardien, puis survole une poussée pour régler sa destination ou sa chute.`; lastStatus = performance.now(); }
    } catch (error) { restore(); enabled = false; effects.forEach(disposeEffect); effects.clear(); sync(); notice('Atelier désactivé : ' + error.message); return; }
    return restore;
  }
  // Le dessin Éther est extrait du laboratoire existant ; seul l'atelier le charge.
  function createEtherDeath() {
    const T = window.THREE, group = new T.Group(); group.visible = false;
    const material = () => new T.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false });
    const halo = new T.Mesh(new T.TorusGeometry(.62, .022, 10, 72), material());
    const inner = new T.Mesh(new T.TorusGeometry(.47, .009, 8, 64), material());
    halo.renderOrder = 57; inner.renderOrder = 58;
    const sprite = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false })); sprite.renderOrder = 59;
    group.add(halo, inner, sprite);
    return { group, halo, inner, sprite, texture: null, hex: null };
  }
  function updateEtherDeath(effect, source, camera, settings) {
    const hex = settings['death.halo'] || '#E6A24B';
    if (hex !== effect.hex) { effect.texture?.dispose(); effect.texture = makeDeathTexture(hex); effect.sprite.material.map = effect.texture; effect.sprite.material.needsUpdate = true; effect.hex = hex; }
    source.getWorldPosition(effect.group.position); effect.group.lookAt(camera.position);
    const size = settings['death.size'] ?? 1, alpha = Math.min(1, source.material.opacity * (settings['death.opacity'] ?? 1));
    effect.sprite.scale.setScalar(source.scale.x * size); effect.sprite.material.opacity = alpha;
    for (const ring of [effect.halo, effect.inner]) { ring.visible = settings['death.rings'] !== false; ring.scale.setScalar(settings['death.haloSize'] ?? 1); ring.material.color.set(hex); ring.material.opacity = alpha * (ring === effect.inner ? .62 : 1); }
  }

  function makeDeathTexture(haloHex) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d");
    const color = new THREE.Color(haloHex);
    const amber = `${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}`;
    context.clearRect(0, 0, 512, 512);

    const aura = context.createRadialGradient(256, 245, 35, 256, 245, 205);
    aura.addColorStop(0, `rgba(${amber}, .24)`);
    aura.addColorStop(.5, `rgba(${amber}, .08)`);
    aura.addColorStop(1, `rgba(${amber}, 0)`);
    context.fillStyle = aura;
    context.fillRect(35, 25, 442, 442);

    context.shadowColor = `rgba(${amber}, .92)`;
    context.shadowBlur = 34;
    context.fillStyle = "#f9e1b0";
    context.beginPath();
    context.moveTo(256, 72);
    context.bezierCurveTo(172, 72, 124, 125, 126, 216);
    context.bezierCurveTo(127, 262, 148, 291, 181, 310);
    context.lineTo(202, 329);
    context.lineTo(205, 368);
    context.bezierCurveTo(211, 393, 232, 407, 256, 407);
    context.bezierCurveTo(280, 407, 301, 393, 307, 368);
    context.lineTo(310, 329);
    context.lineTo(331, 310);
    context.bezierCurveTo(364, 291, 385, 262, 386, 216);
    context.bezierCurveTo(388, 125, 340, 72, 256, 72);
    context.closePath();
    context.fill();

    context.shadowBlur = 0;
    context.globalCompositeOperation = "destination-out";
    context.fillStyle = "#000";
    context.beginPath();
    context.moveTo(164, 205);
    context.bezierCurveTo(174, 169, 224, 168, 235, 206);
    context.bezierCurveTo(237, 242, 210, 267, 179, 257);
    context.bezierCurveTo(155, 249, 153, 225, 164, 205);
    context.closePath();
    context.moveTo(348, 205);
    context.bezierCurveTo(338, 169, 288, 168, 277, 206);
    context.bezierCurveTo(275, 242, 302, 267, 333, 257);
    context.bezierCurveTo(357, 249, 359, 225, 348, 205);
    context.closePath();
    context.fill();

    context.beginPath();
    context.moveTo(256, 240);
    context.bezierCurveTo(242, 264, 232, 287, 236, 303);
    context.lineTo(256, 292);
    context.lineTo(276, 303);
    context.bezierCurveTo(280, 287, 270, 264, 256, 240);
    context.closePath();
    context.fill();

    context.beginPath();
    context.moveTo(256, 126);
    context.lineTo(267, 149);
    context.lineTo(256, 172);
    context.lineTo(245, 149);
    context.closePath();
    context.fill();

    context.globalCompositeOperation = "source-over";
    context.strokeStyle = `rgba(${amber}, .78)`;
    context.lineWidth = 5;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(208, 337);
    context.bezierCurveTo(230, 324, 282, 324, 304, 337);
    context.stroke();
    for (let x = 224; x <= 288; x += 16) {
      context.beginPath();
      context.moveTo(x, 333);
      context.lineTo(x, 374);
      context.stroke();
    }
    context.strokeStyle = "rgba(255,255,255,.52)";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(256, 205, 119, Math.PI * 1.08, Math.PI * 1.92);
    context.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
  }



  window.ILYOS_VISUAL_EDITOR = { apply, exportProfile: profile, validate };
})();
