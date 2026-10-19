import storage from '@system.storage';
import {LANES,PLAYER_Y,FRAME_MS,speedFor,intervalFor,clampLane,moveX,collision,freshTraffic} from '../../common/game';
const BEST_KEY='race-best-v1';
export default {
  private:{phase:'ready',meters:0,best:0,pace:0,passed:0,playerStyle:'',traffic:[],marks:[]},
  onInit(){
    this._dead=false;this._visible=true;this._timer=null;this._touch=null;
    this._bestWritten=0;this._bestWriting=false;this._epoch=0;
    this.traffic=[0,1,2,3].map(id=>({id,active:false,x:233,y:105,color:'#ed9366',style:'opacity:0;'}));
    this.marks=[0,1,2,3,4,5,6,7].map(id=>({id,style:''}));
    this.resetScene();
    storage.get({key:BEST_KEY,success:value=>{
      if(this._dead)return;const n=Number(value);
      if(Number.isSafeInteger(n)&&n>=0){this.best=Math.max(this.best,n);this._bestWritten=n;this.saveBest();}
    },fail:()=>{}});
  },
  onShow(){this._visible=true;},
  onHide(){this.suspend();},
  onDestroy(){this.suspend();this._dead=true;},
  suspend(){this._visible=false;this._touch=null;if(this.phase==='running')this.phase='paused';this.stopTimer();this.saveBest();},
  stopTimer(){if(this._timer!==null)clearTimeout(this._timer);this._timer=null;this._epoch++;},
  resetScene(){
    this._distance=0;this.meters=0;this.passed=0;this.pace=0;this._lane=1;this._x=233;
    this._road=0;this._spawn=0;
    for(let i=0;i<this.traffic.length;i++){this.traffic[i].active=false;this.traffic[i].style='opacity:0;';}
    this.paint();
  },
  start(){
    if(this._dead||!this._visible||this.phase==='running')return;
    this.stopTimer();this._touch=null;this.resetScene();this.phase='running';this._last=Date.now();this.schedule();
  },
  pause(){if(this.phase!=='running')return;this.phase='paused';this._touch=null;this.stopTimer();this.saveBest();},
  resume(){if(this.phase!=='paused'||!this._visible||this._dead)return;this.phase='running';this._last=Date.now();this.schedule();},
  schedule(){
    if(this._timer!==null||this.phase!=='running'||!this._visible||this._dead)return;
    const epoch=this._epoch;
    this._timer=setTimeout(()=>{this._timer=null;if(epoch!==this._epoch||this.phase!=='running'||!this._visible||this._dead)return;this.tick();},FRAME_MS);
  },
  tick(){
    const now=Date.now(),dt=Math.min(.1,Math.max(0,(now-this._last)/1000));this._last=now;
    const speed=speedFor(this._distance),dx=speed*dt,oldX=this._x;
    this._x=moveX(this._x,this._lane,dt);this._distance+=dx/12;
    this.meters=Math.floor(this._distance);this.pace=Math.round(speed/140*60);this._road=(this._road+dx)%88;
    let crashed=false;
    for(let i=0;i<this.traffic.length;i++){
      const c=this.traffic[i];if(!c.active)continue;const oldY=c.y;c.y+=dx;
      if(collision(oldX,this._x,c,oldY,c.y))crashed=true;
      if(c.y>450){c.active=false;this.passed++;}
    }
    this._spawn+=dt*1000;
    if(this._spawn>=intervalFor(this._distance)){
      const slot=this.traffic.filter(c=>!c.active)[0];
      if(slot){const next=freshTraffic();slot.x=next.x;slot.y=next.y;slot.color=next.color;slot.active=true;this._spawn=0;}
    }
    this.paint();
    if(crashed){this.phase='over';this._touch=null;this.stopTimer();this.saveBest();}
    else this.schedule();
  },
  paint(){
    const player='left:'+Math.round(this._x-17)+'px;top:'+(PLAYER_Y-29)+'px;';
    if(this.playerStyle!==player)this.playerStyle=player;
    for(let i=0;i<this.traffic.length;i++){
      const c=this.traffic[i],style='left:'+Math.round(c.x-17)+'px;top:'+Math.round(c.y-29)+'px;opacity:'+(c.active?Math.min(1,Math.max(0,(c.y-100)/24)):0)+';background-color:'+c.color+';';
      if(c.style!==style)c.style=style;
    }
    for(let i=0;i<this.marks.length;i++){
      const y=100+Math.floor(i/2)*88+this._road;
      this.marks[i].style='left:'+(i%2?272:192)+'px;top:'+Math.round(y)+'px;opacity:'+(y>=125&&y<=397?1:0)+';';
    }
  },
  steer(direction){if(this.phase==='running')this._lane=clampLane(this._lane+direction);},
  touchStart(event){
    if(this.phase!=='running'||!this._visible)return;
    const touches=event&&event.touches;
    if(!touches||touches.length!==1){this._touch=null;return;}
    const t=touches[0];
    if(!Number.isFinite(t.clientX)||!Number.isFinite(t.clientY)||t.clientY<135)return;
    this._touch={x:t.clientX,y:t.clientY,id:t.identifier===undefined?0:t.identifier};
  },
  touchEnd(event){
    const from=this._touch;this._touch=null;if(!from||this.phase!=='running')return;
    const changed=event&&event.changedTouches;if(!changed||changed.length!==1||(event.touches&&event.touches.length))return;
    const t=changed[0];if((t.identifier===undefined?0:t.identifier)!==from.id||!Number.isFinite(t.clientX)||!Number.isFinite(t.clientY))return;
    const dx=t.clientX-from.x,dy=t.clientY-from.y;
    if(Math.abs(dx)>=18&&Math.abs(dx)>Math.abs(dy))this.steer(dx>0?1:-1);
    else if(Math.abs(dx)<18&&Math.abs(dy)<18&&from.y>=245)this.steer(from.x>=233?1:-1);
  },
  cancelTouch(){this._touch=null;},
  saveBest(){
    this.best=Math.max(this.best,this.meters);
    if(this._bestWriting||this.best<=this._bestWritten)return;
    const value=this.best;this._bestWriting=true;
    storage.set({key:BEST_KEY,value:String(value),success:()=>{this._bestWritten=value;},complete:()=>{this._bestWriting=false;if(this.best>value)this.saveBest();}});
  }
};
