export const POSE_THRESHOLDS=Object.freeze({leftRight:.12,neutral:.08,jump:.08,slide:.15,jumpSpeed:.35,visibility:.55});
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)];};
export function bodyMetrics(points){
 if(!points)return null;
 const selected=[11,12,23,24].map(i=>points[i]);
 if(selected.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.visibility)||p.visibility<POSE_THRESHOLDS.visibility||p.x<0||p.x>1||p.y<0||p.y>1))return null;
 const [left,right,hipLeft,hipRight]=selected;
 return {x:1-(left.x+right.x)/2,shoulderY:(left.y+right.y)/2,hipY:(hipLeft.y+hipRight.y)/2};
}
export class PoseMotion {
 constructor(){this.reset();}
 reset(){this.baseline=null;this.samples=[];this.filtered=null;this.previous=null;this.lane=1;this.jumpLatched=false;this.slideLatched=false;this.lastJump=-Infinity;}
 calibrate(points,time){
  const m=bodyMetrics(points);if(!m||m.hipY-m.shoulderY<.08){this.samples=[];return {ready:false,progress:0};}
  this.samples.push({...m,time});if(this.samples.length>22)this.samples.shift();
  const xs=this.samples.map(s=>s.x),ys=this.samples.map(s=>s.shoulderY);
  if(Math.max(...xs)-Math.min(...xs)>.055||Math.max(...ys)-Math.min(...ys)>.055){this.samples=this.samples.slice(-4);return {ready:false,progress:0};}
  const progress=Math.min(1,this.samples.length/22);
  if(this.samples.length===22&&time-this.samples[0].time>=900){
   this.baseline={x:median(xs),shoulderY:median(ys),hipY:median(this.samples.map(s=>s.hipY))};this.filtered={...this.baseline};this.previous={...this.baseline,time};return {ready:true,progress:1};
  }
  return {ready:false,progress};
 }
 update(points,time){
  const m=bodyMetrics(points);if(!m||!this.baseline)return {tracked:false};
  const prior=this.previous;
  if(!this.filtered||!prior||time-prior.time>300){this.filtered={...m};this.previous={...m,time};return {tracked:true,lane:this.lane,jump:false,slide:false};}
  const alpha=.5;for(const key of ['x','hipY','shoulderY'])this.filtered[key]+=alpha*(m[key]-this.filtered[key]);
  const f=this.filtered,dx=f.x-this.baseline.x,dy=f.shoulderY-this.baseline.shoulderY;
  if(dx<-POSE_THRESHOLDS.leftRight)this.lane=0;else if(dx>POSE_THRESHOLDS.leftRight)this.lane=2;else if(Math.abs(dx)<POSE_THRESHOLDS.neutral)this.lane=1;
  const sliding=dy>POSE_THRESHOLDS.slide;
  const rise=this.baseline.hipY-f.hipY,dt=Math.max(.01,(time-prior.time)/1000),speed=(prior.hipY-f.hipY)/dt;
  let jump=false;
  if(rise>POSE_THRESHOLDS.jump&&speed>POSE_THRESHOLDS.jumpSpeed&&!sliding&&!this.jumpLatched&&time-this.lastJump>850){jump=true;this.jumpLatched=true;this.lastJump=time;}
  if(rise<.035)this.jumpLatched=false;
  const slide=sliding&&!this.slideLatched;this.slideLatched=sliding;
  this.previous={...f,time};return {tracked:true,lane:this.lane,jump,slide,sliding};
 }
}
