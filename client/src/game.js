import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {loadCoinTemplate} from './coin.js?logo=2';
import {Mascot} from './mascot.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {LANES,speedAt,hitObstacle,crossed,scoreFor,clampLane} from './rules.js';
const $=id=>document.getElementById(id),canvas=$('game');
let renderer;
try{renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch(e){$('load-status').textContent='WebGL is unavailable. Enable hardware acceleration or try another browser.';throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
const scene=new T.Scene();scene.background=new T.Color('#c4e2d3');scene.fog=new T.Fog('#c4e2d3',48,145);
const camera=new T.PerspectiveCamera(57,innerWidth/innerHeight,.1,420);camera.position.set(0,4.3,7.4);camera.lookAt(0,1,-13);
const hemi=new T.HemisphereLight(0xdaf4ff,0x677d3a,2.0);scene.add(hemi);const sun=new T.DirectionalLight(0xffecc8,3.2);sun.position.set(-12,22,9);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-14,right:14,top:20,bottom:-25,near:.5,far:75});sun.shadow.bias=-.0005;sun.target.position.set(0,0,-15);scene.add(sun,sun.target);
const scenery=new T.Group();scene.add(scenery);let tiles=[],tileLength=72,tileStart=-12,environmentReady=false,chosen='forest',state='menu',loadToken=0;
const cache=new Map(),cityMixers=new WeakMap(),loader=new GLTFLoader();loader.setDRACOLoader(new DRACOLoader().setDecoderPath('lib/three/examples/jsm/libs/draco/gltf/'));
const material=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.75,...extra});
const blue=material('#00b5e2',{metalness:.15,roughness:.35}),white=material('#f3f4eb'),dark=material('#112d39'),wood=material('#713b1f'),cut=material('#d89a51'),stone=material('#7d8586'),stripe=material('#f5d45b');
function mesh(geo,mat,parent,x=0,y=0,z=0){const o=new T.Mesh(geo,mat);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
const box=(w,h,d,m,p,x=0,y=0,z=0)=>mesh(new T.BoxGeometry(w,h,d),m,p,x,y,z);
const sphere=(r,m,p,x=0,y=0,z=0)=>mesh(new T.SphereGeometry(r,16,12),m,p,x,y,z);
const player=new T.Group(),body=new T.Group();scene.add(player);player.add(body);
const mascot=new Mascot(body);
let characterReady=false,coinReady=false;
function updateReady(){document.dispatchEvent(new CustomEvent('game-ready',{detail:{ready:environmentReady&&characterReady&&coinReady}}));}
mascot.load(loader,'assets/Mascot_Animated.glb').then(()=>{characterReady=true;updateReady();}).catch(e=>{console.error('Mascot load failed',e);$('load-status').textContent='Could not load mascot. Start the local server and reload.';});
const shadow=mesh(new T.CircleGeometry(.48,24),new T.MeshBasicMaterial({color:0x153023,transparent:true,opacity:.22,depthWrite:false}),scene,0,.015,0);shadow.rotation.x=-Math.PI/2;
let ground=0,lane=1,x=0,height=0,velocity=0,slideLeft=0,distance=0,coinCount=0,elapsed=0,spawnAt=22,entities=[],best=0,animTime=0,invincibleLeft=0,magnetLeft=0,hasGift=false,nextMagnetAt=0,nextGiftAt=0;
const MAGNET_TIME=10,MAGNET_RANGE=26,POWER_Y={rock:2.55,log:1.75,barrier:.6,ybarrier:2.2,sbarrier:.55},magnetTarget=new T.Vector3();

let sound=false,audio;function tone(freq,duration=.1,{type='sine',delay=0,volume=.035}={}){if(!sound)return;try{audio??=new AudioContext();audio.resume();const osc=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime+delay;osc.type=type;osc.connect(gain);gain.connect(audio.destination);osc.frequency.value=freq;gain.gain.setValueAtTime(volume,t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);osc.start(t);osc.stop(t+duration);}catch{}}
// Synth jingles as [frequency, start, length]; a file in sfx with the same name takes precedence.
const jingles={click:{type:'triangle',volume:.05,notes:[[660,0,.06]]},magnet:{type:'square',volume:.025,notes:[[392,0,.08],[523,.07,.08],[659,.14,.08],[784,.21,.08],[1047,.28,.25]]},gift:{type:'triangle',volume:.06,notes:[[784,0,.1],[988,.09,.1],[1175,.18,.1],[1568,.27,.35],[1976,.27,.35],[2349,.4,.3]]},revive:{type:'triangle',volume:.06,notes:[[523,0,.12],[659,.1,.12],[784,.2,.12],[1047,.3,.4]]},magnetEnd:{type:'sine',volume:.04,notes:[[660,0,.1],[440,.09,.16]]},count:{type:'square',volume:.03,notes:[[660,0,.12]]},go:{type:'square',volume:.035,notes:[[880,0,.08],[1320,.08,.35]]}};
const music=new Audio('assets/sound/bgsound.mp3');music.loop=true;music.volume=.35;
const sfx={coin:new Audio('assets/sound/coin-colect.mp3'),hit:new Audio('assets/sound/obstacle-hit.mp3'),magnet:new Audio('assets/sound/magnet-colect.mp3'),gift:new Audio('assets/sound/gift-box.mp3')};
const magnetLoop=new Audio('assets/sound/magnet.mp3');magnetLoop.loop=true;magnetLoop.volume=.45;
function playSfx(name){if(!sound)return;if(!sfx[name]){const j=jingles[name];for(const [f,at,d]of j.notes)tone(f,d,{type:j.type,delay:at,volume:j.volume});return;}const a=sfx[name].cloneNode();a.volume=.7;a.play().catch(()=>{});}
document.addEventListener('click',e=>{if(e.target.closest('button:not([data-action])'))playSfx('click');},true);
function syncMusic(){if(sound&&state==='playing')music.play().catch(()=>{});else music.pause();if(sound&&state==='playing'&&magnetLeft>0)magnetLoop.play().catch(()=>{});else magnetLoop.pause();}
const soundIcons={on:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 21c3.527-1.547 5.999-4.909 5.999-9S19.527 4.547 16 3v2c2.387 1.386 3.999 4.047 3.999 7S18.387 17.614 16 19v2zM16 7v10c1.225-1.1 2-3.229 2-5s-.775-3.9-2-5zM4 17h2.697l5.748 3.832a1.004 1.004 0 0 0 1.027.05A1 1 0 0 0 14 20V4a1 1 0 0 0-1.554-.832L6.697 7H4c-1.103 0-2 .897-2 2v6c0 1.103.897 2 2 2zm0-8h3c.033 0 .061-.016.093-.019a1.027 1.027 0 0 0 .38-.116c.026-.015.057-.017.082-.033L12 5.868v12.264l-4.445-2.964c-.025-.017-.056-.02-.082-.033a.986.986 0 0 0-.382-.116C7.059 15.016 7.032 15 7 15H4V9z"/></svg>',off:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m21.707 20.293-2.023-2.023A9.566 9.566 0 0 0 21.999 12c0-4.091-2.472-7.453-5.999-9v2c2.387 1.386 3.999 4.047 3.999 7a8.113 8.113 0 0 1-1.672 4.913l-1.285-1.285C17.644 14.536 18 13.19 18 12c0-1.771-.775-3.9-2-5v7.586l-2-2V4a1 1 0 0 0-1.554-.832L7.727 6.313l-4.02-4.02-1.414 1.414 18 18 1.414-1.414zM12 5.868v4.718L9.169 7.755 12 5.868zM4 17h2.697l5.748 3.832a1.004 1.004 0 0 0 1.027.05A1 1 0 0 0 14 20v-1.879l-2-2v2.011l-4.445-2.964c-.025-.017-.056-.02-.082-.033a.986.986 0 0 0-.382-.116C7.059 15.016 7.032 15 7 15H4V9h.879L3.102 7.223A1.995 1.995 0 0 0 2 9v6c0 1.103.897 2 2 2z"/></svg>'};
$('sound').onclick=()=>{sound=!sound;$('sound').innerHTML=(sound?soundIcons.on:soundIcons.off)+`<span>${sound?'ON':'OFF'}</span>`;$('sound').setAttribute('aria-pressed',sound);tone(550);syncMusic();};
let toastTimer;function toast(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2200);}
// Bake transformed Blender scenery into a small number of draw calls.
function prepareScenery(root){root.updateMatrixWorld(true);const groups=new Map();root.traverse(o=>{if(!o.isMesh)return;const n=o.name;const p=new T.Vector3();o.getWorldPosition(p);if(/Coin_|JUMP_Log|Log_cut|Broken_branch|ROLL_Under|Barrier_post|Warning_stripe|Asset_crate/.test(n))return;if(/Asset_Rock/.test(n)&&Math.abs(p.x)<3.5)return;if(/Distant_mountain|Lantern_glow/.test(n))return;let g=o.geometry.clone().applyMatrix4(o.matrixWorld);if(g.index)g=g.toNonIndexed();if(!g.attributes.normal)g.computeVertexNormals();if(!g.attributes.uv)g.setAttribute('uv',new T.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));for(const key of Object.keys(g.attributes))if(!['position','normal','uv'].includes(key))g.deleteAttribute(key);const mat=Array.isArray(o.material)?o.material[0]:o.material;const key=mat.uuid;if(!groups.has(key))groups.set(key,{mat,geos:[]});groups.get(key).geos.push(g);});const result=new T.Group();for(const{mat,geos}of groups.values()){const geo=mergeGeometries(geos,false);if(!geo)continue;const m=new T.Mesh(geo,mat);m.receiveShadow=true;result.add(m);for(const g of geos)g.dispose();}return result;}
// Colombo: one real-length city corridor (Galle Face roundabout -> Galle Road -> Morven Hotel), built from Mapbox data.
// Colombo: the detailed city map in 5 tracks (Galle Face -> Galle Road -> Kollupitiya / Morven).
// Each track keeps its real position (GLB z = -route metres). The whole map repeats every 2554 m
// (track 1 starts at route -64 m, track 5 ends at 2490 m). Track 1 loads first; 2-5 stream in the background.
const CITY={colombo:{tracks:[1,2,3,4,5].map(i=>`assets/colombo/map/track-${i}.glb`),period:2554,sky:'#bfe1f2',fogNear:90,fogFar:400}};
function prepareCity(root){root.traverse(o=>{if(!o.isMesh)return;o.receiveShadow=true;o.castShadow=false;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m&&m.map)m.map.anisotropy=4;});return root;}
async function loadCityTrack(city,i){const key='colombo#'+i;let r=cache.get(key);if(!r){const g=await loader.loadAsync(city.tracks[i]);r=prepareCity(g.scene);if(g.animations.length){const mixer=new T.AnimationMixer(r);for(const clip of g.animations)mixer.clipAction(clip).play();cityMixers.set(r,mixer);}cache.set(key,r);}return r;}
// Two copies of the whole map (this lap + the next one) so the loop never shows a gap.
// The run starts CITY_START_M metres before route 0, so the Old Parliament is seen from the side, just ahead on the left.
// Track 1 has road from route -64 m, so keep this between 0 and about 50.
const CITY_START_M=40;
// No loop: the Colombo run ends just after Morven Hotel (B143 ends at route 2296 m, city side).
// game-end.glb road-closed barriers stand across the road at CITY_END_M; the run finishes 3 m before them.
const CITY_END_M=2302,CITY_FINISH_DIST=CITY_END_M-.65+CITY_START_M; // the runner's chest touches the end barriers here
function loadGameEnd(root){loader.loadAsync('assets/colombo/game-end.glb').then(({scene:m})=>{m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});const row=new T.Group();row.name='game-end barriers';
 for(let i=0;i<7;i++){const b=i?m.clone():m;b.position.set(-8.1+i*2.7,0,0);row.add(b);}row.position.z=-CITY_END_M;root.add(row);}).catch(e=>console.error('game-end.glb',e));}
// Road gantries (road-gantry-green.glb). Left (wide) board = text in English / Sinhala / Tamil, right board = banner image.
// Edit this list to move gantries or change the text (route = metres from Galle Face).
const CITY_GANTRIES=[
 {route:17,  text:['GALLE FACE  •  COLOMBO 01','ගාලු මුවදොර  •  කොළඹ 01','காலி முகத்திடல்  •  கொழும்பு 01']},
 {route:1340,text:['GALLE ROAD  •  COLOMBO 03','ගාලු පාර  •  කොළඹ 03','காலி வீதி  •  கொழும்பு 03']},
 {route:1741,text:['KOLLUPITIYA  •  GALLE ROAD','කොල්ලුපිටිය  •  ගාලු පාර','கொள்ளுப்பிட்டி  •  காலி வீதி']},
 {route:2227,text:['KOLLUPITIYA  •  COLOMBO 03','කොල්ලුපිටිය  •  කොළඹ 03','கொள்ளுப்பிட்டி  •  கொழும்பு 03']},
 {route:2290,text:['FINISH  •  MORVEN HOTEL','අවසානය  •  මෝවන් හෝටලය','முடிவு  •  மோர்வன் ஹோட்டல்']},
];
const GANTRY_IMG='assets/colombo/banner-image/img-1.webp';
const GANTRY_FONT="'Noto Sans Sinhala','Noto Sans Tamil','Sinhala Sangam MN','Tamil Sangam MN','Iskoola Pota','Latha','Nirmala UI',Arial,Helvetica,sans-serif";
const GANTRY_TEXT_SIZE=0.5; // text height as a share of each row (smaller = smaller text)
function gantryTex(canvas){const t=new T.CanvasTexture(canvas);t.flipY=false;t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;return t;}
function gantryImage(img,aspect){const c=document.createElement('canvas');c.width=2048;c.height=Math.round(2048/aspect);const g=c.getContext('2d');
 let sw=img.width,sh=img.width/aspect;if(sh>img.height){sh=img.height;sw=sh*aspect;}g.drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,0,0,c.width,c.height);return gantryTex(c);}
function gantryText(lines,aspect,bg){const c=document.createElement('canvas');c.width=2048;c.height=Math.round(2048/aspect);const g=c.getContext('2d');
 g.fillStyle=bg;g.fillRect(0,0,c.width,c.height);g.strokeStyle='#fff';g.lineWidth=8;g.strokeRect(16,16,c.width-32,c.height-32);
 g.fillStyle='#fff';g.textAlign='center';g.textBaseline='middle';const pad=40,lh=(c.height-pad*2)/lines.length;
 lines.forEach((s,i)=>{let fs=Math.round(lh*GANTRY_TEXT_SIZE);const set=()=>g.font=`bold ${fs}px ${GANTRY_FONT}`;set();while(g.measureText(s).width>c.width-160&&fs>16){fs-=2;set();}g.fillText(s,c.width/2,pad+lh*(i+.5));});
 return gantryTex(c);}
function faceAspect(mesh){mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;return (b.max.x-b.min.x)/(b.max.y-b.min.y);}
function gantryMat(t){return new T.MeshStandardMaterial({map:t,emissive:0xffffff,emissiveMap:t,emissiveIntensity:.35,roughness:.6});}
async function loadGantries(root){
 const img=new Image();const imgReady=new Promise(r=>{img.onload=()=>r(img);img.onerror=()=>{console.error('gantry banner image failed');r(null);};});img.src=GANTRY_IMG;
 try{await document.fonts?.load?.(`bold 40px ${GANTRY_FONT}`,'ගාලු காலி');}catch(e){}
 Promise.all([loader.loadAsync('assets/colombo/road-gantry-green.glb'),imgReady]).then(([{scene:m},im])=>{
  let sign,ad;m.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;if(o.name==='SignFace')sign=o;if(o.name==='AdFace')ad=o;});
  const bg=sign?'#'+sign.material.color.getHexString(T.SRGBColorSpace):'#0b6b3a';
  if(ad&&im)ad.material=gantryMat(gantryImage(im,faceAspect(ad)));
  const group=new T.Group();group.name='road gantries';
  CITY_GANTRIES.forEach((cfg,i)=>{const g=i?m.clone():m;
   if(sign)g.getObjectByName('SignFace').material=gantryMat(gantryText(cfg.text,faceAspect(sign),cfg.bg||bg));
   g.position.set(0,0,-cfg.route);group.add(g);});
  root.add(group);}).catch(e=>console.error('road-gantry-green.glb',e));}
function placeRoots(roots,period){scenery.clear();tiles=roots;tileLength=period;tileStart=CITY_START_M;roots.forEach((r,i)=>{r.userData.start=CITY_START_M+i*period;r.position.z=-r.userData.start;scenery.add(r);});}
function placeTiles(proto,length,count,start){scenery.clear();tiles=[];tileLength=length;tileStart=start;for(let i=0;i<count;i++){const tile=i?proto.clone():proto;tile.userData.start=start+i*length;tile.position.z=-tile.userData.start;scenery.add(tile);tiles.push(tile);}}
async function chooseBiome(name){chosen=name;environmentReady=false;const token=++loadToken;$('play').disabled=true;$('play').textContent='Preparing your trail…';$('load-status').textContent='Loading '+name+' environment';document.querySelectorAll('[data-biome]').forEach(b=>{b.classList.toggle('active',b.dataset.biome===name);b.setAttribute('aria-pressed',String(b.dataset.biome===name));});try{const city=CITY[name];
 if(city){await loadColomboProps();const first=await loadCityTrack(city,0);if(token!==loadToken)return;
  const roots=[new T.Group()];roots[0].add(first);placeRoots(roots,city.period);loadGameEnd(roots[0]);loadGantries(roots[0]);
  (async()=>{for(let i=1;i<city.tracks.length;i++){try{const t=await loadCityTrack(city,i);if(token!==loadToken)return;roots[0].add(t);}catch(e){console.error('Colombo track '+(i+1)+' failed',e);}}})();}
 else{let proto=cache.get(name);if(!proto){const gltf=await loader.loadAsync('assets/'+name+'_72m.glb');proto=prepareScenery(gltf.scene);cache.set(name,proto);}if(token!==loadToken)return;placeTiles(proto,72,3,-12);}const cave=name==='cave';scene.background.set(city?city.sky:cave?'#202a27':'#c4e2d3');scene.fog.color.copy(scene.background);scene.fog.near=city?city.fogNear:cave?25:48;scene.fog.far=city?city.fogFar:cave?95:145;sun.intensity=cave?1.2:3.2;hemi.groundColor.set(city?'#8a8f94':'#677d3a');environmentReady=true;updateReady();}catch(e){console.error(e);$('load-status').textContent='Could not load assets. Run START_GAME.command or start the local server.';$('play').textContent='Reload to retry';}}
document.querySelectorAll('[data-biome]').forEach(b=>b.onclick=()=>chooseBiome(b.dataset.biome));
const coinTemplate=new T.Group();
loadCoinTemplate(loader,'assets/GameOn_Coin.glb?logo=2').then(model=>{
 coinTemplate.add(model);coinReady=true;updateReady();
}).catch(e=>{console.error('Coin load failed',e);$('load-status').textContent='Could not load the coin model. Start the local server and reload.';});
const logTemplate=new T.Group();const log=mesh(new T.CylinderGeometry(.42,.42,1.85,9),wood,logTemplate,0,.42,0);log.rotation.z=Math.PI/2;for(const side of[-1,1]){const cap=mesh(new T.CylinderGeometry(.34,.34,.012,9),cut,logTemplate,side*.93,.42,0);cap.rotation.z=Math.PI/2;}box(.15,.38,.16,wood,logTemplate,.25,.83,0).rotation.z=.35;
const rockTemplate=new T.Group();mesh(new T.DodecahedronGeometry(.83,0),stone,rockTemplate,0,.68,0).scale.set(1,1,.8);
const barrierTemplate=new T.Group();for(const side of[-1,1])box(.12,2.2,.18,wood,barrierTemplate,side*.91,1.1,0);box(2.05,.55,.24,wood,barrierTemplate,0,1.82,0);for(let i=-3;i<=3;i++){const st=box(.12,.51,.015,stripe,barrierTemplate,i*.27,1.82,.13);st.rotation.z=-.4;}
const glow=(color)=>material(color,{emissive:color,emissiveIntensity:.35,roughness:.4});
const magnetTemplate=new T.Group();{const red=glow('#e8343a'),steel=material('#e6eef2',{metalness:.7,roughness:.25});mesh(new T.TorusGeometry(.32,.11,10,24,Math.PI),red,magnetTemplate,0,.12,0);for(const side of[-1,1]){mesh(new T.CylinderGeometry(.11,.11,.2,12),red,magnetTemplate,side*.32,.02,0);mesh(new T.CylinderGeometry(.115,.115,.16,12),steel,magnetTemplate,side*.32,-.16,0);}magnetTemplate.scale.setScalar(1.15);}
// Box geometry with its corners pushed out onto spheres of radius r.
function roundedBox(w,h,d,r,seg=4){const g=new T.BoxGeometry(w,h,d,seg*2,seg*2,seg*2),p=g.attributes.position,v=new T.Vector3(),inner=new T.Vector3(w/2-r,h/2-r,d/2-r);for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const c=v.clone().clamp(inner.clone().negate(),inner);v.sub(c).normalize().multiplyScalar(r).add(c);p.setXYZ(i,v.x,v.y,v.z);}g.computeVertexNormals();return g;}
const gloss=(color,glowColor)=>new T.MeshPhysicalMaterial({color,roughness:.28,clearcoat:1,clearcoatRoughness:.12,emissive:glowColor,emissiveIntensity:.22});
// Glossy purple gift with lid, yellow ribbon, looped bow and sparkles.
const giftTemplate=new T.Group();{const wrap=gloss('#a54cf5','#7b2fe0'),ribbon=gloss('#ffbf1f','#e08a00'),spark=new T.MeshBasicMaterial({color:'#ffc21a',side:T.DoubleSide});
 mesh(roundedBox(.7,.42,.7,.11),wrap,giftTemplate,0,-.13,0);mesh(roundedBox(.72,.22,.72,.1),wrap,giftTemplate,0,.185,0);
 for(const turn of[0,Math.PI/2]){mesh(roundedBox(.15,.43,.715,.04),ribbon,giftTemplate,0,-.13,0).rotation.y=turn;mesh(roundedBox(.15,.23,.735,.04),ribbon,giftTemplate,0,.18,0).rotation.y=turn;}
 for(const side of[-1,1]){const loop=mesh(new T.TorusGeometry(.12,.022,10,32),ribbon,giftTemplate,side*.14,.41,0);loop.scale.set(1.2,.95,3.6);loop.rotation.set(0,0,side*.75);}
 mesh(roundedBox(.12,.09,.13,.035),ribbon,giftTemplate,0,.32,0);
 const star=new T.Shape();star.moveTo(0,1);for(const [x,y]of[[1,0],[0,-1],[-1,0],[0,1]])star.quadraticCurveTo(0,0,x,y);
 for(const [x,y,s]of[[-.6,.2,.07],[-.5,-.04,.045],[.6,.3,.065]]){const m=mesh(new T.ShapeGeometry(star),spark,giftTemplate,x,y,0);m.scale.setScalar(s);m.castShadow=false;}
 giftTemplate.scale.setScalar(1.1);}
// Colombo-only props (Lanka Metro bus, three-wheeler, yellow road barrier). Loaded only when the Colombo map is chosen.
const TUK_SCALE=1.4;const COLOMBO_PROPS={bus:{url:'assets/colombo/Lanka-Metro-Bus.glb',len:11.9,speed:9},tuk:{url:'assets/colombo/Three-Wheel.glb',len:2.5*TUK_SCALE,speed:7,scale:TUK_SCALE},ybarrier:{url:'assets/colombo/Yellow-Barrier.glb'},sbarrier:{url:'assets/colombo/final-Runner-Slide-Barrier.glb'},cart:{url:'assets/colombo/Handcart.glb',ramp:true}};
const templates={coin:coinTemplate,log:logTemplate,rock:rockTemplate,barrier:barrierTemplate,magnet:magnetTemplate,gift:giftTemplate,bus:new T.Group(),tuk:new T.Group(),ybarrier:new T.Group(),sbarrier:new T.Group(),cart:new T.Group()};templates.pbus=templates.bus;const pools={coin:[],log:[],rock:[],barrier:[],magnet:[],gift:[],bus:[],tuk:[],ybarrier:[],sbarrier:[],cart:[],pbus:[]};
// Three-wheeler colours: the red model plus repainted green, blue and yellow copies.
const TUK_PAINT={tuk_red:null,tuk_green:'#1e8f3e',tuk_blue:'#1f5fbf',tuk_yellow:'#f2c400'},TUK_COLOURS=Object.keys(TUK_PAINT);for(const k of TUK_COLOURS){templates[k]=new T.Group();pools[k]=[];}
// Lion Strong can: special pickup in Colombo. Missed cans come back, a bit easier each time (see LION_GAP below).
const LION={url:'assets/colombo/lion-strong.glb',height:1.05,y:5.0,bonus:50};
const lionTemplate=new T.Group();lionTemplate.name='lion';templates.lion=lionTemplate;pools.lion=[];let lionLoading=null;
function lionRays(){const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d'),m=256;
 const fade=g.createRadialGradient(m,m,0,m,m,m);fade.addColorStop(0,'rgba(255,246,190,1)');fade.addColorStop(.3,'rgba(255,205,70,.8)');fade.addColorStop(1,'rgba(255,150,0,0)');g.fillStyle=fade;
 for(let i=0;i<16;i++){const a=i/16*Math.PI*2,w=Math.PI/16*(i%2?.35:.6);g.beginPath();g.moveTo(m,m);g.arc(m,m,m,a-w,a+w);g.closePath();g.fill();}
 const core=g.createRadialGradient(m,m,0,m,m,150);core.addColorStop(0,'rgba(255,255,235,.95)');core.addColorStop(.5,'rgba(255,225,130,.45)');core.addColorStop(1,'rgba(255,200,80,0)');g.fillStyle=core;g.fillRect(0,0,512,512);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
function loadLion(){return lionLoading||=loader.loadAsync(LION.url).then(({scene:m})=>{
  const box=new T.Box3().setFromObject(m),size=box.getSize(new T.Vector3()),s=LION.height/size.y;
  m.scale.setScalar(s);m.position.y=-(box.min.y+size.y/2)*s;m.traverse(o=>{if(o.isMesh){o.castShadow=true;}});
  const can=new T.Group();can.name='lionCan';can.add(m);can.rotation.z=.12;lionTemplate.add(can);
  const add=(o,name)=>{o.name=name;o.castShadow=false;o.renderOrder=2;lionTemplate.add(o);return o;};
  const rayMat=new T.MeshBasicMaterial({map:lionRays(),transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide});
  add(new T.Mesh(new T.PlaneGeometry(3.4,3.4),rayMat),'lionRays').position.z=-.45;
  const r2=add(new T.Mesh(new T.PlaneGeometry(2.3,2.3),rayMat.clone()),'lionRays2');r2.position.z=-.4;r2.material.opacity=.7;
  // Gold ring that spins around the can, with sparkles riding on it.
  const tilt=add(new T.Group(),'lionTilt');tilt.rotation.x=Math.PI/2-.38;
  const ring=new T.Group();ring.name='lionRing';tilt.add(ring);
  ring.add(new T.Mesh(new T.TorusGeometry(.78,.045,12,72),new T.MeshStandardMaterial({color:'#ffd34d',emissive:'#ffb300',emissiveIntensity:.9,metalness:.6,roughness:.25})));
  const sparkMat=new T.MeshBasicMaterial({color:'#fff6c8'});for(let i=0;i<5;i++){const a=i/5*Math.PI*2,sp=new T.Mesh(new T.OctahedronGeometry(.07),sparkMat);sp.position.set(Math.cos(a)*.78,Math.sin(a)*.78,0);ring.add(sp);}
  const ring2=new T.Mesh(new T.TorusGeometry(.95,.018,8,72),new T.MeshBasicMaterial({color:'#fff1a8',transparent:true,opacity:.55,blending:T.AdditiveBlending,depthWrite:false}));ring2.name='lionRing2';tilt.add(ring2);
}).catch(e=>console.error('lion-strong.glb',e));}
// Lion cans: the player keeps getting new chances until one is collected. Each retry is a little easier, never free:
//  try 1: in the air above the middle lane, reachable only by jumping off the first parked bus roof
//  try 2: on top of a parked bus roof (climb the handcart, run along the roof)
//  try 3: above a yellow barrier - jump high over it to grab the can
//  try 4+: alternates: under a hazard barrier (slide under it) / above a yellow barrier (jump over it)
const LION_GAP=60; // extra metres after a miss before the next can is placed (on top of the ~115 m spawn look-ahead)
let lionGot=false,lionTry=0,lionActive=false,lionNextAt=0;
function lionReset(){lionGot=lionActive=false;lionTry=0;lionNextAt=0;}
function placeLion(lane,d,y,hint){if(lionGot||lionActive||!lionTemplate.children.length)return null;lionActive=true;
 const e=addEntity('lion',lane,d,y);e.obj.scale.setScalar(1);e.obj.position.x=LANES[lane];
 if(hint){addEntity('coin',lane,d-2.6,y-.9);addEntity('coin',lane,d-1.4,y-.45);}return e;}
// Called from the bus yard (tries 1 and 2).
function spawnLion(busStart){if(lionTry===0)placeLion(1,busStart+BUS_LEN*.75,LION.y,true);
 else if(lionTry===1&&spawnAt>=lionNextAt)placeLion(2,busStart+BUS_LEN*.6,BUS_TOP+1.9,false);}
// Called from spawnRow (tries 3+): a barrier with the can on it, in a lane kept clear of other obstacles and tuks.
function spawnRoadLion(reserved){if(lionGot||lionActive||lionTry<2||spawnAt<lionNextAt)return;
 const free=[1,0,2].filter(l=>!reserved[l]);if(!free.length)return;const ln=free[Math.floor(Math.random()*free.length)];
 const guard=lionTry%2===0?'ybarrier':'sbarrier',d=spawnAt+9;
 const e=placeLion(ln,d,guard==='ybarrier'?POWER_Y.ybarrier+.25:.62,false);if(!e)return;
 e.lionGuard=guard;e.obj.scale.setScalar(.85);addEntity(guard,ln,d);
 reserved[ln]=true;laneFree[ln]=Math.max(laneFree[ln],spawnAt+30);}
function lionMissed(){lionActive=false;if(lionGot)return;lionTry++;lionNextAt=spawnAt+LION_GAP;if(lionTry===1)nextYardAt=lionNextAt;
 toast('🦁 Missed it! Another Lion Strong ahead');}
// Returns true when the entity should be removed.
function updateLion(e,prev,dt){const o=e.obj,p=e.parts||(e.parts={can:o.getObjectByName('lionCan'),rays:o.getObjectByName('lionRays'),rays2:o.getObjectByName('lionRays2'),ring:o.getObjectByName('lionRing'),ring2:o.getObjectByName('lionRing2')});
 p.can.rotation.y+=dt*2.6;p.rays.rotation.z+=dt*.5;p.rays2.rotation.z-=dt*.8;p.ring.rotation.z+=dt*3.2;p.ring2.rotation.z-=dt*1.4;
 const pulse=1+Math.sin(elapsed*5)*.08;p.rays.scale.setScalar(pulse);p.rays2.scale.setScalar(2-pulse);
 if(e.got){e.t+=dt;o.position.lerp(magnetTarget,1-Math.exp(-12*dt));o.scale.setScalar(Math.max(.01,1+e.t*1.5-e.t*e.t*9));return e.t>.45;}
 o.position.z=distance-e.d;o.position.y=e.y+Math.sin(elapsed*3)*.12;
 if(!e.checked&&crossed(prev,o.position.z,.9)){e.checked=true;if(Math.abs(x-LANES[e.lane])<1&&(e.lionGuard?!hit(e.lionGuard,height-ground,slideLeft>0):Math.abs(height+1-e.y)<1)){e.got=true;e.t=0;lionGot=true;lionActive=false;coinCount+=LION.bonus;playSfx('gift');toast('🦁 LION STRONG! +'+LION.bonus+' coins');setTimeout(()=>{if(state==='playing')document.dispatchEvent(new CustomEvent('lion-promo'));},700);}else lionMissed();}
 return o.position.z>9;}
async function loadColomboProps(){await loadLion();await Promise.all(Object.entries(COLOMBO_PROPS).map(async([k,p])=>{if(templates[k].children.length)return;const {scene:m}=await loader.loadAsync(p.url);if(p.ramp){templates[k].add(makeRamp(m));return;}if(p.len)m.rotation.y=-Math.PI/2;if(p.scale)m.scale.setScalar(p.scale);templates[k].add(mergeProp(m));}));for(const [k,paint]of Object.entries(TUK_PAINT)){if(templates[k].children.length)continue;const v=templates.tuk.clone(true);if(paint)v.traverse(o=>{if(o.isMesh&&o.material.name==='Body_Paint'){o.material=o.material.clone();o.material.color.set(paint);}});templates[k].add(v);}renderer.compile(scene,camera);}
// Detailed Blender models have 150-300 parts each. Merge every model into one mesh per material
// (a few draw calls instead of hundreds) and swap glass 'transmission' (which re-renders the whole
// scene every frame) for cheap transparent glass.
// Handcart tipped back on its wheels: the open end rests on the road (facing the runner) and the
// handle end points up, so it works as a ramp. Deck heights are measured with ray casts.
const RAMP={len:4,h0:.1,h1:1.5};
function makeRamp(m){m.rotation.y=Math.PI/2;const tilt=new T.Group();tilt.add(m);tilt.rotation.x=RAMP_TILT;const merged=mergeProp(tilt);const box=new T.Box3().setFromObject(merged),c=box.getCenter(new T.Vector3());merged.position.set(-c.x,-box.min.y,-c.z);merged.updateMatrixWorld(true);
 const ray=new T.Raycaster(),hz=z=>{ray.set(new T.Vector3(0,10,z),new T.Vector3(0,-1,0));const h=ray.intersectObject(merged,true)[0];return h?h.point.y:0;};
 const size=box.getSize(new T.Vector3());RAMP.len=size.z;RAMP.h0=hz(size.z/2-.25);RAMP.h1=hz(-size.z/2+.9);return merged;}
const RAMP_TILT=.36,BUS_TOP=2.68,BUS_LEN=11.9;
function mergeProp(root){root.updateMatrixWorld(true);const groups=new Map();root.traverse(o=>{if(!o.isMesh)return;let g=o.geometry.clone().applyMatrix4(o.matrixWorld);if(g.index)g=g.toNonIndexed();if(!g.attributes.normal)g.computeVertexNormals();if(!g.attributes.uv)g.setAttribute('uv',new T.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));for(const key of Object.keys(g.attributes))if(!['position','normal','uv'].includes(key))g.deleteAttribute(key);let mat=Array.isArray(o.material)?o.material[0]:o.material;if(mat.transmission>0){mat=mat.clone();mat.transmission=0;mat.transparent=true;mat.opacity=.45;mat.depthWrite=false;}const key=mat.uuid;if(!groups.has(key))groups.set(key,{mat,geos:[]});groups.get(key).geos.push(g);});const out=new T.Group();for(const{mat,geos}of groups.values()){const geo=mergeGeometries(geos,false);for(const g of geos)g.dispose();if(!geo)continue;const mesh=new T.Mesh(geo,mat);mesh.castShadow=!mat.transparent;mesh.receiveShadow=true;out.add(mesh);}return out;}
// Yellow barriers follow the rock rule: jump high over it or change lane.
const hit=(kind,h,sliding)=>hitObstacle(kind==='ybarrier'?'rock':kind==='sbarrier'?'barrier':kind,h,sliding);
let laneFree=[0,0,0];
function addEntity(kind,laneIndex,d,y=kind==='coin'?1.05:0){const o=pools[kind].pop()||templates[kind].clone();o.position.set(LANES[laneIndex],y,distance-d);o.visible=true;scene.add(o);const e={kind,lane:laneIndex,d,y,obj:o,checked:false};entities.push(e);return e;}
// Power-ups sit on the obstacle (above a rock or log, under a barrier) and are only won by clearing it.
function addPowerup(kind,laneIndex,guard,d){addEntity(kind,laneIndex,d,POWER_Y[guard]).guard=guard;}
function release(e){scene.remove(e.obj);pools[e.kind].push(e.obj);}
function clearEntities(){for(const e of entities)release(e);entities=[];}
// Bus yard: 2-3 Lanka Metro buses parked in the right lane with coins on the roofs, and a tipped
// handcart ramp in the middle lane. Jump onto the cart, run up, jump + move right to land on the buses.
let nextYardAt=260;
function spawnYard(){const n=2+(Math.random()<.5?1:0),gap=4.5+Math.random()*1.5,cartD=spawnAt,busStart=cartD+RAMP.len/2+2.5;
 addEntity('cart',1,cartD).platform={ramp:true,len:RAMP.len,h0:RAMP.h0,h1:RAMP.h1};
 for(let k=0;k<n;k++)addEntity('pbus',2,busStart+BUS_LEN/2+k*(BUS_LEN+gap)).platform={top:BUS_TOP,len:BUS_LEN};
 const end=busStart+n*(BUS_LEN+gap);
 for(let k=0;k<n;k++){const b0=busStart+k*(BUS_LEN+gap);for(let d=b0+1;d<b0+BUS_LEN-.5;d+=1.6)addEntity('coin',2,d,BUS_TOP+1.05);
  // coin arc over the gap shows where to jump to the next bus
  if(k<n-1)for(let j=0;j<3;j++){const t=(j+1)/4;addEntity('coin',2,b0+BUS_LEN+gap*t-.5,BUS_TOP+1.05+Math.sin(t*Math.PI)*1.3);}}
 for(let d=cartD-RAMP.len/2+.6;d<cartD+RAMP.len/2;d+=1.3)addEntity('coin',1,d,RAMP.h0+(RAMP.h1-RAMP.h0)*((d-cartD+RAMP.len/2)/RAMP.len)+1.05);
 for(let d=cartD-4;d<end;d+=1.6)addEntity('coin',0,d);
 spawnLion(busStart);laneFree=[end+6,end+6,end+6];spawnAt=end+18;nextYardAt=spawnAt+380+Math.random()*260;}
function spawnRow(){const row=Math.round((spawnAt-22)/18),city=chosen==='colombo',reserved=laneFree.map(v=>v>spawnAt);
 if(city&&spawnAt>CITY_FINISH_DIST-30){spawnAt+=18;return;}
 if(city)spawnRoadLion(reserved);
 // Colombo: oncoming bus / three-wheeler. Its lane stays clear of other obstacles while it drives through the rows behind it.
 if(city&&row>=5&&!reserved.some(Boolean)&&spawnAt>=nextYardAt&&spawnAt<CITY_FINISH_DIST-120){spawnYard();return;}
 if(city&&row>=3&&!reserved.some(Boolean)&&Math.random()<.3){const ln=Math.floor(Math.random()*3),kind=TUK_COLOURS[Math.floor(Math.random()*TUK_COLOURS.length)];addEntity(kind,ln,spawnAt).vehicle=COLOMBO_PROPS.tuk;laneFree[ln]=spawnAt+18*6;const safe=(ln+1+Math.floor(Math.random()*2))%3;for(let j=0;j<6;j++)addEntity('coin',safe,spawnAt-7+j*1.6);spawnAt+=18;return;}
 let blocked=row<3?[0,2,1][row]:Math.floor(Math.random()*3);if(reserved[blocked])blocked=[0,1,2].find(l=>!reserved[l]);let kind=row<3?['log','rock','barrier'][row]:['log','rock','barrier'][Math.floor(Math.random()*3)];if(city)kind=kind==='barrier'?'sbarrier':'ybarrier';addEntity(kind,blocked,spawnAt);if(row>=3){if(spawnAt>=nextMagnetAt){addPowerup('magnet',blocked,kind,spawnAt);nextMagnetAt=spawnAt+300+Math.random()*250;}else if(!hasGift&&spawnAt>=nextGiftAt){addPowerup('gift',blocked,kind,spawnAt);nextGiftAt=spawnAt+550+Math.random()*350;}}let safe=[1,2].map(o=>(blocked+o)%3).find(l=>!reserved[l])??(blocked+1)%3;if(distance>220&&Math.random()<.35){const b=(blocked+2)%3;if(!reserved[b]&&b!==safe)addEntity(city?'ybarrier':['rock','log'][Math.floor(Math.random()*2)],b,spawnAt);}for(let j=0;j<6;j++)addEntity('coin',safe,spawnAt-7+j*1.6);spawnAt+=18;}
// Height of whatever the runner is standing over (road, handcart ramp, parked bus roof).
function surfaceAt(px){let top=0,kind=null;for(const e of entities){const p=e.platform;if(!p||Math.abs(px-LANES[e.lane])>1.05)continue;const z=distance-e.d;if(z+p.len/2<-.3||z-p.len/2>.3)continue;const h=p.ramp?p.h0+(p.h1-p.h0)*T.MathUtils.clamp((z+p.len/2)/p.len,0,1):p.top;if(h>top){top=h;kind=e.kind;}}return {top,kind};}
function reset(){body.rotation.x=0;finishDone=false;poseSlideHeld=false;mascot.reset();clearEntities();lionReset();lane=1;x=height=velocity=slideLeft=distance=coinCount=elapsed=animTime=0;spawnAt=22;laneFree=[0,0,0];nextYardAt=260;ground=0;invincibleLeft=magnetLeft=0;hasGift=false;nextMagnetAt=200+Math.random()*150;nextGiftAt=350+Math.random()*250;body.visible=true;body.rotation.set(0,0,0);body.position.set(0,0,0);body.scale.set(1,1,1);for(let i=0;i<tiles.length;i++)tiles[i].userData.start=tileStart+i*tileLength;while(spawnAt<115)spawnRow();updateHUD();updatePowerHUD();}
function showState(next){state=next;syncMusic();document.dispatchEvent(new CustomEvent('game-state',{detail:next}));}
function start(){if(!environmentReady||!characterReady||!coinReady)return;reset();music.currentTime=0;showState('playing');tone(440);}
function gameOver(kind){if(hasGift){updateHUD();crashKind=kind;playSfx('hit');showState('revive');document.dispatchEvent(new CustomEvent('game-revive'));return;}finishRun(kind);}
let crashKind=null;
function revive(){if(state!=='revive')return;hasGift=false;crashKind=null;for(let i=entities.length-1;i>=0;i--){const e=entities[i];if(e.kind!=='coin'&&e.kind!=='lion'&&e.obj.position.z>-35){release(e);entities.splice(i,1);}}height=velocity=slideLeft=0;invincibleLeft=2.5;nextGiftAt=Math.max(nextGiftAt,spawnAt+500);mascot.reset();updatePowerHUD();playSfx('revive');showState('playing');}
function collectPower(kind){if(kind==='magnet'){magnetLeft=MAGNET_TIME;magnetLoop.currentTime=0;syncMusic();toast('🧲 Magnet! Coins fly to you');}else{hasGift=true;toast('🎁 Gift box! One free continue');}playSfx(kind);updatePowerHUD();}
function updatePowerHUD(){$('power-magnet').hidden=magnetLeft<=0;$('magnet-bar').style.width=magnetLeft/MAGNET_TIME*100+'%';$('power-gift').hidden=!hasGift;}
// End of the Colombo run: bump into the closure barriers, bounce back, then show the congratulations screen.
let finishT=0,finishDone=false;
function crashFinish(){distance=CITY_FINISH_DIST;finishT=0;finishDone=false;velocity=0;slideLeft=0;playSfx('hit');showState('finishing');}
function updateFinish(dt){finishT+=dt;const k=Math.min(finishT/.55,1);distance=CITY_FINISH_DIST-1.4*Math.sin(k*Math.PI/2);
 height=Math.max(ground,ground+.55*Math.sin(Math.min(finishT/.5,1)*Math.PI));body.rotation.x=-.5*Math.sin(Math.min(finishT/.9,1)*Math.PI);
 camera.position.x+=Math.sin(finishT*60)*.06*Math.max(0,1-finishT*2);
 if(finishT>1.4&&!finishDone){finishDone=true;body.rotation.x=0;finishRun('finish');}}
function finishRun(kind){updateHUD();showState('over');document.dispatchEvent(new CustomEvent('game-over',{detail:{finished:kind==='finish',distance:Math.floor(distance),coins:coinCount,score:scoreFor(distance,coinCount),biome:chosen,cause:kind==='finish'?'You reached Morven Hotel - Colombo run complete!':kind==='pbus'?'Use the handcart to climb onto the parked buses, and jump the gaps between them.':kind==='cart'?'Jump onto the handcart from the low end.':kind==='bus'?'Change lanes before the Lanka Metro bus reaches you.':kind.startsWith('tuk')?'Watch out for oncoming three-wheelers - change lanes!':kind==='ybarrier'?'Jump over yellow barriers or change lanes.':kind==='sbarrier'?'Squat to slide under the hazard barriers.':kind==='barrier'?'Squat to slide under striped barriers.':kind==='rock'?'Step or lean to dodge rocks, or time a high jump.':'Jump over fallen logs.'}}));playSfx('hit');}

function action(a){
 if(state!=='playing')return;
 if(a==='left'||a==='right'){
  const next=clampLane(lane+(a==='left'?-1:1));
  if(next!==lane){lane=next;if(height-ground<.03&&slideLeft<=0)mascot.trigger(a,.3);tone(230,.035);}
 }
 if(a==='jump'&&height-ground<.03){slideLeft=0;velocity=8.4;mascot.trigger('jump',2*8.4/19);tone(400,.08);}
 if(a==='slide'&&height-ground<.03){slideLeft=.9;mascot.trigger('slide',.9);tone(170,.07);}
}
document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();action(b.dataset.action);}));let touchStart=null;canvas.addEventListener('pointerdown',e=>{touchStart={x:e.clientX,y:e.clientY};});canvas.addEventListener('pointerup',e=>{if(!touchStart)return;const dx=e.clientX-touchStart.x,dy=e.clientY-touchStart.y;touchStart=null;if(Math.max(Math.abs(dx),Math.abs(dy))<22)return;action(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'slide':'jump');});canvas.addEventListener('pointercancel',()=>touchStart=null);
function updateHUD(){$('distance').innerHTML=Math.floor(distance)+'<span>m</span>';$('coins').textContent=coinCount;$('score').textContent=scoreFor(distance,coinCount);}
let poseSlideHeld=false;
let last=performance.now(),hudTimer=0,camLift=0;function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.04);last=now;const running=state==='playing';if(state==='finishing')updateFinish(dt);if(running){elapsed+=dt;const speed=speedAt(distance);const advance=speed*dt;distance+=advance;x=T.MathUtils.damp(x,LANES[lane],17,dt);const sf=surfaceAt(x);if(sf.top-height>.6){if(invincibleLeft===0)gameOver(sf.kind);}else{ground=sf.top;if(height<ground){height=ground;if(velocity<0)velocity=0;}if(height>ground+.001||velocity>0){height+=velocity*dt;velocity-=19*dt;if(height<=ground){height=ground;velocity=0;}}}slideLeft=Math.max(poseSlideHeld&&height-ground<.03?.12:0,slideLeft-dt);while(spawnAt<distance+115)spawnRow();if(chosen==='colombo'&&distance>=CITY_FINISH_DIST){crashFinish();return;}if(magnetLeft>0){magnetLeft=Math.max(0,magnetLeft-dt);if(magnetLeft===0){playSfx('magnetEnd');syncMusic();}}if(invincibleLeft>0){invincibleLeft=Math.max(0,invincibleLeft-dt);body.visible=invincibleLeft===0||Math.floor(invincibleLeft*10)%2===0;}magnetTarget.set(x,height+1,0);for(let i=entities.length-1;i>=0&&state==='playing';i--){const e=entities[i];const prev=e.obj.position.z;if(e.kind==='lion'){if(updateLion(e,prev,dt)){release(e);entities.splice(i,1);}continue;}if(e.kind==='coin'){e.obj.rotation.y+=dt*2;if(magnetLeft>0&&!e.pulled&&prev>-MAGNET_RANGE)e.pulled=true;let got;if(e.pulled){e.obj.position.lerp(magnetTarget,1-Math.exp(-14*dt));got=e.obj.position.distanceTo(magnetTarget)<.7;}else{e.obj.position.z=distance-e.d;got=Math.abs(x-LANES[e.lane])<.7&&Math.abs(height+(slideLeft>0?.5:1)-e.y)<.9&&crossed(prev,e.obj.position.z,.65);}if(got){coinCount++;playSfx('coin');release(e);entities.splice(i,1);continue;}}else if(e.guard){e.obj.position.z=distance-e.d;if(e.kind==='gift')e.obj.rotation.y=.6+Math.sin(elapsed*2)*.35;else e.obj.rotation.y+=dt*2.4;e.obj.position.y=e.y+Math.sin(elapsed*4)*.08;if(!e.checked&&crossed(prev,e.obj.position.z,.6)&&Math.abs(x-LANES[e.lane])<.77){e.checked=true;if(!hit(e.guard,height-ground,slideLeft>0)){collectPower(e.kind);release(e);entities.splice(i,1);continue;}}}else if(e.platform){e.obj.position.z=distance-e.d;if(e.obj.position.z-e.platform.len/2>9){release(e);entities.splice(i,1);}continue;}
else if(e.vehicle){const v=e.vehicle,z=(distance-e.d)*(1+v.speed/speed);e.obj.position.z=z;if(!e.checked){if(z-v.len/2>.4)e.checked=true;else if(z+v.len/2>-.4&&Math.abs(x-LANES[e.lane])<.9&&invincibleLeft===0){e.checked=true;gameOver(e.kind);break;}}if(z-v.len/2>9){release(e);entities.splice(i,1);}continue;}
else{e.obj.position.z=distance-e.d;if(!e.checked&&crossed(prev,e.obj.position.z,.48)&&Math.abs(x-LANES[e.lane])<.77){e.checked=true;if(hit(e.kind,height-ground,slideLeft>0)&&invincibleLeft===0){gameOver(e.kind);break;}}}if(e.obj.position.z>9){release(e);entities.splice(i,1);}}hudTimer+=dt;if(hudTimer>.09){updateHUD();updatePowerHUD();hudTimer=0;}}
for(const tile of tiles){if(tile.userData.start+tileLength<distance-12)tile.userData.start+=tileLength*tiles.length;tile.position.z=distance-tile.userData.start;}
body.position.y=height;
if(chosen==='colombo')scenery.traverseVisible(o=>cityMixers.get(o)?.update(dt));
mascot.update(dt,state==='revive'?'paused':state,speedAt(distance),height-ground>.03||velocity>0,slideLeft>0,poseSlideHeld);
player.position.x=x;shadow.position.x=x;shadow.position.y=ground+.015;const air=height-ground;shadow.scale.setScalar(Math.max(.45,1-air*.18));shadow.material.opacity=Math.max(.06,.22-air*.06);camLift=T.MathUtils.damp(camLift,air<.05?ground:Math.min(camLift,height),4,dt);camera.position.x=T.MathUtils.damp(camera.position.x,x*.15,3,dt);camera.position.y=4.3+camLift;camera.lookAt(x*.12,1+camLift,-13);renderer.render(scene,camera);}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();if(state==='playing')showState('paused');toast('Graphics paused. Reload the page to restore the game.');});
// Map select is hidden in index.html, so the game always starts on Colombo.
// To use the map select again: un-comment it in index.html and change 'colombo' back to 'forest'.
chooseBiome('colombo');requestAnimationFrame(frame);

export const game={
 get ready(){return environmentReady&&characterReady&&coinReady;},get state(){return state;},
 start,action,
 setLane(target){if(state!=='playing')return;const next=clampLane(target);if(next===lane)return;const direction=next<lane?'left':'right';lane=next;if(height-ground<.03&&slideLeft<=0)mascot.trigger(direction,.3);},
 setSquat(active){poseSlideHeld=active;},
 pause(){if(state==='playing')showState('paused');},
 resume(){if(state==='paused')showState('playing');},
 revive,
 sfx:playSfx,
 endRun(){if(state==='revive')finishRun(crashKind);},
 home(){reset();clearEntities();player.position.set(0,0,0);showState('menu');}
};
