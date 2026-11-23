import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
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
const cache=new Map(),loader=new GLTFLoader();
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
let lane=1,x=0,height=0,velocity=0,slideLeft=0,distance=0,coinCount=0,elapsed=0,spawnAt=22,entities=[],best=0,animTime=0,invincibleLeft=0,magnetLeft=0,hasGift=false,nextMagnetAt=0,nextGiftAt=0;
const MAGNET_TIME=10,MAGNET_RANGE=26,POWER_Y={rock:2.55,log:1.75,barrier:.6},magnetTarget=new T.Vector3();

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
const CITY={colombo:{url:'assets/colombo_route.glb',sky:'#bfe1f2',fogNear:90,fogFar:400}};
function prepareCity(root){root.updateMatrixWorld(true);root.traverse(o=>{if(!o.isMesh)return;o.receiveShadow=true;o.castShadow=/wall_/.test(o.name)||/wall_/.test(o.parent?.name||'');const m=o.material;if(m){m.envMapIntensity=.6;if(m.map){m.map.anisotropy=4;m.map.colorSpace=T.SRGBColorSpace;}}});const end=root.getObjectByName('route_end');root.userData.length=end?-end.position.z:-new T.Box3().setFromObject(root).min.z;const len=root.userData.length;root.add(gantry(['GALLE FACE','Colombo 01  ·  Galle Road  ↓'],-45),gantry(['GALLE ROAD','Kollupitiya  ·  Colombo 03'],-len/2),gantry(['MORVEN HOTEL','213 Galle Rd  ·  Colombo 03'],-len+40));return root;}
// Overhead road sign (Sri Lankan green gantry) drawn on a canvas.
function gantry(lines,z){const g=new T.Group(),c=document.createElement('canvas');c.width=1024;c.height=256;const x=c.getContext('2d');x.fillStyle='#0b6b3a';x.fillRect(0,0,1024,256);x.strokeStyle='#fff';x.lineWidth=10;x.strokeRect(12,12,1000,232);x.fillStyle='#fff';x.textAlign='center';x.font='bold 86px Arial';x.fillText(lines[0],512,118);x.font='bold 52px Arial';x.fillText(lines[1],512,200);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;
 const panel=mesh(new T.PlaneGeometry(10,2.5),new T.MeshStandardMaterial({map:tex,roughness:.6}),g,0,7.2,0);panel.castShadow=false;box(10.3,2.7,.12,dark,g,0,7.2,-.08);for(const side of[-1,1])box(.35,8.6,.35,material('#9aa3a8',{metalness:.5,roughness:.4}),g,side*8.7,4.3,0);box(17.8,.35,.35,material('#9aa3a8',{metalness:.5,roughness:.4}),g,0,8.4,-.1);g.position.z=z;return g;}
function placeTiles(proto,length,count,start){scenery.clear();tiles=[];tileLength=length;tileStart=start;for(let i=0;i<count;i++){const tile=i?proto.clone():proto;tile.userData.start=start+i*length;tile.position.z=-tile.userData.start;scenery.add(tile);tiles.push(tile);}}
async function chooseBiome(name){chosen=name;environmentReady=false;const token=++loadToken;$('play').disabled=true;$('play').textContent='Preparing your trail…';$('load-status').textContent='Loading '+name+' environment';document.querySelectorAll('[data-biome]').forEach(b=>{b.classList.toggle('active',b.dataset.biome===name);b.setAttribute('aria-pressed',String(b.dataset.biome===name));});try{const city=CITY[name];let proto=cache.get(name);if(!proto){const gltf=await loader.loadAsync(city?city.url:'assets/'+name+'_72m.glb');proto=city?prepareCity(gltf.scene):prepareScenery(gltf.scene);cache.set(name,proto);}if(token!==loadToken)return;if(city)placeTiles(proto,proto.userData.length,2,0);else placeTiles(proto,72,3,-12);const cave=name==='cave';scene.background.set(city?city.sky:cave?'#202a27':'#c4e2d3');scene.fog.color.copy(scene.background);scene.fog.near=city?city.fogNear:cave?25:48;scene.fog.far=city?city.fogFar:cave?95:145;sun.intensity=cave?1.2:3.2;hemi.groundColor.set(city?'#8a8f94':'#677d3a');environmentReady=true;updateReady();}catch(e){console.error(e);$('load-status').textContent='Could not load assets. Run START_GAME.command or start the local server.';$('play').textContent='Reload to retry';}}
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
const templates={coin:coinTemplate,log:logTemplate,rock:rockTemplate,barrier:barrierTemplate,magnet:magnetTemplate,gift:giftTemplate};const pools={coin:[],log:[],rock:[],barrier:[],magnet:[],gift:[]};
function addEntity(kind,laneIndex,d,y=kind==='coin'?1.05:0){const o=pools[kind].pop()||templates[kind].clone();o.position.set(LANES[laneIndex],y,distance-d);o.visible=true;scene.add(o);const e={kind,lane:laneIndex,d,y,obj:o,checked:false};entities.push(e);return e;}
// Power-ups sit on the obstacle (above a rock or log, under a barrier) and are only won by clearing it.
function addPowerup(kind,laneIndex,guard,d){addEntity(kind,laneIndex,d,POWER_Y[guard]).guard=guard;}
function release(e){scene.remove(e.obj);pools[e.kind].push(e.obj);}
function clearEntities(){for(const e of entities)release(e);entities=[];}
function spawnRow(){const row=Math.round((spawnAt-22)/18);const blocked=row<3?[0,2,1][row]:Math.floor(Math.random()*3);const kind=row<3?['log','rock','barrier'][row]:['log','rock','barrier'][Math.floor(Math.random()*3)];addEntity(kind,blocked,spawnAt);if(row>=3){if(spawnAt>=nextMagnetAt){addPowerup('magnet',blocked,kind,spawnAt);nextMagnetAt=spawnAt+300+Math.random()*250;}else if(!hasGift&&spawnAt>=nextGiftAt){addPowerup('gift',blocked,kind,spawnAt);nextGiftAt=spawnAt+550+Math.random()*350;}}let safe=(blocked+1)%3;if(distance>220&&Math.random()<.35){const b=(blocked+2)%3;addEntity(['rock','log'][Math.floor(Math.random()*2)],b,spawnAt);}for(let j=0;j<6;j++)addEntity('coin',safe,spawnAt-7+j*1.6);spawnAt+=18;}
function reset(){poseSlideHeld=false;mascot.reset();clearEntities();lane=1;x=height=velocity=slideLeft=distance=coinCount=elapsed=animTime=0;spawnAt=22;invincibleLeft=magnetLeft=0;hasGift=false;nextMagnetAt=200+Math.random()*150;nextGiftAt=350+Math.random()*250;body.visible=true;body.rotation.set(0,0,0);body.position.set(0,0,0);body.scale.set(1,1,1);for(let i=0;i<tiles.length;i++)tiles[i].userData.start=tileStart+i*tileLength;while(spawnAt<115)spawnRow();updateHUD();updatePowerHUD();}
function showState(next){state=next;syncMusic();document.dispatchEvent(new CustomEvent('game-state',{detail:next}));}
function start(){if(!environmentReady||!characterReady||!coinReady)return;reset();music.currentTime=0;showState('playing');tone(440);}
function gameOver(kind){if(hasGift){updateHUD();crashKind=kind;playSfx('hit');showState('revive');document.dispatchEvent(new CustomEvent('game-revive'));return;}finishRun(kind);}
let crashKind=null;
function revive(){if(state!=='revive')return;hasGift=false;crashKind=null;for(let i=entities.length-1;i>=0;i--){const e=entities[i];if(e.kind!=='coin'&&e.obj.position.z>-35){release(e);entities.splice(i,1);}}height=velocity=slideLeft=0;invincibleLeft=2.5;nextGiftAt=Math.max(nextGiftAt,spawnAt+500);mascot.reset();updatePowerHUD();playSfx('revive');showState('playing');}
function collectPower(kind){if(kind==='magnet'){magnetLeft=MAGNET_TIME;magnetLoop.currentTime=0;syncMusic();toast('🧲 Magnet! Coins fly to you');}else{hasGift=true;toast('🎁 Gift box! One free continue');}playSfx(kind);updatePowerHUD();}
function updatePowerHUD(){$('power-magnet').hidden=magnetLeft<=0;$('magnet-bar').style.width=magnetLeft/MAGNET_TIME*100+'%';$('power-gift').hidden=!hasGift;}
function finishRun(kind){updateHUD();showState('over');document.dispatchEvent(new CustomEvent('game-over',{detail:{distance:Math.floor(distance),coins:coinCount,score:scoreFor(distance,coinCount),biome:chosen,cause:kind==='barrier'?'Squat to slide under striped barriers.':kind==='rock'?'Step or lean to dodge rocks, or time a high jump.':'Jump over fallen logs.'}}));playSfx('hit');}

function action(a){
 if(state!=='playing')return;
 if(a==='left'||a==='right'){
  const next=clampLane(lane+(a==='left'?-1:1));
  if(next!==lane){lane=next;if(height<.03&&slideLeft<=0)mascot.trigger(a,.3);tone(230,.035);}
 }
 if(a==='jump'&&height<.03){slideLeft=0;velocity=8.4;mascot.trigger('jump',2*8.4/19);tone(400,.08);}
 if(a==='slide'&&height<.03){slideLeft=.9;mascot.trigger('slide',.9);tone(170,.07);}
}
document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();action(b.dataset.action);}));let touchStart=null;canvas.addEventListener('pointerdown',e=>{touchStart={x:e.clientX,y:e.clientY};});canvas.addEventListener('pointerup',e=>{if(!touchStart)return;const dx=e.clientX-touchStart.x,dy=e.clientY-touchStart.y;touchStart=null;if(Math.max(Math.abs(dx),Math.abs(dy))<22)return;action(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'slide':'jump');});canvas.addEventListener('pointercancel',()=>touchStart=null);
function updateHUD(){$('distance').innerHTML=Math.floor(distance)+'<span>m</span>';$('coins').textContent=coinCount;$('score').textContent=scoreFor(distance,coinCount);}
let poseSlideHeld=false;
let last=performance.now(),hudTimer=0;function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.04);last=now;const running=state==='playing';if(running){elapsed+=dt;const speed=speedAt(distance);const advance=speed*dt;distance+=advance;x=T.MathUtils.damp(x,LANES[lane],17,dt);if(height>0||velocity>0){height+=velocity*dt;velocity-=19*dt;if(height<0){height=0;velocity=0;}}slideLeft=Math.max(poseSlideHeld&&height<.03?.12:0,slideLeft-dt);while(spawnAt<distance+115)spawnRow();if(magnetLeft>0){magnetLeft=Math.max(0,magnetLeft-dt);if(magnetLeft===0){playSfx('magnetEnd');syncMusic();}}if(invincibleLeft>0){invincibleLeft=Math.max(0,invincibleLeft-dt);body.visible=invincibleLeft===0||Math.floor(invincibleLeft*10)%2===0;}magnetTarget.set(x,height+1,0);for(let i=entities.length-1;i>=0;i--){const e=entities[i];const prev=e.obj.position.z;if(e.kind==='coin'){e.obj.rotation.y+=dt*2;if(magnetLeft>0&&!e.pulled&&prev>-MAGNET_RANGE)e.pulled=true;let got;if(e.pulled){e.obj.position.lerp(magnetTarget,1-Math.exp(-14*dt));got=e.obj.position.distanceTo(magnetTarget)<.7;}else{e.obj.position.z=distance-e.d;got=Math.abs(x-LANES[e.lane])<.7&&Math.abs(height+(slideLeft>0?.5:1)-1.05)<.9&&crossed(prev,e.obj.position.z,.65);}if(got){coinCount++;playSfx('coin');release(e);entities.splice(i,1);continue;}}else if(e.guard){e.obj.position.z=distance-e.d;if(e.kind==='gift')e.obj.rotation.y=.6+Math.sin(elapsed*2)*.35;else e.obj.rotation.y+=dt*2.4;e.obj.position.y=e.y+Math.sin(elapsed*4)*.08;if(!e.checked&&crossed(prev,e.obj.position.z,.6)&&Math.abs(x-LANES[e.lane])<.77){e.checked=true;if(!hitObstacle(e.guard,height,slideLeft>0)){collectPower(e.kind);release(e);entities.splice(i,1);continue;}}}else{e.obj.position.z=distance-e.d;if(!e.checked&&crossed(prev,e.obj.position.z,.48)&&Math.abs(x-LANES[e.lane])<.77){e.checked=true;if(hitObstacle(e.kind,height,slideLeft>0)&&invincibleLeft===0){gameOver(e.kind);break;}}}if(e.obj.position.z>9){release(e);entities.splice(i,1);}}hudTimer+=dt;if(hudTimer>.09){updateHUD();updatePowerHUD();hudTimer=0;}}
for(const tile of tiles){if(tile.userData.start+tileLength<distance-12)tile.userData.start+=tileLength*tiles.length;tile.position.z=distance-tile.userData.start;}
body.position.y=height;
mascot.update(dt,state==='revive'?'paused':state,speedAt(distance),height>0||velocity>0,slideLeft>0,poseSlideHeld);
player.position.x=x;shadow.position.x=x;shadow.scale.setScalar(Math.max(.45,1-height*.18));shadow.material.opacity=Math.max(.06,.22-height*.06);camera.position.x=T.MathUtils.damp(camera.position.x,x*.15,3,dt);camera.lookAt(x*.12,1,-13);renderer.render(scene,camera);}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();if(state==='playing')showState('paused');toast('Graphics paused. Reload the page to restore the game.');});
chooseBiome('forest');requestAnimationFrame(frame);

export const game={
 get ready(){return environmentReady&&characterReady&&coinReady;},get state(){return state;},
 start,action,
 setLane(target){if(state!=='playing')return;const next=clampLane(target);if(next===lane)return;const direction=next<lane?'left':'right';lane=next;if(height<.03&&slideLeft<=0)mascot.trigger(direction,.3);},
 setSquat(active){poseSlideHeld=active;},
 pause(){if(state==='playing')showState('paused');},
 resume(){if(state==='paused')showState('playing');},
 revive,
 sfx:playSfx,
 endRun(){if(state==='revive')finishRun(crashKind);},
 home(){reset();clearEntities();player.position.set(0,0,0);showState('menu');}
};
