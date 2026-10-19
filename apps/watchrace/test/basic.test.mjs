import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../src/common/game.js',import.meta.url),'utf8');
const g=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const source=readFileSync(new URL('../src/pages/index/page.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default','return');
function harness(){
 let now=1000,id=0;const timers=new Map(),writes=[];
 const storage={get(o){o.success('9');},set(o){writes.push(o.value);o.success?.();o.complete?.();}};
 const values={storage,...g,setTimeout:(fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key;},clearTimeout:id=>timers.delete(id),Date:{now:()=>now}};
 const vm=new Function(...Object.keys(values),source)(...Object.values(values));Object.assign(vm,structuredClone(vm.private));vm.onInit();
 return {vm,timers,writes,fire(ms){const [key,t]=timers.entries().next().value;timers.delete(key);now+=ms??t.ms;t.fn();}};
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
