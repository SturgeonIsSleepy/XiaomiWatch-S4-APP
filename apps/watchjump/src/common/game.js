export const ANCHOR = {x: 233, y: 310};
export const MAX_HOLD = 1100;
export function charge(heldMs) { return Math.max(0, Math.min(1, heldMs / MAX_HOLD)); }
export function distanceForHold(heldMs) { return 24 + 0.28 * Math.max(0, Math.min(MAX_HOLD, heldMs)); }
export function targetFor(score, random = Math.random) {
  const side = random() < 0.5 ? -1 : 1;
  const x = ANCHOR.x + side * (88 + Math.floor(random() * 43));
  const y = ANCHOR.y - (66 + Math.floor(random() * 26));
  return {x, y, width: Math.max(58, 82 - Math.floor(score / 4) * 2), color: score % 2 ? '#f0b77a' : '#69c8d1'};
}
export function endpoint(from, target, heldMs) {
  const dx = target.x - from.x, dy = target.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const distance = distanceForHold(heldMs);
  return {x: from.x + dx / length * distance, y: from.y + dy / length * distance};
}
export function inside(point, platform) {
  const dx = (point.x - platform.x) / (platform.width / 2 - 3);
  const dy = (point.y - platform.y) / 18;
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
