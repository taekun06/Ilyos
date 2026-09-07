// Contrat du rendu temporaire avec les véritables objets Three.js, sans GPU.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const THREE = require('../vendor/three.min.js');
const source = fs.readFileSync(path.join(__dirname, '../js/visual-editor.js'), 'utf8');
const elements = new Map();
function element() {
  return { children: [], listeners: {}, classList: { toggle() {} },
    set id(id) { this._id = id; elements.set(id, this); }, get id() { return this._id; },
    append(...items) { this.children.push(...items); },
    setAttribute() {}, addEventListener(type, fn) { this.listeners[type] = fn; },
    querySelector(selector) { const id = selector.slice(1); if (!elements.has(id)) { const node = element(); node.id = id; } return elements.get(id); },
    getContext() { return new Proxy({}, { get: (_, key) => key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {} }); }
  };
}
const document = { currentScript: { src: 'http://localhost/js/visual-editor.js' }, createElement: element, head: element(), body: element() };
const window = { THREE };
const context = { window, document, THREE, URL, URLSearchParams, location: { search: '?visualEditor=1' }, performance, console, setTimeout };
vm.runInNewContext(source, context);
const api = window.ILYOS_VISUAL_EDITOR;
const change = (key, value) => { const input = elements.get('ve-' + key); input.value = String(value); input.checked = value; input.listeners.input(); };
const scene = new THREE.Scene();
const actionPreviewGroup = new THREE.Group(); scene.add(actionPreviewGroup);
const target = new THREE.Mesh(new THREE.TorusGeometry(.19, .026), new THREE.MeshBasicMaterial({ color: 0xd9743a, opacity: .68 }));
target.userData.visualRole = 'push.target'; actionPreviewGroup.add(target);
const hit = new THREE.Mesh(new THREE.SphereGeometry(.56), new THREE.MeshBasicMaterial({ opacity: .001 }));
hit.userData.ilyosInteraction = 'push-death-destination'; actionPreviewGroup.add(hit);
const state = { scene, actionPreviewGroup, renderer: { toneMappingExposure: .96 }, camera: new THREE.PerspectiveCamera() };
state.camera.position.set(4, 5, 8);
const original = { color: target.material.color.getHex(), opacity: target.material.opacity, scale: target.scale.clone() };
api.apply(state)();
assert.equal(target.material.color.getHex(), original.color);
change('push.target', '#00FF00'); change('push.size', 1.7); change('push.opacity', .5); change('scene.exposure', 1.2);
for (let i = 0; i < 100; i++) {
  const restore = api.apply(state);
  assert.equal(target.material.color.getHex(), 0x00ff00);
  assert.equal(target.scale.x, 1.7);
  assert.equal(target.material.opacity, .34);
  assert.equal(state.renderer.toneMappingExposure, 1.2);
  assert.equal(hit.scale.x, 1); assert.equal(hit.material.opacity, .001);
  restore();
  assert.equal(target.material.color.getHex(), original.color);
  assert.equal(target.material.opacity, original.opacity);
  assert.ok(target.scale.equals(original.scale));
  assert.equal(state.renderer.toneMappingExposure, .96);
}
const death = new THREE.Sprite(new THREE.SpriteMaterial()); death.userData.visualRole = 'death.sprite'; actionPreviewGroup.add(death);
change('death.style', 'ether');
let restore = api.apply(state);
assert.equal(death.visible, false);
const effect = scene.children.find(child => child !== actionPreviewGroup);
assert.ok(effect.visible);
restore(); assert.equal(death.visible, true); assert.equal(effect.visible, false);
let disposed = false; effect.children[0].geometry.addEventListener('dispose', () => { disposed = true; });
actionPreviewGroup.remove(death); api.apply(state)();
assert.equal(disposed, true); assert.equal(scene.children.length, 1);
elements.get('veEnabled').onchange({ target: { checked: false } });
restore = api.apply(state); assert.equal(target.material.color.getHex(), original.color); restore();
const exported = api.exportProfile(); assert.equal(api.validate(exported)['push.size'], 1.7);
for (const values of [{ 'push.size': 99 }, { 'scene.exposure': NaN }, { 'death.style': 'unknown' }, { 'push.target': 'red' }, { '__proto__.polluted': true }]) {
  assert.throws(() => api.validate({ schema: 'ilyos-visual-editor', version: 1, values }));
}
assert.throws(() => api.validate({ schema: 'ilyos-visual-editor', version: 2, values: {} }));
const normalWindow = {};
vm.runInNewContext(source, { window: normalWindow, location: { search: '' }, URLSearchParams });
assert.equal(normalWindow.ILYOS_VISUAL_EDITOR, undefined);
console.log('OK: rendu/restauration sur 100 frames, hitbox intacte, variante Éther, libération GPU, profils validés et mode normal inactif.');
