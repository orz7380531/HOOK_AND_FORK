// WeaponBase 基类 + Hook（钩子）类 + Fork（钢叉）类

class WeaponBase {
  constructor(owner) {
    this.owner = owner;
    this.active = false;
    this.timer = 0;
  }

  fire(heavy) {
    // 子类实现
  }

  update(dt, players) {
    // 子类实现
  }

  draw(ctx) {
    // 子类实现
  }

  getHitArea() {
    return null;
  }

  // ----  序列化：将武器数据转为纯对象（用于网络传输）------------
  serialize() {
    return {
      ownerId: this.owner.id,
      state: this.state,
      tipX: this.tipX,
      tipY: this.tipY,
      isHeavy: this.isHeavy,
      dirX: this.dirX,
      dirY: this.dirY,
      currentRange: this.currentRange || 0
    };
  }
}

// ============================================================
//  Hook — 红方钩子武器
//  状态机: idle → charging(仅重勾) → extending → retracting → idle
// ============================================================

class Hook extends WeaponBase {
  constructor(owner) {
    super(owner);
    this.state = 'idle';       // idle | charging | extending | retracting | cooldown
    this.tipX = 0;
    this.tipY = 0;
    this.dirX = 0;
    this.dirY = 0;
    this.currentRange = 0;
    this.maxRange = 0;
    this.speed = 0;
    this.pullForce = 0;
    this.stunDuration = 0;
    this.chargeTimer = 0;
    this.isHeavy = false;
    this.cooldownTimer = 0;
    this.cooldownDuration = 0;
  }

  fire(heavy) {
    if (this.state !== 'idle') return;

    this.isHeavy = heavy;

    var cfg;
    if (heavy) {
      cfg = {
        range: CONFIG.hook.heavyRange,
        speed: CONFIG.hook.heavySpeed,
        pullForce: CONFIG.hook.heavyPullForce,
        stun: CONFIG.hook.heavyStun,
        chargeTime: 0.2,
        cooldown: CONFIG.hook.heavyCooldown
      };
    } else {
      cfg = {
        range: CONFIG.hook.lightRange,
        speed: CONFIG.hook.lightSpeed,
        pullForce: CONFIG.hook.lightPullForce,
        stun: CONFIG.hook.lightStun,
        chargeTime: 0,
        cooldown: CONFIG.hook.lightCooldown
      };
    }

    this.maxRange = cfg.range;
    this.speed = cfg.speed;
    this.pullForce = cfg.pullForce;
    this.stunDuration = cfg.stun;
    this.currentRange = 0;
    this.cooldownDuration = cfg.cooldown;

    // 以面朝方向为出钩方向
    var fx = this.owner.facing.x;
    var fy = this.owner.facing.y;
    var len = Math.sqrt(fx * fx + fy * fy);
    if (len < 0.0001) {
      this.dirX = 1;
      this.dirY = 0;
    } else {
      this.dirX = fx / len;
      this.dirY = fy / len;
    }

    if (cfg.chargeTime > 0) {
      this.state = 'charging';
      this.chargeTimer = cfg.chargeTime;
    } else {
      this.state = 'extending';
    }

    // 钩尖起始于玩家圆心
    this.tipX = this.owner.x;
    this.tipY = this.owner.y;

    console.log('[Hook] P' + (this.owner.id + 1) + ' fires ' + (heavy ? 'HEAVY' : 'light') + ' hook');
  }

  update(dt, players, resolver) {
    if (this.state === 'idle') return;

    // 蓄力阶段（仅重勾）
    if (this.state === 'charging') {
      this.chargeTimer -= dt;
      this.tipX = this.owner.x;
      this.tipY = this.owner.y;
      if (this.chargeTimer <= 0) {
        this.state = 'extending';
        this.chargeTimer = 0;
        console.log('[Hook] P' + (this.owner.id + 1) + ' heavy hook released');
      }
      return;
    }

      // 延伸阶段：钩尖沿方向伸展，检测碰撞
    if (this.state === 'extending') {
      this.currentRange += this.speed * dt;
      this.tipX = this.owner.x + this.dirX * this.currentRange;
      this.tipY = this.owner.y + this.dirY * this.currentRange;

      // 检测是否碰到墙体或障碍物（通过网格坐标）
      var tipGridX = Math.floor((this.tipX - Level.offsetX) / Level.gridSize);
      var tipGridY = Math.floor((this.tipY - Level.offsetY) / Level.gridSize);
      var tipKey = tipGridX + ',' + tipGridY;
      if (Level.wallCells.has(tipKey) || Level.obstacleCells.has(tipKey)) {
        this.state = 'retracting';
        return;
      }

      // 碰撞检测：钩尖是否碰到任何活跃玩家（包括队友）
      if (players) {
        for (var i = 0; i < players.length; i++) {
          var p = players[i];
          if (p === this.owner || !p.alive) continue;

          var dx = this.tipX - p.x;
          var dy = this.tipY - p.y;
          var dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONFIG.player.radius + 6) {
            // 命中！将事件推入仲裁队列，不直接生效
            if (resolver) {
              resolver.addHit(this.owner, p, 'hook', this.isHeavy ? 'heavy' : 'light');
            }
            this.state = 'retracting';
            console.log('[Hook] P' + (this.owner.id + 1) + ' hit P' + (p.id + 1) + ' (' + (this.isHeavy ? 'heavy' : 'light') + ') — 已推入仲裁队列');
            return;
          }
        }
      }

      // 到达最大范围，开始收回
      if (this.currentRange >= this.maxRange) {
        this.currentRange = this.maxRange;
        this.state = 'retracting';
      }
      return;
    }

    // 收回阶段
    if (this.state === 'retracting') {
      this.currentRange -= this.speed * 2 * dt;
      if (this.currentRange <= 0) {
        this.currentRange = 0;
        this.state = 'cooldown';
        this.cooldownTimer = this.cooldownDuration;
        return;
      }
      this.tipX = this.owner.x + this.dirX * this.currentRange;
      this.tipY = this.owner.y + this.dirY * this.currentRange;
    }

    // 后摇阶段：冷却时间内不能攻击
    if (this.state === 'cooldown') {
      this.cooldownTimer -= dt;
      if (this.cooldownTimer <= 0) {
        this.state = 'idle';
      }
      return;
    }
  }

  draw(ctx) {
    if (this.state === 'idle') return;

    var ox = this.owner.x;
    var oy = this.owner.y;

    // 根据玩家当前位置重新计算钩尖位置
    var tipX = ox + this.dirX * this.currentRange;
    var tipY = oy + this.dirY * this.currentRange;

    // 蓄力闪光效果
    if (this.state === 'charging') {
      var chargeProgress = 1 - (this.chargeTimer / 0.2);
      ctx.beginPath();
      ctx.arc(ox, oy, CONFIG.player.radius + 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(233, 69, 96, ' + (0.3 + chargeProgress * 0.6) + ')';
      ctx.lineWidth = 2 + chargeProgress * 2;
      ctx.stroke();
    }

    // 钩子连线
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(tipX, tipY);
    ctx.strokeStyle = '#e94560';
    ctx.lineWidth = this.isHeavy ? 4 : 2.5;
    ctx.stroke();

    // 钩尖三角形
    var angle = Math.atan2(this.dirY, this.dirX);
    var tipSize = this.isHeavy ? 12 : 9;
    ctx.beginPath();
    ctx.moveTo(
      tipX + Math.cos(angle) * tipSize,
      tipY + Math.sin(angle) * tipSize
    );
    ctx.lineTo(
      tipX + Math.cos(angle + 2.5) * tipSize * 0.65,
      tipY + Math.sin(angle + 2.5) * tipSize * 0.65
    );
    ctx.lineTo(
      tipX + Math.cos(angle - 2.5) * tipSize * 0.65,
      tipY + Math.sin(angle - 2.5) * tipSize * 0.65
    );
    ctx.closePath();
    ctx.fillStyle = '#e94560';
    ctx.fill();
  }
}

// ============================================================
//  Fork — 蓝方钢叉武器
//  状态机: idle → extending(瞬间) → holding → retracting → idle
//  重叉特殊：被推者撞墙后进入 pinned 状态
// ============================================================

class Fork extends WeaponBase {
  constructor(owner) {
    super(owner);
    this.state = 'idle';       // idle | extending | holding | retracting | cooldown
    this.tipX = 0;
    this.tipY = 0;
    this.dirX = 0;
    this.dirY = 0;
    this.maxRange = 0;
    this.pushForce = 0;
    this.stunDuration = 0;
    this.holdTimer = 0;
    this.isHeavy = false;
    this.hitDone = false;      // 本回合是否已触发命中
    this.cooldownTimer = 0;
    this.cooldownDuration = 0;
  }

  fire(heavy) {
    if (this.state !== 'idle') return;

    this.isHeavy = heavy;
    this.hitDone = false;

    var cfg;
    if (heavy) {
      cfg = {
        range: CONFIG.fork.heavyRange,
        pushForce: CONFIG.fork.heavyPushForce,
        stun: CONFIG.fork.heavyStun,
        holdTime: 0.15,
        cooldown: CONFIG.fork.heavyCooldown
      };
    } else {
      cfg = {
        range: CONFIG.fork.lightRange,
        pushForce: CONFIG.fork.lightPushForce,
        stun: CONFIG.fork.lightStun,
        holdTime: 0.1,
        cooldown: CONFIG.fork.lightCooldown
      };
    }

    this.maxRange = cfg.range;
    this.pushForce = cfg.pushForce;
    this.stunDuration = cfg.stun;
    this.cooldownDuration = cfg.cooldown;

    // 以面朝方向为出叉方向
    var fx = this.owner.facing.x;
    var fy = this.owner.facing.y;
    var len = Math.sqrt(fx * fx + fy * fy);
    if (len < 0.0001) {
      this.dirX = 1;
      this.dirY = 0;
    } else {
      this.dirX = fx / len;
      this.dirY = fy / len;
    }

    // 钢叉立即到达最大距离（瞬间推出）
    this.tipX = this.owner.x + this.dirX * this.maxRange;
    this.tipY = this.owner.y + this.dirY * this.maxRange;

    // 检测是否碰到墙体或障碍物（通过网格坐标）
    var tipGridX = Math.floor((this.tipX - Level.offsetX) / Level.gridSize);
    var tipGridY = Math.floor((this.tipY - Level.offsetY) / Level.gridSize);
    var tipKey = tipGridX + ',' + tipGridY;
    if (Level.wallCells.has(tipKey) || Level.obstacleCells.has(tipKey)) {
      // 找到最近的碰撞点（沿方向逐步回退）
      var step = 1;
      while (step < this.maxRange) {
        var checkX = this.owner.x + this.dirX * (this.maxRange - step);
        var checkY = this.owner.y + this.dirY * (this.maxRange - step);
        var checkGridX = Math.floor((checkX - Level.offsetX) / Level.gridSize);
        var checkGridY = Math.floor((checkY - Level.offsetY) / Level.gridSize);
        var checkKey = checkGridX + ',' + checkGridY;
        if (!Level.wallCells.has(checkKey) && !Level.obstacleCells.has(checkKey)) {
          this.tipX = checkX;
          this.tipY = checkY;
          break;
        }
        step++;
      }
    }

    this.state = 'extending';
    this.holdTimer = cfg.holdTime;

    console.log('[Fork] P' + (this.owner.id + 1) + ' fires ' + (heavy ? 'HEAVY' : 'light') + ' fork');
  }

  update(dt, players, resolver) {
    if (this.state === 'idle') return;

    // 延伸阶段：瞬间到位，在 hold 期间检测碰撞（只检测一次）
    if (this.state === 'extending') {
      // 检测是否碰到墙体或障碍物（通过网格坐标）
      var tipGridX = Math.floor((this.tipX - Level.offsetX) / Level.gridSize);
      var tipGridY = Math.floor((this.tipY - Level.offsetY) / Level.gridSize);
      var tipKey = tipGridX + ',' + tipGridY;
      if (Level.wallCells.has(tipKey) || Level.obstacleCells.has(tipKey)) {
        this.state = 'retracting';
        return;
      }

      if (!this.hitDone && players) {
        this.hitDone = true;
        this._checkHit(players, resolver);
      }

      this.holdTimer -= dt;
      if (this.holdTimer <= 0) {
        this.state = 'retracting';
      }
      return;
    }

    // 收回阶段
    if (this.state === 'retracting') {
      // 收回到玩家位置
      var backSpeed = this.maxRange * 4; // 快速收回
      var dx = this.owner.x - this.tipX;
      var dy = this.owner.y - this.tipY;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < backSpeed * dt + 2) {
        this.tipX = this.owner.x;
        this.tipY = this.owner.y;
        this.state = 'cooldown';
        this.cooldownTimer = this.cooldownDuration;
        return;
      }

      var bx = dx / dist;
      var by = dy / dist;
      this.tipX += bx * backSpeed * dt;
      this.tipY += by * backSpeed * dt;
    }

    // 后摇阶段：冷却时间内不能攻击
    if (this.state === 'cooldown') {
      this.cooldownTimer -= dt;
      if (this.cooldownTimer <= 0) {
        this.state = 'idle';
      }
      return;
    }
  }

  // 检测钢叉命中：检查钢叉尖端是否碰到任何玩家
  _checkHit(players, resolver) {
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (p === this.owner || !p.alive) continue;

      var dx = this.tipX - p.x;
      var dy = this.tipY - p.y;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < CONFIG.player.radius + 8) {
        // 命中！将事件推入仲裁队列，不直接生效
        if (resolver) {
          resolver.addHit(this.owner, p, 'fork', this.isHeavy ? 'heavy' : 'light');
        }
        console.log('[Fork] P' + (this.owner.id + 1) + ' hit P' + (p.id + 1) + ' (' + (this.isHeavy ? 'heavy' : 'light') + ') — 已推入仲裁队列');
        return; // 每回合只命中一个目标
      }
    }
  }

  draw(ctx) {
    if (this.state === 'idle') return;

    var ox = this.owner.x;
    var oy = this.owner.y;

    // 钢叉连线（始终从玩家到当前叉尖）
    var tx = this.tipX;
    var ty = this.tipY;

    // 蓄力/出叉闪光
    if (this.state === 'extending') {
      ctx.beginPath();
      ctx.arc(ox, oy, CONFIG.player.radius + 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(15, 52, 96, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 钢叉连线
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = '#0f3460';
    ctx.lineWidth = this.isHeavy ? 5 : 3;
    ctx.stroke();

    // 叉尖 T 形
    var angle = Math.atan2(this.dirY, this.dirX);
    var tSize = this.isHeavy ? 14 : 10;
    // T 形的横杠（垂直于出叉方向）
    var px = -Math.sin(angle) * tSize;
    var py = Math.cos(angle) * tSize;
    ctx.beginPath();
    ctx.moveTo(tx + px, ty + py);
    ctx.lineTo(tx - px, ty - py);
    ctx.strokeStyle = '#0f3460';
    ctx.lineWidth = this.isHeavy ? 4 : 2.5;
    ctx.stroke();

    // T 形中点（小圆）
    ctx.beginPath();
    ctx.arc(tx, ty, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#0f3460';
    ctx.fill();
  }
}
