import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load = path => import('data:text/javascript;base64,' + Buffer.from(readFileSync(new URL(path, import.meta.url))).toString('base64'));
const {slide, planMove, move, isGameOver, isValidBoard} = await load('../src/common/game.js');
const {beginGesture, endGesture} = await load('../src/common/gesture.js');
const board = row => row.concat(Array(16 - row.length).fill(0));
test('original and optional chain rules, including the requested example', () => {
  assert.deepEqual(planMove(board([16,8,8]), 'left').board.slice(0,4), [16,16,0,0]);
  const r = planMove(board([16,8,8]), 'left', true);
  assert.deepEqual(r.frames.map(f => f.board.slice(0,4)), [[16,16,0,0],[32,0,0,0]]);
  assert.equal(r.gained, 48);
  assert.deepEqual(planMove(board([2,2,4,8]), 'left', true).board.slice(0,4), [16,0,0,0]);
  assert.equal(planMove(board([2,2,4,8]), 'left', true).frames.length, 3);
  assert.deepEqual(planMove(board([2,2,2,2]), 'left', true).board.slice(0,4), [8,0,0,0]);
  assert.deepEqual(planMove(board([4,2,2]), 'right', true).board.slice(0,4), [0,0,0,8]);
});
test('four directions, score and a single random spawn after the whole turn', () => {
  for (const direction of ['left','right','up','down']) {
    const b = direction === 'left' || direction === 'right' ? board([16,8,8]) : [16,0,0,0,8,0,0,0,8,0,0,0,0,0,0,0];
    let calls = 0;
    const r = move(b, direction, () => {calls++; return 0;}, true);
    assert.equal(calls, 2); // one location draw and one value draw
    assert.equal(r.gained, 48);
    assert.equal(r.board.filter(Boolean).length, 2);
    assert.equal(r.board.reduce((a,b)=>a+b,0), 34);
  }
});
test('blocked gestures do not spawn, score, or mutate the caller', () => {
  const b=board([2]); const old=b.slice();
  const r=move(b,'left',()=>{throw Error('must not spawn');},true);
  assert.equal(r.moved,false);assert.equal(r.gained,0);assert.equal(r.spawned,-1);assert.deepEqual(b,old);
  assert.equal(isGameOver([2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2]),true);
});
test('exhaustive rows: conserve mass, terminate, preserve inputs and reach a stable chain result', () => {
  const values=[0,2,4,8,16];
  for(let code=0;code<625;code++) {
    let n=code;const row=[];for(let k=0;k<4;k++){row.push(values[n%5]);n=Math.floor(n/5);}
    for(const d of ['left','right','up','down']) {
      const b=d==='left'||d==='right'?board(row):Array.from({length:16},(_,i)=>i%4===0?row[i/4]:0);
      const old=b.slice(),r=planMove(b,d,true);
      assert.deepEqual(b,old);assert.ok(isValidBoard(r.board));assert.ok(r.frames.length<=3);
      assert.equal(r.board.reduce((a,b)=>a+b,0),b.reduce((a,b)=>a+b,0));
      assert.equal(slide(r.board,d).moved,false);
      for(const f of r.frames) {
        assert.equal(f.motions.length,f.before.filter(Boolean).length);
        assert.equal(f.gained,f.merged.reduce((s,i)=>s+f.board[i],0));
      }
    }
  }
});
test('touch threshold, diagonal rejection, finger identity and incomplete touches', () => {
  const t=(x,y,id=0)=>({clientX:x,clientY:y,identifier:id});
  const start=beginGesture({touches:[t(100,100)]});
  const end=(x,y,id=0)=>endGesture(start,{touches:[],changedTouches:[t(x,y,id)]});
  assert.equal(end(170,105),'right');assert.equal(end(100,30),'up');
  assert.equal(end(110,100),null);assert.equal(end(150,150),null);assert.equal(end(170,100,1),null);
  assert.equal(beginGesture({touches:[t(0,0),t(1,1,1)]}),null);
  assert.equal(endGesture(null,{changedTouches:[t(100,100)]}),null);
});
