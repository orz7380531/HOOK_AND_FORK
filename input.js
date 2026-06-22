// ===== P1 输入：鼠标 + WASD =====
class LocalInput {
  constructor(canvas) {
    this._canvas = canvas;

    // 键盘状态（WASD）
    this._keysDown = new Set();

    // 鼠标状态（canvas 内坐标）
    this._mouseX = 0;
    this._mouseY = 0;
    this._mouseDown = { 0: false, 2: false };

    // 上次瞄准方向（防抖用）
    this._lastAimX = 1;
    this._lastAimY = 0;

    this._onKeyDown = (e) => {
      this._keysDown.add(e.code);
      // 只阻止游戏按键，避免屏蔽 F12 等浏览器快捷键
      var gameCodes = ['KeyW','KeyA','KeyS','KeyD','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Comma','Period'];
      if (gameCodes.includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => {
      this._keysDown.delete(e.code);
    };
    this._onMouseMove = (e) => {
      var rect = this._canvas.getBoundingClientRect();
      var scaleX = this._canvas.width / rect.width;
      var scaleY = this._canvas.height / rect.height;
      this._mouseX = (e.clientX - rect.left) * scaleX;
      this._mouseY = (e.clientY - rect.top) * scaleY;
    };
    this._onMouseDown = (e) => {
      if (e.button === 0 || e.button === 2) {
        e.preventDefault();
        this._mouseDown[e.button] = true;
      }
    };
    this._onMouseUp = (e) => {
      if (e.button === 0 || e.button === 2) {
        this._mouseDown[e.button] = false;
      }
    };
    this._onContextMenu = (e) => { e.preventDefault(); };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this._canvas.addEventListener('mousemove', this._onMouseMove);
    this._canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    this._canvas.addEventListener('contextmenu', this._onContextMenu);
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this._canvas.removeEventListener('mousemove', this._onMouseMove);
    this._canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    this._canvas.removeEventListener('contextmenu', this._onContextMenu);
    this._canvas = null;
  }

  // WASD 八方向归一化移动
  getMoveDirection() {
    var x = 0, y = 0;
    if (this._keysDown.has('KeyW')) y -= 1;
    if (this._keysDown.has('KeyS')) y += 1;
    if (this._keysDown.has('KeyA')) x -= 1;
    if (this._keysDown.has('KeyD')) x += 1;
    if (x === 0 && y === 0) return { x: 0, y: 0 };
    var len = Math.sqrt(x * x + y * y);
    return { x: x / len, y: y / len };
  }

  // 鼠标指向玩家的归一化向量
  getAimDirection(playerX, playerY) {
    var dx = this._mouseX - playerX;
    var dy = this._mouseY - playerY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return { x: this._lastAimX, y: this._lastAimY };
    this._lastAimX = dx / dist;
    this._lastAimY = dy / dist;
    return { x: this._lastAimX, y: this._lastAimY };
  }

  // 用于绘制准星
  getMousePosition() {
    return { x: this._mouseX, y: this._mouseY };
  }

  isLightPressed() { return !!this._mouseDown[0]; }
  isHeavyPressed() { return !!this._mouseDown[2]; }
}

// ===== P2 输入：方向键 + 逗号/句号 =====
class KeyboardInput {
  constructor() {
    this._keysDown = new Set();

    // 瞄准方向跟随最近移动方向
    this._lastAimX = -1;  // 蓝方初始朝左
    this._lastAimY = 0;

    this._onKeyDown = (e) => {
      this._keysDown.add(e.code);
      var gameCodes = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Comma','Period'];
      if (gameCodes.includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => {
      this._keysDown.delete(e.code);
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }

  getMoveDirection() {
    var x = 0, y = 0;
    if (this._keysDown.has('ArrowUp'))    y -= 1;
    if (this._keysDown.has('ArrowDown'))  y += 1;
    if (this._keysDown.has('ArrowLeft'))  x -= 1;
    if (this._keysDown.has('ArrowRight')) x += 1;
    if (x === 0 && y === 0) return { x: 0, y: 0 };
    var len = Math.sqrt(x * x + y * y);
    return { x: x / len, y: y / len };
  }

  // P2 的瞄准方向 = 最近移动方向（无鼠标）
  getAimDirection() {
    var move = this.getMoveDirection();
    if (move.x !== 0 || move.y !== 0) {
      this._lastAimX = move.x;
      this._lastAimY = move.y;
    }
    return { x: this._lastAimX, y: this._lastAimY };
  }

  isLightPressed() { return this._keysDown.has('Comma'); }
  isHeavyPressed() { return this._keysDown.has('Period'); }
}
