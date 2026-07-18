import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const COLORS = {
  summer: new THREE.Color('#91eadc'),
  staking: new THREE.Color('#ffad7d'),
  pending: new THREE.Color('#d83e78'),
  pink: new THREE.Color('#f25386'),
  violet: new THREE.Color('#713b83'),
  ink: new THREE.Color('#090412')
};
const HEX = { summer:'#91eadc', staking:'#ffad7d', pending:'#d83e78' };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(max-width: 760px)').matches;
const CITY_X = mobile ? 11.35 : 13.5;
const fmt = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2});
const root = document.querySelector('#webgl');
const ui = Object.fromEntries(['loader','loaderText','loaderBar','summerCount','stakingCount','pendingCount','summerMeter','stakingMeter','claimCount','claimed','arrival','arrivalCity','arrivalName','arrivalAmount','status','fps'].map(id=>[id,document.querySelector(`#${id}`)]));

const W = {
  scene:null, camera:null, renderer:null, labels:null, composer:null, bloom:null, clock:new THREE.Clock(),
  pointer:new THREE.Vector2(), pointerSmooth:new THREE.Vector2(), raycaster:new THREE.Raycaster(),
  commonCurve:null, summerCurve:null, stakingCurve:null, pulses:[], residents:[], active:[], queue:[], pendingResidents:[], seen:new Set(),
  population:null, populationCount:0, scanner:null, cityRings:[], signs:[], kinetic:[], first:true, state:null,
  lastSpawn:0, frames:0, fpsTime:0, lastFps:0, world:new THREE.Group(), phoneMeshes:[], introDone:false, hovered:null, pointerActive:false
};

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
const rngFor=seed=>{let n=hash(seed)||1;return()=>((n=Math.imul(n^n>>>15,1|n))^n+Math.imul(n^n>>>7,61|n),((n^n>>>14)>>>0)/4294967296)};
const idOf=c=>c.signature||c.sig||`${c.claimer||c.owner}-${c.amount}-${c.blockTime||c.timestamp}`;
const routeOf=c=>c.route==='staking'||c.staked===true?'staking':c.route==='summer'||c.staked===false?'summer':'pending';
const nameOf=c=>c.domain||c.name||c.skrDomain||`${String(c.claimer||c.owner||'seeker').slice(0,5)}…${String(c.claimer||c.owner||'').slice(-3)}`;
const validSolscan=u=>typeof u==='string'&&u.startsWith('https://solscan.io/tx/');
const amountOf=c=>Number(c.amount)||0;

function loadStep(percent,text){ui.loaderBar.style.width=`${percent}%`;ui.loaderText.textContent=text}

async function init(){
  loadStep(12,'LOADING THREE.JS WORLD');
  await document.fonts.ready;
  setupRenderer();
  loadStep(30,'BUILDING THE COASTLINE');
  buildWorld();
  loadStep(62,'LIGHTING BOTH CITIES');
  buildAtmosphere();
  bindInteraction();
  resize();
  loadStep(78,'CONNECTING LIVE ROUTES');
  await fetchState();
  loadStep(100,'CITY IS ALIVE');
  setTimeout(()=>ui.loader.classList.add('hidden'),450);
  W.clock.start();
  requestAnimationFrame(frame);
  setInterval(fetchState,10000);
}

function setupRenderer(){
  W.scene=new THREE.Scene();
  W.scene.fog=new THREE.FogExp2('#3a1747',mobile?.0155:.0115);
  W.camera=new THREE.PerspectiveCamera(mobile?57:46,innerWidth/innerHeight,.1,160);
  W.renderer=new THREE.WebGLRenderer({antialias:!mobile,powerPreference:'high-performance',alpha:false});
  W.renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile?1.15:1.35));
  W.renderer.setSize(innerWidth,innerHeight);
  W.renderer.outputColorSpace=THREE.SRGBColorSpace;
  W.renderer.toneMapping=THREE.ACESFilmicToneMapping;
  W.renderer.toneMappingExposure=1.19;
  W.renderer.shadowMap.enabled=!mobile;
  W.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  root.appendChild(W.renderer.domElement);

  W.labels=new CSS2DRenderer();
  W.labels.setSize(innerWidth,innerHeight);
  W.labels.domElement.className='label-layer';
  root.appendChild(W.labels.domElement);

  W.composer=new EffectComposer(W.renderer);
  W.composer.addPass(new RenderPass(W.scene,W.camera));
  W.bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),mobile?.48:.72,.72,.74);
  W.composer.addPass(W.bloom);
  W.composer.addPass(new OutputPass());
  W.scene.add(W.world);
}

function buildWorld(){
  addSky();
  addLights();
  addGroundAndWater();
  createRoadNetwork();
  createCity('summer',-CITY_X,-24);
  createCity('staking',CITY_X,-24);
  createScannerPlaza();
  addPalms();
  addStreetLights();
  addRoutePulses();
}

function addSky(){
  const sky=new THREE.Mesh(new THREE.SphereGeometry(95,32,16),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#18092d')},mid:{value:new THREE.Color('#8f3278')},bottom:{value:new THREE.Color('#ff806d')}},
    vertexShader:'varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec3 vPos; uniform vec3 top;uniform vec3 mid;uniform vec3 bottom;void main(){float h=normalize(vPos).y;vec3 c=h>.05?mix(mid,top,smoothstep(.05,.72,h)):mix(bottom,mid,smoothstep(-.3,.05,h));gl_FragColor=vec4(c,1.);}'
  }));
  W.scene.add(sky);
  const sunTexture=radialTexture(['rgba(255,255,232,1)','rgba(255,221,158,1)','rgba(255,128,101,.72)','rgba(242,83,134,0)']);
  const sun=new THREE.Sprite(new THREE.SpriteMaterial({map:sunTexture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  sun.position.set(4.2,10.5,-59);sun.scale.set(24,24,1);W.scene.add(sun);
  const sunCore=new THREE.Sprite(new THREE.SpriteMaterial({map:radialTexture(['rgba(255,255,235,1)','rgba(255,232,177,1)','rgba(255,159,112,.96)','rgba(255,116,103,0)']),transparent:true,depthWrite:false,toneMapped:false}));
  sunCore.position.set(4.2,10.5,-58.8);sunCore.scale.set(10.5,10.5,1);W.scene.add(sunCore);
  const mountainMat=new THREE.MeshBasicMaterial({color:'#351744',fog:false});
  for(let i=0;i<18;i++){const r=rngFor(`mountain-${i}`),m=new THREE.Mesh(new THREE.ConeGeometry(5+r()*8,7+r()*9,3),mountainMat);m.position.set(-52+i*6+(r()-.5)*3,1,-54-r()*5);m.rotation.y=r()*Math.PI;W.world.add(m)}
}

function radialTexture(stops){
  const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d'),g=x.createRadialGradient(128,128,0,128,128,128);stops.forEach((s,i)=>g.addColorStop(i/(stops.length-1),s));x.fillStyle=g;x.fillRect(0,0,256,256);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

function addLights(){
  W.scene.add(new THREE.AmbientLight('#a76482',.92));
  W.scene.add(new THREE.HemisphereLight('#ffe1c2','#16071f',2.05));
  const key=new THREE.DirectionalLight('#ffd4aa',3.65);key.position.set(-10,28,18);key.castShadow=!mobile;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-35;key.shadow.camera.right=35;key.shadow.camera.top=30;key.shadow.camera.bottom=-35;W.scene.add(key);
  const sunset=new THREE.DirectionalLight('#ff7495',1.5);sunset.position.set(14,10,-30);W.scene.add(sunset);
  const pink=new THREE.PointLight('#f25386',38,48,2);pink.position.set(-15,8,-20);W.world.add(pink);
  const gold=new THREE.PointLight('#ffad7d',42,48,2);gold.position.set(15,8,-21);W.world.add(gold);
  const cyan=new THREE.PointLight('#91eadc',30,44,2);cyan.position.set(0,4,3);W.world.add(cyan);
}

function addGroundAndWater(){
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(86,90),new THREE.MeshStandardMaterial({color:'#21102b',emissive:'#5a1d50',emissiveIntensity:.18,roughness:.82,metalness:.12}));ground.rotation.x=-Math.PI/2;ground.position.set(0,-.12,-13);ground.receiveShadow=!mobile;W.world.add(ground);
  const waterMat=new THREE.MeshPhysicalMaterial({color:'#231540',emissive:'#8d285f',emissiveIntensity:.34,roughness:.18,metalness:.28,transparent:true,opacity:.88});
  for(const x of [-34,34]){const water=new THREE.Mesh(new THREE.PlaneGeometry(24,84,12,12),waterMat);water.rotation.x=-Math.PI/2;water.position.set(x,-.04,-17);W.world.add(water)}
  const grid=new THREE.GridHelper(82,50,'#713b83','#46345d');grid.position.y=-.02;grid.position.z=-13;grid.material.opacity=.2;grid.material.transparent=true;W.world.add(grid);
}

function createRoadNetwork(){
  W.commonCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,.03,18.5),new THREE.Vector3(0,.03,10.5),new THREE.Vector3(0,.03,3.5),new THREE.Vector3(0,.03,-3)]);
  W.summerCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,.04,-3),new THREE.Vector3(-2,.04,-8),new THREE.Vector3(-7,.04,-13),new THREE.Vector3(-CITY_X,.04,-19.5)]);
  W.stakingCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,.045,-3),new THREE.Vector3(2,.045,-8),new THREE.Vector3(7,.045,-13),new THREE.Vector3(CITY_X,.045,-19.5)]);
  createRoad(W.commonCurve,5.7,COLORS.pink,'common');
  createRoad(W.summerCurve,4.5,COLORS.summer,'summer');
  createRoad(W.stakingCurve,4.5,COLORS.staking,'staking');
  addRouteChevrons(W.summerCurve,'summer');
  addRouteChevrons(W.stakingCurve,'staking');
}

function addRouteChevrons(curve,route){
  const mat=new THREE.MeshBasicMaterial({color:COLORS[route],transparent:true,opacity:.9,side:THREE.DoubleSide}),geo=new THREE.ConeGeometry(.24,.62,3);
  for(const t of [.32,.53,.74]){const p=curve.getPoint(t),tan=curve.getTangent(t),arrow=new THREE.Mesh(geo,mat);arrow.position.copy(p);arrow.position.y=.095;arrow.rotation.x=Math.PI/2;arrow.rotation.z=-Math.atan2(tan.x,tan.z);W.world.add(arrow)}
}

function roadGeometry(curve,width,segments=80){
  const pos=[],uv=[],idx=[];
  for(let i=0;i<=segments;i++){const t=i/segments,p=curve.getPoint(t),tan=curve.getTangent(t).normalize(),side=new THREE.Vector3(-tan.z,0,tan.x).multiplyScalar(width/2);for(const k of [-1,1]){const q=p.clone().addScaledVector(side,k);pos.push(q.x,q.y,q.z);uv.push(k<0?0:1,t*8)}}
  for(let i=0;i<segments;i++){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}

function createRoad(curve,width,accent,name){
  const road=new THREE.Mesh(roadGeometry(curve,width),new THREE.MeshStandardMaterial({color:'#271426',emissive:'#6d2858',emissiveIntensity:.18,roughness:.58,metalness:.38}));road.receiveShadow=!mobile;road.userData.name=name;W.world.add(road);
  const tubeGeo=new THREE.TubeGeometry(curve,80,.04,6,false),edgeMat=new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:.58});
  for(const side of [-1,1]){const edgeCurve=new THREE.CatmullRomCurve3(Array.from({length:33},(_,i)=>{const t=i/32,p=curve.getPoint(t),tan=curve.getTangent(t),perp=new THREE.Vector3(-tan.z,0,tan.x).normalize();return p.addScaledVector(perp,side*width*.49).add(new THREE.Vector3(0,.035,0))}));W.world.add(new THREE.Mesh(new THREE.TubeGeometry(edgeCurve,64,.045,5,false),edgeMat))}
  const markerMat=new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:.34}),markerGeo=new THREE.BoxGeometry(.07,.025,.62);
  const total=name==='common'?18:11;
  if(name!=='common')for(let i=2;i<total;i+=2){const t=i/total,p=curve.getPoint(t),tan=curve.getTangent(t),m=new THREE.Mesh(markerGeo,markerMat);m.position.copy(p).add(new THREE.Vector3(0,.035,0));m.rotation.y=Math.atan2(tan.x,tan.z);W.world.add(m)}
}

function createCity(route,x,z){
  const accent=COLORS[route],second=route==='summer'?COLORS.violet:COLORS.pink;
  const group=new THREE.Group();group.position.set(x,0,z);W.world.add(group);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(10.4,11,.42,48),new THREE.MeshStandardMaterial({color:route==='summer'?'#163342':'#48213c',emissive:accent,emissiveIntensity:.11,metalness:.28,roughness:.61}));base.position.y=.05;base.receiveShadow=!mobile;group.add(base);
  for(const radius of [5.1,8.7]){const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.045,6,96),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:radius<6?.72:.36}));ring.rotation.x=Math.PI/2;ring.position.y=.29;group.add(ring);W.cityRings.push({mesh:ring,speed:(route==='summer'?1:-1)*(radius<6?.11:.06),phase:x})}
  const plaza=new THREE.Mesh(new THREE.CylinderGeometry(3.8,4,.22,32),new THREE.MeshStandardMaterial({color:'#170c27',metalness:.65,roughness:.25,emissive:accent,emissiveIntensity:.12}));plaza.position.y=.34;group.add(plaza);
  const r=rngFor(route+'-architecture'),count=mobile?27:44;
  for(let i=0;i<count;i++){
    let bx,bz,d=0;do{bx=(r()-.5)*18;bz=(r()-.5)*18;d=Math.hypot(bx,bz)}while(d<4.7||d>9.6);
    const w=.75+r()*1.45,dep=.75+r()*1.35,h=1.3+r()*5.8*(1-d/14),geo=new RoundedBoxGeometry(w,h,dep,2,.08);
    const mat=new THREE.MeshStandardMaterial({map:facadeTexture(route,i,w,h),color:route==='summer'?'#254158':'#542648',emissive:accent,emissiveIntensity:.08,metalness:.3,roughness:.52});
    const b=new THREE.Mesh(geo,mat);b.position.set(bx,h/2+.43,bz);b.castShadow=!mobile&&i<14;b.receiveShadow=!mobile;group.add(b);
    if(i%4===0){const roof=new THREE.Mesh(new THREE.BoxGeometry(w*.68,.035,dep*.68),new THREE.MeshBasicMaterial({color:i%8===0?second:accent}));roof.position.set(bx,h+.46,bz);group.add(roof)}
  }
  const tower=createLandmark(route);tower.position.set(route==='summer'?-5.7:5.7,0,-3.6);group.add(tower);
  group.add(createDistrictFeature(route));
  const title=makeTextSprite(route==='summer'?'SUMMER CITY':'STAKING CITY',HEX[route],route==='summer'?'CLAIM-ONLY DISTRICT':'LOCKED-IN DISTRICT');title.position.set(0,6.6,-2.4);title.scale.set(mobile?5.7:9.5,mobile?2.05:3.2,1);group.add(title);W.signs.push(title);
  const halo=new THREE.PointLight(HEX[route],24,19,2);halo.position.set(0,4,0);group.add(halo);
}

function facadeTexture(route,seed,w,h){
  const c=document.createElement('canvas');c.width=64;c.height=128;const x=c.getContext('2d'),r=rngFor(`${route}-${seed}`),accent=HEX[route];x.fillStyle=route==='summer'?'#11162b':'#211020';x.fillRect(0,0,64,128);x.strokeStyle='rgba(255,255,255,.035)';for(let i=0;i<64;i+=16){x.beginPath();x.moveTo(i,0);x.lineTo(i,128);x.stroke()}
  for(let yy=8;yy<122;yy+=13)for(let xx=7;xx<59;xx+=13){x.fillStyle=r()>.23?(r()>.18?accent:'#ff4f9d'):'rgba(5,4,15,.8)';x.globalAlpha=.22+r()*.58;x.fillRect(xx,yy,5,7)}x.globalAlpha=1;
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(Math.max(1,w*.6),Math.max(1,h*.34));t.anisotropy=2;return t;
}

function createLandmark(route){
  const g=new THREE.Group(),accent=COLORS[route];
  const body=new THREE.Mesh(new RoundedBoxGeometry(2.2,7.8,2.2,3,.18),new THREE.MeshStandardMaterial({color:'#130c24',emissive:accent,emissiveIntensity:.12,metalness:.62,roughness:.25}));body.position.y=4.3;g.add(body);
  for(let y=1.1;y<7.7;y+=.58){const strip=new THREE.Mesh(new THREE.BoxGeometry(2.23,.055,2.23),new THREE.MeshBasicMaterial({color:y%1.16<.2?COLORS.pink:accent,transparent:true,opacity:.78}));strip.position.y=y+.3;g.add(strip)}
  const crown=new THREE.Mesh(new THREE.ConeGeometry(1.4,2,4),new THREE.MeshBasicMaterial({color:accent,wireframe:true}));crown.position.y=9.15;crown.rotation.y=Math.PI/4;g.add(crown);return g;
}

function createDistrictFeature(route){
  const g=new THREE.Group(),accent=COLORS[route];g.position.set(route==='summer'?3.5:-3.5,.45,2.7);
  if(route==='summer'){
    const wheel=new THREE.Mesh(new THREE.TorusGeometry(1.55,.07,8,64),new THREE.MeshBasicMaterial({color:accent}));wheel.position.y=1.75;g.add(wheel);
    for(let i=0;i<8;i++){const spoke=new THREE.Mesh(new THREE.BoxGeometry(.025,1.45,.025),new THREE.MeshBasicMaterial({color:i%2?COLORS.pink:accent,transparent:true,opacity:.7}));spoke.position.y=1.75;spoke.rotation.z=i*Math.PI/8;g.add(spoke)}
    const stand=new THREE.Mesh(new THREE.CylinderGeometry(.05,.08,1.55,6),new THREE.MeshStandardMaterial({color:'#43314e',metalness:.8}));stand.position.y=.78;g.add(stand);W.kinetic.push({mesh:wheel,speed:.08,type:'wheel'});
  }else{
    for(let i=0;i<4;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.55+i*.2,.06,8,48),new THREE.MeshBasicMaterial({color:i%2?COLORS.pink:accent}));ring.rotation.x=Math.PI/2;ring.position.y=.45+i*.48;g.add(ring);W.kinetic.push({mesh:ring,speed:(i%2?-.16:.12),type:'vault'})}
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.1,.28,3.25,8),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:.5,blending:THREE.AdditiveBlending}));beam.position.y=1.5;g.add(beam);
  }
  return g;
}

function createScannerPlaza(){
  const g=new THREE.Group();g.position.set(0,0,-8.1);
  const disc=new THREE.Mesh(new THREE.CylinderGeometry(2.25,2.45,.1,32),new THREE.MeshStandardMaterial({color:'#170d1b',emissive:COLORS.pending,emissiveIntensity:.045,metalness:.25,roughness:.8}));disc.position.y=.08;g.add(disc);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.78,.025,6,64),new THREE.MeshBasicMaterial({color:COLORS.pending,transparent:true,opacity:.16}));ring.rotation.x=Math.PI/2;ring.position.y=.15;g.add(ring);
  W.world.add(g);W.scanner=g;
}

function addPalms(){
  const trunkGeo=new THREE.CylinderGeometry(.07,.12,2.1,6),trunkMat=new THREE.MeshStandardMaterial({color:'#4a2036',roughness:.92}),leafGeo=new THREE.ConeGeometry(.13,1.25,4),leafMat=new THREE.MeshStandardMaterial({color:'#184b47',emissive:'#28bf9d',emissiveIntensity:.11,roughness:.72,side:THREE.DoubleSide});
  const spots=[];
  for(const curve of [W.commonCurve,W.summerCurve,W.stakingCurve])for(let i=2;i<10;i+=2)for(const side of [-1,1]){const t=i/11,p=curve.getPoint(t),tan=curve.getTangent(t),perp=new THREE.Vector3(-tan.z,0,tan.x).normalize();spots.push(p.addScaledVector(perp,side*(curve===W.commonCurve?4.5:3.5)))}
  spots.forEach((p,i)=>{if(mobile&&i%2)return;const g=new THREE.Group();g.position.copy(p);const trunk=new THREE.Mesh(trunkGeo,trunkMat);trunk.position.y=1.05;trunk.rotation.z=(i%3-1)*.035;g.add(trunk);for(let k=0;k<6;k++){const leaf=new THREE.Mesh(leafGeo,leafMat);leaf.position.y=2.15;leaf.rotation.z=Math.PI/2.45;leaf.rotation.y=k*Math.PI/3;leaf.translateY(.45);g.add(leaf)}W.world.add(g)});
}

function addStreetLights(){
  const poleGeo=new THREE.CylinderGeometry(.025,.045,1.9,6),poleMat=new THREE.MeshStandardMaterial({color:'#171320',metalness:.8,roughness:.25}),bulbGeo=new THREE.SphereGeometry(.09,8,6);
  for(const [curve,color] of [[W.commonCurve,COLORS.pink],[W.summerCurve,COLORS.summer],[W.stakingCurve,COLORS.staking]])for(let i=2;i<12;i+=2)for(const side of [-1,1]){const t=i/13,p=curve.getPoint(t),tan=curve.getTangent(t),perp=new THREE.Vector3(-tan.z,0,tan.x).normalize(),g=new THREE.Group();g.position.copy(p.addScaledVector(perp,side*(curve===W.commonCurve?3.25:2.65)));const pole=new THREE.Mesh(poleGeo,poleMat);pole.position.y=.95;g.add(pole);const bulb=new THREE.Mesh(bulbGeo,new THREE.MeshBasicMaterial({color}));bulb.position.y=1.92;g.add(bulb);W.world.add(g)}
}

function makeTextSprite(title,color,sub=''){
  const c=document.createElement('canvas');c.width=1024;c.height=360;const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);x.textAlign='center';x.shadowColor=color;x.shadowBlur=28;x.fillStyle=color;x.font='italic 900 82px "Archivo Black"';x.fillText(title,512,150);x.shadowBlur=0;x.fillStyle='#fff7e9';x.font='500 26px "DM Mono"';x.letterSpacing='7px';x.fillText(sub,512,210);x.strokeStyle=color;x.globalAlpha=.65;x.lineWidth=3;x.beginPath();x.moveTo(210,248);x.lineTo(814,248);x.stroke();const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,toneMapped:false}));return sprite;
}

function addRoutePulses(){
  const geo=new THREE.SphereGeometry(.09,8,6);
  for(const [curve,route,count] of [[W.commonCurve,'summer',7],[W.commonCurve,'staking',7],[W.summerCurve,'summer',7],[W.stakingCurve,'staking',7]])for(let i=0;i<count;i++){const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:COLORS[route]}));W.world.add(mesh);W.pulses.push({mesh,curve,offset:i/count+(route==='staking'?.5:0),speed:.035+(i%3)*.004})}
}

function buildAtmosphere(){
  const count=mobile?360:700,pos=new Float32Array(count*3),col=new Float32Array(count*3),r=rngFor('seeker-neon-air');
  for(let i=0;i<count;i++){pos[i*3]=(r()-.5)*70;pos[i*3+1]=1+r()*26;pos[i*3+2]=-48+r()*76;const c=r()>.58?COLORS.pink:(r()>.5?COLORS.summer:COLORS.staking);col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));const points=new THREE.Points(g,new THREE.PointsMaterial({size:.065,vertexColors:true,transparent:true,opacity:.38,blending:THREE.AdditiveBlending,depthWrite:false}));points.userData.air=true;W.world.add(points);W.air=points;
}

let exactPhoneTexture;
function getExactPhoneTexture(){
  if(exactPhoneTexture)return exactPhoneTexture;
  exactPhoneTexture=new THREE.TextureLoader().load('./assets/seeker-phone-exact.png');
  exactPhoneTexture.colorSpace=THREE.SRGBColorSpace;exactPhoneTexture.anisotropy=Math.min(8,W.renderer.capabilities.getMaxAnisotropy());return exactPhoneTexture;
}

function createPhone(route='summer',scale=1){
  const accent=COLORS[route]||COLORS.pending,g=new THREE.Group(),walker=new THREE.Group();g.scale.setScalar(scale);walker.position.y=-.985;g.add(walker);g.userData.walker=walker;
  const support=new THREE.Mesh(new RoundedBoxGeometry(.955,2.0,.055,4,.11),new THREE.MeshStandardMaterial({color:'#26313a',metalness:.4,roughness:.66,transparent:true,opacity:.62}));support.position.set(0,1,-.035);walker.add(support);
  const phone=new THREE.Mesh(new THREE.PlaneGeometry(.955,2),new THREE.MeshBasicMaterial({map:getExactPhoneTexture(),transparent:false,alphaTest:.07,depthWrite:true,toneMapped:false,side:THREE.DoubleSide}));phone.position.set(0,1,.012);walker.add(phone);
  const dock=new THREE.Mesh(new RoundedBoxGeometry(.48,.065,.24,3,.03),new THREE.MeshStandardMaterial({color:'#17151a',metalness:.32,roughness:.82}));dock.position.set(0,-.985,-.025);g.add(dock);
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(.58,28),new THREE.MeshBasicMaterial({color:'#000000',transparent:true,opacity:.52,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-.992;shadow.scale.y=.26;g.add(shadow);
  const routeGlow=new THREE.Mesh(new THREE.CircleGeometry(.62,28),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:.095,blending:THREE.AdditiveBlending,depthWrite:false}));routeGlow.rotation.x=-Math.PI/2;routeGlow.position.y=-.99;routeGlow.scale.y=.24;g.add(routeGlow);
  g.traverse(o=>{if(o.isMesh)o.userData.phoneRoot=g});W.phoneMeshes.push(phone,support);return g;
}

function makePhoneDataPlate(claim,route){
  const c=document.createElement('canvas');c.width=768;c.height=220;const x=c.getContext('2d'),accent=HEX[route]||HEX.pending;
  x.clearRect(0,0,c.width,c.height);x.beginPath();x.roundRect(8,8,752,204,38);x.fillStyle='rgba(6,5,9,.9)';x.fill();x.lineWidth=4;x.strokeStyle=`${accent}99`;x.stroke();
  x.beginPath();x.arc(48,66,10,0,Math.PI*2);x.fillStyle=accent;x.shadowColor=accent;x.shadowBlur=22;x.fill();x.shadowBlur=0;
  x.textBaseline='middle';x.fillStyle='#fff';x.font='700 54px "Space Grotesk"';x.fillText(nameOf(claim),82,72,640);
  x.fillStyle=accent;x.font='500 30px "DM Mono"';x.fillText(`${fmt.format(amountOf(claim))} SKR · ${route==='staking'?'STAKED':'CLAIMED'}`,40,157,680);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,W.renderer.capabilities.getMaxAnisotropy());
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(2.05,.59),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}));plate.position.set(0,2.43,.045);plate.renderOrder=6;plate.userData.texture=texture;return plate;
}

function makeLabel(claim,route,resident=false){
  const a=document.createElement(validSolscan(claim.solscan)?'a':'div');a.className=`phone-label ${resident?'resident':''} ${route==='pending'?'pending':''}`;a.style.setProperty('--accent',HEX[route]);if(a.tagName==='A'){a.href=claim.solscan;a.target='_blank';a.rel='noopener noreferrer';a.title='Open transaction on Solscan'}
  const b=document.createElement('b');b.textContent=nameOf(claim);const s=document.createElement('span');s.textContent=route==='pending'?'ROUTE SCANNING':`${fmt.format(amountOf(claim))} SKR · ${route==='staking'?'STAKED':'CLAIMED'}`;a.append(b,s);return new CSS2DObject(a);
}

class SeekerActor{
  constructor(claim,route,mode='moving'){
    this.claim=claim;this.route=route;this.id=idOf(claim);this.seed=hash(this.id);this.r=rngFor(this.id);this.mode=mode;this.progress=0;this.duration=reduced?.2:52+this.r()*16;this.phase=this.r()*Math.PI*2;this.group=createPhone(route,mode==='resident'?.56:(mobile?.8:1.28));this.walker=this.group.userData.walker;this.group.userData.actor=this;this.label=makeLabel(claim,route,mode==='resident');this.label.position.set(0,2.72,0);this.walker.add(this.label);if(mode==='moving'){this.dataPlate=makePhoneDataPlate(claim,route);this.dataPlate.visible=!mobile;this.walker.add(this.dataPlate)}W.world.add(this.group);if(mode==='moving')this.group.position.copy(W.commonCurve.getPoint(0));else{this.group.traverse(o=>{if(o.isPointLight)o.visible=false});this.label.visible=false;this.placeResident()}
  }
  update(dt,time){
    if(this.mode==='moving')this.travel(dt,time);else this.party(time);
  }
  travel(dt,time){
    this.progress=clamp(this.progress+dt/this.duration,0,1);const commonEnd=.54;let curve,t;if(this.progress<commonEnd){curve=W.commonCurve;t=this.progress/commonEnd}else{curve=this.route==='staking'?W.stakingCurve:W.summerCurve;t=(this.progress-commonEnd)/(1-commonEnd)}
    const p=curve.getPoint(t),tan=curve.getTangent(t),step=time*1.85+this.phase;this.group.position.copy(p);this.group.visible=p.z<14.2;this.group.position.y=this.group.scale.x+.045;this.group.rotation.y=Math.atan2(-tan.x,-tan.z)*.28;this.group.rotation.z=0;this.walker.position.y=-.985+Math.abs(Math.sin(step))*.012;this.walker.position.x=Math.sin(step)*.012;this.walker.rotation.z=Math.sin(step)*.052;this.walker.rotation.y=Math.sin(step*.5)*.01;
    if(this.progress>=1)this.arrive();
  }
  arrive(){this.mode='resident';this.group.scale.setScalar(.56);if(this.dataPlate)this.dataPlate.visible=false;this.group.traverse(o=>{if(o.isPointLight)o.visible=false});this.label.element.classList.add('resident');this.label.visible=false;this.placeResident();announce(this.claim,this.route);W.residents.push(this);const cap=mobile?18:38;if(W.residents.length>cap){const old=W.residents.shift();old.dispose()}}
  placeResident(){
    const center=this.route==='summer'?new THREE.Vector3(-CITY_X,.5,-24):this.route==='staking'?new THREE.Vector3(CITY_X,.5,-24):new THREE.Vector3(0,.5,-8.1),angle=this.r()*Math.PI*2,rad=this.route==='pending'?1.25+this.r()*.65:2.0+this.r()*2.2;this.home=center.add(new THREE.Vector3(Math.cos(angle)*rad,0,Math.sin(angle)*rad));this.group.position.copy(this.home);this.group.rotation.y=-angle*.08;this.group.scale.setScalar(this.route==='pending'?.38:.52);this.restY=this.route==='pending'?.425:.565;this.group.position.y=this.restY;
  }
  party(time){this.group.position.x=this.home.x;this.group.position.z=this.home.z;this.group.position.y=this.restY;this.group.rotation.z=0;this.walker.position.y=-.985+Math.abs(Math.sin(time*.62+this.phase))*.006;this.walker.rotation.z=Math.sin(time*.48+this.phase)*.006}
  dispose(){W.world.remove(this.group);this.label.element.remove();if(this.dataPlate?.userData.texture)this.dataPlate.userData.texture.dispose();this.group.traverse(o=>{if(o.isMesh){const i=W.phoneMeshes.indexOf(o);if(i>=0)W.phoneMeshes.splice(i,1)}})}
}

function addPendingResident(claim){if(W.pendingResidents.length>8)return;const a=new SeekerActor(claim,'pending','resident');W.pendingResidents.push(a)}

function announce(claim,route){ui.arrival.dataset.route=route;ui.arrivalCity.textContent=route==='staking'?'STAKING CITY':'SUMMER CITY';ui.arrivalName.textContent=nameOf(claim);ui.arrivalAmount.textContent=`${fmt.format(amountOf(claim))} SKR · ${route==='staking'?'CLAIM + STAKE':'CLAIM RECEIVED'}`;ui.arrival.classList.remove('flash');void ui.arrival.offsetWidth;ui.arrival.classList.add('flash')}

async function fetchState(){
  try{const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)throw Error(`HTTP ${r.status}`);const data=await r.json();applyState(data);ui.status.textContent='SOLANA TRAFFIC FLOWING'}catch(e){console.error('Live state:',e);ui.status.textContent='RECONNECTING TO SOLANA';if(W.first){ui.loaderText.textContent='WORLD READY · LIVE DATA RETRYING'}}
}

function applyState(data){
  const claims=Array.isArray(data.claims)?data.claims:[],counts={summer:0,staking:0,pending:0};claims.forEach(c=>counts[routeOf(c)]++);const routed=counts.summer+counts.staking||1;
  ui.summerCount.textContent=fmt.format(counts.summer);ui.stakingCount.textContent=fmt.format(counts.staking);ui.pendingCount.textContent=fmt.format(counts.pending);ui.summerMeter.style.width=`${counts.summer/routed*100}%`;ui.stakingMeter.style.width=`${counts.staking/routed*100}%`;ui.claimCount.textContent=fmt.format(Number(data.claimCount)||0);ui.claimed.textContent=`${compact.format(Number(data.claimed)||0)} SKR CLAIMED`;
  const total=Math.max(0,Math.floor(Number(data.claimCount)||0));if(total!==W.populationCount)buildPopulation(total);
  if(W.first){
    const explicit=claims.filter(c=>routeOf(c)!=='pending'),pending=claims.filter(c=>routeOf(c)==='pending');
    explicit.slice(0,mobile?14:28).reverse().forEach(c=>{const a=new SeekerActor(c,routeOf(c),'resident');W.residents.push(a)});
    explicit.slice(mobile?14:28,mobile?20:36).reverse().forEach(c=>W.queue.push(c));
    pending.slice(0,mobile?5:8).forEach(addPendingResident);claims.forEach(c=>W.seen.add(idOf(c)));W.first=false;
  }else{
    for(const c of claims.slice().reverse()){const id=idOf(c);if(!W.seen.has(id)){const route=routeOf(c);if(route==='pending')addPendingResident(c);else W.queue.push(c);W.seen.add(id)}}
  }
  W.state={...data,counts};
}

function buildPopulation(count){
  if(W.population){W.world.remove(W.population);W.population.geometry.dispose();W.population.material.dispose()}
  W.populationCount=count;if(!count)return;const shown=Math.min(count,12000),pos=new Float32Array(shown*3),col=new Float32Array(shown*3),r=rngFor(`population-${count}`);
  for(let i=0;i<shown;i++){const side=r()>.5?1:-1,centerX=side*CITY_X,angle=r()*Math.PI*2,rad=4.2+r()*12.5;pos[i*3]=centerX+Math.cos(angle)*rad;pos[i*3+1]=.28+r()*3.8;pos[i*3+2]=-24+Math.sin(angle)*rad*.72;const c=i%5===0?COLORS.pink:(i%2?COLORS.summer:COLORS.staking);col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));W.population=new THREE.Points(g,new THREE.PointsMaterial({size:mobile?.035:.045,vertexColors:true,transparent:true,opacity:.17,blending:THREE.AdditiveBlending,depthWrite:false}));W.population.position.y=.1;W.world.add(W.population);
}

function spawnActors(time){const cap=mobile?2:4,interval=mobile?9:7;if(!W.queue.length||W.active.length>=cap||time-W.lastSpawn<interval)return;const claim=W.queue.shift(),route=routeOf(claim);if(route==='pending')return;const actor=new SeekerActor(claim,route);W.active.push(actor);W.lastSpawn=time;announce(claim,route)}

function bindInteraction(){
  addEventListener('pointermove',e=>{W.pointerActive=true;W.pointer.x=e.clientX/innerWidth*2-1;W.pointer.y=-(e.clientY/innerHeight*2-1)});
  addEventListener('pointerleave',()=>{W.pointerActive=false;W.pointer.set(0,0);if(W.hovered){W.hovered.label.visible=false;W.hovered=null}});
  W.renderer.domElement.addEventListener('pointerup',e=>{const p=new THREE.Vector2(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight*2-1));W.raycaster.setFromCamera(p,W.camera);const hits=W.raycaster.intersectObjects(W.phoneMeshes,false);if(!hits.length)return;let o=hits[0].object,rootPhone=o.userData.phoneRoot,actor=rootPhone?.userData.actor;const url=actor?.claim?.solscan;if(validSolscan(url))open(url,'_blank','noopener,noreferrer')});
  addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);addEventListener('orientationchange',()=>setTimeout(resize,150));
}

function updateHoveredResident(){
  if(mobile||!W.pointerActive)return;W.raycaster.setFromCamera(W.pointer,W.camera);const hit=W.raycaster.intersectObjects(W.phoneMeshes,false)[0];let actor=hit?.object?.userData?.phoneRoot?.userData?.actor;if(actor?.mode!=='resident')actor=null;if(W.hovered===actor)return;if(W.hovered)W.hovered.label.visible=false;W.hovered=actor;if(actor)actor.label.visible=true;W.renderer.domElement.style.cursor=actor?'pointer':'default';
}

function resize(){
  const w=innerWidth,h=innerHeight;W.camera.aspect=w/h;W.camera.fov=w<760?57:46;W.camera.updateProjectionMatrix();W.renderer.setPixelRatio(Math.min(devicePixelRatio||1,w<760?1.15:1.35));W.renderer.setSize(w,h);W.composer.setSize(w,h);W.labels.setSize(w,h);const z=w<760?39:29,y=w<760?14.5:10.5;W.camera.position.set(0,y,z);W.camera.lookAt(0,1,-12)
}

function updateCamera(time){W.pointerSmooth.lerp(W.pointer,.035);const z=mobile?39:29,y=mobile?14.5:10.5;W.camera.position.x= W.pointerSmooth.x*(mobile?.7:1.45)+Math.sin(time*.055)*.28;W.camera.position.y=y+W.pointerSmooth.y*.42;W.camera.position.z=z;W.camera.lookAt(W.pointerSmooth.x*1.1,1-W.pointerSmooth.y*.2,-12)}

function frame(){
  requestAnimationFrame(frame);const dt=Math.min(W.clock.getDelta(),.05),time=W.clock.elapsedTime;spawnActors(time);W.active.forEach(a=>{a.update(dt,time);a.label.visible=mobile});W.active=W.active.filter(a=>a.mode==='moving');W.residents.forEach(a=>a.update(dt,time));W.pendingResidents.forEach(a=>a.update(dt,time));
  W.pulses.forEach(p=>{p.offset=(p.offset+dt*p.speed)%1;const q=p.curve.getPoint(p.offset);p.mesh.position.copy(q);p.mesh.position.y=.15+Math.sin(time*3+p.offset*9)*.04});
  W.cityRings.forEach(r=>r.mesh.rotation.z=time*r.speed+r.phase);W.kinetic.forEach(k=>{if(k.type==='wheel')k.mesh.rotation.z=time*k.speed;else k.mesh.rotation.z=time*k.speed});if(W.air)W.air.rotation.y=Math.sin(time*.035)*.025;if(W.population)W.population.rotation.y=Math.sin(time*.025)*.012;if(W.frames%8===0)updateHoveredResident();
  updateCamera(time);W.composer.render();W.labels.render(W.scene,W.camera);
  W.frames++;if(time-W.fpsTime>=1){W.lastFps=Math.round(W.frames/(time-W.fpsTime));W.frames=0;W.fpsTime=time;ui.fps.textContent=`${W.lastFps} FPS · WEBGL2`}
}

init().catch(error=>{console.error(error);ui.loaderText.textContent='3D ENGINE ERROR · CHECK CONSOLE';ui.status.textContent='WORLD ENGINE OFFLINE'});
