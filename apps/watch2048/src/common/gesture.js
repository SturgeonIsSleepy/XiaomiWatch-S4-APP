export function beginGesture(event) {
  const touches = event && event.touches;
  if (!touches || touches.length !== 1) return null;
  const t = touches[0];
  if (!Number.isFinite(t.clientX) || !Number.isFinite(t.clientY)) return null;
  return {x: t.clientX, y: t.clientY, id: t.identifier};
}
export function endGesture(start, event) {
  if (!start || !event || (event.touches && event.touches.length)) return null;
  const changed = event.changedTouches;
  if (!changed || changed.length !== 1) return null;
  const t = changed[0];
  if (start.id !== undefined && t.identifier !== start.id) return null;
  const dx = t.clientX - start.x, dy = t.clientY - start.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const x = Math.abs(dx), y = Math.abs(dy);
  if (Math.max(x, y) < 24 || Math.max(x, y) < Math.min(x, y) * 1.15) return null;
  return x > y ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}
