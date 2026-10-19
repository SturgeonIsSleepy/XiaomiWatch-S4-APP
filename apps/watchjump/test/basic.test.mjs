import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../src/common/game.js',import.meta.url),'utf8');
const g=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const source=readFileSync(new URL('../src/pages/index/page.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default','return');
function harness(options={}){
 let now=5000,id=0;const timers=new Map(),writes=[],pulses=[];
 const storage={get(o){o.success(o.key==='jump-best-v1'?'3':JSON.stringify({haptics:options.haptics!==false}));},set(o){writes.push({key:o.key,value:o.value});o.success?.();o.complete?.();}};
 const vibrator={vibrate(o){if(options.broken)throw Error('unsupported');pulses.push({time:now,mode:o.mode});}};
 const names=['storage','vibrator','ANCHOR','MAX_HOLD','charge','endpoint','landing','targetFor','arc','setTimeout','clearTimeout','Date'];
 const args=[storage,vibrator,g.ANCHOR,g.MAX_HOLD,g.charge,g.endpoint,g.landing,score=>g.targetFor(score,()=>.5),g.arc,
  (fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key;},key=>timers.delete(key),{now:()=>now}];
 const vm=new Function(...names,source)(...args);Object.assign(vm,structuredClone(vm.private));vm.onInit();
 return {vm,timers,writes,pulses,advance(ms){now+=ms;},fire(){const [id,t]=timers.entries().next().value;timers.delete(id);now+=t.ms;t.fn();}};
}
const touch={identifier:0,clientX:230,clientY:300};
const start=vm=>vm.touchStart({touches:[touch]});
const end=vm=>vm.touchEnd({touches:[],changedTouches:[touch]});
test('charge is capped, distance increases, arc lands exactly and collision/center bonus agree',()=>{
 assert.equal(g.charge(-10),0);assert.equal(g.charge(5000),1);
 assert.ok(g.distanceForHold(700)>g.distanceForHold(300));assert.equal(g.distanceForHold(g.MAX_HOLD),g.distanceForHold(5000));
 const a={x:233,y:310,width:86},b={x:350,y:230,width:80};
 const hold=(Math.hypot(b.x-a.x,b.y-a.y)-8)/.12,p=g.endpoint(a,b,hold);
 assert.ok(Math.hypot(p.x-b.x,p.y-b.y)<.00001);assert.equal(g.landing(p,a,b).points,2);
 assert.equal(g.landing({x:450,y:450},a,b).hit,false);
 assert.deepEqual(g.arc(a,b,1),{x:350,groundY:230,y:230});assert.ok(g.arc(a,b,.5).y<230);
});
test('holding provides progress and compression, stops refreshing at full charge, hiding cancels',()=>{
 const h=harness();assert.equal(h.timers.size,0);start(h.vm);h.advance(400);h.fire();
 assert.equal(h.vm.phase,'charging');assert.match(h.vm.powerLabel,/蓄力/);assert.notEqual(h.vm.powerStyle,'width:0px;');
 h.advance(2200);h.fire();assert.equal(h.timers.size,0);assert.match(h.vm.powerLabel,/已满/);
 h.vm.onHide();assert.equal(h.vm.phase,'ready');assert.equal(h.timers.size,0);assert.equal(h.vm._finger,null);
});
test('release jumps, scores once and finishes camera with no idle timer',()=>{
 const h=harness(),vm=h.vm;start(vm);
 h.advance((Math.hypot(vm._target.x-vm._x,vm._target.y-vm._y)-8)/.12);
 end(vm);end(vm);assert.equal(vm.phase,'flying');assert.equal(h.timers.size,1);
 let n=0;while(h.timers.size){h.fire();assert.doesNotThrow(()=>JSON.parse(vm.playerStyle.transform));assert.ok(++n<=34);assert.ok(h.timers.size<=1);}
 assert.equal(vm.phase,'ready');assert.equal(vm.score,2);assert.equal(vm.best,3);assert.equal(vm._current.x,233);assert.equal(vm._current.y,320);
});
test('multitouch and hiding midflight cannot leave active work behind',()=>{
 const h=harness(),vm=h.vm;start(vm);vm.touchStart({touches:[touch,{...touch,identifier:1}]});
 assert.equal(vm.phase,'ready');assert.equal(h.timers.size,0);
 start(vm);h.advance(2200);end(vm);assert.equal(vm.phase,'flying');vm.onHide();
 assert.equal(vm.phase,'over');assert.equal(h.timers.size,0);vm.onDestroy();assert.equal(h.timers.size,0);
});

test('haptics use finite short pulses, are throttled and honor off/hidden/unsupported states',()=>{
 const h=harness();start(h.vm);assert.equal(h.pulses.length,1);h.vm.pulse();assert.equal(h.pulses.length,1);
 h.advance(1100);h.fire();assert.equal(h.pulses.length,2);h.advance(1100);h.fire();assert.equal(h.pulses.length,3);assert.equal(h.timers.size,0);
 h.vm.onHide();h.advance(300);h.vm.pulse();assert.equal(h.pulses.length,3);assert.ok(h.pulses.every(p=>p.mode==='short'));
 const off=harness({haptics:false});start(off.vm);off.advance(800);off.fire();assert.equal(off.pulses.length,0);
 const broken=harness({broken:true});start(broken.vm);assert.equal(broken.vm.hapticAvailable,false);assert.equal(broken.timers.size,1);
});
test('haptic setting persists and landing feedback has bounded work and clears on hide',()=>{
 const h=harness(),vm=h.vm;vm.toggleHaptics();assert.equal(vm.haptics,false);assert.equal(JSON.parse(h.writes.at(-1).value).haptics,false);
 start(vm);h.advance((Math.hypot(vm._target.x-vm._x,vm._target.y-vm._y)-8)/.12);end(vm);
 for(let i=0;i<18;i++)h.fire();assert.equal(vm.phase,'landing');assert.equal(vm.combo,1);h.fire();assert.match(vm.ringStyle,/width:/);
 vm.onHide();assert.equal(vm.phase,'ready');assert.equal(h.timers.size,0);assert.equal(vm.ringStyle,'opacity:0;');
});
test('consecutive centers award 2 then 4, a normal landing resets the combo',()=>{
 const h=harness(),vm=h.vm;
 function jump(perfect){vm._flight={from:{x:vm._x,y:vm._y},to:{x:vm._target.x,y:vm._target.y},result:{hit:true,advance:true,points:perfect?2:1}};vm.completeFlight(false);}
 jump(true);assert.equal(vm.score,2);jump(true);assert.equal(vm.score,6);assert.equal(vm.combo,2);jump(false);assert.equal(vm.score,7);assert.equal(vm.combo,0);
});

test('slower charge gives distinct short, medium and long jumps; gap bands vary independently of bonuses',()=>{
 assert.equal(g.MAX_HOLD,2200);
 assert.deepEqual([500,1100,1800].map(g.distanceForHold),[68,140,224]);
 const gaps=[0,1,2].map(round=>{const t=g.targetFor(round,()=>.5);return Math.hypot(t.x-g.ANCHOR.x,t.y-g.ANCHOR.y);});
 assert.ok(gaps[1]<gaps[0]&&gaps[0]<gaps[2]);assert.ok(gaps[2]-gaps[1]>100);
 const h=harness(),vm=h.vm;vm.toggleMenu();start(vm);assert.equal(vm.phase,'ready');assert.equal(h.timers.size,0);
 vm.toggleHaptics();vm.toggleMenu();start(vm);assert.equal(vm.phase,'charging');
});
