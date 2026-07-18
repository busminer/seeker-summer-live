import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ---------- palette: Seeker Summer golden hour ---------- */
const PAL = {
  skyTop: '#1b0830', skyMid: '#7a1f66', horizon: '#ff5e00', sunCore: '#fff3c9', sunGlow: '#ff8c3a',
  ocean: '#0a2540', oceanDeep: '#071226', foam: '#8feaff',
  sand: '#c98a5e', promenade: '#2b1230',
  summer: '#7fe8d9', staking: '#ffc36b', pending: '#f25386', violet: '#713b83',
  palmDark: '#150a22', rockDark: '#1c0f2a'
};
const COLORS = {
  summer: new THREE.Color(PAL.summer),
  staking: new THREE.Color(PAL.staking),
  pending: new THREE.Color(PAL.pending),
  violet: new THREE.Color(PAL.violet)
};
const HEX = { summer: PAL.summer, staking: PAL.staking, pending: PAL.pending };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(max-width: 760px)').matches;
const CITY_X = mobile ? 11.2 : 13.5;
const CITY_Z = -24;
const fmt = new Intl.NumberFormat('en-US');
const root = document.querySelector('#webgl');
const ui = Object.fromEntries(['loader','loaderText','loaderBar','summerCount','stakingCount','pendingCount','summerMeter','stakingMeter','claimCount','claimed','staked','arrival','arrivalCity','arrivalName','arrivalAmount','status','fps','summerTotal','stakingTotal','onlineBadge','onlineCount'].map(id => [id, document.querySelector(`#${id}`)]));

const W = {
  scene: null, camera: null, renderer: null, labels: null, composer: null, bloom: null,
  clock: new THREE.Clock(), pointer: new THREE.Vector2(), pointerSmooth: new THREE.Vector2(), raycaster: new THREE.Raycaster(),
  commonCurve: null, summerCurve: null, stakingCurve: null,
  pulses: [], residents: [], active: [], queue: [], pendingResidents: [], seen: new Set(),
  population: null, populationCount: 0, cityRings: [], kinetic: [], stringLights: [], clouds: [], birds: null, birdTimer: 14,
  shootingStar: null, starTimer: 34, palms: [], umbrellas: [],
  chillSpots: [], workCenter: new THREE.Vector3(), vaultPos: new THREE.Vector3(),
  first: true, state: null, lastSpawn: 0, frames: 0, fpsTime: 0, lastFps: 0,
  world: new THREE.Group(), phoneMeshes: [], hovered: null, pointerActive: false, time: 0
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rngFor = seed => { let n = hash(seed) || 1; return () => ((n = Math.imul(n ^ n >>> 15, 1 | n)) ^ n + Math.imul(n ^ n >>> 7, 61 | n), ((n ^ n >>> 14) >>> 0) / 4294967296); };
const idOf = c => c.signature || c.sig || `${c.claimer || c.owner}-${c.amount}-${c.blockTime || c.timestamp}`;
const routeOf = c => c.route === 'staking' || c.staked === true ? 'staking' : c.route === 'summer' || c.staked === false ? 'summer' : 'pending';
const nameOf = c => c.domain || c.name || c.skrDomain || `${String(c.claimer || c.owner || 'seeker').slice(0, 5)}…${String(c.claimer || c.owner || '').slice(-3)}`;
const validSolscan = u => typeof u === 'string' && u.startsWith('https://solscan.io/tx/');
const amountOf = c => Number(c.amount) || 0;

function loadStep(percent, text) { ui.loaderBar.style.width = `${percent}%`; ui.loaderText.textContent = text; }

async function init() {
  loadStep(10, 'WARMING UP THE SUN');
  await document.fonts.ready;
  setupRenderer();
  loadStep(30, 'POURING THE OCEAN');
  buildWorld();
  loadStep(58, 'OPENING BOTH CITIES');
  buildAtmosphere();
  bindInteraction();
  resize();
  loadStep(76, 'CONNECTING LIVE CLAIMS');
  await fetchState();
  loadStep(100, 'GOLDEN HOUR IS LIVE');
  setTimeout(() => ui.loader.classList.add('hidden'), 450);
  W.clock.start();
  requestAnimationFrame(frame);
  setInterval(fetchState, 10000);
  startPresence();
}

async function heartbeatPresence() {
  if (document.hidden) return;
  try {
    const response = await fetch('/api/presence', { method: 'POST', cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const online = Math.max(1, Math.floor(Number(data.online) || 0));
    ui.onlineCount.textContent = fmt.format(online);
    ui.onlineBadge.classList.add('visible');
  } catch (_) {
    ui.onlineBadge.classList.remove('visible');
  }
}

function startPresence() {
  heartbeatPresence();
  setInterval(heartbeatPresence, 15000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) heartbeatPresence();
  });
}

function setupRenderer() {
  W.scene = new THREE.Scene();
  W.scene.fog = new THREE.FogExp2('#40143f', mobile ? 0.0135 : 0.0098);
  W.camera = new THREE.PerspectiveCamera(mobile ? 57 : 46, innerWidth / innerHeight, 0.1, 220);
  W.renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance', alpha: false });
  W.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.15 : 1.35));
  W.renderer.setSize(innerWidth, innerHeight);
  W.renderer.outputColorSpace = THREE.SRGBColorSpace;
  W.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  W.renderer.toneMappingExposure = 1.12;
  W.renderer.shadowMap.enabled = !mobile;
  W.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  root.appendChild(W.renderer.domElement);

  W.labels = new CSS2DRenderer();
  W.labels.setSize(innerWidth, innerHeight);
  W.labels.domElement.className = 'label-layer';
  root.appendChild(W.labels.domElement);

  W.composer = new EffectComposer(W.renderer);
  W.composer.addPass(new RenderPass(W.scene, W.camera));
  W.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), mobile ? 0.42 : 0.58, 0.82, 0.78);
  W.composer.addPass(W.bloom);
  W.composer.addPass(new OutputPass());
  W.scene.add(W.world);
}

/* ---------- canvas texture helpers ---------- */
function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function cloudTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const x = c.getContext('2d'), r = rngFor('clouds');
  x.clearRect(0, 0, 512, 192);
  for (let i = 0; i < 26; i++) {
    const cx = 60 + r() * 392, cy = 70 + r() * 62, rad = 22 + r() * 46;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,214,186,.55)');
    g.addColorStop(0.55, 'rgba(238,150,170,.28)');
    g.addColorStop(1, 'rgba(190,90,150,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function sandTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), r = rngFor('sand');
  x.fillStyle = '#b97a52'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = r() > 0.5 ? 'rgba(255,205,150,.16)' : 'rgba(90,40,40,.14)';
    x.fillRect(r() * 256, r() * 256, 1.4, 1.4);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 4); return t;
}

function plankTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const x = c.getContext('2d'), r = rngFor('plank');
  x.fillStyle = '#33162c'; x.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 18) {
    x.fillStyle = `rgba(${150 + r() * 40},${70 + r() * 26},${86 + r() * 30},${0.05 + r() * 0.05})`;
    x.fillRect(0, y, 128, 16);
    x.fillStyle = 'rgba(10,4,14,.5)'; x.fillRect(0, y + 16, 128, 2);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 6); return t;
}

function umbrellaTexture(route) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  const a = route === 'summer' ? '#ff6e3f' : '#ffb040', b = '#ffffff';
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? a : b; x.fillRect(i * 32, 0, 32, 128); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// synthwave sun disc: warm gradient with growing horizontal slits in the lower
// half — the signature from the Seeker Summer sunglasses reflection
function sunDiscTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const x = c.getContext('2d');
  const grad = x.createLinearGradient(0, 30, 0, 482);
  grad.addColorStop(0, '#fffbe8'); grad.addColorStop(0.42, '#ffe4a0');
  grad.addColorStop(0.72, '#ffab5e'); grad.addColorStop(1, '#ff7a50');
  x.fillStyle = grad;
  x.beginPath(); x.arc(256, 256, 240, 0, Math.PI * 2); x.fill();
  // soft edge falloff
  const edge = x.createRadialGradient(256, 256, 215, 256, 256, 250);
  edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = edge; x.fillRect(0, 0, 512, 512);
  // dark synthwave slits (opaque, so the glow behind can't bleed through)
  x.fillStyle = 'rgba(43,12,58,0.92)';
  let y = 300, gap = 20;
  while (y < 500) { x.fillRect(0, y, 512, gap); y += gap + 26; gap = Math.round(gap * 1.6); }
  x.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function addSky() {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 40, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(PAL.skyTop) },
      mid: { value: new THREE.Color(PAL.skyMid) },
      low: { value: new THREE.Color('#d6336c') },
      bottom: { value: new THREE.Color(PAL.horizon) },
      sunDir: { value: new THREE.Vector3(0.09, 0.115, -1).normalize() },
      sunCol: { value: new THREE.Color('#ffd9a0') }
    },
    vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `
      varying vec3 vPos; uniform vec3 top,mid,low,bottom,sunDir,sunCol;
      void main(){
        vec3 d = normalize(vPos);
        float h = d.y;
        vec3 c = h > 0.16 ? mix(mid, top, smoothstep(0.16, 0.75, h))
                          : mix(bottom, mix(low, mid, smoothstep(0.02, 0.16, h)), smoothstep(-0.06, 0.02, h));
        // subtle synthwave stripes just above horizon
        float stripe = sin(h * 240.0) * 0.5 + 0.5;
        float band = smoothstep(0.005, 0.03, h) * (1.0 - smoothstep(0.03, 0.09, h));
        c *= 1.0 - band * stripe * 0.10;
        // warm halo around the sun direction
        float s = max(dot(d, sunDir), 0.0);
        c += sunCol * (pow(s, 90.0) * 0.55 + pow(s, 18.0) * 0.22);
        gl_FragColor = vec4(c, 1.0);
      }`
  }));
  W.scene.add(sky);

  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture(['rgba(255,244,205,1)', 'rgba(255,196,120,.9)', 'rgba(255,110,70,.45)', 'rgba(242,83,134,0)']),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  }));
  sunGlow.position.set(7.5, 9.2, -86); sunGlow.scale.set(34, 34, 1); W.scene.add(sunGlow);
  // synthwave sun: warm disc with growing horizontal slits — the Seeker Summer sunglasses signature
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunDiscTexture(), transparent: true, depthWrite: false, toneMapped: false, fog: false
  }));
  sunCore.position.set(7.5, 9.2, -85.5); sunCore.scale.set(14.5, 14.5, 1); W.scene.add(sunCore);

  // distant coastline mountains, silhouetted plum
  const mMat = new THREE.MeshBasicMaterial({ color: '#2a1136', fog: false });
  const r = rngFor('coast');
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(4 + r() * 7, 5 + r() * 8, 3), mMat);
    const side = i % 2 ? 1 : -1;
    m.position.set(side * (26 + r() * 34), 0.5, -62 - r() * 10);
    m.rotation.y = r() * Math.PI; W.world.add(m);
  }
}

function addLights() {
  W.scene.add(new THREE.AmbientLight('#b06a8c', 0.85));
  W.scene.add(new THREE.HemisphereLight('#ffd9b0', '#1c0a26', 1.9));
  const sun = new THREE.DirectionalLight('#ffc890', 3.4);
  sun.position.set(12, 16, -30); sun.castShadow = !mobile;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -34; sun.shadow.camera.right = 34; sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -34;
  W.scene.add(sun);
  const rim = new THREE.DirectionalLight('#ff6e96', 1.35); rim.position.set(-14, 9, -22); W.scene.add(rim);
  const fill = new THREE.PointLight('#7fe8d9', 26, 40, 2); fill.position.set(0, 5, 6); W.world.add(fill);
  const gold = new THREE.PointLight('#ffc36b', 40, 34, 2); gold.position.set(CITY_X, 5, CITY_Z + 1); W.world.add(gold);
  const aqua = new THREE.PointLight('#7fe8d9', 30, 34, 2); aqua.position.set(-CITY_X, 5, CITY_Z + 1); W.world.add(aqua);
}

function addPromenadeAndBeach() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(96, 66),
    new THREE.MeshStandardMaterial({ color: PAL.promenade, emissive: '#5c2150', emissiveIntensity: 0.14, roughness: 0.85, metalness: 0.1 })
  );
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.12, -2); ground.receiveShadow = !mobile;
  W.world.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(110, 9),
    new THREE.MeshStandardMaterial({ map: sandTexture(), color: '#d9a276', roughness: 0.95, metalness: 0.02 })
  );
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, -0.06, -30.5); sand.receiveShadow = !mobile;
  W.world.add(sand);

  // waterline foam strip
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(110, 1.7),
    new THREE.MeshBasicMaterial({ color: PAL.foam, transparent: true, opacity: 0.30, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  foam.rotation.x = -Math.PI / 2; foam.position.set(0, -0.03, -34.2);
  W.world.add(foam); W.foam = foam;

  // rocks along the waterline
  const r = rngFor('rocks'), rockMat = new THREE.MeshStandardMaterial({ color: PAL.rockDark, roughness: 0.9, metalness: 0.08 });
  for (let i = 0; i < (mobile ? 8 : 15); i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + r() * 1.3, 0), rockMat);
    rock.position.set(-44 + i * 6.2 + (r() - 0.5) * 3.4, 0.05 + r() * 0.15, -33.2 - r() * 2.4);
    rock.scale.y = 0.55 + r() * 0.4; rock.rotation.set(r() * 3, r() * 3, r() * 3);
    W.world.add(rock);
  }
}

function addOcean() {
  const geo = new THREE.PlaneGeometry(190, 70, 96, 40);
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      time: { value: 0 },
      deep: { value: new THREE.Color(PAL.oceanDeep) },
      near: { value: new THREE.Color(PAL.ocean) },
      sunX: { value: 7.5 },
      sunCol: { value: new THREE.Color('#ffb060') },
      skyCol: { value: new THREE.Color('#c4557a') },
      foamCol: { value: new THREE.Color(PAL.foam) }
    },
    vertexShader: `
      varying vec2 vUv; varying vec3 vWorld; uniform float time;
      void main(){
        vUv = uv;
        vec3 p = position;
        p.z += sin(p.x * 0.14 + time * 0.7) * 0.35 + sin(p.x * 0.31 - time * 0.45) * 0.18;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      varying vec2 vUv; varying vec3 vWorld;
      uniform float time, sunX; uniform vec3 deep, near, sunCol, skyCol, foamCol;
      float hash21(vec2 p){ p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
      void main(){
        float depthT = smoothstep(0.0, 0.85, vUv.y); // 0 shore -> 1 horizon
        vec3 c = mix(near, deep, depthT);
        // sky reflection tint
        c = mix(c, skyCol, 0.24 * (1.0 - depthT * 0.5));
        // moving wave shading
        float w = sin(vWorld.x * 0.55 + time * 1.1) * 0.5 + sin(vWorld.z * 0.8 - time * 0.8) * 0.5;
        c += vec3(0.03, 0.05, 0.07) * w;
        // sun path: shimmering column under the sun
        float path = exp(-pow((vWorld.x - sunX) * 0.16, 2.0)) * (1.0 - depthT * 0.35);
        float shimmer = 0.55 + 0.45 * sin(vWorld.z * 2.6 + time * 2.2 + sin(vWorld.x * 3.0));
        c += sunCol * path * shimmer * 0.85;
        // sparkle glints
        vec2 cell = floor(vWorld.xz * 2.4 + vec2(0.0, time * 1.4));
        float g = step(0.985, hash21(cell));
        c += vec3(1.0, 0.85, 0.6) * g * (0.5 + 0.5 * path);
        // cyan foam pulses near shore
        float foamBand = (1.0 - smoothstep(0.0, 0.10, vUv.y)) * (0.5 + 0.5 * sin(vWorld.x * 0.8 + time * 1.3));
        c += foamCol * foamBand * 0.35;
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  const ocean = new THREE.Mesh(geo, mat);
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, -0.02, -69);
  W.world.add(ocean); W.ocean = mat;
}

/* ---------- roads ---------- */
function roadGeometry(curve, width, segments = 80) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, p = curve.getPoint(t), tan = curve.getTangent(t).normalize();
    const side = new THREE.Vector3(-tan.z, 0, tan.x).multiplyScalar(width / 2);
    for (const k of [-1, 1]) { const q = p.clone().addScaledVector(side, k); pos.push(q.x, q.y, q.z); uv.push(k < 0 ? 0 : 1, t * 8); }
  }
  for (let i = 0; i < segments; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

function createRoad(curve, width, accent, name) {
  const road = new THREE.Mesh(roadGeometry(curve, width), new THREE.MeshStandardMaterial({
    map: plankTexture(), color: '#5a2c4a', emissive: accent, emissiveIntensity: 0.06, roughness: 0.72, metalness: 0.2
  }));
  road.receiveShadow = !mobile; road.userData.name = name; W.world.add(road);
  const edgeMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.55 });
  for (const side of [-1, 1]) {
    const edgeCurve = new THREE.CatmullRomCurve3(Array.from({ length: 33 }, (_, i) => {
      const t = i / 32, p = curve.getPoint(t), tan = curve.getTangent(t);
      const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      return p.addScaledVector(perp, side * width * 0.49).add(new THREE.Vector3(0, 0.035, 0));
    }));
    W.world.add(new THREE.Mesh(new THREE.TubeGeometry(edgeCurve, 64, 0.045, 5, false), edgeMat));
  }
}

function createRoadNetwork() {
  W.commonCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.03, 19), new THREE.Vector3(0, 0.03, 11),
    new THREE.Vector3(0, 0.03, 4), new THREE.Vector3(0, 0.03, -3)
  ]);
  W.summerCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.04, -3), new THREE.Vector3(-2.4, 0.04, -8),
    new THREE.Vector3(-7.4, 0.04, -13.5), new THREE.Vector3(-CITY_X + 2.2, 0.04, -19.6)
  ]);
  W.stakingCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.045, -3), new THREE.Vector3(2.4, 0.045, -8),
    new THREE.Vector3(7.4, 0.045, -13.5), new THREE.Vector3(CITY_X - 2.2, 0.045, -19.6)
  ]);
  createRoad(W.commonCurve, 5.6, COLORS.pending, 'common');
  createRoad(W.summerCurve, 4.4, COLORS.summer, 'summer');
  createRoad(W.stakingCurve, 4.4, COLORS.staking, 'staking');
}

/* ---------- palms ---------- */
function makePalm(scale, dark) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: dark ? '#241028' : '#4a2440', roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({
    color: dark ? PAL.palmDark : '#173a38', emissive: dark ? '#000000' : '#1f8f76',
    emissiveIntensity: dark ? 0 : 0.14, roughness: 0.8, side: THREE.DoubleSide
  });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.14, 2.6, 6), trunkMat);
  trunk.position.y = 1.3; trunk.rotation.z = 0.06; g.add(trunk);
  const fronds = new THREE.Group(); fronds.position.y = 2.62;
  for (let k = 0; k < 7; k++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.7, 4), leafMat);
    leaf.rotation.z = Math.PI / 2.25; leaf.rotation.y = k * Math.PI / 3.5;
    leaf.translateY(0.55); fronds.add(leaf);
    const droop = new THREE.Mesh(new THREE.ConeGeometry(0.10, 1.1, 4), leafMat);
    droop.rotation.z = Math.PI / 1.6; droop.rotation.y = k * Math.PI / 3.5 + 0.45;
    droop.translateY(0.4); fronds.add(droop);
  }
  g.add(fronds);
  g.scale.setScalar(scale);
  g.userData.fronds = fronds;
  return g;
}

function addPalms() {
  const spots = [];
  for (const curve of [W.commonCurve, W.summerCurve, W.stakingCurve]) {
    for (let i = 2; i < 10; i += 2) for (const side of [-1, 1]) {
      const t = i / 11, p = curve.getPoint(t), tan = curve.getTangent(t);
      const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      spots.push({ p: p.addScaledVector(perp, side * (curve === W.commonCurve ? 4.6 : 3.6)), s: 0.9 + (i % 4) * 0.12, dark: false });
    }
  }
  // hero foreground silhouettes framing the shot
  spots.push({ p: new THREE.Vector3(-9.6, 0, 18.5), s: 3.3, dark: true });
  spots.push({ p: new THREE.Vector3(10.4, 0, 20.5), s: 3.7, dark: true });
  if (!mobile) spots.push({ p: new THREE.Vector3(-14.5, 0, 9.5), s: 2.3, dark: true });
  // beach palms
  const r = rngFor('beach-palms');
  for (let i = 0; i < (mobile ? 4 : 7); i++) spots.push({ p: new THREE.Vector3(-34 + i * 11 + r() * 4, 0, -29.5 - r() * 2), s: 1.15 + r() * 0.5, dark: false });

  spots.forEach((s, i) => {
    if (mobile && !s.dark && i % 2) return;
    const palm = makePalm(s.s, s.dark);
    palm.position.copy(s.p); palm.rotation.y = hash(`palm-${i}`) % 6;
    W.world.add(palm);
    W.palms.push({ fronds: palm.userData.fronds, phase: i * 1.37, amp: s.dark ? 0.05 : 0.03 });
  });
}

/* ---------- cities ---------- */
function makeTextSprite(title, color, sub = '') {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 360;
  const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); x.textAlign = 'center';
  x.beginPath(); x.roundRect(54, 30, 916, 274, 42);
  x.fillStyle = 'rgba(22, 7, 34, .86)'; x.fill();
  x.lineWidth = 7; x.strokeStyle = color; x.globalAlpha = 0.88; x.stroke(); x.globalAlpha = 1;
  x.shadowColor = '#08010d'; x.shadowBlur = 18; x.lineWidth = 12; x.strokeStyle = 'rgba(8,1,13,.92)';
  x.font = 'italic 900 104px "Archivo Black"'; x.strokeText(title, 512, 158);
  x.shadowColor = color; x.shadowBlur = 34; x.fillStyle = color; x.fillText(title, 512, 158);
  x.shadowBlur = 0; x.fillStyle = '#fff8ec'; x.font = '700 30px "DM Mono"';
  try { x.letterSpacing = '7px'; } catch (_) {}
  x.fillText(sub, 512, 228);
  x.strokeStyle = color; x.globalAlpha = 0.65; x.lineWidth = 3;
  x.beginPath(); x.moveTo(180, 265); x.lineTo(844, 265); x.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
}

function createSummerCity() {
  const g = new THREE.Group(); g.position.set(-CITY_X, 0, CITY_Z); W.world.add(g);
  // sandy club deck
  const base = new THREE.Mesh(new THREE.CylinderGeometry(9.8, 10.4, 0.4, 48),
    new THREE.MeshStandardMaterial({ map: sandTexture(), color: '#e0aa7c', roughness: 0.9 }));
  base.position.y = 0.05; base.receiveShadow = !mobile; g.add(base);
  for (const radius of [5.0, 8.4]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.045, 6, 96),
      new THREE.MeshBasicMaterial({ color: COLORS.summer, transparent: true, opacity: radius < 6 ? 0.7 : 0.35 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.28; g.add(ring);
    W.cityRings.push({ mesh: ring, speed: radius < 6 ? 0.1 : 0.05, phase: 1 });
  }
  // tiki bar
  const bar = new THREE.Group(); bar.position.set(-3.4, 0.25, -2.6);
  const hut = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 1.5, 10),
    new THREE.MeshStandardMaterial({ color: '#5c3040', roughness: 0.85 }));
  hut.position.y = 0.75; bar.add(hut);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.25, 1.3, 10),
    new THREE.MeshStandardMaterial({ color: '#8a4a34', roughness: 0.95 }));
  roof.position.y = 2.1; bar.add(roof);
  const glowWin = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.5),
    new THREE.MeshBasicMaterial({ color: '#ffcf8f', transparent: true, opacity: 0.9 }));
  glowWin.position.set(0, 0.9, 1.52); bar.add(glowWin);
  g.add(bar);

  // umbrellas + loungers -> chill spots
  const r = rngFor('summer-props');
  const umbTex = umbrellaTexture('summer');
  for (let i = 0; i < (mobile ? 5 : 8); i++) {
    const a = (i / (mobile ? 5 : 8)) * Math.PI * 2 + 0.4, rad = 4.6 + r() * 2.6;
    const ux = Math.cos(a) * rad, uz = Math.sin(a) * rad;
    const umb = new THREE.Group(); umb.position.set(ux, 0.25, uz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.4, 6),
      new THREE.MeshStandardMaterial({ color: '#e8d8c8', roughness: 0.6 }));
    pole.position.y = 1.2; umb.add(pole);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.55, 0.85, 10, 1, true),
      new THREE.MeshStandardMaterial({ map: umbTex, side: THREE.DoubleSide, roughness: 0.85 }));
    canopy.position.y = 2.5; umb.add(canopy);
    g.add(umb); W.umbrellas.push({ mesh: canopy, phase: i * 2.1 });
    // lounger next to umbrella
    const lounger = new THREE.Group(); lounger.position.set(ux + 1.15, 0.28, uz + 0.4); lounger.rotation.y = a + Math.PI / 2;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 1.7),
      new THREE.MeshStandardMaterial({ color: '#f2e4d4', roughness: 0.7 }));
    bed.position.y = 0.16; lounger.add(bed);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.1),
      new THREE.MeshStandardMaterial({ color: '#ff8d6b', roughness: 0.7 }));
    back.position.set(0, 0.5, -0.85); back.rotation.x = -0.5; lounger.add(back);
    g.add(lounger);
    const world = new THREE.Vector3(-CITY_X + ux + 1.15, 0, CITY_Z + uz + 0.4);
    W.chillSpots.push({ pos: world, rotY: a + Math.PI / 2, taken: false });
  }
  // string lights around the deck
  const bulbGeo = new THREE.SphereGeometry(0.115, 6, 5);
  for (let s = 0; s < 3; s++) {
    const a0 = s * 2.1 + 0.6, a1 = a0 + 1.7;
    const p0 = new THREE.Vector3(Math.cos(a0) * 8.6, 2.3, Math.sin(a0) * 8.6);
    const p1 = new THREE.Vector3(Math.cos(a1) * 8.6, 2.3, Math.sin(a1) * 8.6);
    for (const p of [p0, p1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.4, 6),
        new THREE.MeshStandardMaterial({ color: '#2a1830', roughness: 0.8 }));
      pole.position.set(p.x, 1.2, p.z); g.add(pole);
    }
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const pos = p0.clone().lerp(p1, t); pos.y -= Math.sin(t * Math.PI) * 0.55;
      const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffd9a0' : '#7fe8d9' }));
      bulb.position.copy(pos); g.add(bulb);
      W.stringLights.push({ mesh: bulb, phase: s * 3 + i * 0.7 });
    }
  }
  const title = makeTextSprite('SUMMER CITY', PAL.summer, 'CLAIMED · CHILLING');
  title.position.set(0, 7.15, -1.8); title.scale.set(mobile ? 6.5 : 12.2, mobile ? 2.35 : 4.3, 1); g.add(title);
  const halo = new THREE.PointLight(PAL.summer, 22, 18, 2); halo.position.set(0, 4, 0); g.add(halo);
}

function createStakingCity() {
  const g = new THREE.Group(); g.position.set(CITY_X, 0, CITY_Z); W.world.add(g);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(9.8, 10.4, 0.4, 48),
    new THREE.MeshStandardMaterial({ color: '#3a1a34', emissive: '#ffc36b', emissiveIntensity: 0.08, roughness: 0.6, metalness: 0.3 }));
  base.position.y = 0.05; base.receiveShadow = !mobile; g.add(base);
  for (const radius of [5.0, 8.4]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.045, 6, 96),
      new THREE.MeshBasicMaterial({ color: COLORS.staking, transparent: true, opacity: radius < 6 ? 0.7 : 0.35 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.28; g.add(ring);
    W.cityRings.push({ mesh: ring, speed: radius < 6 ? -0.1 : -0.05, phase: 2 });
  }
  // the golden vault
  const vault = new THREE.Group(); vault.position.set(1.6, 0.25, -1.8);
  const body = new THREE.Mesh(new RoundedBoxGeometry(3.6, 3.0, 3.0, 3, 0.22),
    new THREE.MeshStandardMaterial({ color: '#241226', metalness: 0.65, roughness: 0.3, emissive: '#ffc36b', emissiveIntensity: 0.07 }));
  body.position.y = 1.5; body.castShadow = !mobile; vault.add(body);
  const door = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.3, 24),
    new THREE.MeshStandardMaterial({ color: '#3a2417', metalness: 0.8, roughness: 0.25, emissive: '#ffc36b', emissiveIntensity: 0.35 }));
  door.rotation.x = Math.PI / 2; door.position.set(-1.82, 1.5, 0); vault.add(door);
  const doorRing = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.08, 8, 32),
    new THREE.MeshBasicMaterial({ color: '#ffc36b' }));
  doorRing.rotation.y = Math.PI / 2; doorRing.position.set(-1.98, 1.5, 0); vault.add(doorRing);
  W.kinetic.push({ mesh: doorRing, speed: 0.5, type: 'spin', axis: 'x' });
  const seamMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.85 });
  for (const y of [0.6, 1.5, 2.4]) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(3.64, 0.045, 3.04), seamMat);
    seam.position.y = y; vault.add(seam);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.5, 4.2, 8),
    new THREE.MeshBasicMaterial({ color: '#ffc36b', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.y = 5.2; vault.add(beam);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75 + i * 0.28, 0.05, 8, 48),
      new THREE.MeshBasicMaterial({ color: i % 2 ? '#f25386' : '#ffc36b', transparent: true, opacity: 0.85 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 3.35 + i * 0.5; vault.add(ring);
    W.kinetic.push({ mesh: ring, speed: i % 2 ? -0.3 : 0.22, type: 'spin', axis: 'z' });
  }
  g.add(vault);
  W.vaultPos.set(CITY_X + 1.6, 0, CITY_Z - 1.8);
  W.workCenter.copy(W.vaultPos);
  // gold token stacks
  const r = rngFor('token-stacks');
  const tokGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.09, 14);
  const tokMat = new THREE.MeshStandardMaterial({ color: '#c98f3a', metalness: 0.85, roughness: 0.25, emissive: '#ffc36b', emissiveIntensity: 0.25 });
  for (let i = 0; i < (mobile ? 5 : 9); i++) {
    const stack = new THREE.Group();
    const sx = -4.6 + r() * 3.4, sz = 1.2 + r() * 3.6, n = 3 + Math.floor(r() * 6);
    stack.position.set(sx, 0.25, sz);
    for (let k = 0; k < n; k++) {
      const tok = new THREE.Mesh(tokGeo, tokMat);
      tok.position.y = 0.06 + k * 0.1; tok.rotation.y = r() * 1.2; stack.add(tok);
    }
    g.add(stack);
  }
  const title = makeTextSprite('STAKING CITY', PAL.staking, 'LOCKED · WORKING');
  title.position.set(0, 7.15, -1.8); title.scale.set(mobile ? 6.5 : 12.2, mobile ? 2.35 : 4.3, 1); g.add(title);
  const halo = new THREE.PointLight(PAL.staking, 26, 18, 2); halo.position.set(0, 4, 0); g.add(halo);

  // the Boss — Seeker Summer sunglasses legend watching over the vault
  const bossTex = new THREE.TextureLoader().load('assets/staking-boss.png');
  bossTex.colorSpace = THREE.SRGBColorSpace;
  const boss = new THREE.Group(); boss.position.set(6.1, 0.25, -4.2); boss.rotation.y = -0.38;
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.95, 0.7, 8),
    new THREE.MeshStandardMaterial({ color: '#241226', roughness: 0.55, metalness: 0.35, emissive: '#ffc36b', emissiveIntensity: 0.12 }));
  pedestal.position.y = 0.35; pedestal.castShadow = !mobile; boss.add(pedestal);
  const bossPlane = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 4.64),
    new THREE.MeshBasicMaterial({ map: bossTex, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide, toneMapped: false }));
  bossPlane.position.y = 3.05; boss.add(bossPlane);
  const bossGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture(['rgba(255,195,107,.8)', 'rgba(255,150,90,.3)', 'rgba(242,83,134,0)']),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
  bossGlow.scale.set(8.5, 8.5, 1); bossGlow.position.set(0, 3.4, -0.7); boss.add(bossGlow);
  if (mobile) boss.scale.setScalar(0.8);
  g.add(boss);
  W.boss = { group: boss, glow: bossGlow };
}

function createScannerPlaza() {
  const g = new THREE.Group(); g.position.set(0, 0, -8.1);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 0.1, 32),
    new THREE.MeshStandardMaterial({ color: '#241028', emissive: COLORS.pending, emissiveIntensity: 0.05, roughness: 0.8 }));
  disc.position.y = 0.08; g.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.025, 6, 64),
    new THREE.MeshBasicMaterial({ color: COLORS.pending, transparent: true, opacity: 0.2 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.15; g.add(ring);
  W.kinetic.push({ mesh: ring, speed: 0.4, type: 'spin', axis: 'z' });
  W.world.add(g);
}

/* ---------- atmosphere: pulses, particles, clouds, birds, stars ---------- */
function addRoutePulses() {
  const geo = new THREE.SphereGeometry(0.09, 8, 6);
  for (const [curve, route, count] of [[W.commonCurve, 'pending', 6], [W.summerCurve, 'summer', 7], [W.stakingCurve, 'staking', 7]]) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: COLORS[route], transparent: true, opacity: 0.9 }));
      W.world.add(mesh);
      W.pulses.push({ mesh, curve, offset: i / count + (route === 'staking' ? 0.5 : 0), speed: 0.035 + (i % 3) * 0.004 });
    }
  }
}

function buildAtmosphere() {
  // warm dust motes
  const count = mobile ? 300 : 560, pos = new Float32Array(count * 3), col = new Float32Array(count * 3), r = rngFor('golden-air');
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (r() - 0.5) * 76; pos[i * 3 + 1] = 0.5 + r() * 24; pos[i * 3 + 2] = -50 + r() * 72;
    const c = r() > 0.6 ? COLORS.staking : (r() > 0.5 ? COLORS.summer : COLORS.pending);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  W.air = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.06, vertexColors: true, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
  W.world.add(W.air);

  // clouds, warm-lit
  const cTex = cloudTexture();
  for (let i = 0; i < (mobile ? 4 : 6); i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cTex, transparent: true, opacity: 0.75, depthWrite: false, fog: false }));
    const rr = rngFor(`cloud-${i}`);
    s.position.set(-50 + rr() * 100, 15 + rr() * 14, -68 - rr() * 12);
    s.scale.set(16 + rr() * 14, 6 + rr() * 4, 1);
    W.scene.add(s); W.clouds.push({ sprite: s, speed: 0.14 + rr() * 0.2 });
  }

  // bird flock (V formation), hidden until timer fires
  const flock = new THREE.Group();
  const birdMat = new THREE.MeshBasicMaterial({ color: '#1c0d26', fog: false });
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 3), birdMat);
    b.rotation.z = Math.PI / 2;
    const row = Math.ceil(i / 2), side = i === 0 ? 0 : (i % 2 ? 1 : -1);
    b.position.set(-row * 0.7, 0, side * row * 0.55);
    flock.add(b);
  }
  flock.visible = false; W.scene.add(flock);
  W.birds = { group: flock, t: -1 };

  // shooting star
  const star = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture(['rgba(255,255,255,1)', 'rgba(255,220,180,.6)', 'rgba(255,140,120,0)']),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  }));
  star.scale.set(2.2, 0.35, 1); star.visible = false; W.scene.add(star);
  W.shootingStar = { sprite: star, t: -1, from: new THREE.Vector3(), to: new THREE.Vector3() };
}

/* ---------- phone with legs ---------- */
let exactPhoneTexture;
function getExactPhoneTexture() {
  if (exactPhoneTexture) return exactPhoneTexture;
  exactPhoneTexture = new THREE.TextureLoader().load('./assets/seeker-phone-exact.png');
  exactPhoneTexture.colorSpace = THREE.SRGBColorSpace;
  exactPhoneTexture.anisotropy = Math.min(8, W.renderer.capabilities.getMaxAnisotropy());
  return exactPhoneTexture;
}

function createRunnerPhone(route, scale = 1) {
  const accent = COLORS[route] || COLORS.pending;
  const g = new THREE.Group(); g.scale.setScalar(scale);
  const body = new THREE.Group(); g.add(body);          // bobs & rolls while running
  g.userData.body = body;

  const support = new THREE.Mesh(new RoundedBoxGeometry(0.955, 2.0, 0.055, 4, 0.11),
    new THREE.MeshStandardMaterial({ color: '#26313a', metalness: 0.4, roughness: 0.66, transparent: true, opacity: 0.55 }));
  support.position.set(0, 1.52, -0.035); body.add(support);
  const phone = new THREE.Mesh(new THREE.PlaneGeometry(0.955, 2),
    new THREE.MeshBasicMaterial({ map: getExactPhoneTexture(), alphaTest: 0.07, toneMapped: false, side: THREE.DoubleSide }));
  phone.position.set(0, 1.52, 0.012); body.add(phone);

  // legs: hip pivots with swinging capsules + feet
  const legMat = new THREE.MeshStandardMaterial({ color: '#33454f', metalness: 0.5, roughness: 0.42, emissive: '#4a6a7a', emissiveIntensity: 0.22 });
  const legGeo = new THREE.CapsuleGeometry(0.072, 0.46, 3, 8);
  const footGeo = new RoundedBoxGeometry(0.16, 0.08, 0.27, 2, 0.03);
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(side * 0.2, 0.56, 0);
    const leg = new THREE.Mesh(legGeo, legMat); leg.position.y = -0.26; hip.add(leg);
    const foot = new THREE.Mesh(footGeo, legMat); foot.position.set(0, -0.5, 0.05); hip.add(foot);
    body.add(hip); legs.push(hip);
  }
  g.userData.legs = legs;

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.5, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012; shadow.scale.y = 0.3; g.add(shadow);
  const routeGlow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.17, blending: THREE.AdditiveBlending, depthWrite: false }));
  routeGlow.rotation.x = -Math.PI / 2; routeGlow.position.y = 0.014; routeGlow.scale.y = 0.28; g.add(routeGlow);
  g.userData.routeGlow = routeGlow;

  g.traverse(o => { if (o.isMesh) o.userData.phoneRoot = g; });
  W.phoneMeshes.push(phone, support);
  return g;
}

function makePhoneDataPlate(claim, route) {
  const c = document.createElement('canvas'); c.width = 768; c.height = 220;
  const x = c.getContext('2d'), accent = HEX[route] || HEX.pending;
  x.clearRect(0, 0, c.width, c.height);
  x.beginPath(); x.roundRect(8, 8, 752, 204, 38);
  x.fillStyle = 'rgba(20,8,20,.88)'; x.fill();
  x.lineWidth = 4; x.strokeStyle = `${accent}99`; x.stroke();
  x.beginPath(); x.arc(48, 66, 10, 0, Math.PI * 2);
  x.fillStyle = accent; x.shadowColor = accent; x.shadowBlur = 22; x.fill(); x.shadowBlur = 0;
  x.textBaseline = 'middle';
  x.fillStyle = '#fff'; x.font = '700 54px "Space Grotesk"';
  x.fillText(nameOf(claim), 82, 72, 640);
  x.fillStyle = accent; x.font = '500 30px "DM Mono"';
  x.fillText(`${fmt.format(amountOf(claim))} SKR · ${route === 'staking' ? 'STAKED' : 'CLAIMED'}`, 40, 157, 680);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, W.renderer.capabilities.getMaxAnisotropy());
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 0.67),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  // phones run away from the camera — flip the plate so its readable face looks back at the viewer
  plate.rotation.y = Math.PI;
  plate.position.set(0, 3.05, 0.05); plate.renderOrder = 6; plate.userData.texture = texture;
  return plate;
}

function makeLabel(claim, route, resident = false) {
  const a = document.createElement(validSolscan(claim.solscan) ? 'a' : 'div');
  a.className = `phone-label ${resident ? 'resident' : ''} ${route === 'pending' ? 'pending' : ''}`;
  a.style.setProperty('--accent', HEX[route]);
  if (a.tagName === 'A') { a.href = claim.solscan; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = 'Open transaction on Solscan'; }
  const b = document.createElement('b'); b.textContent = nameOf(claim);
  const s = document.createElement('span');
  s.textContent = route === 'pending' ? 'ROUTE SCANNING' : `${fmt.format(amountOf(claim))} SKR · ${route === 'staking' ? 'STAKED' : 'CLAIMED'}`;
  a.append(b, s);
  return new CSS2DObject(a);
}

/* ---------- actors ---------- */
class SeekerActor {
  constructor(claim, route, mode = 'moving') {
    this.claim = claim; this.route = route; this.id = idOf(claim);
    this.seed = hash(this.id); this.r = rngFor(this.id);
    this.mode = mode; this.progress = 0;
    this.lane = ((this.seed % 3) - 1) * 0.68;
    this.duration = reduced ? 0.2 : 26 + this.r() * 9;
    this.phase = this.r() * Math.PI * 2;
    this.stepFreq = 8.2 + this.r() * 1.6;
    this.group = createRunnerPhone(route, mode === 'moving' ? (mobile ? 0.92 : 1.42) : (mobile ? 0.5 : 0.56));
    this.body = this.group.userData.body; this.legs = this.group.userData.legs;
    this.group.userData.actor = this;
    this.label = makeLabel(claim, route, mode !== 'moving');
    this.label.position.set(0, 3.35, 0); this.body.add(this.label);
    if (mode === 'moving') {
      this.dataPlate = makePhoneDataPlate(claim, route);
      this.dataPlate.visible = !mobile; this.body.add(this.dataPlate);
      this.group.position.copy(W.commonCurve.getPoint(0));
    }
    W.world.add(this.group);
    if (mode !== 'moving') {
      this.label.visible = false;
      if (route === 'staking') this.setupWorker(); else if (route === 'summer') this.setupChiller(true); else this.setupPending();
    }
  }

  /* --- placement helpers --- */
  setupWorker() {
    this.mode = 'work';
    this.loopR = 2.4 + this.r() * 1.6;
    this.loopSpeed = (0.55 + this.r() * 0.35) * (this.r() > 0.5 ? 1 : -1);
    this.loopPhase = this.r() * Math.PI * 2;
    this.group.scale.setScalar(mobile ? 0.42 : 0.5);
    this.baseY = 0.28;
    this.group.userData.routeGlow.material.opacity = 0.24;
    // glowing token orb carried in front
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.95 }));
    orb.position.set(0, 1.05, 0.62); this.body.add(orb);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture(['rgba(255,210,140,.9)', 'rgba(255,170,80,.35)', 'rgba(255,140,60,0)']),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    halo.scale.set(0.85, 0.85, 1); halo.position.copy(orb.position); this.body.add(halo);
    this.orb = orb;
  }

  setupChiller(withSpot) {
    this.mode = 'chill';
    let spot = withSpot ? W.chillSpots.find(s => !s.taken) : null;
    if (spot) { spot.taken = true; this.spot = spot; }
    // two flavours of chilling: sunbathing on a lounger vs standing socials
    this.chillVariant = spot || this.r() < 0.45 ? 'lounge' : 'stand';
    if (!spot && this.chillVariant === 'lounge') this.chillVariant = 'stand';
    const pos = spot ? spot.pos : this.randomSandSpot();
    this.home = pos.clone(); this.home.y = 0;
    // bias toward the camera so the phone back (and plate side) actually reads
    this.restRotY = (this.r() - 0.5) * 1.1;
    this.group.scale.setScalar(mobile ? 0.56 : 0.72);
    this.baseY = 0.28;
    this.settleFrom = null;
    this.group.position.copy(this.home);
    this.group.userData.routeGlow.material.opacity = 0.3;
    this.applyChillPose();
  }

  randomSandSpot() {
    const a = this.r() * Math.PI * 2, rad = 2.2 + this.r() * 4.4;
    return new THREE.Vector3(-CITY_X + Math.cos(a) * rad, 0, CITY_Z + Math.sin(a) * rad * 0.8);
  }

  applyChillPose() {
    if (this.chillVariant === 'stand') {
      // upright social: legs planted, gentle sway while chatting with the sunset
      for (const hip of this.legs) { hip.visible = true; hip.rotation.x = 0; }
      this.body.rotation.x = -0.04;
      this.body.position.y = 0;
    } else {
      // recline: legs tucked away, phone leans back like sunbathing
      for (const hip of this.legs) hip.visible = false;
      this.body.rotation.x = -0.42;
      this.body.position.y = 0.38;
    }
    this.group.position.y = this.baseY ?? 0.02;
    this.group.rotation.y = this.restRotY;
  }

  setupPending() {
    this.mode = 'pendingIdle';
    const a = this.r() * Math.PI * 2, rad = 1.1 + this.r() * 0.7;
    this.home = new THREE.Vector3(Math.cos(a) * rad, 0, -8.1 + Math.sin(a) * rad);
    this.group.scale.setScalar(0.4);
    for (const hip of this.legs) hip.visible = false;
    this.body.position.y = 0.1;
    this.group.position.copy(this.home);
    this.restRotY = this.r() * Math.PI * 2; this.group.rotation.y = this.restRotY;
  }

  /* --- motion --- */
  runCycle(time, intensity = 1) {
    const step = time * this.stepFreq + this.phase;
    const [l, r] = this.legs;
    l.rotation.x = Math.sin(step) * 0.72 * intensity;
    r.rotation.x = Math.sin(step + Math.PI) * 0.72 * intensity;
    this.body.position.y = Math.abs(Math.sin(step)) * 0.055 * intensity;
    this.body.rotation.z = Math.sin(step) * 0.045 * intensity;
    this.body.rotation.x = -0.1 * intensity;
  }

  travel(dt, time) {
    this.progress = clamp(this.progress + dt / this.duration, 0, 1);
    const commonEnd = 0.54;
    let curve, t;
    if (this.progress < commonEnd) { curve = W.commonCurve; t = this.progress / commonEnd; }
    else { curve = this.route === 'staking' ? W.stakingCurve : W.summerCurve; t = (this.progress - commonEnd) / (1 - commonEnd); }
    const p = curve.getPoint(t), tan = curve.getTangent(t);
    const laneWidth = this.progress < commonEnd ? 1 : 0.62;
    p.addScaledVector(new THREE.Vector3(-tan.z, 0, tan.x).normalize(), this.lane * laneWidth);
    this.group.position.set(p.x, 0.02, p.z);
    this.group.visible = p.z < 14.6;
    this.group.rotation.y = Math.atan2(-tan.x, -tan.z) + Math.PI;
    this.runCycle(time);
    if (this.progress >= 1) this.arrive();
  }

  settle(dt, time) {
    // walk from city gate to final spot with legs on, climbing onto the deck
    this.settleT = clamp(this.settleT + dt / this.settleDur, 0, 1);
    const p = this.settleFrom.clone().lerp(this.home, this.settleT);
    this.group.position.set(p.x, lerp(0.02, 0.28, this.settleT), p.z);
    const dir = this.home.clone().sub(this.settleFrom);
    if (dir.lengthSq() > 0.001) this.group.rotation.y = Math.atan2(-dir.x, -dir.z) + Math.PI;
    this.runCycle(time, 0.8);
    if (this.settleT >= 1) {
      if (this.route === 'staking') { this.setupWorker(); }
      else { this.mode = 'chill'; this.applyChillPose(); }
    }
  }

  arrive() {
    if (this.dataPlate) this.dataPlate.visible = false;
    this.label.element.classList.add('resident');
    this.label.visible = false;
    if (this.route === 'summer') {
      let spot = W.chillSpots.find(s => !s.taken);
      if (spot) { spot.taken = true; this.spot = spot; }
      this.chillVariant = (spot || this.r() < 0.45) ? 'lounge' : 'stand';
      if (!spot && this.chillVariant === 'lounge') this.chillVariant = 'stand';
      this.home = (spot ? spot.pos : this.randomSandSpot()).clone(); this.home.y = 0;
      this.restRotY = (this.r() - 0.5) * 1.1;
    } else {
      const a = this.r() * Math.PI * 2, rad = 2.4 + this.r() * 1.6;
      this.home = new THREE.Vector3(W.workCenter.x + Math.cos(a) * rad, 0, W.workCenter.z + Math.sin(a) * rad * 0.75);
    }
    this.settleFrom = this.group.position.clone();
    this.settleDur = Math.max(2.5, this.settleFrom.distanceTo(this.home) / 1.6);
    this.settleT = 0; this.mode = 'settle';
    announce(this.claim, this.route);
    W.residents.push(this);
    const cap = mobile ? 18 : 38;
    if (W.residents.length > cap) { const old = W.residents.shift(); old.dispose(); }
  }

  work(time) {
    const a = time * this.loopSpeed + this.loopPhase;
    const x = W.workCenter.x + Math.cos(a) * this.loopR;
    const z = W.workCenter.z + Math.sin(a) * this.loopR * 0.75;
    const dx = -Math.sin(a) * this.loopSpeed, dz = Math.cos(a) * 0.75 * this.loopSpeed;
    this.group.position.set(x, this.baseY ?? 0.02, z);
    this.group.rotation.y = Math.atan2(-dx, -dz) + Math.PI;
    this.runCycle(time, 0.85);
    if (this.orb) this.orb.position.y = 1.05 + Math.sin(time * 3 + this.phase) * 0.06;
  }

  chill(time) {
    this.group.position.x = this.home.x; this.group.position.z = this.home.z;
    if (this.chillVariant === 'stand') {
      this.body.rotation.x = -0.04 + Math.sin(time * 0.7 + this.phase) * 0.02;
      this.body.rotation.z = Math.sin(time * 0.9 + this.phase) * 0.06;
      this.body.position.y = Math.abs(Math.sin(time * 1.1 + this.phase)) * 0.02;
    } else {
      this.body.rotation.x = -0.42 + Math.sin(time * 0.5 + this.phase) * 0.035;
      this.body.rotation.z = Math.sin(time * 0.42 + this.phase) * 0.05;
      this.body.position.y = 0.38 + Math.sin(time * 0.6 + this.phase) * 0.02;
    }
  }

  pendingIdle(time) {
    this.body.position.y = 0.1 + Math.abs(Math.sin(time * 0.9 + this.phase)) * 0.04;
    this.body.rotation.z = Math.sin(time * 0.7 + this.phase) * 0.04;
  }

  update(dt, time) {
    if (this.mode === 'moving') this.travel(dt, time);
    else if (this.mode === 'settle') this.settle(dt, time);
    else if (this.mode === 'work') this.work(time);
    else if (this.mode === 'chill') this.chill(time);
    else if (this.mode === 'pendingIdle') this.pendingIdle(time);
  }

  dispose() {
    W.world.remove(this.group);
    this.label.element.remove();
    if (this.dataPlate?.userData.texture) this.dataPlate.userData.texture.dispose();
    this.group.traverse(o => { if (o.isMesh) { const i = W.phoneMeshes.indexOf(o); if (i >= 0) W.phoneMeshes.splice(i, 1); } });
  }
}

function addPendingResident(claim) {
  if (W.pendingResidents.length > 8) return;
  W.pendingResidents.push(new SeekerActor(claim, 'pending', 'resident'));
}

function announce(claim, route) {
  ui.arrival.dataset.route = route;
  ui.arrivalCity.textContent = route === 'staking' ? 'STAKING CITY' : 'SUMMER CITY';
  ui.arrivalName.textContent = nameOf(claim);
  ui.arrivalAmount.textContent = `${fmt.format(amountOf(claim))} SKR · ${route === 'staking' ? 'CLAIM + STAKE' : 'CLAIM RECEIVED'}`;
  ui.arrival.classList.remove('flash'); void ui.arrival.offsetWidth; ui.arrival.classList.add('flash');
}

/* ---------- odometer counters ---------- */
const odos = {};
function odometer(el, key) {
  if (!odos[key]) {
    el.textContent = ''; el.classList.add('odo');
    odos[key] = { el, cols: [], len: 0 };
  }
  return odos[key];
}
function setOdometer(key, value) {
  const el = ui[key];
  if (!el) return;
  const o = odometer(el, key);
  const str = fmt.format(Math.max(0, Math.floor(value)));
  o.el.setAttribute('aria-label', str);
  o.el.dataset.value = str;
  if (str.length !== o.len) {
    o.el.innerHTML = ''; o.cols = []; o.len = str.length;
    for (const ch of str) {
      if (ch === ',') { const s = document.createElement('span'); s.className = 'odo-sep'; s.textContent = ','; o.el.appendChild(s); o.cols.push(null); }
      else {
        const col = document.createElement('span'); col.className = 'odo-col';
        const inner = document.createElement('span'); inner.className = 'odo-strip';
        for (let d = 0; d <= 9; d++) { const dd = document.createElement('i'); dd.textContent = d; inner.appendChild(dd); }
        col.appendChild(inner); o.el.appendChild(col); o.cols.push(inner);
      }
    }
    // slot-machine entrance: park every reel at 0, then cascade-roll to the real digits
    o.cols.forEach(inner => { if (inner) { inner.style.transition = 'none'; inner.style.transform = 'translateY(0em)'; } });
    void o.el.offsetWidth;
    o.cols.forEach((inner, i) => { if (inner) { inner.style.transition = ''; inner.style.transitionDelay = `${i * 70}ms`; } });
    setTimeout(() => o.cols.forEach(s => { if (s) s.style.transitionDelay = '0s'; }), 2600);
  }
  [...str].forEach((ch, i) => {
    if (ch !== ',' && o.cols[i]) o.cols[i].style.transform = `translateY(-${Number(ch)}em)`;
  });
}

/* ---------- live data ---------- */
async function fetchState() {
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (!r.ok) throw Error(`HTTP ${r.status}`);
    applyState(await r.json());
    ui.status.textContent = 'SOLANA TRAFFIC FLOWING';
  } catch (e) {
    console.error('Live state:', e);
    ui.status.textContent = 'RECONNECTING TO SOLANA';
    if (W.first) ui.loaderText.textContent = 'WORLD READY · LIVE DATA RETRYING';
  }
}

function applyState(data) {
  const claims = Array.isArray(data.claims) ? data.claims : [], counts = { summer: 0, staking: 0, pending: 0 };
  claims.forEach(c => counts[routeOf(c)]++);
  const routed = counts.summer + counts.staking || 1;
  ui.summerCount.textContent = fmt.format(counts.summer);
  ui.stakingCount.textContent = fmt.format(counts.staking);
  ui.pendingCount.textContent = fmt.format(counts.pending);
  ui.summerMeter.style.width = `${counts.summer / routed * 100}%`;
  ui.stakingMeter.style.width = `${counts.staking / routed * 100}%`;
  // camp totals: all-time from backend backfill when available, else live-window sums
  const winSummer = claims.filter(c => routeOf(c) === 'summer').reduce((s, c) => s + amountOf(c), 0);
  const winStaking = claims.filter(c => routeOf(c) === 'staking').reduce((s, c) => s + amountOf(c), 0);
  const camps = data.camps && Number.isFinite(data.camps.summer?.total) ? data.camps : null;
  const sTotal = camps ? camps.summer.total : winSummer;
  const kTotal = camps ? camps.staking.total : winStaking;
  setOdometer('summerTotal', sTotal);
  setOdometer('stakingTotal', kTotal);
  setOdometer('claimCount', Number(data.claimCount) || 0);
  setOdometer('claimed', sTotal);
  setOdometer('staked', kTotal);
  // meter bars reflect the money split when camps exist (honest all-time), else counts
  if (camps && sTotal + kTotal > 0) {
    ui.summerMeter.style.width = `${sTotal / (sTotal + kTotal) * 100}%`;
    ui.stakingMeter.style.width = `${kTotal / (sTotal + kTotal) * 100}%`;
  }
  document.body.dataset.campsScope = camps ? 'alltime' : 'window';
  const total = Math.max(0, Math.floor(Number(data.claimCount) || 0));
  if (total !== W.populationCount) buildPopulation(total);
  if (W.first) {
    const explicit = claims.filter(c => routeOf(c) !== 'pending'), pending = claims.filter(c => routeOf(c) === 'pending');
    explicit.slice(0, mobile ? 14 : 28).reverse().forEach(c => W.residents.push(new SeekerActor(c, routeOf(c), 'resident')));
    explicit.slice(mobile ? 14 : 28, mobile ? 20 : 36).reverse().forEach(c => W.queue.push(c));
    pending.slice(0, mobile ? 5 : 8).forEach(addPendingResident);
    // pre-seed the promenade so the first frame already has runners
    const preset = mobile ? [0.12, 0.42] : [0.1, 0.3, 0.52];
    for (const p of preset) {
     const claim = W.queue.shift();
      if (!claim) break;
      const route = routeOf(claim);
      if (route === 'pending') continue;
      const actor = new SeekerActor(claim, route);
      actor.progress = p;
      W.active.push(actor);
    }
    claims.forEach(c => W.seen.add(idOf(c)));
    W.first = false;
  } else {
    for (const c of claims.slice().reverse()) {
      const id = idOf(c);
      if (!W.seen.has(id)) {
        const route = routeOf(c);
        if (route === 'pending') addPendingResident(c); else W.queue.push(c);
        W.seen.add(id);
      }
    }
  }
  W.state = { ...data, counts };
}

function buildPopulation(count) {
  if (W.population) {
    W.world.remove(W.population);
    W.population.geometry.dispose(); W.population.material.dispose();
  }
  W.populationCount = count; if (!count) return;
  const shown = Math.min(count, 12000), pos = new Float32Array(shown * 3), col = new Float32Array(shown * 3), r = rngFor(`population-${count}`);
  for (let i = 0; i < shown; i++) {
    const side = r() > 0.5 ? 1 : -1, angle = r() * Math.PI * 2, rad = 4 + r() * 13;
    pos[i * 3] = side * CITY_X + Math.cos(angle) * rad;
    pos[i * 3 + 1] = 0.3 + r() * 3.6;
    pos[i * 3 + 2] = CITY_Z + Math.sin(angle) * rad * 0.72;
    const c = i % 5 === 0 ? COLORS.pending : (side < 0 ? COLORS.summer : COLORS.staking);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  W.population = new THREE.Points(g, new THREE.PointsMaterial({
    size: mobile ? 0.035 : 0.045, vertexColors: true, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  W.population.position.y = 0.1;
  W.world.add(W.population);
}

function spawnActors(time) {
  const cap = mobile ? 2 : 3, interval = mobile ? 9 : 8;
  if (!W.queue.length || W.active.length >= cap || time - W.lastSpawn < interval) return;
  const claim = W.queue.shift(), route = routeOf(claim);
  if (route === 'pending') return;
  W.active.push(new SeekerActor(claim, route));
  W.lastSpawn = time;
  announce(claim, route);
}

/* ---------- interaction ---------- */
function bindInteraction() {
  addEventListener('pointermove', e => {
    W.pointerActive = true;
    W.pointer.x = e.clientX / innerWidth * 2 - 1;
    W.pointer.y = -(e.clientY / innerHeight * 2 - 1);
  });
  addEventListener('pointerleave', () => {
    W.pointerActive = false; W.pointer.set(0, 0);
    if (W.hovered) { W.hovered.label.visible = false; W.hovered = null; }
  });
  W.renderer.domElement.addEventListener('pointerup', e => {
    const p = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1));
    W.raycaster.setFromCamera(p, W.camera);
    const hits = W.raycaster.intersectObjects(W.phoneMeshes, false);
    if (!hits.length) return;
    const actor = hits[0].object.userData.phoneRoot?.userData.actor;
    const url = actor?.claim?.solscan;
    if (validSolscan(url)) open(url, '_blank', 'noopener,noreferrer');
  });
  addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 150));
}

function updateHoveredResident() {
  if (mobile || !W.pointerActive) return;
  W.raycaster.setFromCamera(W.pointer, W.camera);
  const hit = W.raycaster.intersectObjects(W.phoneMeshes, false)[0];
  let actor = hit?.object?.userData?.phoneRoot?.userData?.actor;
  if (actor && actor.mode !== 'chill' && actor.mode !== 'work' && actor.mode !== 'pendingIdle') actor = null;
  if (W.hovered === actor) return;
  if (W.hovered) W.hovered.label.visible = false;
  W.hovered = actor;
  if (actor) actor.label.visible = true;
  W.renderer.domElement.style.cursor = actor ? 'pointer' : 'default';
}

function resize() {
  const w = innerWidth, h = innerHeight;
  W.camera.aspect = w / h; W.camera.fov = w < 760 ? 57 : 46;
  W.camera.updateProjectionMatrix();
  W.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, w < 760 ? 1.15 : 1.35));
  W.renderer.setSize(w, h);
  W.composer.setSize(w, h);
  W.labels.setSize(w, h);
  const z = w < 760 ? 40 : 30, y = w < 760 ? 14.5 : 10.2;
  W.camera.position.set(0, y, z);
  W.camera.lookAt(0, 1.6, -14);
}

function updateCamera(time) {
  W.pointerSmooth.lerp(W.pointer, 0.035);
  const z = mobile ? 40 : 30, y = mobile ? 14.5 : 10.2;
  W.camera.position.x = W.pointerSmooth.x * (mobile ? 0.7 : 1.5) + Math.sin(time * 0.05) * 0.3;
  W.camera.position.y = y + W.pointerSmooth.y * 0.45;
  W.camera.position.z = z;
  W.camera.lookAt(W.pointerSmooth.x * 1.1, 1.6 - W.pointerSmooth.y * 0.2, -14);
}

/* ---------- frame loop ---------- */
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(W.clock.getDelta(), 0.05), time = W.clock.elapsedTime;
  W.time = time;

  spawnActors(time);
  W.active.forEach(a => { a.update(dt, time); a.label.visible = mobile; });
  W.active = W.active.filter(a => a.mode === 'moving');
  W.residents.forEach(a => a.update(dt, time));
  W.pendingResidents.forEach(a => a.update(dt, time));

  W.pulses.forEach(p => {
    p.offset = (p.offset + dt * p.speed) % 1;
    const q = p.curve.getPoint(p.offset);
    p.mesh.position.copy(q); p.mesh.position.y = 0.15 + Math.sin(time * 3 + p.offset * 9) * 0.04;
  });
  W.cityRings.forEach(r => r.mesh.rotation.z = time * r.speed + r.phase);
  W.kinetic.forEach(k => { if (k.axis === 'x') k.mesh.rotation.x = time * k.speed; else k.mesh.rotation.z = time * k.speed; });
  W.palms.forEach(p => { p.fronds.rotation.z = Math.sin(time * 0.5 + p.phase) * p.amp; p.fronds.rotation.x = Math.sin(time * 0.37 + p.phase * 1.3) * p.amp * 0.6; });
  W.umbrellas.forEach(u => { u.mesh.rotation.z = Math.sin(time * 0.4 + u.phase) * 0.03; });
  W.stringLights.forEach(b => { b.mesh.material.opacity = 1; const s = 0.85 + Math.sin(time * 2.2 + b.phase) * 0.3; b.mesh.scale.setScalar(s); });
  W.clouds.forEach(c => { c.sprite.position.x += dt * c.speed; if (c.sprite.position.x > 62) c.sprite.position.x = -62; });
  if (W.air) W.air.rotation.y = Math.sin(time * 0.03) * 0.02;
  if (W.population) W.population.rotation.y = Math.sin(time * 0.022) * 0.012;
  if (W.ocean) W.ocean.uniforms.time.value = time;
  if (W.foam) W.foam.material.opacity = 0.24 + Math.sin(time * 1.1) * 0.08;

  // birds
  W.birdTimer -= dt;
  if (W.birdTimer <= 0 && W.birds.t < 0) {
    W.birds.t = 0;
    W.birds.group.visible = true;
    W.birds.fromX = -58; W.birds.baseY = 14 + Math.random() * 9;
    W.birdTimer = 38 + Math.random() * 40;
  }
  if (W.birds.t >= 0) {
    W.birds.t += dt / 34;
    const t = W.birds.t;
    W.birds.group.position.set(lerp(-58, 58, t), W.birds.baseY + Math.sin(t * 6) * 0.8, -64);
    W.birds.group.children.forEach((b, i) => { b.rotation.x = Math.sin(time * 7 + i) * 0.4; });
    if (t >= 1) { W.birds.t = -1; W.birds.group.visible = false; }
  }

  // shooting star
  W.starTimer -= dt;
  if (W.starTimer <= 0 && W.shootingStar.t < 0) {
    const s = W.shootingStar;
    s.t = 0; s.sprite.visible = true;
    s.from.set(-34 + Math.random() * 40, 24 + Math.random() * 8, -70);
    s.to.copy(s.from).add(new THREE.Vector3(14 + Math.random() * 8, -7 - Math.random() * 4, 0));
    W.starTimer = 55 + Math.random() * 50;
  }
  if (W.shootingStar.t >= 0) {
    const s = W.shootingStar; s.t += dt / 1.3;
    if (s.t >= 1) { s.t = -1; s.sprite.visible = false; }
    else {
      s.sprite.position.copy(s.from).lerp(s.to, s.t);
      s.sprite.material.opacity = Math.sin(s.t * Math.PI);
    }
  }

  if (W.frames % 8 === 0) updateHoveredResident();
  updateCamera(time);
  W.composer.render();
  W.labels.render(W.scene, W.camera);
  W.frames++;
  if (time - W.fpsTime >= 1) {
    W.lastFps = Math.round(W.frames / (time - W.fpsTime));
    W.frames = 0; W.fpsTime = time;
    ui.fps.textContent = `${W.lastFps} FPS · WEBGL2`;
  }
}

/* ---------- world build ---------- */
function buildWorld() {
  addSky();
  addLights();
  addPromenadeAndBeach();
  addOcean();
  createRoadNetwork();
  createSummerCity();
  createStakingCity();
  createScannerPlaza();
  addPalms();
  addRoutePulses();
}

init().catch(error => {
  console.error(error);
  ui.loaderText.textContent = '3D ENGINE ERROR · CHECK CONSOLE';
  ui.status.textContent = 'WORLD ENGINE OFFLINE';
});

// debug handle for QA probes (positions, modes, counts)
window.__seeker = W;
