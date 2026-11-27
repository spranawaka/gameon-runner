// Dancing character drawn in the middle of the Lion Strong popup (own small transparent WebGL canvas).
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
const URL='assets/colombo/final-dance-model.glb';
let renderer=null,scene=null,camera=null,mixer=null,model=null,hips=null,hipsHome=null,canvas=null,raf=0,last=0,loading=null;
function load(){
 if(loading)return loading;
 const loader=new GLTFLoader();loader.setDRACOLoader(new DRACOLoader().setDecoderPath('lib/three/examples/jsm/libs/draco/gltf/'));
 loading=loader.loadAsync(URL).then(g=>{
  model=g.scene;model.traverse(o=>{if(o.isMesh){o.frustumCulled=false;}if(o.isBone&&!hips&&/hips/i.test(o.name))hips=o;});
  if(hips)hipsHome=hips.position.clone();
  scene=new T.Scene();scene.add(model);
  scene.add(new T.HemisphereLight('#dff4ff','#1b2f7a',2.2));
  const key=new T.DirectionalLight('#ffffff',2.4);key.position.set(1.5,3,4);scene.add(key);
  const rim=new T.DirectionalLight('#4fd6ff',2.2);rim.position.set(-3,2.5,-2);scene.add(rim);
  const box=new T.Box3().setFromObject(model),h=box.max.y-box.min.y;
  camera=new T.PerspectiveCamera(28,1,.1,50);camera.position.set(0,h*.55,h*2.55);camera.lookAt(0,h*.5,0);
  mixer=new T.AnimationMixer(model);
  for(const clip of g.animations)mixer.clipAction(clip).play();
 }).catch(e=>console.error('final-dance-model.glb',e));
 return loading;
}
function frame(now){
 raf=requestAnimationFrame(frame);if(!renderer||!mixer)return;
 const dt=Math.min((now-last)/1000,.05);last=now;mixer.update(dt);
 if(hips&&hipsHome){hips.position.x=hipsHome.x;hips.position.z=hipsHome.z;} // dance in place
 const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
 const dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
 renderer.render(scene,camera);
}
export const dancer={
 preload:load,
 async start(target){
  canvas=target;
  if(!renderer){renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.setClearColor(0x000000,0);}
  await load();cancelAnimationFrame(raf);last=performance.now();if(mixer)mixer.setTime(0);raf=requestAnimationFrame(frame);
 },
 stop(){cancelAnimationFrame(raf);raf=0;}
};
