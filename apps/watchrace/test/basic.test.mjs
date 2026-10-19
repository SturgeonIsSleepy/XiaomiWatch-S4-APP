import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../src/common/game.js',import.meta.url),'utf8');
const g=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const source=readFileSync(new URL('../src/pages/index/page.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default','return');
function harness(options={}){
 let now=1000,id=0;const timers=new Map(),writes=[],sounds=[];
 const storage={get(o){o.success('9');},set(o){writes.push(o.value);o.success?.();o.complete?.();}};
 const audio={play(){if(options.audioBroken)throw Error("audio unavailable");sounds.push("play");},stop(){sounds.push("stop");}};
 const values={storage,audio,...g,setTimeout:(fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key;},clearTimeout:id=>timers.delete(id),Date:{now:()=>now}};
 const vm=new Function(...Object.keys(values),source)(...Object.values(values));Object.assign(vm,structuredClone(vm.private));vm.onInit();
 return {vm,timers,writes,sounds,audio,fire(ms){const [key,t]=timers.entries().next().value;timers.delete(key);now+=ms??t.ms;t.fn();}};
}
const finger=(x=230,y=340,id=0)=>({clientX:x,clientY:y,identifier:id});
function input(vm,x1,y1,x2,y2){vm.touchStart({touches:[finger(x1,y1)]});vm.touchEnd({touches:[],changedTouches:[finger(x2,y2)]});}
test('speed and spawn interval are gradual and bounded; traffic stays in three lanes',()=>{
 assert.ok(g.speedFor(100)>g.speedFor(0));assert.equal(g.speedFor(10000),250);
 assert.ok(g.intervalFor(100)<g.intervalFor(0));assert.equal(g.intervalFor(10000),920);
 for(const n of [0,.5,.999])assert.ok(g.LANES.includes(g.freshTraffic(()=>n).x));
 assert.equal(g.clampLane(-1),0);assert.equal(g.clampLane(3),2);assert.equal(g.moveX(233,2,.05),269);
});
test('swept collision catches crossings while allowing adjacent lanes and nonoverlapping times',()=>{
 assert.equal(g.collision(233,233,{x:233},280,430),true);
 assert.equal(g.collision(153,153,{x:313},280,430),false);
 assert.equal(g.collision(153,233,{x:233},100,120),false);
 assert.equal(g.collision(153,233,{x:233},352,352),true);
 // The paths cross their respective axes at different times, with no actual collision.
 assert.equal(g.collision(153,313,{x:153},200,352),false);
});
test('idle has no timer; starting twice leaves only one loop and paint keeps stable records',()=>{
 const h=harness(),vm=h.vm,record=vm.traffic[0];assert.equal(h.timers.size,0);assert.equal(vm.best,9);
 vm.start();vm.start();assert.equal(h.timers.size,1);h.fire();assert.equal(h.timers.size,1);assert.equal(vm.traffic[0],record);
 vm.pause();assert.equal(h.timers.size,0);assert.equal(vm.phase,'paused');vm.resume();assert.equal(h.timers.size,1);
});
test('swipes and side taps steer once; vertical, multitouch and HUD input do not steer',()=>{
 const h=harness(),vm=h.vm;vm.start();input(vm,230,330,300,330);assert.equal(vm._lane,2);
 input(vm,230,330,150,330);assert.equal(vm._lane,1);input(vm,150,340,150,340);assert.equal(vm._lane,0);
 input(vm,150,340,150,340);assert.equal(vm._lane,0);input(vm,250,340,250,240);assert.equal(vm._lane,0);
 input(vm,330,90,330,90);assert.equal(vm._lane,0);
 vm.touchStart({touches:[finger()]});vm.touchStart({touches:[finger(),finger(250,340,1)]});vm.touchEnd({touches:[],changedTouches:[finger(320,340)]});assert.equal(vm._lane,0);
});
test('a delayed frame is bounded; hide freezes progress and resume resets wall clock',()=>{
 const h=harness(),vm=h.vm;vm.start();h.fire(5000);assert.ok(vm._distance<2);const distance=vm._distance;
 vm.onHide();assert.equal(vm.phase,'paused');assert.equal(h.timers.size,0);assert.equal(vm._touch,null);
 vm.onShow();assert.equal(h.timers.size,0);assert.equal(vm._distance,distance);vm.resume();h.fire();assert.ok(vm._distance-distance<1);
 vm.onDestroy();assert.equal(h.timers.size,0);vm.resume();assert.equal(h.timers.size,0);
});
test('traffic spawns, passes once; crash stops work and persists best; retry clears the scene',()=>{
 const h=harness(),vm=h.vm;vm.start();vm._spawn=2000;h.fire();assert.equal(vm.traffic.filter(c=>c.active).length,1);
 const c=vm.traffic[0];c.x=313;c.y=449;h.fire();assert.equal(vm.passed,1);assert.equal(c.active,false);
 vm._distance=21;c.x=233;c.y=345;c.active=true;h.fire();assert.equal(vm.phase,'over');assert.equal(h.timers.size,0);assert.equal(vm.best,21);assert.equal(h.writes.at(-1),'21');
 vm.start();assert.equal(vm.phase,'running');assert.equal(vm.meters,0);assert.equal(vm.passed,0);assert.equal(vm.traffic.some(c=>c.active),false);assert.equal(vm.best,21);
});

test('braking converges to traffic speed, keeps road moving and front gap stable; release accelerates',()=>{
 const h=harness(),vm=h.vm;vm.start();const c=vm.traffic[0];Object.assign(c,{active:true,x:233,y:210,boost:0});
 vm.touchStart({touches:[finger(170,415)]});assert.equal(vm.braking,true);assert.equal(vm._lane,1);
 for(let i=0;i<8;i++)h.fire(50);assert.equal(vm._speed,g.TRAFFIC_SPEED);
 const y=c.y,road=vm._road;h.fire();assert.ok(Math.abs(c.y-y)<1e-8);assert.notEqual(vm._road,road);assert.equal(vm.pace,40);
 vm.touchEnd({touches:[],changedTouches:[finger(170,415)]});assert.equal(vm.braking,false);h.fire();assert.ok(vm._speed>g.TRAFFIC_SPEED);assert.equal(vm._lane,1);
});
test('horn boosts only nearest car ahead in current lane, with cooldown, expiry and finite audio',()=>{
 const h=harness(),vm=h.vm;vm.start();
 vm._speed=g.TRAFFIC_SPEED;vm.braking=true;
 const cars=vm.traffic;Object.assign(cars[0],{active:true,x:233,y:180});Object.assign(cars[1],{active:true,x:233,y:260});Object.assign(cars[2],{active:true,x:153,y:280});Object.assign(cars[3],{active:true,x:233,y:420});
 vm.honk();assert.equal(cars[1].boost,g.HORN_DURATION);assert.equal(cars[0].boost,0);assert.equal(cars[2].boost,0);assert.equal(cars[3].boost,0);
 assert.deepEqual(h.sounds,['play']);vm.honk();assert.deepEqual(h.sounds,['play']);const y=cars[1].y;h.fire();assert.ok(cars[1].y<y);
 for(let i=0;i<32;i++)h.fire();assert.equal(cars[1].boost,0);const after=cars[1].y;h.fire();assert.ok(Math.abs(cars[1].y-after)<1e-8);
 assert.ok(cars[1].y-cars[0].y>=68-1e-8);
 assert.ok(h.timers.size<=1);vm.pause();assert.equal(h.timers.size,0);assert.equal(h.sounds.at(-1),'stop');
});
test('brake plus horn supports two fingers; release, dragging off, cancel and hide clear brake without steering',()=>{
 const h=harness(),vm=h.vm;vm.start();const brake=finger(170,415,0),horn=finger(290,415,1);
 vm.touchStart({touches:[brake],changedTouches:[brake]});vm.touchStart({touches:[brake,horn],changedTouches:[horn]});assert.equal(vm.braking,true);assert.equal(h.sounds.length,1);
 vm.touchEnd({touches:[brake],changedTouches:[horn]});assert.equal(vm.braking,true);assert.equal(vm._lane,1);
 vm.touchMove({touches:[finger(170,380)]});assert.equal(vm.braking,false);
 vm.touchStart({touches:[brake]});vm.cancelTouch();assert.equal(vm.braking,false);
 vm.touchStart({touches:[brake]});vm.onHide();assert.equal(vm.braking,false);assert.equal(vm._brakeFinger,null);assert.equal(h.timers.size,0);vm.onShow();vm.resume();assert.equal(vm.braking,false);
});
test('stationary traffic does not overlap at spawn; horn without a target or audio still works and cools down',()=>{
 const cars=g.LANES.map(x=>({active:true,x,y:105}));assert.equal(g.freeSpawn(cars),null);cars[0].y=210;assert.equal(g.freeSpawn(cars,()=>.5).x,153);
 const h=harness({audioBroken:true}),vm=h.vm;vm.start();assert.doesNotThrow(()=>vm.honk());assert.equal(vm.hornLabel,'无前车');assert.ok(vm._hornCooldown>0);
 const asyncFail=harness();asyncFail.vm.start();asyncFail.audio.onerror();assert.doesNotThrow(()=>asyncFail.vm.honk());assert.equal(asyncFail.sounds.length,0);assert.ok(asyncFail.vm._hornCooldown>0);
 vm.pause();const cooldown=vm._hornCooldown;vm.honk();assert.equal(vm._hornCooldown,cooldown);assert.equal(h.timers.size,0);
});
