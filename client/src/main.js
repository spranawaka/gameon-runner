import {game} from './game.js';
import {PoseMotion} from './pose-motion.js';
import {CameraControls} from './camera.js';
const $=id=>document.getElementById(id);
const screens=['menu','setup','countdown','paused','over'];
let flow='menu',mode='camera',pendingRun=null,saving=false,countTimer=null,lastPose=0,lostSince=0,countRemaining=5,countLast=0,requestToken=0;
const motion=new PoseMotion();
function display(next){
 flow=next;document.body.dataset.screen=next;for(const id of screens)$(id).hidden=id!==next;
 $('hud').hidden=!['playing'].includes(next);$('pause').hidden=next!=='playing';
 $('touch-controls').hidden=next!=='playing'||mode!=='keyboard';$('footer').hidden=next!=='menu';
 $('camera-panel').hidden=mode!=='camera'||!['setup','countdown','playing','paused'].includes(next);
}
function setStatus(text){$('setup-status').textContent=text;}
function updateReady(){if(flow==='menu'){$('play').disabled=!game.ready;$('play').textContent=game.ready?'START ▶':'Preparing your trail…';if(game.ready)$('load-status').textContent=mode==='camera'?'Webcam controls · no login needed':'Keyboard controls · no login needed';}}
function setMode(next){mode=next;for(const name of ['camera','keyboard']){$('mode-'+name).classList.toggle('active',name===mode);$('mode-'+name).setAttribute('aria-pressed',String(name===mode));}updateReady();}
function stopCount(){clearInterval(countTimer);countTimer=null;}
function home(){requestToken++;stopCount();camera.stop();motion.reset();pendingRun=null;$('score-form').reset();$('save-status').textContent='';game.setSquat(false);game.home();display('menu');updateReady();}
function pause(reason='Your next step can wait.') {if(flow!=='playing')return;game.setSquat(false);$('pause-reason').textContent=reason;game.pause();display('paused');}
function drawPose(points){
 const ctx=$('pose-overlay').getContext('2d'),w=320,h=240;ctx.clearRect(0,0,w,h);if(!points)return;
 ctx.lineWidth=3;ctx.strokeStyle='#8ff5cd';ctx.fillStyle='#e0fff2';
 for(const [a,b]of[[11,12],[11,23],[12,24],[23,24]]){if(!points[a]||!points[b])continue;ctx.beginPath();ctx.moveTo((1-points[a].x)*w,points[a].y*h);ctx.lineTo((1-points[b].x)*w,points[b].y*h);ctx.stroke();}
 for(const p of Object.values(points)){ctx.beginPath();ctx.arc((1-p.x)*w,p.y*h,4,0,Math.PI*2);ctx.fill();}
}
function trackingLost(message){$('camera-status').textContent='Tracking unavailable';$('tracking-dot').classList.remove('tracked');pause(message);if(flow==='countdown'){$('countdown-hint').textContent=message;}}
function onPose(points,time){
 drawPose(points);
 if(flow==='setup'){
  const calibration=motion.calibrate(points,time);$('calibration-progress').style.width=calibration.progress*100+'%';document.querySelector('.calibration-track').setAttribute('aria-valuenow',String(Math.round(calibration.progress*100)));
  $('camera-status').textContent=points?'Hold still for calibration':'Step back into view';$('tracking-dot').classList.toggle('tracked',!!points);
  if(calibration.ready){lastPose=time;beginCountdown();}
  return;
 }
 const result=motion.update(points,time);$('tracking-dot').classList.toggle('tracked',result.tracked);
 $('camera-status').textContent=result.tracked?'Body tracking active':'Shoulders and hips out of view';
 if(!result.tracked){game.setSquat(false);if(!lostSince)lostSince=time;if(flow==='playing'&&time-lostSince>1100)pause('Tracking lost. Step back so your shoulders and hips are visible.');return;}
 lastPose=time;lostSince=0;
 if(flow==='playing'){
  game.setLane(result.lane);game.setSquat(result.sliding);
  if(result.jump)game.action('jump');if(result.slide)game.action('slide');
 }
}
const camera=new CameraControls({video:$('camera-video'),onPose,onStatus:setStatus,onLost:trackingLost});
async function start(){
 if(!game.ready||flow!=='menu')return;
 const token=++requestToken;pendingRun=null;$('score-form').reset();$('save-status').textContent='';
 if(mode==='keyboard'){beginCountdown();return;}
 motion.reset();lastPose=0;lostSince=0;$('calibration-progress').style.width='0';document.querySelector('.calibration-track').setAttribute('aria-valuenow','0');display('setup');
 try{const ready=await camera.start();if(!ready||token!==requestToken)return;}
 catch(e){if(token!==requestToken)return;camera.stop();setStatus(e.message);$('camera-status').textContent='Camera unavailable';}
}
function beginCountdown(){
 if(!['menu','setup'].includes(flow))return;
 stopCount();display('countdown');countRemaining=5;countLast=performance.now();$('countdown-number').textContent='5';$('countdown-hint').textContent='Get ready to move';
 countTimer=setInterval(()=>{
  const now=performance.now(),dt=Math.min((now-countLast)/1000,.2);countLast=now;
  if(document.hidden)return;
  if(mode==='camera'&&(!camera.active||now-lastPose>650)){$('countdown-hint').textContent='Step back into view to continue';return;}
  $('countdown-hint').textContent='Get ready to move';countRemaining-=dt;
  if(countRemaining>0){$('countdown-number').textContent=String(Math.ceil(countRemaining));return;}
  stopCount();$('countdown-number').textContent='GO!';$('countdown-hint').textContent='Enjoy your run';
  const token=requestToken;setTimeout(()=>{if(token!==requestToken||flow!=='countdown')return;if(mode==='camera'&&performance.now()-lastPose>650){flow='setup';beginCountdown();return;}game.start();display('playing');},450);
 },80);
}
async function loadLeaderboard(){
 $('refresh-board').disabled=true;$('leaderboard-status').textContent='Loading leaderboard…';
 try{const res=await fetch('/api/leaderboard',{cache:'no-store'});const data=await res.json();if(!res.ok)throw new Error(data.error);$('leaderboard').replaceChildren();
  for(const row of data.scores){const li=document.createElement('li');for(const [className,text]of[['rank',String(row.rank)],['avatar',row.name.trim().charAt(0).toUpperCase()],['runner',row.name],['points',row.score.toLocaleString()]]){const el=document.createElement('span');el.className=className;el.textContent=text;if(className==='avatar'){el.setAttribute('aria-hidden','true');el.style.setProperty('--avatar-hue',String([...row.name].reduce((n,c)=>n+c.charCodeAt(0),0)%360));}li.append(el);}$('leaderboard').append(li);}
  $('leaderboard-status').textContent=data.scores.length?'':'Be the first to leave your mark.';
 }catch(e){$('leaderboard-status').textContent=e.message||'Leaderboard unavailable. You can still play.';}finally{$('refresh-board').disabled=false;}
}
$('score-form').addEventListener('submit',async event=>{
 event.preventDefault();if(!pendingRun||saving)return;
 saving=true;$('save-score').disabled=true;$('skip-score').disabled=true;$('save-score').textContent='Saving…';$('save-status').textContent='';
 try{
  const res=await fetch('/api/scores',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(12000),body:JSON.stringify({name:$('player-name').value,email:$('player-email').value,distance:pendingRun.distance,coins:pendingRun.coins,biome:pendingRun.biome})});
  const data=await res.json();if(!res.ok)throw new Error(data.error||'Could not save. Please retry.');
  home();await loadLeaderboard();$('load-status').textContent='Score saved · your best: '+data.bestScore.toLocaleString();
 }catch(e){$('save-status').textContent=e.name==='TimeoutError'?'Save timed out. Please retry or skip.':e.message||'Could not save. Please retry or skip.';}
 finally{saving=false;$('save-score').disabled=false;$('skip-score').disabled=false;$('save-score').textContent='SAVE SCORE ▶';}
});
// No fetch, beacon, cookie or storage write runs on Skip.
$('skip-score').onclick=()=>{if(!saving)home();};
$('refresh-board').onclick=loadLeaderboard;$('play').onclick=start;
$('mode-camera').onclick=()=>setMode('camera');$('mode-keyboard').onclick=()=>setMode('keyboard');
$('setup-keyboard').onclick=()=>{requestToken++;camera.stop();motion.reset();setMode('keyboard');display('menu');beginCountdown();};
$('cancel-setup').onclick=home;$('cancel-countdown').onclick=home;
$('pause').onclick=()=>pause();$('resume').onclick=()=>{
 if(mode==='camera'&&(!camera.active||performance.now()-lastPose>650)){$('pause-reason').textContent='Stand in view of the webcam before continuing.';return;}
 game.resume();display('playing');
};
document.querySelectorAll('.home').forEach(b=>b.onclick=home);
document.querySelector('.brand').onclick=e=>{e.preventDefault();if(!saving)home();};
const keys={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'jump',KeyW:'jump',Space:'jump',ArrowDown:'slide',KeyS:'slide'};
addEventListener('keydown',e=>{
 if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
 if(e.code==='Escape'||e.code==='KeyP'){
  if(e.repeat)return;e.preventDefault();if(flow==='playing')pause();else if(flow==='paused')$('resume').click();else if(['setup','countdown'].includes(flow))home();return;
 }
 if(flow==='playing'&&mode==='keyboard'&&keys[e.code]){e.preventDefault();if(!e.repeat)game.action(keys[e.code]);}
});
document.addEventListener('game-ready',updateReady);
document.addEventListener('game-state',e=>{if(e.detail==='paused'&&flow==='playing')display('paused');});
document.addEventListener('game-over',e=>{
 requestToken++;stopCount();camera.stop();game.setSquat(false);pendingRun=Object.freeze({...e.detail});
 $('final-score').textContent=pendingRun.score.toLocaleString();$('final-distance').textContent=pendingRun.distance.toLocaleString();$('final-coins').textContent=pendingRun.coins.toLocaleString();$('cause').textContent=pendingRun.cause;$('score-form').reset();$('save-status').textContent='';display('over');
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&flow==='playing')pause('The tab was hidden. Continue when you are ready.');});
setInterval(()=>{if(mode==='camera'&&flow==='playing'&&performance.now()-lastPose>2000)pause('Tracking paused. Stand where your shoulders and hips are visible.');},500);
addEventListener('pagehide',()=>camera.stop());
display('menu');updateReady();loadLeaderboard();
