import storage from '@system.storage';
import {newGame, move, isGameOver, isValidBoard} from '../../common/game';
import {beginGesture, endGesture} from '../../common/gesture';
const SAVE_KEY = 'game-v1'; // Preserve the original installation's save.
const SLIDE_MS = 144;
const SLIDE_FRAMES = 9;
const FEEDBACK_MS = 80;
const INPUT_GAP_MS = 160;
export default {
  private: {board: [], cells: [], slots: [], score: 0, message: '加载中', ready: false,
    chain: false, animations: true, busy: false},
  onInit() {
    this._visible = true; this._dead = false; this._timer = null;
    this._gesture = null; this._lastMove = 0; this._turn = null;
    this._writing = false; this._queuedSave = null; this._lastSaved = null;
    this.slots = Array.from({length: 16}, (_, id) => ({id, position: this.position(id)}));
    storage.get({key: SAVE_KEY, success: value => {
      if (this._dead) return;
      try {
        const saved = JSON.parse(value);
        if (isValidBoard(saved.board) && Number.isSafeInteger(saved.score) && saved.score >= 0) {
          this.board = saved.board; this.score = saved.score;
          this.chain = saved.chain === true; this.animations = saved.animations !== false;
          this.ready = true; this.renderBoard(this.board); return;
        }
      } catch (e) {}
      this.restart();
    }, fail: () => { if (!this._dead) this.restart(); }});
  },
  onShow() { this._visible = true; },
  onHide() { this._visible = false; this.settle(); this._gesture = null; this.save(); },
  onDestroy() { this.settle(); this.save(); this._dead = true; this._gesture = null; },
  position(id) { return 'left:' + (8 + id % 4 * 72) + 'px;top:' + (8 + Math.floor(id / 4) * 72) + 'px;'; },
  renderBoard(board, motions, phase, highlights) {
    if (this.cells.length !== 16) {
      this.cells = Array.from({length: 16}, (_, id) => ({id, label: '', position: '',
        font: '', tone: 'tile-2', effect: ''}));
    }
    // Keep the 16 keyed objects alive. Replacing keyed loop records can leave stale
    // text/style bindings on older Vela component runtimes.
    for (let id = 0; id < 16; id++) {
      const value = board[id], cell = this.cells[id];
      cell.label = value ? String(value) : '';
      cell.font = value >= 65536 ? 'font-small' : value >= 1024 ? 'font-medium' : '';
      cell.tone = 'tile-' + Math.min(value || 2, 2048);
      const opacity = highlights && highlights.indexOf(id) >= 0 ? '0.65' : '1';
      cell.position = this.position(id) + 'visibility:' + (value ? 'visible' : 'hidden') + ';opacity:' + opacity + ';';
    }
    this.message = isGameOver(this.board) ? '游戏结束' : this.board.some(n => n >= 2048) ? '达成 2048！' : '滑动棋盘';
  },
  touchStart(event) {
    this._gesture = null;
    if (!this.ready || this.busy || !this._visible) return;
    this._gesture = beginGesture(event);
  },
  touchEnd(event) {
    const start = this._gesture; this._gesture = null;
    if (!this.ready || this.busy || !this._visible) return;
    const direction = endGesture(start, event);
    const now = Date.now();
    if (!direction || now - this._lastMove < INPUT_GAP_MS) return;
    const result = move(this.board, direction, Math.random, this.chain);
    if (!result.moved) return;
    this._lastMove = now;
    this.board = result.board; this.score += result.gained;
    // Persist the settled turn, never an intermediate animation frame.
    this.save();
    if (!this.animations) { this.renderBoard(this.board); return; }
    this.busy = true; this._turn = result;
    this.animatePass(0);
  },
  animatePass(index) {
    if (!this._turn || this._dead || !this._visible) { this.settle(); return; }
    const frame = this._turn.frames[index];
    this.renderBoard(frame.before);
    this._frameStart = Date.now();
    this.animateStep(index, 1);
  },
  animateStep(index, step) {
    // At most nine short updates per pass. Elapsed time skips late frames under load.
    this._timer = setTimeout(() => {
      this._timer = null;
      if (!this._turn || !this._visible || this._dead) { this.settle(); return; }
      const frame = this._turn.frames[index];
      const progress = Math.min(1, Math.max(step / SLIDE_FRAMES, (Date.now() - this._frameStart) / SLIDE_MS));
      const fraction = progress * progress * (3 - 2 * progress);
      frame.motions.forEach(m => {
        if (m.from === m.to) return;
        const x = 8 + ((m.from % 4) + (m.to % 4 - m.from % 4) * fraction) * 72;
        const y = 8 + (Math.floor(m.from / 4) + (Math.floor(m.to / 4) - Math.floor(m.from / 4)) * fraction) * 72;
        this.cells[m.from].position = 'left:' + x + 'px;top:' + y + 'px;visibility:visible;opacity:1;';
      });
      if (progress < 1 && step < SLIDE_FRAMES) { this.animateStep(index, Math.max(step + 1, Math.floor(progress * SLIDE_FRAMES) + 1)); return; }
      if (index + 1 < this._turn.frames.length) { this.animatePass(index + 1); return; }
      this.renderBoard(this.board, null, null, frame.merged.concat([this._turn.spawned]));
      this._timer = setTimeout(() => { this._timer = null; this.settle(); }, FEEDBACK_MS);
    }, Math.max(4, Math.min(16, this._frameStart + step * (SLIDE_MS / SLIDE_FRAMES) - Date.now())));
  },
  settle() {
    if (this._timer !== null) clearTimeout(this._timer);
    this._timer = null; this._turn = null; this.busy = false;
    if (this.ready && !this._dead) this.renderBoard(this.board);
  },
  toggleChain() {
    if (!this.ready || this.busy) return;
    this._gesture = null; this.chain = !this.chain; this.save();
  },
  toggleAnimations() {
    if (!this.ready || this.busy) return;
    this._gesture = null; this.animations = !this.animations; this.save();
  },
  restart() {
    if (this.busy || this._dead) return;
    this._gesture = null; this.board = newGame(); this.score = 0;
    this.ready = true; this.renderBoard(this.board); this.save();
  },
  save() {
    if (!this.ready) return;
    const value = JSON.stringify({board: this.board, score: this.score, chain: this.chain, animations: this.animations});
    if (value === this._lastSaved || value === this._queuedSave) return;
    this._queuedSave = value; this.flushSave();
  },
  flushSave() {
    if (this._writing || this._queuedSave === null) return;
    const value = this._queuedSave; this._queuedSave = null; this._writing = true;
    storage.set({key: SAVE_KEY, value, success: () => { this._lastSaved = value; },
      complete: () => { this._writing = false; this.flushSave(); }});
  }
};
