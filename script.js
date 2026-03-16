"use strict";

const WORLD = { width: 1100, height: 620 };
const GROUND_Y = 500;

const PLAYER = {
  width: 70,
  height: 56,
  speed: 360,
  gravity: 1900,
  jumpPower: 700,
  fireCooldown: 0.16
};

const LEVEL_BASE_DISTANCE = 220;
const LEVEL_STEP_DISTANCE = 90;

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreVal = document.getElementById("scoreVal");
const distanceVal = document.getElementById("distanceVal");
const livesVal = document.getElementById("livesVal");
const levelVal = document.getElementById("levelVal");
const comboVal = document.getElementById("comboVal");
const overdriveFill = document.getElementById("overdriveFill");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startBtn = document.getElementById("startBtn");

const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const restartBtn = document.getElementById("restartBtn");

const input = {
  left: false,
  right: false,
  shoot: false,
  jumpQueued: false,
  boostQueued: false,
  pointerDown: false
};

let running = false;
let rafId = 0;
let lastTime = 0;
let gameState = "menu";

const audioFx = {
  ctx: null
};

const game = {
  player: null,
  bullets: [],
  enemyBullets: [],
  enemies: [],
  pickups: [],
  particles: [],
  stars: [],
  layers: [],
  score: 0,
  distance: 0,
  lives: 3,
  level: 1,
  nextLevelDistance: LEVEL_BASE_DISTANCE,
  combo: 0,
  comboTimer: 0,
  overdrive: 0,
  overdriveActive: false,
  overdriveTime: 0,
  speedBase: 265,
  time: 0,
  spawnEnemyIn: 1,
  spawnPickupIn: 2.1,
  groundOffset: 0,
  shake: 0,
  levelBannerTimer: 0,
  levelBannerText: ""
};

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function setRunButtons() {
  pauseBtn.disabled = gameState !== "running";
  resumeBtn.disabled = gameState !== "paused";
}

function clearHeldInput() {
  input.left = false;
  input.right = false;
  input.shoot = false;
  input.pointerDown = false;
  input.jumpQueued = false;
  input.boostQueued = false;
}

function ensureAudioContext() {
  if (!audioFx.ctx) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }
    audioFx.ctx = new AudioContextCtor();
  }

  if (audioFx.ctx.state === "suspended") {
    audioFx.ctx.resume();
  }

  return audioFx.ctx;
}

function scheduleTone(audioCtx, time, freq, duration, gain, type) {
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);

  amp.gain.setValueAtTime(0.0001, time);
  amp.gain.linearRampToValueAtTime(gain, time + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + duration);

  osc.connect(amp);
  amp.connect(audioCtx.destination);

  osc.start(time);
  osc.stop(time + duration + 0.03);
}

function playLevelUpSfx() {
  const audioCtx = ensureAudioContext();
  if (!audioCtx) {
    return;
  }

  const t = audioCtx.currentTime + 0.01;
  scheduleTone(audioCtx, t, 523.25, 0.14, 0.07, "triangle");
  scheduleTone(audioCtx, t + 0.11, 659.26, 0.16, 0.06, "triangle");
  scheduleTone(audioCtx, t + 0.23, 783.99, 0.2, 0.06, "sine");
}

function createStars() {
  game.stars.length = 0;
  for (let i = 0; i < 120; i += 1) {
    game.stars.push({
      x: rand(0, WORLD.width),
      y: rand(0, GROUND_Y - 80),
      s: rand(0.7, 2.2),
      tw: rand(0, Math.PI * 2)
    });
  }
}

function createLayer(depth, count, minH, maxH, colorA, colorB) {
  const list = [];
  let x = 0;
  for (let i = 0; i < count; i += 1) {
    const w = rand(50, 160);
    const h = rand(minH, maxH);
    list.push({ x, w, h, flicker: rand(0, Math.PI * 2) });
    x += w + rand(12, 28);
  }

  return { depth, colorA, colorB, items: list, width: x };
}

function setupLayers() {
  game.layers = [
    createLayer(0.22, 22, 70, 160, "#26303f", "#313e50"),
    createLayer(0.42, 20, 110, 220, "#1e2838", "#273449"),
    createLayer(0.68, 18, 140, 290, "#182231", "#202e42")
  ];
}

function resetGame() {
  game.player = {
    x: 180,
    y: GROUND_Y - PLAYER.height,
    w: PLAYER.width,
    h: PLAYER.height,
    vx: 0,
    vy: 0,
    jumps: 0,
    fireCd: 0,
    invuln: 0,
    trail: []
  };

  game.bullets.length = 0;
  game.enemyBullets.length = 0;
  game.enemies.length = 0;
  game.pickups.length = 0;
  game.particles.length = 0;

  game.score = 0;
  game.distance = 0;
  game.lives = 3;
  game.level = 1;
  game.nextLevelDistance = LEVEL_BASE_DISTANCE;
  game.combo = 0;
  game.comboTimer = 0;
  game.overdrive = 0;
  game.overdriveActive = false;
  game.overdriveTime = 0;
  game.speedBase = 265;
  game.time = 0;
  game.spawnEnemyIn = 0.8;
  game.spawnPickupIn = 1.8;
  game.groundOffset = 0;
  game.shake = 0;
  game.levelBannerTimer = 0;
  game.levelBannerText = "";

  createStars();
  setupLayers();
  updateHud();
}

function currentSpeed() {
  const growth = Math.min(220, game.time * 7.5);
  const levelBonus = (game.level - 1) * 24;
  const raw = game.speedBase + growth + levelBonus;
  return raw * (game.overdriveActive ? 0.67 : 1);
}

function queueJump() {
  input.jumpQueued = true;
}

function queueBoost() {
  input.boostQueued = true;
}

function spawnBullet() {
  const p = game.player;
  game.bullets.push({
    x: p.x + p.w - 4,
    y: p.y + p.h * 0.46,
    w: 20,
    h: 6,
    vx: 780,
    life: 1.4
  });

  for (let i = 0; i < 3; i += 1) {
    game.particles.push({
      x: p.x + p.w,
      y: p.y + p.h * 0.46,
      vx: rand(140, 240),
      vy: rand(-50, 50),
      life: rand(0.08, 0.2),
      maxLife: 0.2,
      size: rand(2, 4),
      color: "#ffd7a5"
    });
  }
}

function spawnEnemy() {
  const roll = Math.random();
  const hpBoost = Math.floor((game.level - 1) / 3);
  const speedBoost = (game.level - 1) * 0.02;
  const pointBonus = (game.level - 1) * 12;

  if (roll < 0.25) {
    const hp = 2 + hpBoost;
    game.enemies.push({
      type: "shooter",
      x: WORLD.width + 50,
      y: rand(150, 400),
      w: 64,
      h: 40,
      hp: hp,
      maxHp: hp,
      speedMul: rand(0.7, 0.95) + speedBoost,
      points: 220 + pointBonus,
      phase: 0,
      t: 0,
      hitFlash: 0,
      fireCooldown: rand(1.2, 2.0)
    });
    return;
  }

  if (roll < 0.55) {
    const droneHp = game.level >= 8 ? 2 : 1;
    game.enemies.push({
      type: "drone",
      x: WORLD.width + 50,
      y: rand(220, 420),
      w: 56,
      h: 34,
      hp: droneHp,
      maxHp: droneHp,
      speedMul: rand(1.03, 1.25) + speedBoost,
      points: 140 + pointBonus,
      phase: rand(0, Math.PI * 2),
      t: 0,
      hitFlash: 0
    });
    return;
  }

  if (roll < 0.78) {
    const hp = 2 + hpBoost;
    game.enemies.push({
      type: "barrier",
      x: WORLD.width + 40,
      y: GROUND_Y - 84,
      w: 50,
      h: 84,
      hp,
      maxHp: hp,
      speedMul: rand(0.92, 1.04) + speedBoost * 0.75,
      points: 170 + pointBonus,
      phase: 0,
      t: 0,
      hitFlash: 0
    });
    return;
  }

  const hp = 4 + Math.floor((game.level - 1) / 4);
  game.enemies.push({
    type: "gate",
    x: WORLD.width + 40,
    y: GROUND_Y - 126,
    w: 82,
    h: 126,
    hp,
    maxHp: hp,
    speedMul: rand(0.9, 1) + speedBoost * 0.55,
    points: 320 + pointBonus * 2,
    phase: 0,
    t: 0,
    hitFlash: 0
  });
}

function spawnPickup() {
  game.pickups.push({
    x: WORLD.width + 40,
    y: rand(220, 430),
    r: 11,
    phase: rand(0, Math.PI * 2)
  });
}

function addExplosion(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const a = rand(0, Math.PI * 2);
    const sp = rand(80, 300);
    game.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: rand(0.2, 0.8),
      maxLife: 0.8,
      size: rand(1.8, 4.4),
      color
    });
  }
}

function levelUp() {
  game.level += 1;
  game.nextLevelDistance += LEVEL_BASE_DISTANCE + (game.level - 1) * LEVEL_STEP_DISTANCE;
  game.score += 220 + game.level * 40;
  game.overdrive = clamp(game.overdrive + 12, 0, 100);
  game.shake = Math.max(game.shake, 10);
  game.levelBannerTimer = 2;
  game.levelBannerText = `LEVEL ${game.level}`;

  addExplosion(WORLD.width * 0.55, GROUND_Y - 60, "#ffd2a0", 26);
  playLevelUpSfx();
}

function updateLevelProgress() {
  while (game.distance >= game.nextLevelDistance) {
    levelUp();
  }
}

function destroyEnemy(index) {
  const e = game.enemies[index];
  const mult = 1 + Math.min(3, game.combo * 0.18);
  game.score += Math.round(e.points * mult);
  game.combo += 1;
  game.comboTimer = 2.2;
  game.overdrive = clamp(game.overdrive + 14 + e.maxHp * 4, 0, 100);
  game.shake = Math.max(game.shake, 8);

  addExplosion(e.x + e.w * 0.5, e.y + e.h * 0.5, e.type === "drone" ? "#8bf2ff" : (e.type === "shooter" ? "#ff6b9f" : "#ff9d9d"), 22 + e.maxHp * 4);
  game.enemies.splice(index, 1);
}

function endGame() {
  running = false;
  gameState = "gameover";
  cancelAnimationFrame(rafId);
  clearHeldInput();

  overlayTitle.textContent = "Mission Failed";
  overlayText.textContent = `Score ${game.score} | Distance ${Math.floor(game.distance)}m | Level ${game.level}. Relaunch to beat your run.`;
  startBtn.textContent = "Run Again";
  overlay.classList.add("visible");
  setRunButtons();
}

function damagePlayer() {
  const p = game.player;
  p.invuln = 1.15;
  game.lives -= 1;
  game.combo = 0;
  game.comboTimer = 0;
  game.shake = 18;
  addExplosion(p.x + p.w * 0.5, p.y + p.h * 0.5, "#ff6b9f", 25);

  if (game.lives <= 0) {
    endGame();
  }
}

function updatePlayer(dt) {
  const p = game.player;

  const moveAxis = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  p.vx = moveAxis * PLAYER.speed;
  p.x += p.vx * dt;

  p.x = clamp(p.x, 60, 390);

  if (input.jumpQueued && p.jumps < 2) {
    p.vy = -PLAYER.jumpPower;
    p.jumps += 1;
    addExplosion(p.x + p.w * 0.4, p.y + p.h, "#9ce9ff", 12);
  }
  input.jumpQueued = false;

  p.vy += PLAYER.gravity * dt;
  p.y += p.vy * dt;

  if (p.y + p.h >= GROUND_Y) {
    p.y = GROUND_Y - p.h;
    p.vy = 0;
    p.jumps = 0;
  }

  p.fireCd = Math.max(0, p.fireCd - dt);
  if (input.shoot && p.fireCd <= 0) {
    spawnBullet();
    p.fireCd = game.overdriveActive ? PLAYER.fireCooldown * 0.45 : PLAYER.fireCooldown;
  }

  p.invuln = Math.max(0, p.invuln - dt);

  p.trail.push({ x: p.x + p.w * 0.35, y: p.y + p.h * 0.75, life: 0.33 });
  if (p.trail.length > 16) {
    p.trail.shift();
  }
}

function updateBullets(dt) {
  for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
    const b = game.bullets[i];
    b.x += b.vx * dt;
    b.life -= dt;

    if (b.x > WORLD.width + 80 || b.life <= 0) {
      game.bullets.splice(i, 1);
    }
  }
}

function updateEnemyBullets(dt) {
  for (let i = game.enemyBullets.length - 1; i >= 0; i -= 1) {
    const b = game.enemyBullets[i];
    b.x += b.vx * dt;
    b.life -= dt;

    if (b.x < -40 || b.life <= 0) {
      game.enemyBullets.splice(i, 1);
      continue;
    }

    const bulletRect = { x: b.x, y: b.y, w: b.w, h: b.h };
    const playerRect = { x: game.player.x + 10, y: game.player.y + 8, w: game.player.w - 18, h: game.player.h - 12 };

    if (game.player.invuln <= 0 && rectsOverlap(bulletRect, playerRect)) {
      game.enemyBullets.splice(i, 1);
      damagePlayer();
    }
  }
}

function updateEnemies(dt, speed) {
  game.spawnEnemyIn -= dt;
  if (game.spawnEnemyIn <= 0) {
    spawnEnemy();
    const levelFactor = Math.min(0.45, (game.level - 1) * 0.045);
    const interval = rand(0.58, 1.12) * (1 - levelFactor) * (game.overdriveActive ? 0.95 : 1);
    game.spawnEnemyIn = Math.max(0.26, interval);
  }

  for (let i = game.enemies.length - 1; i >= 0; i -= 1) {
    const e = game.enemies[i];
    e.t += dt;
    e.hitFlash = Math.max(0, e.hitFlash - dt * 6);

    e.x -= speed * e.speedMul * dt;
    if (e.type === "drone") {
      e.y += Math.sin(e.t * 4 + e.phase) * 26 * dt;
    } else if (e.type === "shooter") {
      e.y += Math.sin(e.t * 2 + e.phase) * 15 * dt;
      e.fireCooldown -= dt;
      if (e.fireCooldown <= 0 && e.x < WORLD.width && e.x - game.player.x < 550 && e.x > game.player.x) {
        game.enemyBullets.push({
          x: e.x,
          y: e.y + e.h * 0.5 - 3,
          w: 16,
          h: 6,
          vx: -500,
          life: 3.5
        });
        e.fireCooldown = rand(1.8, 2.8);
      }
    }

    if (e.x + e.w < -50) {
      game.enemies.splice(i, 1);
      continue;
    }

    const enemyRect = { x: e.x + 5, y: e.y + 5, w: e.w - 10, h: e.h - 10 };
    const playerRect = { x: game.player.x + 10, y: game.player.y + 8, w: game.player.w - 18, h: game.player.h - 12 };

    if (game.player.invuln <= 0 && rectsOverlap(enemyRect, playerRect)) {
      game.enemies.splice(i, 1);
      damagePlayer();
      continue;
    }

    for (let j = game.bullets.length - 1; j >= 0; j -= 1) {
      const b = game.bullets[j];
      const bulletRect = { x: b.x, y: b.y, w: b.w, h: b.h };
      if (rectsOverlap(enemyRect, bulletRect)) {
        game.bullets.splice(j, 1);
        e.hp -= 1;
        e.hitFlash = 1;

        addExplosion(b.x + 8, b.y + 3, "#b8f6ff", 7);

        if (e.hp <= 0) {
          destroyEnemy(i);
        }
        break;
      }
    }
  }
}

function updatePickups(dt, speed) {
  game.spawnPickupIn -= dt;
  if (game.spawnPickupIn <= 0) {
    spawnPickup();
    const levelFactor = clamp(1 - (game.level - 1) * 0.02, 0.7, 1);
    game.spawnPickupIn = rand(1.8, 3.4) * levelFactor;
  }

  for (let i = game.pickups.length - 1; i >= 0; i -= 1) {
    const p = game.pickups[i];
    p.x -= speed * 1.02 * dt;
    p.phase += dt * 4;

    if (p.x + p.r < -30) {
      game.pickups.splice(i, 1);
      continue;
    }

    const rx = clamp(p.x, game.player.x, game.player.x + game.player.w);
    const ry = clamp(p.y, game.player.y, game.player.y + game.player.h);
    const dx = p.x - rx;
    const dy = p.y - ry;

    if (dx * dx + dy * dy <= p.r * p.r) {
      const mult = 1 + Math.min(3, game.combo * 0.18);
      game.score += Math.round(120 * mult);
      game.overdrive = clamp(game.overdrive + 24, 0, 100);
      game.comboTimer = Math.max(game.comboTimer, 1.6);
      addExplosion(p.x, p.y, "#ffd6a6", 16);
      game.pickups.splice(i, 1);
    }
  }
}

function updateParticles(dt) {
  for (let i = game.particles.length - 1; i >= 0; i -= 1) {
    const p = game.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.982;
    p.vy *= 0.982;

    if (p.life <= 0) {
      game.particles.splice(i, 1);
    }
  }

  for (let i = game.player.trail.length - 1; i >= 0; i -= 1) {
    const t = game.player.trail[i];
    t.life -= dt;
    if (t.life <= 0) {
      game.player.trail.splice(i, 1);
    }
  }
}

function updateLayers(dt, speed) {
  for (let l = 0; l < game.layers.length; l += 1) {
    const layer = game.layers[l];
    const drift = speed * layer.depth * dt;

    for (let i = 0; i < layer.items.length; i += 1) {
      layer.items[i].x -= drift;
      layer.items[i].flicker += dt * (1.3 + layer.depth);
    }

    const maxX = Math.max(...layer.items.map((it) => it.x + it.w));
    for (let i = 0; i < layer.items.length; i += 1) {
      if (layer.items[i].x + layer.items[i].w < -40) {
        layer.items[i].x = maxX + rand(16, 40);
        layer.items[i].w = rand(52, 170);
        layer.items[i].h = rand(75, 290 * layer.depth + 95);
        layer.items[i].flicker = rand(0, Math.PI * 2);
      }
    }
  }
}

function updateOverdrive(dt) {
  if (input.boostQueued && !game.overdriveActive && game.overdrive >= 100) {
    game.overdriveActive = true;
    game.overdriveTime = 5;
    game.overdrive = 0;
    game.shake = 12;
    addExplosion(game.player.x + game.player.w * 0.5, game.player.y + game.player.h * 0.5, "#ffd7a0", 34);
  }

  input.boostQueued = false;

  if (game.overdriveActive) {
    game.overdriveTime -= dt;
    if (game.overdriveTime <= 0) {
      game.overdriveActive = false;
      game.overdriveTime = 0;
    }
  }
}

function updateCombo(dt) {
  if (game.combo > 0) {
    game.comboTimer -= dt;
    if (game.comboTimer <= 0) {
      game.combo = 0;
      game.comboTimer = 0;
    }
  }
}

function updateLevelBanner(dt) {
  if (game.levelBannerTimer > 0) {
    game.levelBannerTimer = Math.max(0, game.levelBannerTimer - dt);
  }
}

function updateHud() {
  const mult = 1 + Math.min(3, game.combo * 0.18);
  scoreVal.textContent = String(game.score);
  distanceVal.textContent = `${Math.floor(game.distance)}m`;
  livesVal.textContent = String(game.lives);
  levelVal.textContent = String(game.level);
  comboVal.textContent = `x${mult.toFixed(1)}`;
  overdriveFill.style.width = `${Math.round(game.overdrive)}%`;
}

function update(dt) {
  const speed = currentSpeed();

  game.time += dt;
  game.distance += speed * dt * 0.08;
  game.groundOffset += speed * dt;
  game.score += Math.round(speed * dt * (game.overdriveActive ? 0.45 : 0.25));

  updateLevelProgress();
  updateOverdrive(dt);
  updatePlayer(dt);
  updateBullets(dt);
  updateEnemyBullets(dt);
  updateEnemies(dt, speed);
  updatePickups(dt, speed);
  updateParticles(dt);
  updateLayers(dt, speed);
  updateCombo(dt);
  updateLevelBanner(dt);

  game.shake = Math.max(0, game.shake - dt * 26);

  updateHud();
}

function drawSky() {
  const pulse = Math.sin(game.time * 0.35) * 0.5 + 0.5;

  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, game.overdriveActive ? "#22363a" : "#1a2536");
  sky.addColorStop(0.48, game.overdriveActive ? "#39434b" : "#344055");
  sky.addColorStop(0.84, game.overdriveActive ? "#866043" : "#8f6345");
  sky.addColorStop(1, game.overdriveActive ? "#bc8c60" : "#c08e63");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  const sun = ctx.createRadialGradient(820, GROUND_Y - 42, 10, 820, GROUND_Y - 42, 140 + pulse * 18);
  sun.addColorStop(0, "rgba(255, 227, 176, 0.35)");
  sun.addColorStop(1, "rgba(255, 227, 176, 0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  const haze = ctx.createLinearGradient(0, GROUND_Y - 140, 0, GROUND_Y + 30);
  haze.addColorStop(0, "rgba(243, 193, 139, 0)");
  haze.addColorStop(1, "rgba(243, 193, 139, 0.18)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, GROUND_Y - 140, WORLD.width, 170);

  for (let i = 0; i < game.stars.length; i += 1) {
    const s = game.stars[i];
    const twinkle = 0.35 + 0.65 * Math.sin(game.time * 1.1 + s.tw);
    const fadeByHeight = clamp((GROUND_Y - s.y) / GROUND_Y, 0, 1);
    ctx.fillStyle = `rgba(225, 235, 246, ${(0.12 + twinkle * 0.22) * fadeByHeight})`;
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
}

function drawLayers() {
  for (let l = 0; l < game.layers.length; l += 1) {
    const layer = game.layers[l];

    for (let i = 0; i < layer.items.length; i += 1) {
      const b = layer.items[i];
      const y = GROUND_Y - b.h;

      const grad = ctx.createLinearGradient(b.x, y, b.x, GROUND_Y);
      grad.addColorStop(0, layer.colorA);
      grad.addColorStop(1, layer.colorB);
      ctx.fillStyle = grad;
      ctx.fillRect(b.x, y, b.w, b.h);

      const rows = Math.floor(b.h / 22);
      const cols = Math.max(2, Math.floor(b.w / 17));
      for (let ry = 0; ry < rows; ry += 1) {
        for (let cx = 0; cx < cols; cx += 1) {
          if (Math.sin(b.flicker + ry * 0.65 + cx * 1.1) > 0.62) {
            ctx.fillStyle = "rgba(255, 216, 156, 0.34)";
          } else {
            ctx.fillStyle = "rgba(86, 109, 140, 0.2)";
          }
          ctx.fillRect(b.x + 5 + cx * 12, y + 8 + ry * 18, 6, 9);
        }
      }
    }
  }
}

function drawGround() {
  const grad = ctx.createLinearGradient(0, GROUND_Y - 18, 0, WORLD.height);
  grad.addColorStop(0, "#2e333d");
  grad.addColorStop(1, "#14181f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, GROUND_Y, WORLD.width, WORLD.height - GROUND_Y);

  ctx.fillStyle = "rgba(250, 219, 172, 0.2)";
  ctx.fillRect(0, GROUND_Y - 3, WORLD.width, 6);

  const step = 86;
  const dash = 34;
  const offset = game.groundOffset % step;

  ctx.fillStyle = "rgba(246, 227, 196, 0.65)";
  for (let x = -offset; x < WORLD.width + step; x += step) {
    ctx.fillRect(x + 10, GROUND_Y + 54, dash, 6);
  }

  const shoulderGrad = ctx.createLinearGradient(0, GROUND_Y + 10, 0, GROUND_Y + 42);
  shoulderGrad.addColorStop(0, "rgba(255, 168, 99, 0.3)");
  shoulderGrad.addColorStop(1, "rgba(255, 168, 99, 0)");
  ctx.fillStyle = shoulderGrad;
  ctx.fillRect(0, GROUND_Y + 8, WORLD.width, 36);

  for (let y = GROUND_Y + 16; y < WORLD.height; y += 20) {
    const alpha = clamp(0.14 - (y - GROUND_Y) * 0.0015, 0, 0.14);
    ctx.strokeStyle = `rgba(180, 187, 197, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD.width, y);
    ctx.stroke();
  }
}

function drawPickups() {
  for (let i = 0; i < game.pickups.length; i += 1) {
    const p = game.pickups[i];
    const bob = Math.sin(p.phase) * 5;

    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(p.phase * 0.7);

    ctx.shadowColor = "rgba(255, 203, 138, 0.65)";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "#ffd39d";

    ctx.beginPath();
    ctx.moveTo(0, -p.r);
    ctx.lineTo(p.r * 0.8, 0);
    ctx.lineTo(0, p.r);
    ctx.lineTo(-p.r * 0.8, 0);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

function drawBullets() {
  for (let i = 0; i < game.bullets.length; i += 1) {
    const b = game.bullets[i];
    ctx.fillStyle = "#ffe4bf";
    ctx.shadowColor = "rgba(244, 184, 118, 0.8)";
    ctx.shadowBlur = 15;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.shadowBlur = 0;
  }
}

function drawEnemyBullets() {
  for (let i = 0; i < game.enemyBullets.length; i += 1) {
    const b = game.enemyBullets[i];
    ctx.fillStyle = "#ff6b9f";
    ctx.shadowColor = "rgba(255, 107, 159, 0.8)";
    ctx.shadowBlur = 12;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.shadowBlur = 0;
  }
}

function drawEnemies() {
  for (let i = 0; i < game.enemies.length; i += 1) {
    const e = game.enemies[i];

    if (e.type === "shooter") {
      ctx.save();
      ctx.translate(e.x + e.w * 0.5, e.y + e.h * 0.5);
      ctx.fillStyle = e.hitFlash > 0 ? "#ffffff" : "#a3455b";
      ctx.shadowColor = "rgba(255, 107, 159, 0.45)";
      ctx.shadowBlur = e.hitFlash > 0 ? 20 : 10;
      ctx.fillRect(-28, -12, 56, 24);
      ctx.fillStyle = "#ff85af";
      ctx.fillRect(-20, -6, 20, 12);
      ctx.fillStyle = "#2b3240";
      ctx.fillRect(8, -4, 20, 8);
      ctx.restore();
      
      const hpRatio = e.hp / e.maxHp;
      ctx.fillStyle = "rgba(12, 16, 28, 0.7)";
      ctx.fillRect(e.x + 8, e.y - 12, e.w - 16, 5);
      ctx.fillStyle = "#ffd7a3";
      ctx.fillRect(e.x + 8, e.y - 12, (e.w - 16) * hpRatio, 5);
      continue;
    }

    if (e.type === "drone") {
      ctx.save();
      ctx.translate(e.x + e.w * 0.5, e.y + e.h * 0.5);
      ctx.fillStyle = e.hitFlash > 0 ? "#ffffff" : "#d8dee7";
      ctx.shadowColor = "rgba(255, 208, 153, 0.45)";
      ctx.shadowBlur = 20;
      ctx.fillRect(-18, -9, 36, 18);
      ctx.fillRect(-30, -4, 10, 8);
      ctx.fillRect(20, -4, 10, 8);
      ctx.fillStyle = "#2b3240";
      ctx.fillRect(-6, -5, 12, 10);
      ctx.restore();
      continue;
    }

    if (e.type === "barrier") {
      const grad = ctx.createLinearGradient(e.x, e.y, e.x, e.y + e.h);
      grad.addColorStop(0, e.hitFlash > 0 ? "#ffffff" : "#d38b6d");
      grad.addColorStop(1, "#5a2f24");
      ctx.fillStyle = grad;
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = "rgba(242, 203, 142, 0.55)";
      ctx.fillRect(e.x + 6, e.y + 14, e.w - 12, 10);
      ctx.fillRect(e.x + 6, e.y + 32, e.w - 12, 10);
      continue;
    }

    const grad = ctx.createLinearGradient(e.x, e.y, e.x + e.w, e.y + e.h);
    grad.addColorStop(0, e.hitFlash > 0 ? "#ffffff" : "#e3bf8a");
    grad.addColorStop(1, "#5b442c");
    ctx.fillStyle = grad;
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.strokeStyle = "rgba(31, 18, 2, 0.45)";
    ctx.lineWidth = 3;
    ctx.strokeRect(e.x + 2, e.y + 2, e.w - 4, e.h - 4);

    const hpRatio = e.hp / e.maxHp;
    ctx.fillStyle = "rgba(12, 16, 28, 0.7)";
    ctx.fillRect(e.x + 8, e.y - 12, e.w - 16, 5);
    ctx.fillStyle = "#ffd7a3";
    ctx.fillRect(e.x + 8, e.y - 12, (e.w - 16) * hpRatio, 5);
  }
}

function drawPlayer() {
  const p = game.player;

  for (let i = 0; i < p.trail.length; i += 1) {
    const t = p.trail[i];
    const a = clamp(t.life / 0.33, 0, 1);
    ctx.fillStyle = `rgba(248, 191, 123, ${a * 0.2})`;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 8 * a + 2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (p.invuln > 0 && Math.floor(game.time * 24) % 2 === 0) {
    return;
  }

  const bob = Math.sin(game.time * 8) * 2;

  ctx.save();
  ctx.translate(p.x, p.y + bob);

  ctx.shadowColor = game.overdriveActive ? "rgba(255, 202, 130, 0.75)" : "rgba(198, 206, 218, 0.55)";
  ctx.shadowBlur = game.overdriveActive ? 30 : 20;

  ctx.fillStyle = "#d7dbe2";
  ctx.fillRect(10, 14, 44, 24);

  ctx.fillStyle = "#3b404f";
  ctx.fillRect(24, 6, 20, 14);

  ctx.fillStyle = "#ffd995";
  ctx.fillRect(50, 22, 14, 8);

  ctx.fillStyle = "#0f1630";
  ctx.beginPath();
  ctx.arc(18, 43, 10, 0, Math.PI * 2);
  ctx.arc(48, 43, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f6c98a";
  ctx.beginPath();
  ctx.arc(18, 43, 5, 0, Math.PI * 2);
  ctx.arc(48, 43, 5, 0, Math.PI * 2);
  ctx.fill();

  if (game.overdriveActive) {
    ctx.strokeStyle = "rgba(255, 206, 137, 0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(35, 30, 44, 26, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawParticles() {
  for (let i = 0; i < game.particles.length; i += 1) {
    const p = game.particles[i];
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    const color = hexOrRgba(p.color, alpha);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.6, p.size * alpha), 0, Math.PI * 2);
    ctx.fill();
  }
}

function hexOrRgba(color, alpha) {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const value = Number.parseInt(hex, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
  }
  return color;
}

function drawEffects() {
  const vignette = ctx.createRadialGradient(
    WORLD.width * 0.5,
    WORLD.height * 0.42,
    120,
    WORLD.width * 0.5,
    WORLD.height * 0.42,
    WORLD.width * 0.68
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.28)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  if (game.overdriveActive) {
    const k = Math.sin(game.time * 14) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(245, 198, 125, ${0.06 + k * 0.08})`;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  }
}

function drawRoundedRect(x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function drawLevelBanner() {
  if (game.levelBannerTimer <= 0) {
    return;
  }

  const total = 2;
  const elapsed = total - game.levelBannerTimer;
  const enter = clamp(elapsed / 0.24, 0, 1);
  const exit = clamp(game.levelBannerTimer / 0.45, 0, 1);
  const alpha = Math.min(1, enter, exit);
  const scale = 0.9 + enter * 0.1;
  const y = 74 + (1 - enter) * -24;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(WORLD.width * 0.5, y);
  ctx.scale(scale, scale);

  const w = 300;
  const h = 58;
  const x = -w * 0.5;
  const yy = -h * 0.5;

  const grad = ctx.createLinearGradient(x, yy, x + w, yy + h);
  grad.addColorStop(0, "rgba(245, 182, 101, 0.88)");
  grad.addColorStop(1, "rgba(249, 214, 166, 0.9)");
  ctx.fillStyle = grad;
  drawRoundedRect(x, yy, w, h, 16);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 246, 230, 0.9)";
  ctx.lineWidth = 2;
  drawRoundedRect(x + 2, yy + 2, w - 4, h - 4, 14);
  ctx.stroke();

  ctx.fillStyle = "rgba(38, 29, 19, 0.92)";
  ctx.font = "700 28px 'Russo One', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(game.levelBannerText, 0, 0);

  ctx.restore();
}

function render() {
  ctx.save();
  if (game.shake > 0) {
    ctx.translate(rand(-game.shake, game.shake), rand(-game.shake, game.shake));
  }

  drawSky();
  drawLayers();
  drawGround();
  drawPickups();
  drawBullets();
  drawEnemyBullets();
  drawEnemies();
  drawPlayer();
  drawParticles();
  drawEffects();
  drawLevelBanner();

  ctx.restore();
}

function frame(timestamp) {
  if (!running) {
    return;
  }

  const dt = clamp((timestamp - lastTime) / 1000, 0, 0.033);
  lastTime = timestamp;

  update(dt);
  render();

  if (running) {
    rafId = requestAnimationFrame(frame);
  }
}

function startGame() {
  ensureAudioContext();
  resetGame();
  running = true;
  gameState = "running";
  overlay.classList.remove("visible");
  startBtn.textContent = "Start Mission";
  clearHeldInput();
  setRunButtons();
  lastTime = performance.now();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frame);
}

function pauseGame(message) {
  if (gameState !== "running") {
    return;
  }

  running = false;
  gameState = "paused";
  cancelAnimationFrame(rafId);
  clearHeldInput();

  overlayTitle.textContent = "Paused";
  overlayText.textContent = message || "Run paused. Hit Resume or press P to continue.";
  startBtn.textContent = "Resume";
  overlay.classList.add("visible");

  setRunButtons();
}

function resumeGame() {
  if (gameState !== "paused") {
    return;
  }

  ensureAudioContext();
  running = true;
  gameState = "running";
  overlay.classList.remove("visible");
  clearHeldInput();
  setRunButtons();
  lastTime = performance.now();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frame);
}

function onKeyDown(event) {
  const key = event.key.toLowerCase();

  if ((key === "p" || key === "escape") && !event.repeat) {
    if (gameState === "running") {
      pauseGame();
    } else if (gameState === "paused") {
      resumeGame();
    }
    event.preventDefault();
    return;
  }

  if (gameState !== "running") {
    return;
  }

  if (key === "a" || key === "arrowleft") {
    input.left = true;
  }
  if (key === "d" || key === "arrowright") {
    input.right = true;
  }
  if ((key === "w" || key === "arrowup" || key === " ") && !event.repeat) {
    queueJump();
  }
  if ((key === "j" || key === "k") && !event.repeat) {
    input.shoot = true;
  }
  if (key === "shift" && !event.repeat) {
    queueBoost();
  }

  if (["arrowleft", "arrowright", "arrowup", " "].includes(key)) {
    event.preventDefault();
  }
}

function onKeyUp(event) {
  const key = event.key.toLowerCase();

  if (key === "a" || key === "arrowleft") {
    input.left = false;
  }
  if (key === "d" || key === "arrowright") {
    input.right = false;
  }
  if (key === "j" || key === "k") {
    input.shoot = false;
  }
}

function onCanvasPointerDown(event) {
  if (gameState !== "running") {
    return;
  }

  input.pointerDown = true;

  const rect = canvas.getBoundingClientRect();
  const px = (event.clientX - rect.left) / rect.width;

  if (px < 0.45) {
    queueJump();
  } else {
    input.shoot = true;
  }
}

function onCanvasPointerUp() {
  input.pointerDown = false;
  input.shoot = false;
}

function bindTouchButtons() {
  const buttons = Array.from(document.querySelectorAll(".touchpad button"));

  function applyAction(action, pressed) {
    if ((gameState !== "running") && pressed) {
      return;
    }

    if (action === "left") {
      input.left = pressed;
    } else if (action === "right") {
      input.right = pressed;
    } else if (action === "shoot") {
      input.shoot = pressed;
    } else if (action === "jump" && pressed) {
      queueJump();
    } else if (action === "boost" && pressed) {
      queueBoost();
    }
  }

  for (let i = 0; i < buttons.length; i += 1) {
    const btn = buttons[i];
    const action = btn.getAttribute("data-action");

    btn.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      applyAction(action, true);
    });

    btn.addEventListener("pointerup", (event) => {
      event.preventDefault();
      applyAction(action, false);
    });

    btn.addEventListener("pointercancel", () => applyAction(action, false));
    btn.addEventListener("pointerleave", () => applyAction(action, false));
  }
}

window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);

canvas.addEventListener("pointerdown", onCanvasPointerDown);
window.addEventListener("pointerup", onCanvasPointerUp);
window.addEventListener("pointercancel", onCanvasPointerUp);

bindTouchButtons();

startBtn.addEventListener("click", () => {
  if (gameState === "paused") {
    resumeGame();
    return;
  }

  overlayTitle.textContent = "Skyline Surge";
  overlayText.textContent = "An arcade runner-shooter set on a collapsing skyline expressway. Dodge barriers, destroy drones, collect flux shards, and trigger overdrive with Shift.";
  startGame();
});

pauseBtn.addEventListener("click", () => pauseGame());
resumeBtn.addEventListener("click", () => resumeGame());
restartBtn.addEventListener("click", () => startGame());

document.addEventListener("visibilitychange", () => {
  if (document.hidden && gameState === "running") {
    pauseGame("The mission paused because the tab was hidden. Resume when you are ready.");
  }
});

resetGame();
setRunButtons();
render();




