class Player {
  constructor(id, team, x, y) {
    this.id = id;
    this.team = team;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.state = 'idle';
    this.stunTimer = 0;
    this.alive = true;
    this.facing = { x: 0, y: 0 };
    this.weapon = null;       // WeaponBase 实例（红方 Hook，蓝方 Fork）
  }

  // 被武器命中后进入僵直
  stun(duration) {
    this.state = 'stunned';
    this.stunTimer = duration;
  }

  // 被重叉推到墙上，钉在墙上一段时间
  pin(wallX, wallY, duration) {
    this.state = 'pinned';
    this.pinTimer = duration;
    this.pinX = wallX;
    this.pinY = wallY;
    this.x = wallX;
    this.y = wallY;
    this.vx = 0;
    this.vy = 0;
  }

  update(dt, input) {
    if (!this.alive) return;

    // 钉墙计时
    if (this.state === 'pinned') {
      this.pinTimer -= dt;
      // 锁定在墙上位置
      this.x = this.pinX;
      this.y = this.pinY;
      this.vx = 0;
      this.vy = 0;
      if (this.pinTimer <= 0) {
        this.state = 'idle';
        this.pinTimer = 0;
      }
      return;
    }

    // 僵直计时
    if (this.state === 'stunned') {
      this.stunTimer -= dt;
      if (this.stunTimer <= 0) {
        this.state = 'idle';
        this.stunTimer = 0;
        this.vx = 0;
        this.vy = 0;
      }
    }

    // 非僵直/非钉墙时接受移动输入
    // input = { moveX, moveY, aimX, aimY, light, heavy }
    if (this.state !== 'stunned' && this.state !== 'pinned') {
      this.vx = input.moveX * CONFIG.player.speed;
      this.vy = input.moveY * CONFIG.player.speed;

      // facing 来自鼠标方向（不再是移动方向）
      if (input.aimX !== 0 || input.aimY !== 0) {
        this.facing = { x: input.aimX, y: input.aimY };
      }

      // 武器攻击输入
      if (this.weapon) {
        if (input.light) this.weapon.fire(false);
        if (input.heavy) this.weapon.fire(true);
      }
    }

    // 始终更新位置（僵直期间仍受惯性/击退力影响）
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx) {
    if (!this.alive) return;

    var r = CONFIG.player.radius;
    var color = this.team === 'red' ? CONFIG.colors.redTeam : CONFIG.colors.blueTeam;

    // 僵直闪烁效果
    if (this.state === 'stunned') {
      var blink = Math.floor(this.stunTimer * 10) % 2 === 0;
      ctx.globalAlpha = blink ? 1.0 : 0.4;
    }

    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // 面朝方向指示点
    var fx = this.facing.x;
    var fy = this.facing.y;
    if (fx !== 0 || fy !== 0) {
      var angle = Math.atan2(fy, fx);
      var ex = this.x + Math.cos(angle) * (r - 2);
      var ey = this.y + Math.sin(angle) * (r - 2);
      ctx.beginPath();
      ctx.arc(ex, ey, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    ctx.globalAlpha = 1.0;
  }

  // 静态方法：判断某个阵营是否全灭
  static allDead(team, players) {
    for (var i = 0; i < players.length; i++) {
      if (players[i].team === team && players[i].alive) return false;
    }
    return true;
  }

  // 静态方法：统计某个阵营存活人数
  static aliveCount(team, players) {
    var count = 0;
    for (var i = 0; i < players.length; i++) {
      if (players[i].team === team && players[i].alive) count++;
    }
    return count;
  }

  // ----  序列化：将玩家数据转为纯对象（用于网络传输）------------
  serialize() {
    return {
      id: this.id,
      team: this.team,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      state: this.state,
      stunTimer: this.stunTimer,
      pinTimer: this.pinTimer || 0,
      alive: this.alive,
      facing: { x: this.facing.x, y: this.facing.y }
    };
  }

  // ----  反序列化：从纯对象恢复玩家数据（用于网络接收）--------
  static fromData(d) {
    var p = new Player(d.id, d.team, d.x, d.y);
    p.vx = d.vx;
    p.vy = d.vy;
    p.state = d.state;
    p.stunTimer = d.stunTimer;
    p.pinTimer = d.pinTimer || 0;
    p.alive = d.alive;
    p.facing = { x: d.facing.x, y: d.facing.y };
    return p;
  }
}
