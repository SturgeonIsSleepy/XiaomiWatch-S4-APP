export const ANCHOR = {x: 233, y: 320};
export const MAX_HOLD = 2200;
export function charge(heldMs) { return Math.max(0, Math.min(1, heldMs / MAX_HOLD)); }
export function distanceForHold(heldMs) { return 8 + 0.12 * Math.max(0, Math.min(MAX_HOLD, heldMs)); }
// Cycle gap bands independently of points: center bonuses must not skip bands.
export function targetFor(round, random = Math.random) {
  const side = random() < 0.5 ? -1 : 1;
  const distance = [140, 92, 202][round % 3] + random() * 20;
  const palette = [
    {color:'#ffffff', sideColor:'#bac8d0'},
    {color:'#e9c181', sideColor:'#bf9862'},
    {color:'#97beb5', sideColor:'#6e9890'}
  ];
  return {x: ANCHOR.x + side * distance * .68,
    y: ANCHOR.y - distance * Math.sqrt(1 - .68 * .68),
    width: 76 + (round % 2) * 8, ...palette[round % 3]};
}
export function endpoint(from, target, heldMs) {
  const dx = target.x - from.x, dy = target.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const distance = distanceForHold(heldMs);
  return {x: from.x + dx / length * distance, y: from.y + dy / length * distance};
}
export function inside(point, platform) {
  const dx = (point.x - platform.x) / (platform.width / 2 - 3);
  const dy = (point.y - platform.y) / 20;
  return dx * dx + dy * dy <= 1;
}
export function landing(point, current, target) {
  if (inside(point, target)) {
    const dx = point.x - target.x, dy = point.y - target.y;
    return {hit: true, advance: true, points: dx * dx + dy * dy <= 100 ? 2 : 1};
  }
  if (inside(point, current)) return {hit: true, advance: false, points: 0};
  return {hit: false, advance: false, points: 0};
}
export function arc(from, to, progress) {
  const t = Math.max(0, Math.min(1, progress));
  return {x: from.x + (to.x - from.x) * t,
    groundY: from.y + (to.y - from.y) * t,
    y: from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * 68};
}
