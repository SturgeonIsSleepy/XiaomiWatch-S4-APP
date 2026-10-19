export const LANES = [153, 233, 313];
export const PLAYER_Y = 352;
export const CAR_WIDTH = 34;
export const CAR_HEIGHT = 58;
export const FRAME_MS = 50;
export function speedFor(meters) { return Math.min(250, 140 + Math.max(0, meters) * .32); }
export function intervalFor(meters) { return Math.max(920, 1500 - Math.max(0, meters) * 1.4); }
export function clampLane(lane) { return Math.max(0, Math.min(2, lane)); }
export function moveX(x, lane, dt) {
  const target=LANES[clampLane(lane)],limit=Math.max(0,dt)*720;
  return x+Math.max(-limit,Math.min(limit,target-x));
}
// Swept vertical collision prevents tunneling if a frame is delayed.
export function collision(px0,px1,car,y0,y1) {
  const halfX=CAR_WIDTH-6,halfY=CAR_HEIGHT-10;
  let lo=0,hi=1;
  const axes=[[px0-car.x,px1-px0,halfX],[PLAYER_Y-y0,-(y1-y0),halfY]];
  for(let i=0;i<axes.length;i++){
    const a=axes[i],start=a[0],delta=a[1],radius=a[2];
    if(Math.abs(delta)<.000001){if(Math.abs(start)>=radius)return false;}
    else{const t0=(-radius-start)/delta,t1=(radius-start)/delta;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>=hi)return false;}
  }
  return lo<hi;
}
export function freshTraffic(random=Math.random) {
  return {x:LANES[Math.min(2,Math.max(0,Math.floor(random()*3)))],y:105,
    color:['#ed9366','#d6c078','#9a9bbf'][Math.min(2,Math.max(0,Math.floor(random()*3)))]};
}
