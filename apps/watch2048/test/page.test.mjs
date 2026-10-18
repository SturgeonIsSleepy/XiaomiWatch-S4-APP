import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load = async path => import('data:text/javascript;base64,'+Buffer.from(readFileSync(new URL(path,import.meta.url))).toString('base64'));
const game=await load('../src/common/game.js'),gesture=await load('../src/common/gesture.js');
const source=readFileSync(new URL('../src/pages/index/page.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default','return');
function harness(saved, asyncWrites=false) {
 const timers=new Map(),writes=[],pending=[];let next=1;
 const storage={get(o){o.success(JSON.stringify(saved));},set(o){writes.push(JSON.parse(o.value));if(asyncWrites)pending.push(o);else{o.success?.();o.complete?.();}}};
 const factory=new Function('storage','newGame','move','isGameOver','isValidBoard','beginGesture','endGesture','setTimeout','clearTimeout',source);
 const vm=factory(storage,game.newGame,game.move,game.isGameOver,game.isValidBoard,gesture.beginGesture,gesture.endGesture,(fn,ms)=>{const id=next++;timers.set(id,{fn,ms});return id;},id=>timers.delete(id));
 Object.assign(vm,structuredClone(vm.private));vm.onInit();
 function fire(){const [id,t]=timers.entries().next().value;timers.delete(id);t.fn();}
 return {vm,timers,writes,pending,fire};
}
const saved={board:[16,8,8,...Array(13).fill(0)],score:0,chain:true,animations:true};
const touch=(x,y)=>({clientX:x,clientY:y,identifier:0});
function swipe(vm){vm.touchStart({touches:[touch(300,145)]});vm.touchEnd({touches:[],changedTouches:[touch(120,145)]});}
test('one gesture settles the complete chain, preserves keyed objects and leaves no idle timer',()=>{
 const h=harness(saved),{vm}=h,objects=vm.cells.slice();
 assert.equal(h.timers.size,0);swipe(vm);assert.equal(vm.score,48);assert.equal(vm.board[0],32);
 assert.equal(h.writes.length,1);assert.equal(h.writes[0].board[0],32);
 swipe(vm);assert.equal(h.writes.length,1);assert.equal(h.timers.size,1);
 let steps=0;while(h.timers.size){h.fire();assert.ok(++steps<=10);assert.ok(h.timers.size<=1);}
 assert.equal(vm.busy,false);assert.equal(vm.cells[0].label,'32');assert.ok(vm.cells.every((c,i)=>c===objects[i]));
 assert.equal(h.timers.size,0);
});
test('hiding mid-animation cancels work and preserves the final turn; resuming accepts new input',()=>{
 const h=harness(saved);swipe(h.vm);h.fire();h.vm.onHide();
 assert.equal(h.timers.size,0);assert.equal(h.vm.busy,false);assert.equal(h.vm._gesture,null);
 assert.equal(h.vm.cells[0].label,'32');assert.equal(h.writes.length,1);
 h.vm.onShow();assert.equal(h.timers.size,0);h.vm.onDestroy();assert.equal(h.timers.size,0);
});
test('animations off settle without timers, settings persist and writes are serialized',()=>{
 const h=harness({...saved,animations:false},true);
 swipe(h.vm);assert.equal(h.timers.size,0);assert.equal(h.vm.cells[0].label,'32');
 h.vm.toggleChain();h.vm.toggleAnimations();assert.equal(h.writes.length,1);
 h.pending.shift().complete();assert.equal(h.writes.length,2);assert.equal(h.writes[1].chain,false);assert.equal(h.writes[1].animations,true);
});
test('legacy saves default to standard moves and animation enabled',()=>{
 const {vm}=harness({board:saved.board,score:12});assert.equal(vm.chain,false);assert.equal(vm.animations,true);
 swipe(vm);assert.equal(vm.board[0],16);assert.equal(vm.board[1],16);assert.equal(vm.score,28);
});
test('a pending final save is not discarded when the page is destroyed',()=>{
 const h=harness({...saved,animations:false},true);swipe(h.vm);h.vm.toggleChain();h.vm.onDestroy();
 assert.equal(h.writes.length,1);h.pending.shift().complete();
 assert.equal(h.writes.length,2);assert.equal(h.writes[1].chain,false);assert.equal(h.writes[1].board[0],32);
});
