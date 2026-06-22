const CONFIG = {
  canvas: { width: 1280, height: 720 },
  colors: { background: '#1a1a2e', redTeam: '#e94560', blueTeam: '#0f3460',
            deadZone: '#0f0f1a', wall: '#333355', ui: '#aaaacc' },
  arena: { mode: 'rect' },
  player: { radius: 10, mass: 1, speed: 120, maxPlayers: 8 },
  hook: { lightRange: 80, lightSpeed: 270, lightPullForce: 70, lightStun: 0.5, lightCooldown: 0.3,
          heavyRange: 150, heavySpeed: 132, heavyPullForce: 110, heavyStun: 0.8, heavyCooldown: 0.5 },
  fork: { lightRange: 60, lightSpeed: 312, lightPushForce: 55, lightStun: 0.3, lightCooldown: 0.2,
          heavyRange: 100, heavySpeed: 192, heavyPushForce: 95, heavyStun: 0.5, heavyCooldown: 0.4,
          wallPinDuration: 1.0 },
  art: { redPlayer: 'assets/red_player.svg', bluePlayer: 'assets/blue_player.svg' },
  match: { duration: 180, startDelay: 3 },
  mouse: { deadzone: 40 },
  // 操控配置（单人鼠标+键盘）
  controls: {
    move: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' },
    lightMouseButton: 0,   // 左键
    heavyMouseButton: 2,   // 右键
  },
};
