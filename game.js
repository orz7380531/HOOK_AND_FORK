(function () {
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');

  // ===== 游戏状态 =====
  var state = 'lobby';  // lobby | instructions | countdown | playing | gameover
  var players = [];
  var p1Input = null;   // LocalInput（P1 鼠标+WASD）
  var p2Input = null;   // KeyboardInput（P2 方向键）
  var resolver = null;
  var matchTimer = 0;
  var countdownTimer = 0;

  // ===== 全局按键（边缘触发，用于 lobby/gameover）=====
  var globalKeyDown = {};
  var prevGlobalKeyDown = {};

  window.addEventListener('keydown', function (e) {
    globalKeyDown[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', function (e) {
    globalKeyDown[e.code] = false;
  });

  function consumeKey(code) {
    return !!(globalKeyDown[code] && !prevGlobalKeyDown[code]);
  }

  function savePrevKeys() {
    prevGlobalKeyDown = {};
    for (var k in globalKeyDown) prevGlobalKeyDown[k] = globalKeyDown[k];
  }

  // ===== 创建玩家 =====
  function createPlayers() {
    players = [];
    // P0 - 红方（钩锁）
    var spawn0 = Level.getSpawnPos(0, 'red');
    var p0 = new Player(0, 'red', spawn0.x, spawn0.y);
    p0.facing = { x: 1, y: 0 };
    p0.weapon = new Hook(p0);
    players.push(p0);

    // P1 - 蓝方（钢叉）
    var spawn1 = Level.getSpawnPos(1, 'blue');
    var p1 = new Player(1, 'blue', spawn1.x, spawn1.y);
    p1.facing = { x: -1, y: 0 };
    p1.weapon = new Fork(p1);
    players.push(p1);
  }

  // ===== 开始游戏 =====
  function startGame() {
    // 销毁旧输入
    if (p1Input) { p1Input.destroy(); p1Input = null; }
    if (p2Input) { p2Input.destroy(); p2Input = null; }

    p1Input = new LocalInput(canvas);
    p2Input = new KeyboardInput();
    resolver = new HitResolver();
    Level.init(CONFIG.arena);
    createPlayers();

    state = 'instructions';
    matchTimer = 0;
  }

  // ===== 场地绘制 =====
  function drawArena() {
    Level.draw(ctx);
  }

  // ===== 命中效果应用 =====
  var pendingPins = [];

  function applyResolvedEffects(effects) {
    pendingPins = [];
    for (var i = 0; i < effects.length; i++) {
      var e = effects[i];
      var target = e.target;
      if (e.type === 'pull') {
        Physics.applyForce(target, e.force);
        target.stun(e.stun);
      } else if (e.type === 'push') {
        Physics.applyForce(target, e.force);
        target.stun(e.stun);
        if (e.isHeavy && e.attacker) {
          pendingPins.push({ target: target, attacker: e.attacker });
        }
      } else if (e.type === 'stun') {
        target.stun(e.duration);
      }
    }
  }

  function checkWallPins() {
    for (var i = 0; i < pendingPins.length; i++) {
      var pt = pendingPins[i].target;
      if (!pt.alive || pt.state === 'pinned') continue;
      var contact = Level.getObstacleContact(pt);
      if (contact.pinned) {
        pt.pin(contact.x, contact.y, CONFIG.fork.wallPinDuration);
      }
    }
  }

  // ===== 顶部 UI 栏 =====
  function drawUI() {
    var redAlive  = Player.aliveCount('red',  players);
    var blueAlive = Player.aliveCount('blue', players);

    ctx.fillStyle = 'rgba(15,15,30,0.7)';
    ctx.fillRect(0, 0, CONFIG.canvas.width, 44);

    ctx.font = 'bold 26px monospace';

    ctx.textAlign = 'left';
    ctx.fillStyle = CONFIG.colors.redTeam;
    ctx.fillText('RED ' + redAlive, 24, 30);

    var remaining = Math.max(0, CONFIG.match.duration - matchTimer);
    var mm = Math.floor(remaining / 60);
    var ss = Math.floor(remaining % 60);
    var timeStr = (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
    ctx.textAlign = 'center';
    ctx.fillStyle = remaining <= 10 ? '#ff4444' : '#ffffff';
    ctx.fillText(timeStr, CONFIG.canvas.width / 2, 32);

    ctx.textAlign = 'right';
    ctx.fillStyle = CONFIG.colors.blueTeam;
    ctx.fillText('BLUE ' + blueAlive, CONFIG.canvas.width - 24, 30);
  }

  // ===== P1 鼠标准星 =====
  function drawMouseCrosshair() {
    if (!p1Input) return;
    var pos = p1Input.getMousePosition();
    ctx.save();
    ctx.strokeStyle = CONFIG.colors.redTeam;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.85;
    var s = 10;
    ctx.beginPath();
    ctx.moveTo(pos.x - s, pos.y); ctx.lineTo(pos.x + s, pos.y);
    ctx.moveTo(pos.x, pos.y - s); ctx.lineTo(pos.x, pos.y + s);
    ctx.stroke();
    ctx.restore();
  }

  // ===== 胜利条件 =====
  function checkWinCondition() {
    var redAlive  = Player.aliveCount('red',  players);
    var blueAlive = Player.aliveCount('blue', players);
    if (redAlive === 0 && blueAlive === 0) return 'draw';
    if (redAlive === 0)  return 'blue';
    if (blueAlive === 0) return 'red';
    if (matchTimer >= CONFIG.match.duration) {
      if (redAlive > blueAlive) return 'red';
      if (blueAlive > redAlive) return 'blue';
      return 'draw';
    }
    return null;
  }

  // ===== 绘制：大厅 =====
  function drawLobby() {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 60px monospace';
    ctx.fillText('HOOK', CONFIG.canvas.width / 2 - 120, 200);
    ctx.fillStyle = CONFIG.colors.redTeam;
    ctx.fillText('vs', CONFIG.canvas.width / 2, 200);
    ctx.fillStyle = '#4488ff';
    ctx.fillText('FORK', CONFIG.canvas.width / 2 + 120, 200);

    ctx.fillStyle = '#aaaacc';
    ctx.font = '18px monospace';
    ctx.fillText('Red: Hook (Mouse + WASD)  |  Blue: Fork (Arrow + , .)', CONFIG.canvas.width / 2, 250);

    ctx.fillStyle = '#e94560';
    ctx.font = '24px monospace';
    var blink = Math.floor(performance.now() / 500) % 2 === 0;
    if (blink) ctx.fillText('Press  SPACE  to Start', CONFIG.canvas.width / 2, 380);

    ctx.fillStyle = '#555577';
    ctx.font = '13px monospace';
    ctx.fillText('2 Players  |  Local Co-op', CONFIG.canvas.width / 2, 440);
  }

  // ===== 绘制：操作说明 =====
  function drawInstructions() {
    drawArena();
    for (var i = 0; i < players.length; i++) players[i].draw(ctx);

    ctx.fillStyle = 'rgba(10,10,20,0.75)';
    ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

    var pw = 580, ph = 400;
    var px = (CONFIG.canvas.width - pw) / 2;
    var py = (CONFIG.canvas.height - ph) / 2;
    ctx.fillStyle = 'rgba(20,20,40,0.95)';
    ctx.strokeStyle = '#333355';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 12);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('操  作  说  明', CONFIG.canvas.width / 2, py + 42);

    var lx = px + 40, rx = px + pw / 2 + 20;

    // P1 红方
    ctx.textAlign = 'left';
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = CONFIG.colors.redTeam;
    ctx.fillText('P1  红方 · 钩锁', lx, py + 85);
    ctx.font = '14px monospace';
    ctx.fillStyle = '#ccccee';
    ctx.fillText('移动   WASD', lx + 16, py + 112);
    ctx.fillText('瞄准   鼠标方向', lx + 16, py + 134);
    ctx.fillText('轻勾   鼠标左键', lx + 16, py + 156);
    ctx.fillText('重勾   鼠标右键（蓄力）', lx + 16, py + 178);

    // P2 蓝方
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#4488ff';
    ctx.fillText('P2  蓝方 · 钢叉', rx, py + 85);
    ctx.font = '14px monospace';
    ctx.fillStyle = '#ccccee';
    ctx.fillText('移动   ↑ ↓ ← →', rx + 16, py + 112);
    ctx.fillText('瞄准   移动方向', rx + 16, py + 134);
    ctx.fillText('轻叉   ,（逗号）', rx + 16, py + 156);
    ctx.fillText('重叉   .（句号）（蓄力）', rx + 16, py + 178);

    ctx.textAlign = 'center';
    ctx.font = '14px monospace';
    ctx.fillStyle = '#aaaacc';
    ctx.fillText('目标：将敌方推入深渊！', CONFIG.canvas.width / 2, py + 225);
    ctx.fillStyle = '#8888aa';
    ctx.font = '13px monospace';
    ctx.fillText('重攻击克制轻攻击  |  重 vs 重 → 双方弹开', CONFIG.canvas.width / 2, py + 252);
    ctx.fillText('钩子/钢叉碰到障碍物自动收回', CONFIG.canvas.width / 2, py + 274);

    var blink = Math.floor(performance.now() / 500) % 2 === 0;
    if (blink) {
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = CONFIG.colors.redTeam;
      ctx.fillText('按  空格  开始对战', CONFIG.canvas.width / 2, py + ph - 24);
    }
  }

  // ===== 绘制：倒计时 =====
  function drawCountdown() {
    drawArena();
    for (var i = 0; i < players.length; i++) players[i].draw(ctx);

    var text;
    if      (countdownTimer > 3)    text = '3';
    else if (countdownTimer > 2)    text = '2';
    else if (countdownTimer > 1)    text = '1';
    else if (countdownTimer > -0.8) text = 'GO!';
    else                            text = '';

    if (text) {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 130px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, CONFIG.canvas.width / 2, CONFIG.canvas.height / 2);
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(15,15,30,0.7)';
    ctx.fillRect(0, 0, CONFIG.canvas.width, 44);
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = CONFIG.colors.redTeam;
    ctx.fillText('RED '  + Player.aliveCount('red',  players), 24, 30);
    ctx.textAlign = 'right';
    ctx.fillStyle = CONFIG.colors.blueTeam;
    ctx.fillText('BLUE ' + Player.aliveCount('blue', players), CONFIG.canvas.width - 24, 30);
  }

  // ===== 绘制：游戏结束 =====
  function drawGameover() {
    ctx.fillStyle = 'rgba(10,10,20,0.65)';
    ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

    var redAlive  = Player.aliveCount('red',  players);
    var blueAlive = Player.aliveCount('blue', players);

    var resultText, resultColor;
    if (redAlive > blueAlive) {
      resultText = 'RED TEAM WINS!';
      resultColor = CONFIG.colors.redTeam;
    } else if (blueAlive > redAlive) {
      resultText = 'BLUE TEAM WINS!';
      resultColor = '#4488ff';
    } else {
      resultText = 'DRAW!';
      resultColor = '#ffffff';
    }

    ctx.fillStyle = resultColor;
    ctx.font = 'bold 68px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(resultText, CONFIG.canvas.width / 2, 260);

    ctx.fillStyle = CONFIG.colors.ui;
    ctx.font = '32px monospace';
    ctx.fillText('Red ' + redAlive + '  -  ' + blueAlive + ' Blue', CONFIG.canvas.width / 2, 330);

    ctx.fillStyle = '#e94560';
    ctx.font = '24px monospace';
    var blink = Math.floor(performance.now() / 500) % 2 === 0;
    if (blink) ctx.fillText('Press  SPACE  to Restart', CONFIG.canvas.width / 2, 420);
  }

  // ===== 主循环 =====
  var lastTime = performance.now();

  function loop(now) {
    requestAnimationFrame(loop);

    var dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 1 / 20) dt = 1 / 20;

    // 清屏
    ctx.fillStyle = CONFIG.colors.background;
    ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

    // ===== 状态机 =====
    if (state === 'lobby') {
      if (consumeKey('Space')) startGame();
      drawLobby();
    }

    else if (state === 'instructions') {
      if (consumeKey('Space')) {
        state = 'countdown';
        countdownTimer = CONFIG.match.startDelay + 1;  // 4 → 显示 3,2,1,GO!
      }
      drawInstructions();
    }

    else if (state === 'countdown') {
      countdownTimer -= dt;
      if (countdownTimer <= -0.8) {
        state = 'playing';
        matchTimer = 0;
      }
      drawCountdown();
    }

    else if (state === 'playing') {
      matchTimer += dt;

      // 1. 清空仲裁队列
      resolver.clear();

      // 2. 武器更新
      for (var i = 0; i < players.length; i++) {
        if (players[i].alive && players[i].weapon) {
          players[i].weapon.update(dt, players, resolver);
        }
      }

      // 3. 仲裁 & 应用效果
      applyResolvedEffects(resolver.resolve());

      // 4. 玩家输入 & 移动
      // P0（红方）：LocalInput（鼠标+WASD）
      if (players[0]) {
        var moveDir0 = p1Input.getMoveDirection();
        var aimDir0  = p1Input.getAimDirection(players[0].x, players[0].y);
        players[0].update(dt, {
          moveX: moveDir0.x, moveY: moveDir0.y,
          aimX:  aimDir0.x,  aimY:  aimDir0.y,
          light: p1Input.isLightPressed(),
          heavy: p1Input.isHeavyPressed()
        });
      }

      // P1（蓝方）：KeyboardInput（方向键）
      if (players[1]) {
        var moveDir1 = p2Input.getMoveDirection();
        var aimDir1  = p2Input.getAimDirection();
        players[1].update(dt, {
          moveX: moveDir1.x, moveY: moveDir1.y,
          aimX:  aimDir1.x,  aimY:  aimDir1.y,
          light: p2Input.isLightPressed(),
          heavy: p2Input.isHeavyPressed()
        });
      }

      // 5. 玩家 vs 玩家碰撞
      for (var a = 0; a < players.length; a++) {
        for (var b = a + 1; b < players.length; b++) {
          if (players[a].alive && players[b].alive) {
            Physics.resolveCollision(players[a], players[b]);
          }
        }
      }

      // 6. 玩家 vs 墙/障碍物碰撞
      for (var k = 0; k < players.length; k++) {
        if (players[k].alive) {
          for (var iter = 0; iter < 4; iter++) {
            if (!Level.checkCollision(players[k])) break;
          }
          Level.resolvePlayer(players[k]);
        }
      }

      // 7. 钉墙
      checkWallPins();

      // 8. 死区检测
      for (var m = 0; m < players.length; m++) {
        var pk = players[m];
        if (!pk.alive) continue;
        if (Level.isInDeadZone(pk)) {
          pk.alive = false;
          pk.x = -200; pk.y = -200;
        }
      }

      // 绘制
      drawArena();
      drawMouseCrosshair();
      for (var n = 0; n < players.length; n++) players[n].draw(ctx);
      for (var q = 0; q < players.length; q++) {
        if (players[q].alive && players[q].weapon) players[q].weapon.draw(ctx);
      }
      drawUI();

      // 胜利判定
      var winner = checkWinCondition();
      if (winner) state = 'gameover';
    }

    else if (state === 'gameover') {
      drawArena();
      for (var i = 0; i < players.length; i++) players[i].draw(ctx);
      for (var j = 0; j < players.length; j++) {
        if (players[j].alive && players[j].weapon) players[j].weapon.draw(ctx);
      }
      drawUI();
      drawGameover();

      if (consumeKey('Space')) {
        state = 'lobby';
        players = [];
        if (p1Input) { p1Input.destroy(); p1Input = null; }
        if (p2Input) { p2Input.destroy(); p2Input = null; }
      }
    }

    savePrevKeys();
  }

  requestAnimationFrame(loop);
})();
