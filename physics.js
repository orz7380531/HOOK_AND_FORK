const Physics = {

  checkCollision(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = CONFIG.player.radius * 2;
    if (dist >= minDist) {
      return { colliding: false, overlap: 0, nx: 0, ny: 0 };
    }
    const overlap = minDist - dist;
    if (dist < 0.0001) {
      return { colliding: true, overlap, nx: 1, ny: 0 };
    }
    return { colliding: true, overlap, nx: dx / dist, ny: dy / dist };
  },

  resolveCollision(p1, p2) {
    const hit = Physics.checkCollision(p1, p2);
    if (!hit.colliding) return;
    const half = hit.overlap / 2;
    p1.x -= hit.nx * half;
    p1.y -= hit.ny * half;
    p2.x += hit.nx * half;
    p2.y += hit.ny * half;
  },

  isInDeadZone(player, arena) {
    const dx = player.x - arena.centerX;
    const dy = player.y - arena.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist > arena.radius;
  },

  checkBoundary(player, arena, ctx) {
    const dx = player.x - arena.centerX;
    const dy = player.y - arena.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const edgeDist = arena.radius - dist;

    if (edgeDist <= arena.boundaryWarn && edgeDist > 0) {
      const nx = dist > 0.0001 ? dx / dist : 0;
      const ny = dist > 0.0001 ? dy / dist : 0;
      const bx = player.x + nx * edgeDist;
      const by = player.y + ny * edgeDist;

      ctx.beginPath();
      ctx.arc(bx, by, CONFIG.player.radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    return { distance: edgeDist, inWarn: edgeDist <= arena.boundaryWarn && edgeDist > 0 };
  },

  applyForce(player, forceVec, dt) {
    // 瞬时冲量：直接加在速度上，让击退/拉拽即刻生效
    player.vx += forceVec.x;
    player.vy += forceVec.y;
  },

  // 检查玩家是否接触场地墙壁边界
  // 返回 { pinned: bool, wallX, wallY }
  checkWallCollision(player, arena) {
    var dx = player.x - arena.centerX;
    var dy = player.y - arena.centerY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var edgeDist = arena.radius - dist;

    // 在边界 5 像素内视为接触墙壁
    if (edgeDist <= 5 && edgeDist >= -5) {
      // 计算墙壁上的最近点（沿玩家→圆心反方向）
      var nx = dist > 0.0001 ? dx / dist : 0;
      var ny = dist > 0.0001 ? dy / dist : -1;
      var wallX = arena.centerX + nx * arena.radius;
      var wallY = arena.centerY + ny * arena.radius;
      return { pinned: true, wallX: wallX, wallY: wallY };
    }
    return { pinned: false, wallX: 0, wallY: 0 };
  }
};
