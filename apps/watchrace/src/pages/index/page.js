import storage from '@system.storage';
import audio from '@system.audio';
import {PLAYER_Y,FRAME_MS,TRAFFIC_SPEED,HORN_DURATION,HORN_BOOST,driveSpeed,frontCar,freeSpawn,controlAt,roadX,roadY,collision,intervalFor} from '../../common/game';
const BEST_KEY='race-best-v1';
export default {
  private:{phase:'ready',meters:0,best:0,pace:0,passed:0,braking:true,accelerating:false,hornLabel:'喇叭',playerStyle:'',traffic:[],marks:[]},
  onInit(){
    this._dead=false;this._visible=true;this._timer=null;this._touch=null;
    this._audioAvailable=true;this._audioPlaying=false;
    try{audio.onended=()=>{this._audioPlaying=false;};audio.onerror=()=>{this._audioAvailable=false;this._audioPlaying=false;};}catch(e){this._audioAvailable=false;}
    this._bestWritten=0;this._bestWriting=false;this._epoch=0;
    this.traffic=[0,1,2,3].map(id=>({id,active:false,boost:0,x:233,y:105,color:'#ed9366',style:'opacity:0;'}));
    this._trafficY=[null,null,null,null];
    this.marks=[0,1,2,3,4,5,6,7].map(id=>({id,style:''}));
    this.resetScene();
    storage.get({key:BEST_KEY,success:value=>{
      if(this._dead)return;const n=Number(value);
      if(Number.isSafeInteger(n)&&n>=0){this.best=Math.max(this.best,n);this._bestWritten=n;this.saveBest();}
    },fail:()=>{}});
  },
  onShow(){this._visible=true;},
  onHide(){this.suspend();},
  onDestroy(){this.suspend();this._dead=true;try{audio.onended=null;audio.onerror=null;}catch(e){}},
  suspend(){this._visible=false;this.cancelTouch();this.stopHorn();if(this.phase==='running')this.phase='paused';this.stopTimer();this.saveBest();},
  stopTimer(){if(this._timer!==null)clearTimeout(this._timer);this._timer=null;this._epoch++;},
  resetScene(){
    this._distance=0;this.meters=0;this.passed=0;this.pace=40;this._x=233;this._y=PLAYER_Y;this._targetX=233;this._targetY=PLAYER_Y;
    this._road=0;this._spawn=0;this._speed=TRAFFIC_SPEED;this._hornFlash=0;this.hornLabel='喇叭';this.cancelTouch();
    for(let i=0;i<this.traffic.length;i++){this.traffic[i].active=false;this.traffic[i].boost=0;this.traffic[i].style='opacity:0;';}
    this.paint();
  },
  start(){
    if(this._dead||!this._visible||this.phase==='running')return;
    this.stopTimer();this._touch=null;this.resetScene();this.phase='running';this._last=Date.now();this.schedule();
  },
  pause(){if(this.phase!=='running')return;this.phase='paused';this.cancelTouch();this.stopHorn();this.stopTimer();this.saveBest();},
  resume(){if(this.phase!=='paused'||!this._visible||this._dead)return;this.phase='running';this._last=Date.now();this.schedule();},
  schedule(){
    if(this._timer!==null||this.phase!=='running'||!this._visible||this._dead)return;
    const epoch=this._epoch;
    this._timer=setTimeout(()=>{this._timer=null;if(epoch!==this._epoch||this.phase!=='running'||!this._visible||this._dead)return;this.tick();},FRAME_MS);
  },
  tick(){
    const now=Date.now(),dt=Math.min(.1,Math.max(0,(now-this._last)/1000));this._last=now;
    const beforeSpeed=this._speed;this._speed=driveSpeed(this._speed,this.braking,this._distance,dt);
    const speed=this._speed,dx=(beforeSpeed+speed)*.5*dt,oldX=this._x,oldY=this._y;
    this._hornFlash=Math.max(0,this._hornFlash-dt);
    this.hornLabel=this._hornFlash>0?this._hornNotice:'喇叭';
    this._x=this._targetX;this._y=this._targetY;this._distance+=dx/12;
    this.meters=Math.floor(this._distance);this.pace=Math.round(speed/TRAFFIC_SPEED*40);this._road=(this._road+dx)%88;
    let crashed=false;
    for(let i=0;i<this.traffic.length;i++)this._trafficY[i]=this.traffic[i].active?this.traffic[i].y:null;
    for(let i=0;i<this.traffic.length;i++){
      const c=this.traffic[i];if(!c.active)continue;const oldCarY=c.y,boostTime=Math.min(c.boost||0,dt);
      let extra=HORN_BOOST*boostTime;
      for(let j=0;j<this.traffic.length;j++){
        const y=this._trafficY[j];
        if(y!==null&&this.traffic[j].x===c.x&&y<oldCarY)extra=Math.min(extra,Math.max(0,oldCarY-y-68));
      }
      c.y+=dx-TRAFFIC_SPEED*dt-extra;c.boost=Math.max(0,(c.boost||0)-dt);
      if(collision(oldX,this._x,c,oldCarY,c.y,oldY,this._y))crashed=true;
      if(c.y>450){c.active=false;this.passed++;}else if(c.y<65)c.active=false;
    }
    this._spawn+=dt*1000;
    if(this._spawn>=intervalFor(this._distance)){
      const slot=this.traffic.filter(c=>!c.active)[0];
      if(slot){const next=freeSpawn(this.traffic);if(next){slot.x=next.x;slot.y=next.y;slot.color=next.color;slot.boost=0;slot.active=true;this._spawn=0;}}
    }
    this.paint();
    if(crashed){this.phase='over';this.cancelTouch();this.stopHorn();this.stopTimer();this.saveBest();}
    else this.schedule();
  },
  paint(){
    const player='left:'+Math.round(this._x-17)+'px;top:'+Math.round(this._y-29)+'px;';
    if(this.playerStyle!==player)this.playerStyle=player;
    for(let i=0;i<this.traffic.length;i++){
      const c=this.traffic[i],style='left:'+Math.round(c.x-17)+'px;top:'+Math.round(c.y-29)+'px;opacity:'+(c.active?Math.min(1,Math.max(0,(c.y-100)/24)):0)+';background-color:'+c.color+';border-color:'+(c.boost>0?'#fff1a5':'#182531')+';';
      if(c.style!==style)c.style=style;
    }
    for(let i=0;i<this.marks.length;i++){
      const y=100+Math.floor(i/2)*88+this._road;
      this.marks[i].style='left:'+(i%2?272:192)+'px;top:'+Math.round(y)+'px;opacity:'+(y>=125&&y<=397?1:0)+';';
    }
  },
  honk(){
    if(this.phase!=='running'||!this._visible||this._dead)return;
    this._hornFlash=.6;
    const car=frontCar(this.traffic,this._x,this._y);
    if(car)car.boost=HORN_DURATION;
    this._hornNotice=car?'前车提速':'无前车';this.hornLabel=this._hornNotice;
    if(this._audioAvailable){this.stopHorn();try{audio.autoplay=false;audio.loop=false;audio.src='/common/horn.mp3';this._audioPlaying=true;audio.play();}catch(e){this._audioPlaying=false;this._audioAvailable=false;}}
    this.paint();
  },
  stopHorn(){if(this._audioPlaying){this._audioPlaying=false;try{audio.stop();}catch(e){}}},
  follow(t){
    if(!Number.isFinite(t.clientX)||!Number.isFinite(t.clientY))return;
    this._targetX=roadX(t.clientX);this._targetY=roadY(t.clientY);
  },
  touchStart(event){
    if(this.phase!=='running'||!this._visible||this._dead)return;
    const touches=event&&event.touches;if(!touches||!touches.length)return;
    const changed=event.changedTouches||touches;
    for(let i=0;i<changed.length;i++){
      const t=changed[i];if(!Number.isFinite(t.clientX)||!Number.isFinite(t.clientY))continue;
      const id=t.identifier===undefined?0:t.identifier;
      if(controlAt(t)==='horn'){
        if(this._hornFinger===null){this._hornFinger=id;this.honk();}
      }else if(this._driveFinger===null&&t.clientY>=140&&t.clientY<=445){
        this._driveFinger=id;this.accelerating=true;this.braking=false;this.follow(t);
      }
    }
  },
  touchMove(event){
    if(this.phase!=='running'||this._driveFinger===null)return;
    const touches=event&&event.touches||[];
    const t=touches.filter(t=>(t.identifier===undefined?0:t.identifier)===this._driveFinger)[0];
    if(t)this.follow(t);
    else{this._driveFinger=null;this.accelerating=false;this.braking=true;}
  },
  touchEnd(event){
    const changed=event&&event.changedTouches;if(!changed)return;
    for(let i=0;i<changed.length;i++){
      const t=changed[i],id=t.identifier===undefined?0:t.identifier;
      if(id===this._driveFinger){this.follow(t);this._driveFinger=null;this.accelerating=false;this.braking=true;}
      if(id===this._hornFinger)this._hornFinger=null;
    }
  },
  cancelTouch(){this._touch=null;this._driveFinger=null;this._hornFinger=null;this.accelerating=false;this.braking=true;},
  saveBest(){
    this.best=Math.max(this.best,this.meters);
    if(this._bestWriting||this.best<=this._bestWritten)return;
    const value=this.best;this._bestWriting=true;
    storage.set({key:BEST_KEY,value:String(value),success:()=>{this._bestWritten=value;},complete:()=>{this._bestWriting=false;if(this.best>value)this.saveBest();}});
  }
};
