const STORAGE_KEY = "runner-best-score";

function hashSeed(seedText) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedText) {
  let state = hashSeed(seedText || "runner-default-seed") || 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RunnerGame {
  constructor({ onStateChange, onResult }) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;

    this.state = this.createIdleState();
    this.lastFrameTs = 0;
    this.rafId = null;
    this.spawnTimer = 0;
    this.obstacleId = 0;
    this.pickupId = 0;
    this.gravity = 1750;
    this.random = Math.random;
  }

  createIdleState() {
    return {
      isRunning: false,
      mode: "normal",
      modeName: "普通模式",
      level: null,
      timeLeft: 0,
      score: 0,
      distance: 0,
      jumps: 0,
      bestScore: this.loadBestScore(),
      playerY: 0,
      playerVy: 0,
      playerX: 72,
      playerWidth: 48,
      playerHeight: 54,
      groundY: 48,
      obstacles: [],
      pickups: [],
      shieldCount: 1,
      shieldArmed: false,
      collisions: 0,
      coins: 0,
      bonusScore: 0,
      powerups: 0,
      lowGravityTimer: 0,
      jumpFloatTimer: 0,
      runSeed: "",
    };
  }

  loadBestScore() {
    try {
      return Number(localStorage.getItem(STORAGE_KEY) || 0);
    } catch {
      return 0;
    }
  }

  saveBestScore(score) {
    localStorage.setItem(STORAGE_KEY, String(score));
  }

  start(level, options = {}) {
    this.stopLoop();

    const runSeed = options.seed || `${Date.now()}|${level.id}`;
    this.random = createSeededRandom(runSeed);

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      level,
      mode: options.mode || "normal",
      modeName: options.modeName || "普通模式",
      timeLeft: level.durationSec,
      shieldCount: 1,
      shieldArmed: false,
      runSeed,
    };

    this.spawnTimer = 380;
    this.lastFrameTs = 0;
    this.onStateChange(this.state);
    this.rafId = requestAnimationFrame((ts) => this.loop(ts));
  }

  loop(ts) {
    if (!this.state.isRunning || !this.state.level) {
      return;
    }

    if (!this.lastFrameTs) {
      this.lastFrameTs = ts;
      this.rafId = requestAnimationFrame((nextTs) => this.loop(nextTs));
      return;
    }

    const dt = Math.min(40, ts - this.lastFrameTs) / 1000;
    this.lastFrameTs = ts;

    this.updatePlayer(dt);
    this.updateObstacles(dt);
    this.updatePickups(dt);
    this.updateSpawn(dt);

    const usedSec = this.state.level.durationSec - this.state.timeLeft;
    this.state.distance = Math.max(0, Math.floor(usedSec * this.state.level.speed * 0.35));
    this.state.score = this.state.distance
      + (this.state.jumps * 6)
      + this.state.bonusScore
      - (this.state.collisions * 30);

    this.state.timeLeft = Math.max(0, this.state.timeLeft - dt);

    this.onStateChange({
      ...this.state,
      obstacles: [...this.state.obstacles],
      pickups: [...this.state.pickups],
    });

    if (this.state.timeLeft <= 0) {
      this.finish(true);
      return;
    }

    this.rafId = requestAnimationFrame((nextTs) => this.loop(nextTs));
  }

  updatePlayer(dt) {
    if (this.state.lowGravityTimer > 0) {
      this.state.lowGravityTimer = Math.max(0, this.state.lowGravityTimer - dt);
    }
    if (this.state.jumpFloatTimer > 0) {
      this.state.jumpFloatTimer = Math.max(0, this.state.jumpFloatTimer - dt);
    }

    let gravityScale = 1;
    if (this.state.lowGravityTimer > 0) {
      gravityScale = 0.72;
    }
    if (this.state.jumpFloatTimer > 0 && this.state.playerVy > 0) {
      gravityScale = Math.min(gravityScale, 0.46);
    }

    this.state.playerVy -= (this.gravity * gravityScale) * dt;
    this.state.playerY += this.state.playerVy * dt;

    if (this.state.playerY < 0) {
      this.state.playerY = 0;
      this.state.playerVy = 0;
    }
  }

  updateObstacles(dt) {
    const speed = this.state.level.speed;
    this.state.obstacles.forEach((obstacle) => {
      obstacle.x -= speed * dt;
    });

    this.state.obstacles = this.state.obstacles.filter((item) => item.x + item.width > -20);

    for (const obstacle of this.state.obstacles) {
      if (obstacle.hit) {
        continue;
      }

      const collided = this.checkCollision(obstacle);
      if (collided) {
        if (this.state.shieldArmed) {
          this.state.shieldArmed = false;
          obstacle.hit = true;
          continue;
        }
        this.state.collisions += 1;
        this.finish(false);
        return;
      }
    }
  }

  updatePickups(dt) {
    const speed = this.state.level.speed;
    this.state.pickups.forEach((pickup) => {
      pickup.x -= speed * dt;
    });

    this.state.pickups = this.state.pickups.filter((item) => item.x + item.width > -20 && !item.collected);

    for (const pickup of this.state.pickups) {
      if (pickup.collected) {
        continue;
      }
      if (!this.checkCollision(pickup)) {
        continue;
      }

      pickup.collected = true;
      if (pickup.type === "coin") {
        this.state.coins += 1;
        this.state.bonusScore += 18;
      } else if (pickup.type === "wing") {
        this.state.powerups += 1;
        this.state.lowGravityTimer = Math.max(this.state.lowGravityTimer, 4);
        this.state.bonusScore += 36;
      }
    }
  }

  updateSpawn(dt) {
    this.spawnTimer -= dt * 1000;
    if (this.spawnTimer > 0) {
      return;
    }

    const minHeight = 28;
    const maxHeight = 70;
    const minWidth = 26;
    const maxWidth = 54;

    this.state.obstacles.push({
      id: `obs-${this.obstacleId += 1}`,
      x: 680,
      width: minWidth + this.random() * (maxWidth - minWidth),
      height: minHeight + this.random() * (maxHeight - minHeight),
      hit: false,
    });

    const pickupRoll = this.random();
    if (pickupRoll < 0.45) {
      const type = pickupRoll > 0.37 ? "wing" : "coin";
      this.state.pickups.push({
        id: `pick-${this.pickupId += 1}`,
        type,
        x: 700 + this.random() * 80,
        width: type === "wing" ? 34 : 30,
        height: type === "wing" ? 42 : 30,
        y: 76 + this.random() * 96,
        collected: false,
      });
    }

    const jitter = (this.random() - 0.5) * 220;
    this.spawnTimer = Math.max(480, this.state.level.spawnIntervalMs + jitter);
  }

  checkCollision(obstacle) {
    const px = this.state.playerX;
    const pw = this.state.playerWidth;
    const ph = this.state.playerHeight;
    const playerBottom = this.state.playerY;
    const playerTop = playerBottom + ph;
    const horizontalInset = 12;
    const verticalInset = obstacle.type ? 8 : 6;

    const ox1 = obstacle.x;
    const ox2 = obstacle.x + obstacle.width;
    const px1 = px;
    const px2 = px + pw;

    const horizontalOverlap = px2 > ox1 + horizontalInset && px1 < ox2 - horizontalInset;
    if (!horizontalOverlap) {
      return false;
    }

    const obstacleBottom = obstacle.y || 0;
    const obstacleTop = obstacleBottom + obstacle.height;
    const verticalHit = playerTop > obstacleBottom + verticalInset && playerBottom < obstacleTop - verticalInset;
    return verticalHit;
  }

  jump() {
    if (!this.state.isRunning || !this.state.level) {
      return false;
    }

    if (this.state.playerY > 3) {
      return false;
    }

    this.state.playerVy = this.state.level.jumpVelocity;
    this.state.jumpFloatTimer = 0.18;
    this.state.jumps += 1;
    this.onStateChange({
      ...this.state,
      obstacles: [...this.state.obstacles],
      pickups: [...this.state.pickups],
    });
    return true;
  }

  useShield() {
    if (!this.state.isRunning || this.state.shieldCount <= 0 || this.state.shieldArmed) {
      return false;
    }

    this.state.shieldCount -= 1;
    this.state.shieldArmed = true;
    this.onStateChange({
      ...this.state,
      obstacles: [...this.state.obstacles],
      pickups: [...this.state.pickups],
    });
    return true;
  }

  finish(isWin) {
    this.stopLoop();
    this.state.isRunning = false;

    const finalScore = Math.max(0, Math.round(this.state.score));
    const bestScore = Math.max(this.state.bestScore, finalScore);
    this.state.score = finalScore;
    this.state.bestScore = bestScore;
    this.saveBestScore(bestScore);

    const stars = isWin
      ? (this.state.collisions === 0 ? 3 : (this.state.collisions <= 1 ? 2 : 1))
      : 0;

    this.onStateChange({
      ...this.state,
      obstacles: [...this.state.obstacles],
      pickups: [...this.state.pickups],
    });
    this.onResult({
      isWin,
      score: finalScore,
      stars,
      levelId: this.state.level.id,
      levelName: this.state.level.name,
      mode: this.state.mode,
      modeName: this.state.modeName,
      jumps: this.state.jumps,
      collisions: this.state.collisions,
      distance: this.state.distance,
      coins: this.state.coins,
      powerups: this.state.powerups,
      bestScore,
      usedSec: Math.round(this.state.level.durationSec - this.state.timeLeft),
      seed: this.state.runSeed,
    });
  }

  stopLoop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
