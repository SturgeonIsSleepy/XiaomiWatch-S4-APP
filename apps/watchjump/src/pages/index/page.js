import storage from '@system.storage';
import {ANCHOR, MAX_HOLD, charge, endpoint, landing, targetFor, arc} from '../../common/game';
const BEST_KEY = 'jump-best-v1';
const FRAME = 20;
export default {
  private: {score: 0, best: 0, phase: 'ready', hint: '按住蓄力，松手起跳', powerLabel: '轻按近 · 长按远',
    powerStyle: 'width:0px;', headStyle: '', bodyStyle: '', shadowStyle: '', platforms: []},
  onInit() {
    this._dead = false; this._visible = true; this._timer = null; this._finger = null;
    this._chargeStart = 0; this._flight = null; this._camera = null; this._epoch = 0;
    this._bestWritten = 0; this._bestWriting = false;
    this.platforms = [0,1,2].map(id => ({id, topStyle: '', sideStyle: '', markStyle: ''}));
    this.restart();
    storage.get({key: BEST_KEY, success: value => {
      if (this._dead) return;
      const n = Number(value);
      if (Number.isSafeInteger(n) && n >= 0) { this.best = Math.max(this.best, n); this._bestWritten = n; this.saveBest(); }
    }, fail: () => {}});
  },
  onShow() { this._visible = true; },
  onHide() {
    this._visible = false; this.cancelTimer(); this._finger = null;
    if (this._flight) this.completeFlight(false);
    if (this._camera) this.finishCamera();
    if (this.phase === 'charging') this.cancelCharge();
    this.saveBest();
  },
  onDestroy() { this.onHide(); this._dead = true; },
  cancelTimer() { if (this._timer !== null) clearTimeout(this._timer); this._timer = null; this._epoch++; },
  later(callback, delay) {
    const epoch = this._epoch;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (this._dead || !this._visible || epoch !== this._epoch) return;
      callback();
    }, delay);
  },
  restart() {
    if (this._dead || this.phase === 'flying' || this.phase === 'scrolling') return;
    this.cancelTimer(); this._finger = null; this._flight = null; this._camera = null;
    this.score = 0; this.phase = 'ready'; this.hint = '按住蓄力，松手起跳'; this.resetPower();
    this._current = {x: ANCHOR.x, y: ANCHOR.y, width: 86, color: '#738398'};
    this._target = targetFor(0); this._x = ANCHOR.x; this._y = ANCHOR.y;
    this.paintPlatform(0, this._current, 0, 0, 1);
    this.paintPlatform(1, this._target, 0, 0, 1);
    this.paintPlatform(2, this._current, 0, 0, 0);
    this.paintPlayer(this._x, this._y, this._y, 0, 1);
  },
  paintPlatform(id, p, dx, dy, opacity) {
    const x = Math.round(p.x + dx), y = Math.round(p.y + dy), w = p.width;
    const base = 'left:' + (x - w/2) + 'px;';
    this.platforms[id].sideStyle = base + 'top:' + (y-1) + 'px;width:' + w + 'px;height:22px;opacity:' + opacity + ';background-color:' + p.color + ';';
    this.platforms[id].topStyle = base + 'top:' + (y-15) + 'px;width:' + w + 'px;opacity:' + opacity + ';background-color:' + p.color + ';';
    this.platforms[id].markStyle = 'left:' + (x-8) + 'px;top:' + (y-3) + 'px;opacity:' + opacity + ';';
  },
  paintPlayer(x, y, groundY, squash, opacity) {
    const h = 25 - squash * 9, width = 19 + squash * 6;
    this.bodyStyle = 'left:' + Math.round(x-width/2) + 'px;top:' + Math.round(y-h) + 'px;width:' + width + 'px;height:' + h + 'px;opacity:' + opacity + ';';
    this.headStyle = 'left:' + Math.round(x-11) + 'px;top:' + Math.round(y-h-18) + 'px;opacity:' + opacity + ';';
    const shadowW = 26 + squash * 12;
    this.shadowStyle = 'left:' + Math.round(x-shadowW/2) + 'px;top:' + Math.round(groundY-4) + 'px;width:' + shadowW + 'px;opacity:' + (opacity * 0.35) + ';';
  },
  resetPower() { this.powerStyle = 'width:0px;background-color:#bce98b;'; this.powerLabel = '轻按近 · 长按远'; },
  touchStart(event) {
    if (this.phase === 'charging' && event && event.touches && event.touches.length !== 1) { this.cancelCharge(); return; }
    if (this.phase !== 'ready' || !this._visible || this._dead) return;
    const touches = event && event.touches;
    if (!touches || touches.length !== 1) { this.cancelCharge(); return; }
    const t = touches[0];
    if (!Number.isFinite(t.clientY) || t.clientY < 110 || t.clientY > 370) return;
    this._finger = t.identifier === undefined ? 0 : t.identifier;
    this._chargeStart = Date.now(); this.phase = 'charging'; this.hint = '按住蓄力 · 松手起跳';
    this.chargeTick();
  },
  chargeTick() {
    if (this.phase !== 'charging') return;
    const p = charge(Date.now() - this._chargeStart);
    this.powerStyle = 'width:' + Math.round(p*236) + 'px;background-color:' + (p > .8 ? '#f0b77a' : '#bce98b') + ';';
    this.powerLabel = p >= 1 ? '蓄力已满，松手起跳' : '蓄力 ' + Math.round(p*100) + '%';
    this.paintPlayer(this._x, this._y, this._y, p, 1);
    if (p < 1) this.later(() => this.chargeTick(), 40);
    // Holding beyond MAX_HOLD does not run an idle refresh loop.
  },
  touchEnd(event) {
    if (this.phase !== 'charging') return;
    const changed = event && event.changedTouches;
    if (!changed || changed.length !== 1 || (event.touches && event.touches.length)) { this.cancelCharge(); return; }
    const t = changed[0], id = t.identifier === undefined ? 0 : t.identifier;
    if (id !== this._finger) { this.cancelCharge(); return; }
    const held = Math.min(MAX_HOLD, Math.max(0, Date.now()-this._chargeStart));
    this.cancelTimer(); this._finger = null; this.phase = 'flying'; this.hint = '起跳！';
    const from = {x:this._x,y:this._y}, to = endpoint(from, this._target, held);
    this._flight = {from, to, result: landing(to, this._current, this._target), start:Date.now()};
    this.flyTick(1);
  },
  cancelCharge() {
    this.cancelTimer(); this._finger = null;
    if (this.phase === 'charging') this.phase = 'ready';
    this.resetPower();
    if (this._current) this.paintPlayer(this._x, this._y, this._y, 0, 1);
    if (this.phase === 'ready') this.hint = '按住蓄力，松手起跳';
  },
  flyTick(step) {
    this.later(() => {
      if (!this._flight) return;
      const f = this._flight, t = Math.min(1, Math.max(step/18,(Date.now()-f.start)/360));
      const p = arc(f.from, f.to, t);
      this.paintPlayer(p.x,p.y,p.groundY,0,1);
      if (t < 1 && step < 18) this.flyTick(Math.max(step+1,Math.floor(t*18)+1));
      else this.completeFlight(true);
    }, FRAME);
  },
  completeFlight(animate) {
    const f = this._flight; this._flight = null;
    if (!f) return;
    this._x = f.to.x; this._y = f.to.y; this.resetPower();
    if (!f.result.hit) {
      this.phase = 'over'; this.hint = '差一点！点“再来”重试'; this.powerLabel = '本局 ' + this.score + ' 分';
      this.paintPlayer(this._x, this._y+18, this._y, 0.7, 0.4); return;
    }
    if (!f.result.advance) {
      this.phase = 'ready'; this.hint = '还在原地，再多蓄力一点';
      this.paintPlayer(this._x,this._y,this._y,0,1);return;
    }
    this.score += f.result.points;
    if (this.score > this.best) { this.best=this.score; this.saveBest(); }
    this.hint = f.result.points===2 ? '正中中心 +2！' : '稳稳落地 +1';
    const next = targetFor(this.score);
    const dx = ANCHOR.x-this._target.x, dy = ANCHOR.y-this._target.y;
    const upcoming = {...next,x:next.x-dx,y:next.y-dy};
    this._camera={old:this._current,current:this._target,next:upcoming,dx,dy,x:this._x,y:this._y,start:Date.now()};
    this.phase='scrolling';
    if (animate) this.cameraTick(1); else this.finishCamera();
  },
  cameraTick(step) {
    this.later(() => {
      if (!this._camera) return;
      const c=this._camera,t=Math.min(1,Math.max(step/9,(Date.now()-c.start)/180)),e=t*t*(3-2*t);
      this.paintPlatform(0,c.old,c.dx*e,c.dy*e,1-e);
      this.paintPlatform(1,c.current,c.dx*e,c.dy*e,1);
      this.paintPlatform(2,c.next,c.dx*e,c.dy*e,e);
      this.paintPlayer(c.x+c.dx*e,c.y+c.dy*e,c.y+c.dy*e,0,1);
      if(t<1 && step<9)this.cameraTick(Math.max(step+1,Math.floor(t*9)+1));else this.finishCamera();
    }, FRAME);
  },
  finishCamera() {
    const c=this._camera;this._camera=null;if(!c)return;
    this._current={...c.current,x:ANCHOR.x,y:ANCHOR.y};
    this._target={...c.next,x:c.next.x+c.dx,y:c.next.y+c.dy};
    this._x=c.x+c.dx;this._y=c.y+c.dy;
    this.paintPlatform(0,this._current,0,0,1);this.paintPlatform(1,this._target,0,0,1);this.paintPlatform(2,this._current,0,0,0);
    this.paintPlayer(this._x,this._y,this._y,0,1);this.phase='ready';
  },
  saveBest() {
    if (this._bestWriting || this.best <= this._bestWritten) return;
    const value=this.best;this._bestWriting=true;
    storage.set({key:BEST_KEY,value:String(value),success:()=>{this._bestWritten=value;},
      complete:()=>{this._bestWriting=false;if(this.best>value)this.saveBest();}});
  }
};
