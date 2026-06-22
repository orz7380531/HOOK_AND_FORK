// HitResolver - 同帧命中仲裁，重攻击互克逻辑

class HitResolver {
  constructor() {
    this.queue = []; // [{ attacker, target, weaponType, weight }]
  }

  addHit(attacker, target, weaponType, weight) {
    // 同帧同攻击者→同目标只记录一次
    for (var i = 0; i < this.queue.length; i++) {
      if (this.queue[i].attacker === attacker && this.queue[i].target === target) return;
    }
    this.queue.push({
      attacker: attacker,
      target: target,
      weaponType: weaponType,
      weight: weight
    });
  }

  // 主持仲裁，返回 ResolvedEffect 数组
  // 必须在所有武器 update 完成后调用
  resolve() {
    var effects = [];
    var q = this.queue;
    if (q.length === 0) return effects;

    console.log('[Resolver] ── 帧开始，队列共 ' + q.length + ' 条命中 ──');
    for (var i = 0; i < q.length; i++) {
      var h = q[i];
      console.log('  ' + (i + 1) + '. P' + (h.attacker.id + 1) + '(' + h.weaponType + '/' + h.weight + ') → P' + (h.target.id + 1));
    }

    // ---------- 分类：同阵营 / 敌对方 ----------
    var sameTeam = [];
    var oppTeam = [];
    for (var i = 0; i < q.length; i++) {
      if (q[i].attacker.team === q[i].target.team) {
        sameTeam.push(q[i]);
      } else {
        oppTeam.push(q[i]);
      }
    }

    // 同阵营命中：始终生效，不受仲裁影响（规则 e）
    for (var i = 0; i < sameTeam.length; i++) {
      this._emitEffect(sameTeam[i], effects);
      console.log('[Resolver] 同阵营生效: P' + (sameTeam[i].attacker.id + 1) + ' → P' + (sameTeam[i].target.id + 1));
    }

    // ---------- 敌对方命中仲裁 ----------
    // 标记：哪些攻击被弹开，哪些攻击者额外僵直
    var deflected = {};  // attacker.id → true
    var stunList = [];   // [{ player, duration }]

    // 1) 找出所有"互打"对（A 打 B 且 B 打 A）
    var paired = {};
    for (var i = 0; i < oppTeam.length; i++) {
      for (var j = i + 1; j < oppTeam.length; j++) {
        var a = oppTeam[i], b = oppTeam[j];
        if (a.attacker === b.target && b.attacker === a.target) {
          var key = Math.min(a.attacker.id, b.attacker.id) + '_' + Math.max(a.attacker.id, b.attacker.id);
          if (paired[key]) continue;
          paired[key] = true;

          var aH = a.weight === 'heavy';
          var bH = b.weight === 'heavy';

          if (!aH && !bH) {
            // 规则 a：轻 vs 轻，双方生效
            console.log('[Resolver] 规则a 轻vs轻: 双方生效');
            this._emitEffect(a, effects);
            this._emitEffect(b, effects);
          } else if (aH && !bH) {
            // 规则 b：重生效，轻被击退
            console.log('[Resolver] 规则b P' + (a.attacker.id + 1) + '重击退P' + (b.attacker.id + 1) + '轻');
            this._emitEffect(a, effects);
            deflected[b.attacker.id] = true;
          } else if (!aH && bH) {
            console.log('[Resolver] 规则b P' + (b.attacker.id + 1) + '重击退P' + (a.attacker.id + 1) + '轻');
            this._emitEffect(b, effects);
            deflected[a.attacker.id] = true;
          } else {
            // 规则 c：重 vs 重，双方弹开，攻击者僵直 1s
            console.log('[Resolver] 规则c 重vs重: 双方弹开，各僵直1s');
            deflected[a.attacker.id] = true;
            deflected[b.attacker.id] = true;
            stunList.push({ player: a.attacker, duration: 1.0 });
            stunList.push({ player: b.attacker, duration: 1.0 });
          }
        }
      }
    }

    // 2) 多人重攻击命中同一人（规则 d）
    var byTarget = {};
    for (var i = 0; i < oppTeam.length; i++) {
      var tid = oppTeam[i].target.id;
      if (!byTarget[tid]) byTarget[tid] = [];
      byTarget[tid].push(oppTeam[i]);
    }
    for (var tid in byTarget) {
      var lst = byTarget[tid];
      var heavyCount = 0;
      for (var i = 0; i < lst.length; i++) {
        if (lst[i].weight === 'heavy') heavyCount++;
      }
      if (heavyCount >= 2) {
        console.log('[Resolver] 规则d: P' + (lst[0].target.id + 1) + '被' + heavyCount + '个重攻击命中 → 全部弹开');
        for (var i = 0; i < lst.length; i++) {
          if (lst[i].weight === 'heavy') {
            deflected[lst[i].attacker.id] = true;
            stunList.push({ player: lst[i].attacker, duration: 1.0 });
          }
        }
        // 目标也僵直 1s
        stunList.push({ player: lst[0].target, duration: 1.0 });
      }
    }

    // 3) 未被弹开的敌方命中正常生效
    for (var i = 0; i < oppTeam.length; i++) {
      var h = oppTeam[i];
      // 如果攻击者已被标记为 deflected，跳过
      if (deflected[h.attacker.id]) {
        console.log('[Resolver] 已弹开，忽略: P' + (h.attacker.id + 1) + ' → P' + (h.target.id + 1));
        continue;
      }
      // 如果是互打对中的轻攻击且对方重攻击生效，已被处理（靠 deflected 标记跳过）
      // 这里直接生效
      this._emitEffect(h, effects);
    }

    // 4) 追加僵直效果
    for (var i = 0; i < stunList.length; i++) {
      var sp = stunList[i].player;
      // 去重：同一人 multiple stun 取最长
      var existing = null;
      for (var j = 0; j < effects.length; j++) {
        if (effects[j].target === sp && effects[j].type === 'stun') {
          existing = effects[j];
          break;
        }
      }
      if (existing) {
        existing.duration = Math.max(existing.duration, stunList[i].duration);
      } else {
        effects.push({
          type: 'stun',
          target: sp,
          duration: stunList[i].duration
        });
      }
      console.log('[Resolver] 追加僵直: P' + (sp.id + 1) + ' 僵直 ' + stunList[i].duration + 's');
    }

    console.log('[Resolver] ── 帧结束，共 ' + effects.length + ' 条生效效果 ──');
    return effects;
  }

  // 根据命中事件生成 ResolvedEffect
  _emitEffect(hit, effects) {
    var w = hit.attacker.weapon;
    if (hit.weaponType === 'hook') {
      // 钩子：沿出钩方向的反方向拉（朝向攻击者）
      var dx = -w.dirX * (hit.weight === 'heavy' ? CONFIG.hook.heavyPullForce : CONFIG.hook.lightPullForce);
      var dy = -w.dirY * (hit.weight === 'heavy' ? CONFIG.hook.heavyPullForce : CONFIG.hook.lightPullForce);
      effects.push({
        type: 'pull',
        target: hit.target,
        force: { x: dx, y: dy },
        stun: hit.weight === 'heavy' ? CONFIG.hook.heavyStun : CONFIG.hook.lightStun
      });
    } else {
      // 钢叉：沿出叉方向推
      var fx = w.dirX * (hit.weight === 'heavy' ? CONFIG.fork.heavyPushForce : CONFIG.fork.lightPushForce);
      var fy = w.dirY * (hit.weight === 'heavy' ? CONFIG.fork.heavyPushForce : CONFIG.fork.lightPushForce);
      effects.push({
        type: 'push',
        target: hit.target,
        force: { x: fx, y: fy },
        stun: hit.weight === 'heavy' ? CONFIG.fork.heavyStun : CONFIG.fork.lightStun,
        isHeavy: hit.weight === 'heavy',
        attacker: hit.attacker
      });
    }
  }

  clear() {
    this.queue = [];
  }
}
