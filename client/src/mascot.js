import * as T from 'three';

// Clip motion lives inside this model; gameplay controls the outer player's height.
export class Mascot {
  constructor(parent) {
    this.parent=parent; this.mixer=null; this.actions=new Map(); this.current=null;
    this.temporary=null; this.remaining=0; this.ready=false;
  }
  async load(loader,url) {
    const gltf=await loader.loadAsync(url);
    this.model=gltf.scene;
    this.model.rotation.y=Math.PI;
    this.model.scale.setScalar(1.1);
    this.model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    this.parent.add(this.model);
    this.mixer=new T.AnimationMixer(this.model);
    for(const clip of gltf.animations)this.actions.set(clip.name,this.mixer.clipAction(clip));
    if(!this.actions.has('Run'))throw new Error('Mascot model has no Run animation');
    this.ready=true; this.play('Idle',.0);
  }
  find(names) {return names.find(n=>this.actions.has(n));}
  play(name,fade=.12,seconds=null) {
    const next=this.actions.get(name); if(!next)return;
    if(this.current===next&&seconds===null)return;
    const prev=this.current; next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
    next.setLoop(seconds?T.LoopOnce:T.LoopRepeat,seconds?1:Infinity);
    next.clampWhenFinished=!!seconds;
    if(seconds)next.setEffectiveTimeScale(next.getClip().duration/seconds);
    next.play(); if(prev&&prev!==next)next.crossFadeFrom(prev,fade,false);
    this.current=next;
  }
  trigger(kind,seconds) {
    const names={jump:['HighJump_InPlace','Jump_InPlace'],slide:['ForwardSlide','Slide','Roll'],left:['Left'],right:['Right']};
    const name=this.find(names[kind]||[]); if(!name)return;
    this.temporary=kind;this.remaining=seconds;this.play(name,.07,seconds);
  }
  reset() {
    this.temporary=null;this.remaining=0;
    if(this.mixer)this.mixer.stopAllAction();this.current=null;
    if(this.ready)this.play('Idle',0);
  }
  update(dt,state,speed,airborne,sliding,holdSlide=false) {
    if(!this.ready||state==='paused'||state==='over')return;
    if(state==='playing') {
      if(this.current)this.current.paused=false;
      this.remaining=Math.max(0,this.remaining-dt);
      if(holdSlide&&this.temporary==='slide'&&this.remaining<.5){this.remaining=.5;this.current.time=this.current.getClip().duration*.5;this.current.paused=true;}
      if(this.temporary==='jump'&&!airborne)this.remaining=0;
      if(this.temporary==='slide'&&!sliding)this.remaining=0;
      if(this.remaining===0)this.temporary=null;
      if(!this.temporary){this.play('Run');this.current.setEffectiveTimeScale(speed/10);}
    } else {this.temporary=null;this.remaining=0;this.play('Idle');}
    this.mixer.update(dt);
  }
}
