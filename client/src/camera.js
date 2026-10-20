export class CameraControls {
 constructor({video,onPose,onStatus,onLost,getMedia=null}){this.video=video;this.onPose=onPose;this.onStatus=onStatus;this.onLost=onLost;this.getMedia=getMedia;this.stream=null;this.worker=null;this.active=false;this.busy=false;this.lastFrame=0;this.token=0;}
 async start(){
  this.stop();const token=++this.token;
  if(!this.getMedia&&!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access requires localhost or HTTPS. You can choose keyboard controls.');
  this.onStatus('Allow camera access, then stand where your shoulders and hips are visible.');
  let stream;
  try{stream=await (this.getMedia||navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices))({audio:false,video:{width:{ideal:640},height:{ideal:480},facingMode:'user'}});}
  catch(e){throw new Error(e.name==='NotAllowedError'?'Camera permission was denied. Allow it in the browser or choose keyboard controls.':e.name==='NotFoundError'?'No webcam was found. Connect a camera or choose keyboard controls.':'Could not open the webcam. Close other camera apps and retry.');}
  if(token!==this.token){stream.getTracks().forEach(t=>t.stop());return false;}
  this.stream=stream;this.video.srcObject=stream;
  this.video.onloadedmetadata=()=>{};await this.video.play();
  if(token!==this.token)return false;
  stream.getVideoTracks()[0].onended=()=>{if(this.active){this.stop();this.onLost('Camera disconnected. Please return home and start again.');}};
  this.onStatus('Loading body tracking…');
  this.worker=new Worker(new URL('./pose-worker.js',import.meta.url));
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Body tracking took too long to load. Reload and retry.')),25000);this.initCancel=()=>{clearTimeout(timer);resolve();};
   this.worker.onerror=()=>{clearTimeout(timer);reject(new Error('Body tracking is unavailable in this browser. Try Chrome or keyboard controls.'));};
   this.worker.onmessage=({data})=>{
    if(data.type==='ready'){clearTimeout(timer);resolve();}
    else if(data.type==='error'){clearTimeout(timer);reject(new Error(data.message));}
    else if(data.type==='pose'){this.busy=false;this.onPose(data.points,data.time);}
    else if(data.type==='frame-error'){this.busy=false;this.onPose(null,performance.now());}
   };
   this.worker.postMessage({type:'init'});
  });
  this.initCancel=null;if(token!==this.token)return false;
  this.active=true;this.onStatus('Stand straight and hold still for calibration.');this.loop();return true;
 }
 loop=async()=>{
  if(!this.active)return;
  this.raf=requestAnimationFrame(this.loop);
  const now=performance.now();if(this.busy||now-this.lastFrame<65||this.video.readyState<2)return;
  this.busy=true;this.lastFrame=now;const worker=this.worker;
  try{const frame=await createImageBitmap(this.video);if(!this.active||worker!==this.worker){frame.close();this.busy=false;return;}worker.postMessage({type:'frame',frame,time:now},[frame]);}
  catch{this.busy=false;this.onPose(null,now);}
 };
 stop(){
  this.token++;this.active=false;this.busy=false;cancelAnimationFrame(this.raf);this.initCancel?.();this.initCancel=null;
  this.worker?.terminate();this.worker=null;
  this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=null;this.video.srcObject=null;
 }
}
