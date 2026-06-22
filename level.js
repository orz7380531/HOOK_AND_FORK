// ============================================================
// level.js  —  矩形场地系统
// 职责：网格、墙体、障碍物、深渊 的生成 / 碰撞 / 绘制
// ============================================================

const Level = {
  // ----  内部状态（init  后填充）------------------------
  gridSize: 20,       //  每格像素（=  player.radius * 2）
  cols: 48,           //  场地列数
  rows: 36,           //  场地行数
  offsetX: 160,       //  场地左上角  X（居中用）
  offsetY: 0,         //  场地左上角  Y

  wallCells: null,      //  Set<string>  "c,r"  墙体格
  obstacleCells: null,  //  Set<string>  障碍物格
  obstacleGroups: null, //  Array<Array<{c,r}>>  每个障碍物的所有格子
  deadCells: null,     //  Set<string>  深渊格
  redSpawns: null,    //  Array<{c,r}>  红方候选出生格
  blueSpawns: null,    //  Array<{c,r}>  蓝方候选出生格

  // ----  初始化 ----------------------------------------
  init(arenaConfig) {
    this.gridSize = CONFIG.player.radius * 2;

    //  计算行列数，尽量铺满  canvas，保持  4:3
    var maxRows = Math.floor(CONFIG.canvas.height / this.gridSize);
    var maxCols = Math.floor(CONFIG.canvas.width / this.gridSize);
    this.rows = maxRows;
    this.cols = Math.floor(this.rows * 4 / 3);
    if (this.cols > maxCols) {
      this.cols = maxCols;
      this.rows = Math.floor(this.cols * 3 / 4);
    }

    //  居中偏移
    this.offsetX = Math.floor((CONFIG.canvas.width - this.cols * this.gridSize) / 2);
    this.offsetY = Math.floor((CONFIG.canvas.height - this.rows * this.gridSize) / 2);

    this.wallCells = new Set();
    this.obstacleCells = new Set();
    this.obstacleGroups = [];   //  Array<Array<{c,r}>>  每个障碍物的所有格子
    this.deadCells = new Set();
    this.redSpawns = [];
    this.blueSpawns = [];

    this._buildWalls();
    this._buildObstacles();
    this._buildSpawnPoints();
    this._buildDeadZones();
    this._buildIndependentDeadZones();
  },

  // ----  墙体：四面各  1  格 ----------------------------
  _buildWalls() {
    for (var c = 0; c < this.cols; c++) {
      this.wallCells.add(c + ',0');
      this.wallCells.add(c + ',' + (this.rows - 1));
    }
    for (var r = 0; r < this.rows; r++) {
      this.wallCells.add('0,' + r);
      this.wallCells.add((this.cols - 1) + ',' + r);
    }
  },

  // ----  障碍物：13-15  个，每个  2-4  格 ----------------
  _isBlocked(c, r) {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return true;
    var key = c + ',' + r;
    if (this.wallCells.has(key)) return true;
    if (this.obstacleCells.has(key)) return true;
    return false;
  },

  //  检查某格与已有障碍物格的曼哈顿距离是否 >= minDist
  _isFarFromObstacles(c, r, minDist) {
    var obsArray = Array.from(this.obstacleCells);
    for (var i = 0; i < obsArray.length; i++) {
      var parts = obsArray[i].split(',');
      var oc = parseInt(parts[0]);
      var or = parseInt(parts[1]);
      if (Math.abs(oc - c) + Math.abs(or - r) < minDist) return false;
    }
    return true;
  },

  //  检查某格与已有深渊格的曼哈顿距离是否 >= minDist
  _isFarFromDead(c, r, minDist) {
    var deadArray = Array.from(this.deadCells);
    for (var i = 0; i < deadArray.length; i++) {
      var parts = deadArray[i].split(',');
      var dc = parseInt(parts[0]);
      var dr = parseInt(parts[1]);
      if (Math.abs(dc - c) + Math.abs(dr - r) < minDist) return false;
    }
    return true;
  },

  //  检查某格是否离出生点太近（曼哈顿距离 < maxDist）
  _isNearSpawnPoint(c, r, maxDist) {
    var allSpawns = this.redSpawns.concat(this.blueSpawns);
    for (var i = 0; i < allSpawns.length; i++) {
      if (Math.abs(allSpawns[i].c - c) <= maxDist && Math.abs(allSpawns[i].r - r) <= maxDist) return true;
    }
    return false;
  },

  _isSafe(c, r) {
    if (this._isBlocked(c, r)) return false;
    if (this.deadCells.has(c + ',' + r)) return false;
    //  检查是否离出生点太近（3 格内）
    var allSpawns = this.redSpawns.concat(this.blueSpawns);
    for (var i = 0; i < allSpawns.length; i++) {
      if (Math.abs(allSpawns[i].c - c) <= 3 && Math.abs(allSpawns[i].r - r) <= 3) return false;
    }
    return true;
  },

  _buildObstacles() {
    var count = 13 + Math.floor(Math.random() * 3); // 13-15
    var safety = 0;
    var minSpacing = 2; // 障碍物之间至少间隔 2 格

    for (var i = 0; i < count && safety < 2000; safety++) {
      var cells = [];

      // 随机起点（不在墙体上，且远离已有障碍物）
      var sc, sr, tries = 0;
      do {
        sc = 2 + Math.floor(Math.random() * (this.cols - 4));
        sr = 2 + Math.floor(Math.random() * (this.rows - 4));
        tries++;
      } while (tries < 200 && (!this._isSafe(sc, sr) || !this._isFarFromObstacles(sc, sr, minSpacing)));

      if (tries >= 200) continue;

      // 随机形状：2×2方块(20%) / 横线 / 竖线 / L形
      var shape = Math.random();
      var size = 2 + Math.floor(Math.random() * 3); // 2-4

      if (shape < 0.20) {
        // 2×2 方块
        for (var dx0 = 0; dx0 < 2; dx0++) {
          for (var dy0 = 0; dy0 < 2; dy0++) {
            cells.push({c: sc + dx0, r: sr + dy0});
          }
        }
      } else if (shape < 0.40) {
        // 横向
        for (var dx = 0; dx < size; dx++) cells.push({c: sc + dx, r: sr});
      } else if (shape < 0.60) {
        // 纵向
        for (var dy = 0; dy < size; dy++) cells.push({c: sc, r: sr + dy});
      } else {
        // L 形
        var h = 1 + Math.floor(Math.random() * (size - 1));
        var v = size - h + 1;
        for (var dx2 = 0; dx2 < h; dx2++) cells.push({c: sc + dx2, r: sr});
        for (var dy2 = 0; dy2 < v; dy2++) cells.push({c: sc, r: sr + dy2});
      }

      // 检查所有格是否安全且满足间距
      var safe = true;
      for (var j = 0; j < cells.length; j++) {
        if (this._isBlocked(cells[j].c, cells[j].r)) { safe = false; break; }
        if (!this._isFarFromObstacles(cells[j].c, cells[j].r, minSpacing)) { safe = false; break; }
      }
      if (!safe) continue;

      // 写入 obstacleCells + obstacleGroups
      for (var k = 0; k < cells.length; k++) {
        this.obstacleCells.add(cells[k].c + ',' + cells[k].r);
      }
      this.obstacleGroups.push(cells);
      i++;
    }
  },

  // ----  深渊：每个障碍物整体只生成一团 2-3 格 ----------
  // ----  深渊：每个障碍物整体只生成一团 2-3 格 ----------
  _buildDeadZones() {
    for (var g = 0; g < this.obstacleGroups.length; g++) {
      var group = this.obstacleGroups[g];
      // 收集该障碍物所有格子的相邻空格（去重）
      var candidates = [];
      var seen = new Set();
      var dirs = [{x:-1,y:0},{x:1,y:0},{x:0,y:-1},{x:0,y:1}];
      for (var i = 0; i < group.length; i++) {
        for (var d = 0; d < dirs.length; d++) {
          var nc = group[i].c + dirs[d].x;
          var nr = group[i].r + dirs[d].y;
          var key = nc + ',' + nr;
          if (seen.has(key)) continue;
          if (nc < 1 || nc >= this.cols - 1 || nr < 1 || nr >= this.rows - 1) continue;
          if (this.wallCells.has(key)) continue;
          if (this.obstacleCells.has(key)) continue;
          if (this.deadCells.has(key)) continue;
          seen.add(key);
          candidates.push({c: nc, r: nr});
        }
      }
      if (candidates.length === 0) continue;

      // 随机选 2-3 格，尽量连成片
      var abyssSize = Math.min(2 + Math.floor(Math.random() * 2), candidates.length);
      var chosen = [];

      // 先随机选第一格
      var firstIdx = Math.floor(Math.random() * candidates.length);
      var first = candidates.splice(firstIdx, 1)[0];
      chosen.push(first);
      this.deadCells.add(first.c + ',' + first.r);

      // 后续优先选与已选格相邻的候选格
      while (chosen.length < abyssSize && candidates.length > 0) {
        var found = -1;
        for (var j = 0; j < candidates.length; j++) {
          for (var k = 0; k < chosen.length; k++) {
            if (Math.abs(candidates[j].c - chosen[k].c) + Math.abs(candidates[j].r - chosen[k].r) === 1) {
              found = j;
              break;
            }
          }
          if (found >= 0) break;
        }
        var pick;
        if (found >= 0) {
          pick = candidates.splice(found, 1)[0];
        } else {
          pick = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
        }
        chosen.push(pick);
        this.deadCells.add(pick.c + ',' + pick.r);
      }
    }
  },

  // ----  独立深渊：数量=障碍物数，1-3格连片，远离出生点 ----------
  _buildIndependentDeadZones() {
    var target = this.obstacleGroups.length;
    var placed = 0;
    var safety = 0;

    while (placed < target && safety < 2000) {
      safety++;

      // 随机选第一格（场地内部，不重叠，远离已有深渊和出生点）
      var sc = 2 + Math.floor(Math.random() * (this.cols - 4));
      var sr = 2 + Math.floor(Math.random() * (this.rows - 4));
      if (this._isBlocked(sc, sr)) continue;
      if (this.deadCells.has(sc + ',' + sr)) continue;
      if (!this._isFarFromDead(sc, sr, 3)) continue;
      // 出生点周围12格内不出现深渊
      if (this._isNearSpawnPoint(sc, sr, 12)) continue;

      var abyssSize = 1 + Math.floor(Math.random() * 3); // 1-3
      var chosen = [{c: sc, r: sr}];
      this.deadCells.add(sc + ',' + sr);

      // 尝试扩展连片
      while (chosen.length < abyssSize) {
        var candidates = [];
        var dirs = [{x:-1,y:0},{x:1,y:0},{x:0,y:-1},{x:0,y:1}];
        for (var k = 0; k < chosen.length; k++) {
          for (var d = 0; d < dirs.length; d++) {
            var nc = chosen[k].c + dirs[d].x;
            var nr = chosen[k].r + dirs[d].y;
            var key = nc + ',' + nr;
            if (this._isBlocked(nc, nr)) continue;
            if (this.deadCells.has(key)) continue;
            if (!this._isFarFromDead(nc, nr, 3)) continue;
            if (this._isNearSpawnPoint(nc, nr, 12)) continue;
            // 排除已选
            var dup = false;
            for (var x = 0; x < candidates.length; x++) {
              if (candidates[x].c === nc && candidates[x].r === nr) { dup = true; break; }
            }
            if (!dup) candidates.push({c: nc, r: nr});
          }
        }
        if (candidates.length === 0) break;
        var pick = candidates[Math.floor(Math.random() * candidates.length)];
        chosen.push(pick);
        this.deadCells.add(pick.c + ',' + pick.r);
      }
      placed++;
    }
  },

  // ----  出生点：红方左侧4列，蓝方右侧4列，垂直居中 ------------
  _buildSpawnPoints() {
    this.redSpawns = [];
    this.blueSpawns = [];
    var leftMax = 4;
    var rightMin = this.cols - 5;
    
    // 垂直居中区域：中间 1/3
    var midStart = Math.floor(this.rows / 3);
    var midEnd = Math.floor(this.rows * 2 / 3);
    
    for (var r = midStart; r < midEnd; r++) {
      for (var c = 1; c < this.cols - 1; c++) {
        var key = c + ',' + r;
        if (this.wallCells.has(key)) continue;
        if (this.obstacleCells.has(key)) continue;
        if (this.deadCells.has(key)) continue;
        if (c <= leftMax) {
          this.redSpawns.push({c: c, r: r});
        } else if (c >= rightMin) {
          this.blueSpawns.push({c: c, r: r});
        }
      }
    }
    
    // 如果居中区域内找不到足够的出生点，扩展到整个高度
    if (this.redSpawns.length < 2 || this.blueSpawns.length < 2) {
      this.redSpawns = [];
      this.blueSpawns = [];
      for (var r2 = 1; r2 < this.rows - 1; r2++) {
        for (var c2 = 1; c2 < this.cols - 1; c2++) {
          var key2 = c2 + ',' + r2;
          if (this.wallCells.has(key2)) continue;
          if (this.obstacleCells.has(key2)) continue;
          if (this.deadCells.has(key2)) continue;
          if (c2 <= leftMax) {
            this.redSpawns.push({c: c2, r: r2});
          } else if (c2 >= rightMin) {
            this.blueSpawns.push({c: c2, r: r2});
          }
        }
      }
    }
    
    //  按行排序（从上到下），方便按 id 取模分散
    this.redSpawns.sort(function (a, b) { return a.r - b.r; });
    this.blueSpawns.sort(function (a, b) { return a.r - b.r; });
  },

  // ----  对外：根据  id  获取出生点像素坐标 ------------
  getSpawnPos(id, team) {
    var list = team === 'red' ? this.redSpawns : this.blueSpawns;
    if (list.length === 0) {
      //  后备：场地中心
      return {
        x: this.offsetX + this.cols * this.gridSize / 2,
        y: this.offsetY + this.rows * this.gridSize / 2
      };
    }
    //  按  id  取模，尽量分散
    var idx = id % list.length;
    var gc = list[idx];
    return {
      x: this.offsetX + (gc.c + 0.5) * this.gridSize,
      y: this.offsetY + (gc.r + 0.5) * this.gridSize
    };
  },

  // ----  碰撞检测：玩家圆形  vs  墙体/障碍物方格 --------
  //  若发生碰撞，将玩家推回，返回  true
  checkCollision(player) {
    if (!player.alive) return false;

    var r = CONFIG.player.radius;
    var px = player.x;
    var py = player.y;

    //  玩家 AABB
    var pl = px - r, pr = px + r;
    var pt = py - r, pb = py + r;

    var collided = false;

    //  检查附近格子（墙体 + 障碍物）
    var minC = Math.max(0, Math.floor((pl - this.offsetX) / this.gridSize) - 1);
    var maxC = Math.min(this.cols - 1, Math.floor((pr - this.offsetX) / this.gridSize) + 1);
    var minR = Math.max(0, Math.floor((pt - this.offsetY) / this.gridSize) - 1);
    var maxR = Math.min(this.rows - 1, Math.floor((pb - this.offsetY) / this.gridSize) + 1);

    for (var c = minC; c <= maxC; c++) {
      for (var r2 = minR; r2 <= maxR; r2++) {
        var key = c + ',' + r2;
        if (!this.wallCells.has(key) && !this.obstacleCells.has(key)) continue;

        //  方格 AABB
        var gl = this.offsetX + c * this.gridSize;
        var gr = gl + this.gridSize;
        var gt = this.offsetY + r2 * this.gridSize;
        var gb = gt + this.gridSize;

        //  AABB 碰撞？
        //  用圆形 vs AABB 精确检测
        var closestX = Math.max(gl, Math.min(px, gr));
        var closestY = Math.max(gt, Math.min(py, gb));
        var dxClosest = px - closestX;
        var dyClosest = py - closestY;
        var distSq = dxClosest * dxClosest + dyClosest * dyClosest;

        if (distSq < r * r) {
          collided = true;

          //  计算推回向量
          var pushDist = r - Math.sqrt(distSq);
          var nx, ny;

          if (distSq < 0.0001) {
            //  玩家中心在方格内，沿最近边界推出
            var centerGx = (gl + gr) / 2;
            var centerGy = (gt + gb) / 2;
            nx = px - centerGx;
            ny = py - centerGy;
            var nlen = Math.sqrt(nx * nx + ny * ny) || 1;
            nx /= nlen; ny /= nlen;
          } else {
            nx = dxClosest / Math.sqrt(distSq);
            ny = dyClosest / Math.sqrt(distSq);
          }

          player.x += nx * (pushDist + 0.5);
          player.y += ny * (pushDist + 0.5);
        }
      }
    }

    return collided;
  },

  // ----  检查玩家是否接触障碍物，返回钉住位置 --------
  getObstacleContact(player) {
    if (!player.alive) return { pinned: false, x: 0, y: 0 };
    var r = CONFIG.player.radius;
    var gs = this.gridSize;
    var px = player.x, py = player.y;

    //  检查玩家圆形是否接触任何障碍物格
    var minC = Math.max(0, Math.floor((px - r - gs) / gs) - 1);
    var maxC = Math.min(this.cols - 1, Math.floor((px + r + gs) / gs) + 1);
    var minR = Math.max(0, Math.floor((py - r - gs) / gs) - 1);
    var maxR = Math.min(this.rows - 1, Math.floor((py + r + gs) / gs) + 1);

    for (var c = minC; c <= maxC; c++) {
      for (var r2 = minR; r2 <= maxR; r2++) {
        if (!this.obstacleCells.has(c + ',' + r2)) continue;
        //  方格 AABB
        var gl = this.offsetX + c * gs;
        var gr = gl + gs;
        var gt = this.offsetY + r2 * gs;
        var gb = gt + gs;
        //  圆形 vs AABB 碰撞
        var closestX = Math.max(gl, Math.min(px, gr));
        var closestY = Math.max(gt, Math.min(py, gb));
        var dx = px - closestX;
        var dy = py - closestY;
        if (dx * dx + dy * dy <= r * r) {
          //  接触了，返回方格中心作为钉住位置
          return { pinned: true, x: (gl + gr) / 2, y: (gt + gb) / 2 };
        }
      }
    }
    return { pinned: false, x: 0, y: 0 };
  },

  // ----  将玩家"完全推出"墙体/障碍物 ----------------------
  //  在  checkCollision  之后调用，处理穿透情况
  resolvePlayer(player) {
    if (!player.alive) return;
    var r = CONFIG.player.radius;
    var gs = this.gridSize;

    //  限制玩家在场地内（墙体内部）
    var minX = this.offsetX + r;
    var maxX = this.offsetX + (this.cols - 1) * gs - r;
    var minY = this.offsetY + r;
    var maxY = this.offsetY + (this.rows - 1) * gs - r;

    if (player.x < minX) player.x = minX;
    if (player.x > maxX) player.x = maxX;
    if (player.y < minY) player.y = minY;
    if (player.y > maxY) player.y = maxY;
  },

  // ----  深渊检测 ----------------------------------------
  isInDeadZone(player) {
    if (!player.alive) return false;
    var c = Math.floor((player.x - this.offsetX) / this.gridSize);
    var r = Math.floor((player.y - this.offsetY) / this.gridSize);
    return this.deadCells.has(c + ',' + r);
  },

  // ----  绘制 ------------------------------------------
  draw(ctx) {
    var gs = this.gridSize;
    var ox = this.offsetX;
    var oy = this.offsetY;

    //  1.  场地背景
    ctx.fillStyle = CONFIG.colors.background;
    ctx.fillRect(ox, oy, this.cols * gs, this.rows * gs);

    //  2.  网格线（透明度  0.08）
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (var c = 0; c <= this.cols; c++) {
      ctx.beginPath();
      ctx.moveTo(ox + c * gs, oy);
      ctx.lineTo(ox + c * gs, oy + this.rows * gs);
      ctx.stroke();
    }
    for (var r = 0; r <= this.rows; r++) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + r * gs);
      ctx.lineTo(ox + this.cols * gs, oy + r * gs);
      ctx.stroke();
    }

    //  3.  墙体
    ctx.fillStyle = '#88aacc';
    this.wallCells.forEach(function (key) {
      var parts = key.split(',');
      var c = parseInt(parts[0]);
      var r = parseInt(parts[1]);
      ctx.fillRect(ox + c * gs, oy + r * gs, gs, gs);
    });

    //  4.  障碍物
    ctx.fillStyle = '#88aacc';
    this.obstacleCells.forEach(function (key) {
      var parts = key.split(',');
      var c = parseInt(parts[0]);
      var r = parseInt(parts[1]);
      ctx.fillRect(ox + c * gs, oy + r * gs, gs, gs);
    });

    //  5.  深渊（纯黑填充 + 暗红边框，让玩家能清楚感受到危险）
    this.deadCells.forEach(function (key) {
      var parts = key.split(',');
      var c = parseInt(parts[0]);
      var r = parseInt(parts[1]);
      var x = ox + c * gs;
      var y = oy + r * gs;
      // 纯黑填充
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, y, gs, gs);
      // 暗血红色边框光晕
      ctx.strokeStyle = 'rgba(233, 69, 96, 0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, gs - 2, gs - 2);
      // 内圈暗红微光
      ctx.fillStyle = 'rgba(40, 0, 0, 0.3)';
      ctx.fillRect(x + 2, y + 2, gs - 4, gs - 4);
    });
  },

  // ----  序列化：将关卡数据转为纯对象（用于网络传输）------------
  serialize() {
    return {
      gridSize: this.gridSize,
      cols: this.cols,
      rows: this.rows,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      wallCells: Array.from(this.wallCells),
      obstacleCells: Array.from(this.obstacleCells),
      deadCells: Array.from(this.deadCells),
      redSpawns: this.redSpawns,
      blueSpawns: this.blueSpawns
    };
  },

  // ----  反序列化：从纯对象恢复关卡数据（用于网络接收）--------
  loadFromData(data) {
    this.gridSize = data.gridSize;
    this.cols = data.cols;
    this.rows = data.rows;
    this.offsetX = data.offsetX;
    this.offsetY = data.offsetY;
    this.wallCells = new Set(data.wallCells);
    this.obstacleCells = new Set(data.obstacleCells);
    this.deadCells = new Set(data.deadCells);
    this.redSpawns = data.redSpawns;
    this.blueSpawns = data.blueSpawns;
    this.obstacleGroups = []; // 不需要同步
  }
};
