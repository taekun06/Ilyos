/* ILYOS — laboratoire visuel indépendant « Éther enchanté ».
   Cette page ne lit ni ne modifie l'état de partie. Les dimensions des effets,
   la caméra et l'éclairage reprennent js/game/kaykit3d.js (V75–V78). */
(() => {
  "use strict";

  const SPACING = .925;
  const BLOCK_SIZE = .932;
  const BLOCK_HEIGHT = .46;
  const BLOCK_Y = .05;
  const SURFACE_Y = BLOCK_Y + BLOCK_HEIGHT;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const PRESETS = {
    A: {
      label: "A · Réglage récupéré",
      zone: { bright: "#70FFF0", dark: "#0F6974", thickness: .075, veilOpacity: 0 },
      selection: { warm: "#FFE39A", ether: "#78FFF0", ringIntensity: 1.34, beamIntensity: .9, particleIntensity: 1.42 },
      push: {
        color: "#1B9A4D", destination: "#D8863F", link: "#F0A94F", highlight: "#FFE0A3",
        ringSize: .86, opacity: .46, linkIntensity: .62
      },
      death: { halo: "#E6A24B", spriteSize: .95, haloSize: 1.09, opacity: .9 }
    },
    B: {
      label: "B · Éther renforcé",
      zone: { bright: "#70FFF0", dark: "#0F6974", thickness: .052, veilOpacity: .22 },
      selection: { warm: "#FFE39A", ether: "#78FFF0", ringIntensity: 1.34, beamIntensity: 1.08, particleIntensity: 1.42 },
      push: {
        color: "#2AB966", destination: "#E19645", link: "#F5B55B", highlight: "#FFE7B3",
        ringSize: .96, opacity: .62, linkIntensity: .9
      },
      death: { halo: "#E6A24B", spriteSize: .9, haloSize: 1.38, opacity: .88 }
    }
  };

  const FIELDS = [
    { section: "ZONE", path: "zone.bright", label: "Couleur claire", type: "color" },
    { section: "ZONE", path: "zone.dark", label: "Couleur sombre", type: "color" },
    { section: "ZONE", path: "zone.thickness", label: "Épaisseur", type: "range", min: .015, max: .24, step: .005 },
    { section: "ZONE", path: "zone.veilOpacity", label: "Opacité du voile", type: "range", min: 0, max: .22, step: .005 },
    { section: "SÉLECTION", path: "selection.warm", label: "Couleur chaude", type: "color" },
    { section: "SÉLECTION", path: "selection.ether", label: "Couleur éther", type: "color" },
    { section: "SÉLECTION", path: "selection.ringIntensity", label: "Intensité anneau", type: "range", min: .2, max: 1.6, step: .01 },
    { section: "SÉLECTION", path: "selection.beamIntensity", label: "Intensité colonne", type: "range", min: 0, max: 2, step: .02 },
    { section: "SÉLECTION", path: "selection.particleIntensity", label: "Intensité particules", type: "range", min: 0, max: 2, step: .02 },
    { section: "POUSSÉE", path: "push.color", label: "Couleur cible", type: "color" },
    { section: "POUSSÉE", path: "push.destination", label: "Couleur destination", type: "color" },
    { section: "POUSSÉE", path: "push.link", label: "Couleur liaison", type: "color" },
    { section: "POUSSÉE", path: "push.highlight", label: "Destination survolée", type: "color" },
    { section: "POUSSÉE", path: "push.ringSize", label: "Taille anneau", type: "range", min: .65, max: 1.55, step: .01 },
    { section: "POUSSÉE", path: "push.opacity", label: "Opacité", type: "range", min: .15, max: 1, step: .01 },
    { section: "POUSSÉE", path: "push.linkIntensity", label: "Intensité liaison", type: "range", min: 0, max: 1.8, step: .02 },
    { section: "☠ CHUTE", path: "death.halo", label: "Couleur halo", type: "color" },
    { section: "☠ CHUTE", path: "death.spriteSize", label: "Taille sprite", type: "range", min: .35, max: 1.3, step: .01 },
    { section: "☠ CHUTE", path: "death.haloSize", label: "Taille halo", type: "range", min: .65, max: 1.55, step: .01 },
    { section: "☠ CHUTE", path: "death.opacity", label: "Opacité", type: "range", min: .15, max: 1, step: .01 }
  ];

  const state = {
    activePreset: "A",
    values: clone(PRESETS.A),
    ready: false,
    sceneObjects: {},
    labels: {},
    mixers: [],
    particles: [],
    lastTime: performance.now()
  };

  const dom = {
    viewport: document.getElementById("etherViewport"),
    canvas: document.getElementById("etherCanvas"),
    status: document.getElementById("renderStatus"),
    groups: document.getElementById("tuningGroups"),
    presetLabel: document.getElementById("activePresetLabel"),
    valuesOutput: document.getElementById("valuesOutput"),
    copy: document.getElementById("copyValues"),
    resetCamera: document.getElementById("resetCamera"),
    protocolWarning: document.getElementById("protocolWarning")
  };

  if (!window.THREE || !THREE.GLTFLoader) {
    showError("Three.js ou GLTFLoader est indisponible.");
    return;
  }

  if (location.protocol === "file:") dom.protocolWarning.hidden = false;

  buildControls();
  bindInterface();

  const renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .96;
  renderer.physicallyCorrectLights = false;
  renderer.setClearColor(0x1f3a5c, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x1f3a5c, 44, 145);
  const camera = new THREE.PerspectiveCamera(33, 1, .1, 460);
  const cameraHome = new THREE.Vector3(6.9, 8.35, 7.65);
  const cameraTarget = new THREE.Vector3(.42, .18, -.04);
  camera.position.copy(cameraHome);
  camera.lookAt(cameraTarget);

  const controls = new THREE.OrbitControls(camera, dom.canvas);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = .11;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.panSpeed = .92;
  controls.rotateSpeed = .82;
  controls.zoomSpeed = .82;
  controls.minDistance = 6.4;
  controls.maxDistance = 25;
  controls.maxPolarAngle = Math.PI * .49;
  controls.target.copy(cameraTarget);

  addSky();
  addLighting();

  const world = new THREE.Group();
  scene.add(world);
  const staticGroup = new THREE.Group();
  const characterGroup = new THREE.Group();
  const fxGroup = new THREE.Group();
  world.add(staticGroup, characterGroup, fxGroup);

  const loader = new THREE.GLTFLoader();
  loader.setCrossOrigin("anonymous");

  const bloom = createBloomPipeline(renderer);

  Promise.all([
    loadGLTF("./assets/kaykit/blockBits/dirt_with_grass.gltf"),
    loadGLTF("./assets/kaykit/characters/Knight.glb"),
    loadGLTF("./assets/kaykit/characters/Mage.glb")
  ]).then(([block, knight, mage]) => {
    buildTiles(block.scene);
    buildCharacters(knight, mage);
    buildFeedbacks();
    state.ready = true;
    dom.status.textContent = "KayKit local prêt · 2 gardiens · 20 blocs · feedbacks actifs";
    dom.status.classList.add("is-ready");
    updateVisuals();
    resize();
  }).catch(error => {
    console.error("[ETHER PREVIEW]", error);
    showError("Impossible de charger les assets KayKit locaux. Ouvrez la page via npm start.");
  });

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(dom.viewport);
  window.addEventListener("resize", resize, { passive: true });
  requestAnimationFrame(animate);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getPath(object, path) {
    return path.split(".").reduce((value, key) => value[key], object);
  }

  function setPath(object, path, value) {
    const keys = path.split(".");
    const leaf = keys.pop();
    const target = keys.reduce((entry, key) => entry[key], object);
    target[leaf] = value;
  }

  function buildControls() {
    const sections = [...new Set(FIELDS.map(field => field.section))];
    sections.forEach(sectionName => {
      const section = document.createElement("section");
      section.className = "tuning-section";
      const heading = document.createElement("h2");
      heading.textContent = sectionName;
      section.appendChild(heading);

      FIELDS.filter(field => field.section === sectionName).forEach(field => {
        const row = document.createElement("div");
        row.className = "control-row";
        const label = document.createElement("label");
        const id = `tuning-${field.path.replace(".", "-")}`;
        label.htmlFor = id;
        label.textContent = field.label;
        const input = document.createElement("input");
        input.id = id;
        input.type = field.type;
        input.dataset.path = field.path;
        if (field.type === "range") {
          input.min = field.min;
          input.max = field.max;
          input.step = field.step;
          const value = document.createElement("output");
          value.className = "control-value";
          value.htmlFor = id;
          value.dataset.valueFor = field.path;
          row.append(label, value, input);
        } else {
          row.append(label, input);
        }
        section.appendChild(row);
      });
      dom.groups.appendChild(section);
    });
    syncControls();
  }

  function bindInterface() {
    document.querySelectorAll("[data-preset]").forEach(button => {
      button.addEventListener("click", () => applyPreset(button.dataset.preset));
    });

    dom.groups.addEventListener("input", event => {
      const input = event.target.closest("input[data-path]");
      if (!input) return;
      const value = input.type === "color" ? input.value.toUpperCase() : Number(input.value);
      setPath(state.values, input.dataset.path, value);
      state.activePreset = "custom";
      dom.presetLabel.textContent = "Réglage personnalisé";
      document.querySelectorAll("[data-preset]").forEach(button => {
        button.classList.remove("is-active");
        button.setAttribute("aria-pressed", "false");
      });
      syncControls(false);
      updateVisuals();
    });

    dom.copy.addEventListener("click", copyValues);
    dom.resetCamera.addEventListener("click", () => {
      camera.position.copy(cameraHome);
      controls.target.copy(cameraTarget);
      controls.update();
      render();
    });
  }

  function applyPreset(key) {
    if (!PRESETS[key]) return;
    state.activePreset = key;
    state.values = clone(PRESETS[key]);
    dom.presetLabel.textContent = PRESETS[key].label;
    document.querySelectorAll("[data-preset]").forEach(button => {
      const active = button.dataset.preset === key;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    dom.valuesOutput.classList.remove("is-visible");
    syncControls();
    updateVisuals();
  }

  function syncControls(writeInputs = true) {
    FIELDS.forEach(field => {
      const input = dom.groups.querySelector(`[data-path="${field.path}"]`);
      const value = getPath(state.values, field.path);
      if (writeInputs && input) input.value = value;
      const output = dom.groups.querySelector(`[data-value-for="${field.path}"]`);
      if (output) output.value = Number(value).toFixed(field.step && field.step < .01 ? 3 : 2);
    });
    const root = document.documentElement;
    root.style.setProperty("--warm", state.values.selection.warm);
    root.style.setProperty("--ether", state.values.selection.ether);
    root.style.setProperty("--zone-dark", state.values.zone.dark);
    root.style.setProperty("--push", state.values.push.destination);
    root.style.setProperty("--death", state.values.death.halo);
  }

  async function copyValues() {
    const payload = {
      preset: state.activePreset,
      zone: state.values.zone,
      selection: state.values.selection,
      push: state.values.push,
      death: state.values.death
    };
    const text = JSON.stringify(payload, null, 2);
    dom.valuesOutput.textContent = text;
    dom.valuesOutput.classList.add("is-visible");
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    dom.copy.textContent = "VALEURS COPIÉES";
    dom.copy.classList.add("is-copied");
    window.setTimeout(() => {
      dom.copy.textContent = "COPIER LES VALEURS";
      dom.copy.classList.remove("is-copied");
    }, 1400);
  }

  function loadGLTF(url) {
    return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
  }

  function addSky() {
    const uniforms = {
      topColor: { value: new THREE.Color(0x132a4a) },
      middleColor: { value: new THREE.Color(0x35597f) },
      bottomColor: { value: new THREE.Color(0x0e1c30) }
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(150, 40, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms,
        vertexShader: "varying vec3 vWorld; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }",
        fragmentShader: "uniform vec3 topColor; uniform vec3 middleColor; uniform vec3 bottomColor; varying vec3 vWorld; void main(){ float h=normalize(vWorld).y*.5+.5; vec3 low=mix(bottomColor,middleColor,smoothstep(0.12,.50,h)); vec3 col=mix(low,topColor,smoothstep(.50,.92,h)); gl_FragColor=vec4(col,1.0); }"
      })
    );
    sky.frustumCulled = false;
    scene.add(sky);
  }

  function addLighting() {
    scene.add(new THREE.AmbientLight(0xfff7ec, .16));
    scene.add(new THREE.HemisphereLight(0xeef5f7, 0x56666a, .58));
    const sun = new THREE.DirectionalLight(0xffeed2, 2.05);
    sun.position.set(-6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.shadow.camera.near = .5;
    sun.shadow.camera.far = 35;
    sun.shadow.bias = -.0004;
    sun.shadow.normalBias = .014;
    sun.shadow.radius = 1.75;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xb7d9e0, .16);
    fill.position.set(8, 5, -8);
    scene.add(fill);
    const front = new THREE.DirectionalLight(0xfffbf1, .12);
    front.position.set(0, 6, 10);
    scene.add(front);
  }

  function cloneNormalized(source, options) {
    let clone;
    try {
      clone = THREE.SkeletonUtils?.clone ? THREE.SkeletonUtils.clone(source) : source.clone(true);
    } catch (_) {
      clone = source.clone(true);
    }
    const wrapper = new THREE.Group();
    wrapper.add(clone);
    clone.traverse(child => {
      if (!child.isMesh) return;
      if (child.material) {
        child.material = Array.isArray(child.material)
          ? child.material.map(material => material.clone())
          : child.material.clone();
      }
      child.castShadow = true;
      child.receiveShadow = true;
    });
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    if (options.exactWidth != null) {
      clone.scale.set(
        options.exactWidth / Math.max(size.x, .001),
        options.exactHeight / Math.max(size.y, .001),
        options.exactDepth / Math.max(size.z, .001)
      );
    } else {
      const scale = Math.min(options.maxWidth / Math.max(size.x, size.z, .001), options.maxHeight / Math.max(size.y, .001));
      clone.scale.setScalar(scale);
    }
    const scaledBox = new THREE.Box3().setFromObject(clone);
    const center = scaledBox.getCenter(new THREE.Vector3());
    clone.position.x -= center.x;
    clone.position.z -= center.z;
    clone.position.y += (options.targetFloor || 0) - scaledBox.min.y;
    return wrapper;
  }

  function cellPosition(r, c, y = 0) {
    return new THREE.Vector3(c * SPACING, y, r * SPACING);
  }

  function buildTiles(blockSource) {
    const tileCells = [];
    for (let r = -2; r <= 1; r++) {
      for (let c = -2; c <= 2; c++) tileCells.push([r, c]);
    }
    tileCells.forEach(([r, c]) => {
      const block = cloneNormalized(blockSource, {
        exactWidth: BLOCK_SIZE,
        exactDepth: BLOCK_SIZE,
        exactHeight: BLOCK_HEIGHT,
        targetFloor: 0
      });
      const p = cellPosition(r, c, BLOCK_Y);
      block.position.copy(p);
      staticGroup.add(block);
    });
  }

  function buildCharacters(knightGltf, mageGltf) {
    const selected = cloneNormalized(knightGltf.scene, { maxWidth: .63, maxHeight: 1.02, targetFloor: 0 });
    selected.position.copy(cellPosition(0, 0, SURFACE_Y));
    selected.rotation.y = Math.PI;
    characterGroup.add(selected);
    state.sceneObjects.selectedCharacter = selected;
    state.labels.selected = { position: cellPosition(0, 0, SURFACE_Y + 1.25), offset: [-12, -18] };
    addIdleAnimation(knightGltf, selected);

    const opponent = cloneNormalized(mageGltf.scene, { maxWidth: .63, maxHeight: 1.02, targetFloor: 0 });
    opponent.position.copy(cellPosition(0, 1, SURFACE_Y));
    opponent.rotation.y = -Math.PI / 2;
    characterGroup.add(opponent);
    state.sceneObjects.opponent = opponent;
    state.labels.push = { position: cellPosition(0, 1, SURFACE_Y + 1.14), offset: [36, -6] };
    addIdleAnimation(mageGltf, opponent);
  }

  function addIdleAnimation(gltf, wrapper) {
    const model = wrapper.children[0] || wrapper;
    const clip = gltf.animations?.find(item => /idle/i.test(item.name)) || gltf.animations?.[0];
    if (!clip) return;
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(clip);
    action.play();
    action.time = Math.random() * Math.max(.01, clip.duration);
    state.mixers.push(mixer);
  }

  function makeGlowTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(.35, "rgba(255,255,255,.85)");
    gradient.addColorStop(.65, "rgba(255,255,255,.32)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
  }

  function makeBeamTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 128, 0, 0);
    gradient.addColorStop(0, "rgba(255,255,255,.9)");
    gradient.addColorStop(.18, "rgba(255,255,255,.6)");
    gradient.addColorStop(.6, "rgba(255,255,255,.18)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 8, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
  }

  function buildFeedbacks() {
    buildMoveZone();
    buildSelection();
    buildPushFeedbacks();
    buildDeathFeedback();
  }

  function buildSelection() {
    const group = new THREE.Group();
    group.position.copy(cellPosition(0, 0, SURFACE_Y));

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(.35, .014, 8, 56),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: .95, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = .04;
    group.add(ring);

    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(.275, .008, 8, 48),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: .62, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = .045;
    group.add(innerRing);

    const marks = new THREE.Group();
    for (let index = 0; index < 4; index++) {
      const mark = new THREE.Mesh(
        new THREE.PlaneGeometry(.09, .018),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: .85, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false })
      );
      const angle = index * Math.PI / 2;
      mark.rotation.x = -Math.PI / 2;
      mark.rotation.z = angle;
      mark.position.set(Math.cos(angle) * .405, .05, Math.sin(angle) * .405);
      marks.add(mark);
    }
    group.add(marks);

    const beamHeight = 1.35;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(.022, .075, beamHeight, 16, 1, true),
      new THREE.MeshBasicMaterial({
        map: makeBeamTexture(), transparent: true, opacity: .16, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.FrontSide, toneMapped: false
      })
    );
    beam.position.y = beamHeight / 2;
    group.add(beam);

    const glowMap = makeGlowTexture();
    const particles = [];
    const particleCount = reducedMotion ? 0 : 12;
    for (let index = 0; index < particleCount; index++) {
      const particle = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowMap, transparent: true, opacity: .85, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false
      }));
      particle.userData.baseAngle = (index / particleCount) * Math.PI * 2;
      particle.userData.radius = .14 + (index % 3) * .075;
      particle.userData.phase = index * .43;
      particle.scale.setScalar(.052 + (index % 2) * .016);
      group.add(particle);
      particles.push(particle);
    }

    const light = new THREE.PointLight(0xffffff, .38, 1.9, 2);
    light.position.y = .62;
    group.add(light);
    fxGroup.add(group);
    state.sceneObjects.selection = { group, ring, innerRing, marks, beam, particles, light };
    state.particles = particles;
  }

  function buildMoveZone() {
    const cells = [
      [-2, -1], [-2, 0],
      [-1, -2], [-1, -1], [-1, 0], [-1, 1],
      [0, -2], [0, -1], [0, 0],
      [1, -1], [1, 0]
    ];
    const group = new THREE.Group();
    const veilPositions = [];
    const half = SPACING / 2;
    cells.forEach(([r, c]) => {
      const center = cellPosition(r, c, SURFACE_Y + .024);
      veilPositions.push(
        center.x - half, center.y, center.z - half,
        center.x + half, center.y, center.z - half,
        center.x + half, center.y, center.z + half,
        center.x - half, center.y, center.z - half,
        center.x + half, center.y, center.z + half,
        center.x - half, center.y, center.z + half
      );
    });
    const veilGeometry = new THREE.BufferGeometry();
    veilGeometry.setAttribute("position", new THREE.Float32BufferAttribute(veilPositions, 3));
    veilGeometry.computeVertexNormals();
    const veil = new THREE.Mesh(veilGeometry, new THREE.MeshBasicMaterial({
      transparent: true, opacity: .055, depthWrite: false, depthTest: false, side: THREE.DoubleSide
    }));
    veil.renderOrder = 17;
    group.add(veil);

    const cellSet = new Set(cells.map(([r, c]) => `${r},${c}`));
    const edges = [];
    cells.forEach(([r, c]) => {
      const x = c * SPACING;
      const z = r * SPACING;
      if (!cellSet.has(`${r - 1},${c}`)) edges.push([x - half, z - half, x + half, z - half]);
      if (!cellSet.has(`${r + 1},${c}`)) edges.push([x - half, z + half, x + half, z + half]);
      if (!cellSet.has(`${r},${c - 1}`)) edges.push([x - half, z - half, x - half, z + half]);
      if (!cellSet.has(`${r},${c + 1}`)) edges.push([x + half, z - half, x + half, z + half]);
    });

    const darkRibbons = [];
    const brightRibbons = [];
    edges.forEach(([x1, z1, x2, z2]) => {
      darkRibbons.push(makeRibbon(x1, z1, x2, z2, SURFACE_Y + .028, .075));
      brightRibbons.push(makeRibbon(x1, z1, x2, z2, SURFACE_Y + .032, .038));
    });
    darkRibbons.forEach(mesh => group.add(mesh));
    brightRibbons.forEach(mesh => group.add(mesh));
    fxGroup.add(group);
    state.sceneObjects.zone = { group, veil, darkRibbons, brightRibbons };
  }

  function makeRibbon(x1, z1, x2, z2, y, thickness) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(length + thickness, 1), material);
    ribbon.scale.y = thickness;
    ribbon.rotation.x = -Math.PI / 2;
    ribbon.rotation.z = -Math.atan2(dz, dx);
    ribbon.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
    ribbon.renderOrder = y > SURFACE_Y + .03 ? 20 : 19;
    return ribbon;
  }

  function buildPushFeedbacks() {
    const target = makeTorus(.19, .026, .68);
    target.position.copy(cellPosition(0, 1, SURFACE_Y + .024));
    fxGroup.add(target);

    const normal = makeTorus(.22, .035, .78, false);
    normal.position.copy(cellPosition(0, 2, SURFACE_Y + .04));
    fxGroup.add(normal);
    state.labels.normal = { position: cellPosition(0, 2, SURFACE_Y + .14), offset: [52, 33] };

    const highlight = makeTorus(.22, .035, 1, false);
    highlight.position.copy(cellPosition(1, 2, SURFACE_Y + .04));
    highlight.scale.setScalar(1.12);
    fxGroup.add(highlight);
    state.labels.highlight = { position: cellPosition(1, 2, SURFACE_Y + .14), offset: [58, 48] };

    const targetOuter = makeTorus(.25, .01, .58, false);
    targetOuter.position.copy(target.position).add(new THREE.Vector3(0, .006, 0));
    fxGroup.add(targetOuter);

    const links = [
      makePushLink(cellPosition(0, 0), cellPosition(0, 2)),
      makePushLink(cellPosition(0, 1), cellPosition(1, 2))
    ];
    links.forEach(link => fxGroup.add(link));

    const destinationGlows = [normal, highlight].map(ring => {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture(), transparent: true, opacity: .75, blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: false, toneMapped: false
      }));
      glow.position.copy(ring.position).add(new THREE.Vector3(0, .025, 0));
      glow.scale.setScalar(.075);
      glow.renderOrder = 60;
      fxGroup.add(glow);
      return glow;
    });

    const destinationOuters = [normal, highlight].map((ring, index) => {
      const outer = makeTorus(index ? .315 : .29, .008, index ? .72 : .5, false);
      outer.position.copy(ring.position).add(new THREE.Vector3(0, .009, 0));
      fxGroup.add(outer);
      return outer;
    });

    state.sceneObjects.push = { target, targetOuter, normal, highlight, links, destinationGlows, destinationOuters };
  }

  function makePushLink(from, to) {
    const group = new THREE.Group();
    const y = SURFACE_Y + .052;
    const underglow = makeRibbon(from.x, from.z, to.x, to.z, y, .072);
    underglow.material.blending = THREE.AdditiveBlending;
    underglow.material.opacity = .32;
    const core = makeRibbon(from.x, from.z, to.x, to.z, y + .004, .018);
    core.material.blending = THREE.NormalBlending;
    core.material.opacity = .96;
    group.add(underglow, core);
    group.userData = { underglow, core };
    return group;
  }

  function makeTorus(radius, tube, opacity, depthTest = true) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 10, 32),
      new THREE.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false, depthTest, side: THREE.DoubleSide, toneMapped: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 58;
    return ring;
  }

  function buildDeathFeedback() {
    const position = cellPosition(-.15, 3.25, 1.25);
    const group = new THREE.Group();
    group.position.copy(position);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(.62, .022, 10, 72),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: .48, depthWrite: false, depthTest: false, toneMapped: false })
    );
    halo.renderOrder = 57;
    group.add(halo);

    const innerHalo = new THREE.Mesh(
      new THREE.TorusGeometry(.47, .009, 8, 64),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: .36, depthWrite: false, depthTest: false, toneMapped: false })
    );
    innerHalo.renderOrder = 58;
    group.add(innerHalo);

    const spriteMaterial = new THREE.SpriteMaterial({ transparent: true, opacity: .88, depthWrite: false, depthTest: false, toneMapped: false });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.setScalar(.82);
    sprite.renderOrder = 59;
    group.add(sprite);

    const runePoints = [];
    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2;
      const radius = .55;
      runePoints.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, .006));
      runePoints.push(new THREE.Vector3(Math.cos(angle) * (radius + .075), Math.sin(angle) * (radius + .075), .006));
    }
    const runes = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(runePoints),
      new THREE.LineBasicMaterial({ transparent: true, opacity: .34, depthWrite: false, depthTest: false })
    );
    group.add(runes);

    fxGroup.add(group);
    state.sceneObjects.death = { group, halo, innerHalo, sprite, runes, texture: null };
    state.labels.death = { position: position.clone().add(new THREE.Vector3(0, .78, 0)), offset: [18, -2] };
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

  function updateVisuals() {
    syncControls(false);
    if (!state.ready) return;
    const values = state.values;
    const selection = state.sceneObjects.selection;
    selection.ring.material.color.set(values.selection.warm);
    selection.ring.material.opacity = Math.min(1, values.selection.ringIntensity);
    selection.ring.scale.setScalar(1 + Math.max(0, values.selection.ringIntensity - 1) * .08);
    selection.innerRing.material.color.set(values.selection.ether);
    selection.innerRing.material.opacity = Math.min(.82, .45 * values.selection.ringIntensity);
    selection.marks.children.forEach(mark => {
      mark.material.color.set(values.selection.warm);
      mark.material.opacity = Math.min(1, .72 * values.selection.ringIntensity);
    });
    selection.beam.material.color.set(values.selection.ether);
    selection.beam.material.opacity = .16 * values.selection.beamIntensity;
    selection.light.color.set(values.selection.warm);
    selection.light.intensity = .38 * values.selection.ringIntensity;
    selection.particles.forEach(particle => particle.material.color.set(values.selection.ether));

    const zone = state.sceneObjects.zone;
    zone.veil.material.color.set(values.zone.bright);
    zone.veil.material.opacity = values.zone.veilOpacity;
    zone.darkRibbons.forEach(ribbon => {
      ribbon.material.color.set(values.zone.dark);
      ribbon.material.opacity = .85;
      ribbon.scale.y = values.zone.thickness + .032;
    });
    zone.brightRibbons.forEach(ribbon => {
      ribbon.material.color.set(values.zone.bright);
      ribbon.material.opacity = 1;
      ribbon.scale.y = values.zone.thickness;
    });

    const push = state.sceneObjects.push;
    push.target.material.color.set(values.push.color);
    push.target.material.opacity = values.push.opacity;
    push.target.scale.setScalar(values.push.ringSize);
    push.normal.material.color.set(values.push.destination);
    push.normal.material.opacity = .48 + values.push.opacity * .4;
    push.normal.scale.setScalar(values.push.ringSize);
    push.highlight.material.color.set(values.push.destination);
    push.highlight.material.opacity = .68 + values.push.opacity * .28;
    push.highlight.scale.setScalar(values.push.ringSize * 1.12);
    push.targetOuter.material.color.set(values.push.color);
    push.targetOuter.material.opacity = values.push.opacity * .62;
    push.targetOuter.scale.setScalar(values.push.ringSize);
    push.links.forEach(link => {
      link.userData.underglow.material.color.set(values.push.destination);
      link.userData.underglow.material.opacity = .28 * values.push.linkIntensity;
      link.userData.core.material.color.set(values.push.link);
      link.userData.core.material.opacity = Math.min(1, .88 * values.push.linkIntensity);
    });
    push.destinationGlows.forEach((glow, index) => {
      glow.material.color.set(values.push.link);
      glow.material.opacity = index ? .82 : .72;
    });
    push.destinationOuters.forEach((outer, index) => {
      outer.material.color.set(index ? values.push.highlight : values.push.destination);
      outer.material.opacity = index ? .62 : .42;
    });

    const death = state.sceneObjects.death;
    death.halo.material.color.set(values.death.halo);
    death.halo.material.opacity = values.death.opacity;
    death.halo.scale.setScalar(values.death.haloSize);
    death.innerHalo.material.color.set(values.death.halo);
    death.innerHalo.material.opacity = values.death.opacity * .62;
    death.innerHalo.scale.setScalar(values.death.haloSize);
    death.runes.material.color.set(values.death.halo);
    death.runes.material.opacity = values.death.opacity * .7;
    death.runes.scale.setScalar(values.death.haloSize);
    death.sprite.scale.setScalar(values.death.spriteSize);
    death.sprite.material.opacity = Math.min(1, .55 + values.death.opacity * .7);
    if (death.texture) death.texture.dispose();
    death.texture = makeDeathTexture(values.death.halo);
    death.sprite.material.map = death.texture;
    death.sprite.material.needsUpdate = true;
    render();
  }

  function resize() {
    const width = Math.max(1, dom.viewport.clientWidth);
    const height = Math.max(1, dom.viewport.clientHeight);
    const pixelRatio = renderer.getPixelRatio();
    const expectedWidth = Math.floor(width * pixelRatio);
    const expectedHeight = Math.floor(height * pixelRatio);
    if (dom.canvas.width !== expectedWidth || dom.canvas.height !== expectedHeight) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      bloom.resize(width, height);
    }
    render();
  }

  function animate(now) {
    requestAnimationFrame(animate);
    const delta = Math.min(.05, (now - state.lastTime) / 1000);
    state.lastTime = now;
    if (document.hidden) return;
    if (!reducedMotion) {
      state.mixers.forEach(mixer => mixer.update(delta));
      const elapsed = now / 1000;
      const selection = state.sceneObjects.selection;
      if (selection) {
        const breathe = Math.sin(elapsed * 2.1);
        selection.ring.rotation.z = elapsed * .16;
        selection.innerRing.rotation.z = -elapsed * .11;
        selection.marks.rotation.y = elapsed * .12;
        selection.beam.material.opacity = (.14 + breathe * .04) * state.values.selection.beamIntensity;
        selection.particles.forEach(particle => {
          const cycle = ((elapsed * .35 + particle.userData.phase) % 2 + 2) % 2;
          const fade = cycle < 1 ? cycle : 2 - cycle;
          const angle = particle.userData.baseAngle + elapsed * .5;
          particle.position.set(Math.cos(angle) * particle.userData.radius, .06 + cycle * .55, Math.sin(angle) * particle.userData.radius);
          particle.material.opacity = Math.min(1, fade * .85 * state.values.selection.particleIntensity);
        });
      }
      const death = state.sceneObjects.death;
      if (death) {
        death.runes.rotation.z = elapsed * .13;
        death.innerHalo.rotation.z = -elapsed * .07;
      }
    }
    const death = state.sceneObjects.death;
    if (death) death.group.lookAt(camera.position);
    controls.update();
    updateLabels();
    render();
  }

  function updateLabels() {
    const rect = dom.viewport.getBoundingClientRect();
    Object.entries(state.labels).forEach(([name, anchor]) => {
      let label = document.querySelector(`[data-anchor="${name}"]`);
      if (!label) return;
      const projected = anchor.position.clone().project(camera);
      const visible = projected.z > -1 && projected.z < 1;
      label.classList.toggle("is-visible", visible && state.ready);
      if (!visible) return;
      const x = (projected.x * .5 + .5) * rect.width + anchor.offset[0];
      const y = (-projected.y * .5 + .5) * rect.height + anchor.offset[1];
      label.style.left = `${x}px`;
      label.style.top = `${y}px`;
    });
  }

  function render() {
    if (bloom.render(scene, camera)) return;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }

  function showError(message) {
    dom.status.textContent = message;
    dom.status.classList.add("is-error");
  }

  function createBloomPipeline(webglRenderer) {
    const config = { enabled: true, threshold: .90, softness: .10, strength: .46, scale: .5, radius: 1 };
    const supported = !!(webglRenderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget);
    const data = { width: 0, height: 0, sceneTarget: null, a: null, b: null, camera: null, quad: null, threshold: null, blur: null, compose: null };

    const shader = (uniforms, fragmentShader) => new THREE.ShaderMaterial({
      uniforms,
      vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}",
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      transparent: false
    });

    function ensure(width, height) {
      if (!supported || !config.enabled) return false;
      const renderWidth = Math.max(2, Math.floor(width * webglRenderer.getPixelRatio()));
      const renderHeight = Math.max(2, Math.floor(height * webglRenderer.getPixelRatio()));
      const lowWidth = Math.max(2, Math.floor(renderWidth * config.scale));
      const lowHeight = Math.max(2, Math.floor(renderHeight * config.scale));
      const options = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, stencilBuffer: false };
      if (!data.sceneTarget) {
        data.sceneTarget = new THREE.WebGLMultisampleRenderTarget(renderWidth, renderHeight, { ...options, depthBuffer: true });
        data.sceneTarget.samples = 4;
        data.sceneTarget.texture.encoding = webglRenderer.outputEncoding;
        data.a = new THREE.WebGLRenderTarget(lowWidth, lowHeight, { ...options, depthBuffer: false });
        data.b = new THREE.WebGLRenderTarget(lowWidth, lowHeight, { ...options, depthBuffer: false });
        data.a.texture.encoding = webglRenderer.outputEncoding;
        data.b.texture.encoding = webglRenderer.outputEncoding;
        data.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        data.threshold = shader(
          { tSource: { value: null }, uThreshold: { value: config.threshold }, uSoftness: { value: config.softness } },
          "uniform sampler2D tSource; uniform float uThreshold; uniform float uSoftness; varying vec2 vUv; void main(){vec3 c=texture2D(tSource,vUv).rgb;float l=dot(c,vec3(.2126,.7152,.0722));float f=smoothstep(uThreshold,uThreshold+uSoftness,l);gl_FragColor=vec4(c*f,1.0);}"
        );
        data.blur = shader(
          { tSource: { value: null }, uDirection: { value: new THREE.Vector2() } },
          "uniform sampler2D tSource; uniform vec2 uDirection; varying vec2 vUv; void main(){vec3 s=texture2D(tSource,vUv).rgb*.227027027;s+=texture2D(tSource,vUv+uDirection*1.3846153846).rgb*.3162162162;s+=texture2D(tSource,vUv-uDirection*1.3846153846).rgb*.3162162162;s+=texture2D(tSource,vUv+uDirection*3.2307692308).rgb*.0702702703;s+=texture2D(tSource,vUv-uDirection*3.2307692308).rgb*.0702702703;gl_FragColor=vec4(s,1.0);}"
        );
        data.compose = shader(
          { tScene: { value: null }, tBloom: { value: null }, uStrength: { value: config.strength } },
          "uniform sampler2D tScene;uniform sampler2D tBloom;uniform float uStrength;varying vec2 vUv;void main(){vec4 base=texture2D(tScene,vUv);vec3 glow=texture2D(tBloom,vUv).rgb;gl_FragColor=vec4(base.rgb+glow*uStrength,base.a);}"
        );
        data.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), data.threshold);
        data.quad.frustumCulled = false;
      } else {
        data.sceneTarget.setSize(renderWidth, renderHeight);
        data.a.setSize(lowWidth, lowHeight);
        data.b.setSize(lowWidth, lowHeight);
      }
      data.width = renderWidth;
      data.height = renderHeight;
      return true;
    }

    function pass(material, target) {
      data.quad.material = material;
      webglRenderer.setRenderTarget(target);
      webglRenderer.clear();
      webglRenderer.render(data.quad, data.camera);
    }

    return {
      resize(width, height) { ensure(width, height); },
      render(renderScene, renderCamera) {
        if (!supported || !data.sceneTarget) return false;
        webglRenderer.setRenderTarget(data.sceneTarget);
        webglRenderer.clear();
        webglRenderer.render(renderScene, renderCamera);
        data.threshold.uniforms.tSource.value = data.sceneTarget.texture;
        pass(data.threshold, data.a);
        data.blur.uniforms.tSource.value = data.a.texture;
        data.blur.uniforms.uDirection.value.set(config.radius / data.a.width, 0);
        pass(data.blur, data.b);
        data.blur.uniforms.tSource.value = data.b.texture;
        data.blur.uniforms.uDirection.value.set(0, config.radius / data.a.height);
        pass(data.blur, data.a);
        data.compose.uniforms.tScene.value = data.sceneTarget.texture;
        data.compose.uniforms.tBloom.value = data.a.texture;
        pass(data.compose, null);
        return true;
      }
    };
  }
})();
