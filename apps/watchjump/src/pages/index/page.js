import storage from '@system.storage';
import vibrator from '@system.vibrator';
import {ANCHOR, MAX_HOLD, charge, endpoint, landing, targetFor, arc} from '../../common/game';
const BEST_KEY = 'jump-best-v1';
const PREF_KEY = 'jump-feedback-v1';
const FRAME = 20;
export default {
  private: {score: 0, best: 0, combo: 0, phase: 'ready', haptics: true, hapticAvailable: true,
    hint: '按住蓄力，松手起跳', powerLabel: '轻按近 · 长按远', rewardText: '',
    powerStyle: 'width:0px;', playerStyle: '', headStyle: '', bodyStyle: '', shadowStyle: '',
    ringStyle: 'opacity:0;', rewardStyle: 'opacity:0;', platforms: []},
  onInit() {
    this._dead=false;this._visible=true;this._timer=null;this._finger=null;
    this._chargeStart=0;this._chargeStage=0;this._flight=null;this._camera=null;this._epoch=0;
    this._bestWritten=0;this._bestWriting=false;this._lastHaptic=-1000;
    this._prefWriting=false;this._prefDirty=false;this._prefsTouched=false;
    this.platforms=[0,1,2].map(id=>({id,topStyle:'',sideStyle:'',markStyle:''}));
    this.restart();
    storage.get({key:BEST_KEY,success:value=>{
      if(this._dead)return;const n=Number(value);
      if(Number.isSafeInteger(n)&&n>=0){this.best=Math.max(this.best,n);this._bestWritten=n;this.saveBest();}
    },fail:()=>{}});
    storage.get({key:PREF_KEY,success:value=>{
      if(this._dead||this._prefsTouched)return;
      try{const p=JSON.parse(value);if(typeof p.haptics==='boolean')this.haptics=p.haptics;}catch(e){}
    },fail:()=>{}});
  },
  onShow(){this._visible=true;},
  onHide(){this.suspend();},
  onDestroy(){this.suspend();this._dead=true;},
  suspend(){
    this._visible=false;this.cancelTimer();this._finger=null;
    if(this._flight)this.completeFlight(false);
    if(this._camera)this.finishCamera();
    if(this.phase==='charging')this.cancelCharge();
    if(this.phase==='falling')this.finishFall();
    this.clearReward();this.saveBest();
  },
  cancelTimer(){if(this._timer!==null)clearTimeout(this._timer);this._timer=null;this._epoch++;},
  later(callback,delay){
    const epoch=this._epoch;
    this._timer=setTimeout(()=>{this._timer=null;if(this._dead||!this._visible||epoch!==this._epoch)return;callback();},delay);
  },
  pulse(){
    if(!this.haptics||!this.hapticAvailable||!this._visible||this._dead)return;
    const now=Date.now();if(now-this._lastHaptic<180)return;
    this._lastHaptic=now;
    // Watch S4 supports vibrate(short); start/stop/custom-duration tasks are S5-only.
    // Each pulse is finite. No vibration loop or separate haptic timer.
    try{vibrator.vibrate({mode:'short'});}catch(e){this.hapticAvailable=false;}
  },
  toggleHaptics(){
    if(this.phase!=='ready'&&this.phase!=='over')return;
    this.haptics=!this.haptics;this._prefsTouched=true;this._prefDirty=true;
    if(this.haptics)this.pulse();this.savePreferences();
  },
  savePreferences(){
    if(this._prefWriting||!this._prefDirty)return;
    this._prefDirty=false;this._prefWriting=true;
    storage.set({key:PREF_KEY,value:JSON.stringify({haptics:this.haptics}),complete:()=>{
      this._prefWriting=false;if(this._prefDirty)this.savePreferences();
    }});
  },
  restart(){
    if(this._dead||['flying','landing','scrolling','falling'].indexOf(this.phase)>=0)return;
    this.cancelTimer();this._finger=null;this._flight=null;this._camera=null;
    this.score=0;this.combo=0;this.phase='ready';this.hint='按住蓄力，松手起跳';this.resetPower();this.clearReward();
    this._current={x:ANCHOR.x,y:ANCHOR.y,width:86,color:'#738398'};
    this._target=targetFor(0);this._x=ANCHOR.x;this._y=ANCHOR.y;
    this.paintPlatform(0,this._current,0,0,1);this.paintPlatform(1,this._target,0,0,1);this.paintPlatform(2,this._current,0,0,0);
    this.paintPlayer(this._x,this._y,this._y,0,1);
  },
  paintPlatform(id,p,dx,dy,opacity,compression=0){
    const x=Math.round(p.x+dx),y=Math.round(p.y+dy),w=p.width,drop=Math.round(compression*7);
    const base='left:'+(x-w/2)+'px;';
    this.platforms[id].sideStyle=base+'top:'+(y-1+drop)+'px;width:'+w+'px;height:'+(22-drop)+'px;opacity:'+opacity+';background-color:'+p.color+';';
    this.platforms[id].topStyle=base+'top:'+(y-15+drop)+'px;width:'+w+'px;height:'+(30-compression*4)+'px;opacity:'+opacity+';background-color:'+p.color+';';
    this.platforms[id].markStyle='left:'+(x-8)+'px;top:'+(y-3+drop)+'px;opacity:'+opacity+';';
  },
  paintPlayer(x,y,groundY,squash,opacity,rotation=0){
    const h=25-squash*12,width=19+squash*10;
    // Vela expects transform in its compiled JSON form for dynamic inline styles.
    this.playerStyle={left:Math.round(x-17)+'px',top:Math.round(y-45)+'px',opacity:String(opacity),transform:JSON.stringify({rotate:Math.round(rotation)+'deg'})};
    this.bodyStyle='left:'+((34-width)/2)+'px;top:'+(45-h)+'px;width:'+width+'px;height:'+h+'px;';
    this.headStyle='left:6px;top:'+(45-h-18)+'px;';
    const shadowW=26+squash*14;
    const height=Math.max(0,groundY-y),shadowOpacity=opacity*(.35-Math.min(.2,height/340));
    this.shadowStyle='left:'+Math.round(x-shadowW/2)+'px;top:'+Math.round(groundY-4)+'px;width:'+shadowW+'px;opacity:'+shadowOpacity+';';
  },
  clearReward(){this.ringStyle='opacity:0;';this.rewardStyle='opacity:0;';this.rewardText='';},
  resetPower(){this.powerStyle='width:0px;background-color:#bce98b;';this.powerLabel='轻按近 · 长按远';},
  touchStart(event){
    if(this.phase==='charging'&&event&&event.touches&&event.touches.length!==1){this.cancelCharge();return;}
    if(this.phase!=='ready'||!this._visible||this._dead)return;
    const touches=event&&event.touches;if(!touches||touches.length!==1){this.cancelCharge();return;}
    const t=touches[0];if(!Number.isFinite(t.clientY)||t.clientY<110||t.clientY>370)return;
    this._finger=t.identifier===undefined?0:t.identifier;
    this._chargeStart=Date.now();this._chargeStage=0;this.phase='charging';this.hint='蓄力下压 · 松手弹起';this.clearReward();
    this.pulse();this.chargeTick();
  },
  chargeTick(){
    if(this.phase!=='charging')return;
    const p=charge(Date.now()-this._chargeStart),stage=p>=1?2:p>=.5?1:0;
    if(stage>this._chargeStage){this._chargeStage=stage;this.pulse();}
    this.powerStyle='width:'+Math.round(p*236)+'px;background-color:'+(p>.8?'#f0b77a':'#bce98b')+';';
    this.powerLabel=p>=1?'蓄力已满，松手起跳':'蓄力 '+Math.round(p*100)+'%';
    const ringW=32+p*36,ringH=12+p*12;
    this.ringStyle='left:'+(this._x-ringW/2)+'px;top:'+(this._y+p*7-ringH/2)+'px;width:'+ringW+'px;height:'+ringH+'px;opacity:'+(0.25+p*.4)+';border-color:'+(p>.8?'#f0b77a':'#bce98b')+';';
    this.paintPlatform(0,this._current,0,0,1,p);
    this.paintPlayer(this._x,this._y+p*7,this._y+p*7,p,1);
    if(p<1)this.later(()=>this.chargeTick(),40);
  },
  touchEnd(event){
    if(this.phase!=='charging')return;
    const changed=event&&event.changedTouches;
    if(!changed||changed.length!==1||(event.touches&&event.touches.length)){this.cancelCharge();return;}
    const t=changed[0],id=t.identifier===undefined?0:t.identifier;if(id!==this._finger){this.cancelCharge();return;}
    const held=Math.min(MAX_HOLD,Math.max(0,Date.now()-this._chargeStart));
    this.cancelTimer();this.clearReward();this._finger=null;this.phase='flying';this.hint='起跳！';this.pulse();
    this.paintPlatform(0,this._current,0,0,1);this.paintPlayer(this._x,this._y,this._y,-.3,1);
    const from={x:this._x,y:this._y},to=endpoint(from,this._target,held);
    this._flight={from,to,result:landing(to,this._current,this._target),start:Date.now()};this.flyTick(1);
  },
  cancelCharge(){
    this.cancelTimer();this.clearReward();this._finger=null;if(this.phase==='charging')this.phase='ready';this.resetPower();
    if(this._current){this.paintPlatform(0,this._current,0,0,1);this.paintPlayer(this._x,this._y,this._y,0,1);}
    if(this.phase==='ready')this.hint='按住蓄力，松手起跳';
  },
  flyTick(step){
    this.later(()=>{
      if(!this._flight)return;const f=this._flight,t=Math.min(1,Math.max(step/18,(Date.now()-f.start)/360));
      const p=arc(f.from,f.to,t),stretch=-.25*Math.sin(Math.PI*t);
      this.paintPlayer(p.x,p.y,p.groundY,stretch,1,360*t);
      if(t<1&&step<18)this.flyTick(Math.max(step+1,Math.floor(t*18)+1));else this.completeFlight(true);
    },FRAME);
  },
  completeFlight(animate){
    const f=this._flight;this._flight=null;if(!f)return;
    this._x=f.to.x;this._y=f.to.y;this.resetPower();
    if(!f.result.hit){
      this.combo=0;
      const dx=this._target.x-f.from.x,dy=this._target.y-f.from.y;
      this.hint=(f.to.x-this._target.x)*dx+(f.to.y-this._target.y)*dy>0?'跳远了，少蓄一点力':'跳近了，再多蓄一点力';
      this.powerLabel='本局 '+this.score+' 分 · 点再来';this.pulse();
      this.phase='falling';if(animate)this.fallTick(1);else this.finishFall();return;
    }
    this.pulse();
    if(!f.result.advance){this.phase='ready';this.hint='还在原地，再多蓄力一点';this.paintPlayer(this._x,this._y,this._y,0,1);return;}
    const perfect=f.result.points===2;
    this.combo=perfect?this.combo+1:0;
    const points=perfect?this.combo*2:1;
    this.score+=points;if(this.score>this.best){this.best=this.score;this.saveBest();}
    this.hint=perfect?'中心连中 '+this.combo+' 次  +'+points:'稳稳落地 +1';
    this.rewardText=perfect?'中心 +'+points:'+'+points;
    const next=targetFor(this.score),dx=ANCHOR.x-this._target.x,dy=ANCHOR.y-this._target.y;
    const upcoming={...next,x:next.x-dx,y:next.y-dy};
    this._camera={old:this._current,current:this._target,next:upcoming,dx,dy,x:this._x,y:this._y,start:Date.now()};
    this.phase='landing';if(animate)this.landingTick(1);else this.finishCamera();
  },
  landingTick(step){
    this.later(()=>{
      const c=this._camera;if(!c)return;const t=step/7,bounce=Math.sin(Math.PI*t)*.7;
      this.paintPlatform(1,c.current,0,0,1,bounce*.4);
      this.paintPlayer(c.x,c.y+bounce*3,c.y,bounce,1);
      const w=30+t*56,h=12+t*20;
      this.ringStyle='left:'+(c.x-w/2)+'px;top:'+(c.y-h/2)+'px;width:'+w+'px;height:'+h+'px;opacity:'+(1-t)+';border-color:'+(this.combo?'#ffe7a0':'#8bdce2')+';';
      this.rewardStyle='left:'+(c.x-70)+'px;top:'+(c.y-76-t*16)+'px;opacity:'+(1-t*.5)+';';
      if(step<7)this.landingTick(step+1);
      else{this.clearReward();this.paintPlatform(1,c.current,0,0,1);this.phase='scrolling';c.start=Date.now();this.cameraTick(1);}
    },24);
  },
  fallTick(step){
    this.later(()=>{const t=step/6;this.paintPlayer(this._x,this._y+38*t,this._y,.2+t*.5,1-t*.7,t*65);
      if(step<6)this.fallTick(step+1);else this.finishFall();},24);
  },
  finishFall(){this.phase='over';this.paintPlayer(this._x,this._y+38,this._y,.7,.3,65);},
  cameraTick(step){
    this.later(()=>{
      if(!this._camera)return;const c=this._camera,t=Math.min(1,Math.max(step/9,(Date.now()-c.start)/180)),e=t*t*(3-2*t);
      this.paintPlatform(0,c.old,c.dx*e,c.dy*e,1-e);this.paintPlatform(1,c.current,c.dx*e,c.dy*e,1);this.paintPlatform(2,c.next,c.dx*e,c.dy*e,e);
      this.paintPlayer(c.x+c.dx*e,c.y+c.dy*e,c.y+c.dy*e,0,1);
      if(t<1&&step<9)this.cameraTick(Math.max(step+1,Math.floor(t*9)+1));else this.finishCamera();
    },FRAME);
  },
  finishCamera(){
    const c=this._camera;this._camera=null;if(!c)return;
    this._current={...c.current,x:ANCHOR.x,y:ANCHOR.y};this._target={...c.next,x:c.next.x+c.dx,y:c.next.y+c.dy};
    this._x=c.x+c.dx;this._y=c.y+c.dy;
    this.paintPlatform(0,this._current,0,0,1);this.paintPlatform(1,this._target,0,0,1);this.paintPlatform(2,this._current,0,0,0);
    this.paintPlayer(this._x,this._y,this._y,0,1);this.clearReward();this.phase='ready';
  },
  saveBest(){
    if(this._bestWriting||this.best<=this._bestWritten)return;const value=this.best;this._bestWriting=true;
    storage.set({key:BEST_KEY,value:String(value),success:()=>{this._bestWritten=value;},complete:()=>{this._bestWriting=false;if(this.best>value)this.saveBest();}});
  }
};
