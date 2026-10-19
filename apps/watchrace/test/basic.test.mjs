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
 return {vm,timers,writes,sounds,audio,advance(ms){now+=ms;},fire(ms){const [key,t]=timers.entries().next().value;timers.delete(key);now+=ms??t.ms;t.fn();}};
}
const finger=(x=230,y=340,id=0)=>({clientX:x,clientY:y,identifier:id});
function input(vm,x1,y1,x2,y2){vm.touchStart({touches:[finger(x1,y1)]});vm.touchEnd({touches:[],changedTouches:[finger(x2,y2)]});}
test('speed is faster and responsive, braking caps at ordinary speed; road limits keep car inside',()=>{
 assert.equal(g.speedFor(0),420);assert.equal(g.driveSpeed(90,false,0,.1),120);
 assert.equal(g.driveSpeed(419,false,0,.1),420);assert.equal(g.driveSpeed(100,true,0,.1),90);
 assert.equal(g.roadX(-20),131);assert.equal(g.roadX(500),335);assert.equal(g.roadY(0),170);assert.equal(g.roadY(500),352);
 assert.ok(g.intervalFor(100)<g.intervalFor(0));assert.equal(g.intervalFor(10000),920);
});
test('swept collision covers continuous horizontal and vertical dragging without false time intersections',()=>{
 assert.equal(g.collision(233,233,{x:233},280,430),true);
 assert.equal(g.collision(153,153,{x:313},280,430),false);
 assert.equal(g.collision(153,313,{x:153},200,352),false);
 assert.equal(g.collision(233,233,{x:233},240,240,352,170),true);
 assert.equal(g.collision(153,153,{x:233},240,240,352,170),false);
});
test('idle is quiet; duplicate start keeps one loop, preserves fixed records and begins with automatic brake',()=>{
 const h=harness(),vm=h.vm,record=vm.traffic[0];assert.equal(h.timers.size,0);assert.equal(vm.best,9);
 vm.start();vm.start();h.fire();assert.equal(h.timers.size,1);assert.equal(vm.traffic[0],record);assert.equal(vm._speed,90);assert.equal(vm.braking,true);
 vm.pause();assert.equal(h.timers.size,0);vm.resume();assert.equal(h.timers.size,1);
});
test('press accelerates and continuously follows both coordinates, release brakes immediately and keeps final position',()=>{
 const h=harness(),vm=h.vm;vm.start();vm.touchStart({touches:[finger(180,300)]});h.fire();
 assert.equal(vm.accelerating,true);assert.equal(vm.braking,false);assert.deepEqual([vm._x,vm._y],[180,300]);assert.ok(vm._speed>90);
 vm.touchMove({touches:[finger(251,280)]});h.fire();assert.deepEqual([vm._x,vm._y],[251,280]);assert.match(vm.playerStyle,/left:234px;top:251px/);
 vm.touchEnd({touches:[],changedTouches:[finger(270,290)]});const speed=vm._speed;assert.equal(vm.braking,true);assert.equal(vm.accelerating,false);
 h.fire();assert.deepEqual([vm._x,vm._y],[270,290]);assert.ok(vm._speed<speed);assert.equal(vm._driveFinger,null);
});
test('horn has no cooldown, every press responds without stacking speed; selection follows actual player height',()=>{
 const h=harness(),vm=h.vm;vm.start();const cars=vm.traffic;
 Object.assign(cars[0],{active:true,x:233,y:180});Object.assign(cars[1],{active:true,x:233,y:260});Object.assign(cars[2],{active:true,x:153,y:280});Object.assign(cars[3],{active:true,x:233,y:420});
 for(let i=0;i<5;i++)vm.honk();assert.equal(h.sounds.filter(s=>s==='play').length,5);assert.equal(cars[1].boost,g.HORN_DURATION);
 assert.equal(cars[0].boost,0);assert.equal(cars[2].boost,0);assert.equal(cars[3].boost,0);assert.equal('_hornCooldown' in vm,false);
 const y=cars[1].y;h.fire();assert.ok(cars[1].y<y);vm.honk();assert.equal(cars[1].boost,g.HORN_DURATION);
 for(let i=0;i<33;i++)h.fire();assert.equal(cars[1].boost,0);assert.ok(cars[1].y-cars[0].y>=68-1e-8);
 assert.equal(g.frontCar(cars,233,170),null);vm.pause();assert.equal(h.sounds.at(-1),'stop');assert.equal(h.timers.size,0);
});
test('second finger honks without stopping acceleration or stealing steering; horn alone never accelerates',()=>{
 const h=harness(),vm=h.vm;vm.start();const drive=finger(200,310,0),horn=finger(290,415,1);
 vm.touchStart({touches:[horn],changedTouches:[horn]});assert.equal(vm.accelerating,false);vm.touchEnd({touches:[],changedTouches:[horn]});
 vm.touchStart({touches:[drive]});vm.touchStart({touches:[drive,horn],changedTouches:[horn]});assert.equal(vm.accelerating,true);
 vm.touchMove({touches:[finger(215,270),horn]});h.fire();assert.deepEqual([vm._x,vm._y],[215,270]);
 vm.touchEnd({touches:[drive],changedTouches:[horn]});assert.equal(vm.accelerating,true);
 vm.touchEnd({touches:[],changedTouches:[drive]});assert.equal(vm.braking,true);
});
test('cancel, lost finger, pause, hide and destroy cannot leave acceleration or timers active',()=>{
 const h=harness(),vm=h.vm;vm.start();const drive=finger();
 vm.touchStart({touches:[drive]});vm.touchMove({touches:[]});assert.equal(vm.braking,true);
 vm.touchStart({touches:[drive]});vm.cancelTouch();assert.equal(vm.accelerating,false);
 vm.touchStart({touches:[drive]});vm.pause();assert.equal(vm.braking,true);assert.equal(h.timers.size,0);vm.resume();assert.equal(vm.accelerating,false);
 vm.touchStart({touches:[drive]});vm.onHide();assert.equal(vm._driveFinger,null);assert.equal(vm.braking,true);assert.equal(h.timers.size,0);
 vm.onShow();assert.equal(h.timers.size,0);vm.resume();assert.equal(vm.accelerating,false);vm.onDestroy();assert.equal(h.timers.size,0);vm.resume();assert.equal(h.timers.size,0);
});
test('release decelerates from top speed to ordinary speed and stabilizes following distance',()=>{
 const h=harness(),vm=h.vm;vm.start();vm._speed=420;const c=vm.traffic[0];Object.assign(c,{active:true,x:233,y:120,boost:0});
 for(let i=0;i<10;i++)h.fire(100);assert.equal(vm._speed,90);assert.equal(vm.pace,40);
 const y=c.y,road=vm._road;h.fire();assert.ok(Math.abs(c.y-y)<1e-8);assert.notEqual(vm._road,road);
 vm.touchStart({touches:[finger(233,352)]});h.fire();assert.ok(vm._speed>90);
});
test('delayed frames are bounded and paused time is not caught up on resume',()=>{
 const h=harness(),vm=h.vm;vm.start();vm.touchStart({touches:[finger()]});h.fire(5000);assert.ok(vm._distance<2);
 vm.pause();const distance=vm._distance;h.advance(5000);vm.resume();h.fire();assert.ok(vm._distance-distance<1);
});
test('stationary spawn spacing and sync/async audio failures preserve game and unlimited horn responses',()=>{
 const cars=g.LANES.map(x=>({active:true,x,y:105}));assert.equal(g.freeSpawn(cars),null);cars[0].y=210;assert.equal(g.freeSpawn(cars,()=>.5).x,153);
 const h=harness({audioBroken:true});h.vm.start();assert.doesNotThrow(()=>h.vm.honk());h.vm.honk();assert.equal(h.vm.hornLabel,'无前车');assert.equal(h.timers.size,1);
 const a=harness();a.vm.start();a.audio.onerror();a.vm.honk();a.vm.honk();assert.equal(a.sounds.length,0);assert.equal(a.vm.hornLabel,'无前车');
});
test('traffic spawn, passing, collision, best save and retry remain functional',()=>{
 const h=harness(),vm=h.vm;vm.start();vm._spawn=2000;h.fire();assert.equal(vm.traffic.filter(c=>c.active).length,1);
 const c=vm.traffic[0];c.x=313;c.y=449;vm._speed=120;vm.accelerating=true;vm.braking=false;h.fire();assert.equal(vm.passed,1);assert.equal(c.active,false);
 vm._distance=21;c.x=233;c.y=345;c.active=true;h.fire();assert.equal(vm.phase,'over');assert.equal(h.timers.size,0);assert.equal(vm.best,21);assert.equal(h.writes.at(-1),'21');
 vm.start();assert.equal(vm.meters,0);assert.equal(vm.traffic.some(c=>c.active),false);assert.equal(vm.best,21);assert.equal(vm.braking,true);assert.equal(vm._y,352);
});
