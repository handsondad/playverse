const BEST_KEY = "whac-best-score";

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let value = Math.imul(t ^ (t >>> 15), 1 | t);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function stringToSeed(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickRandom(list, randomFn) {
  return list[Math.floor(randomFn() * list.length)];
}

function starsByScore(score) {
  if (score >= 220) {
    return 3;
  }
  if (score >= 120) {
    return 2;
  }
  return 1;
}

export class WhacGame {
  constructor({ onStateChange, onResult }) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.reset();
  }

  reset() {
    this.config = null;
    this.timeLeft = 0;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboMultiplier = 1;
    this.maxComboMultiplier = 1;
    this.lastHitGain = 0;
    this.hits = 0;
    this.misses = 0;
    this.entities = [];
    this.isRunning = false;
    this.isFrozen = false;
    this.isDouble = false;
    this.freezeCount = 1;
    this.doubleCount = 1;
    this.spawnTimer = null;
    this.tickTimer = null;
    this.randomFn = Math.random;
    this.mode = "normal";
    this.modeName = "普通模式";
  }

  getComboCurve() {
    const fallback = [
      { combo: 3, multiplier: 1.2 },
      { combo: 6, multiplier: 1.5 },
      { combo: 10, multiplier: 2 },
    ];
    const curve = Array.isArray(this.config?.comboCurve) ? this.config.comboCurve : fallback;
    return [...curve]
      .filter((item) => Number(item?.combo) > 0 && Number(item?.multiplier) >= 1)
      .sort((a, b) => Number(a.combo) - Number(b.combo));
  }

  getComboMultiplier(combo) {
    const value = Number(combo || 0);
    let multiplier = 1;
    for (const item of this.getComboCurve()) {
      if (value >= Number(item.combo)) {
        multiplier = Number(item.multiplier);
      }
    }
    return multiplier;
  }

  start(config, icons, options = {}) {
    this.reset();
    this.config = config;
    this.icons = icons;
    this.mode = options.mode || "normal";
    this.modeName = options.modeName || "普通模式";
    if (options.seed) {
      this.randomFn = mulberry32(stringToSeed(String(options.seed)));
    }
    this.timeLeft = config.durationSec;
    this.isRunning = true;

    this.emit();
    this.tickTimer = setInterval(() => {
      if (!this.isRunning) {
        return;
      }
      this.timeLeft -= 1;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.finish();
        return;
      }
      this.emit();
    }, 1000);

    this.spawnTimer = setInterval(() => {
      if (!this.isRunning || this.isFrozen) {
        return;
      }
      this.spawn();
    }, config.spawnIntervalMs);
  }

  stopTimers() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.spawnTimer) {
      clearInterval(this.spawnTimer);
      this.spawnTimer = null;
    }
  }

  spawn() {
    if (this.entities.length >= this.config.maxActive) {
      return;
    }

    const holeIndex = Math.floor(this.randomFn() * 9);
    const occupied = this.entities.some((entity) => entity.holeIndex === holeIndex);
    if (occupied) {
      return;
    }

    const isTarget = this.randomFn() <= this.config.targetRate;
    const icon = isTarget
      ? pickRandom(this.icons.targetIcons, this.randomFn)
      : pickRandom(this.icons.decoyIcons, this.randomFn);

    const id = `${Date.now()}-${this.randomFn().toString(16).slice(2)}`;
    const entity = {
      id,
      holeIndex,
      isTarget,
      icon,
      expiresAt: Date.now() + this.config.stayMs,
    };

    this.entities.push(entity);
    this.emit();

    setTimeout(() => {
      this.entities = this.entities.filter((item) => item.id !== id);
      this.emit();
    }, this.config.stayMs);
  }

  tap(entityId) {
    if (!this.isRunning) {
      return;
    }

    const entity = this.entities.find((item) => item.id === entityId);
    if (!entity) {
      return;
    }

    this.entities = this.entities.filter((item) => item.id !== entityId);

    if (entity.isTarget) {
      this.hits += 1;
      this.combo += 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      const base = this.config.hitScore;
      this.comboMultiplier = this.getComboMultiplier(this.combo);
      this.maxComboMultiplier = Math.max(this.maxComboMultiplier, this.comboMultiplier);
      const gain = Math.round(base * this.comboMultiplier);
      this.lastHitGain = this.isDouble ? gain * 2 : gain;
      this.score += this.lastHitGain;
    } else {
      this.misses += 1;
      this.combo = 0;
      this.comboMultiplier = 1;
      this.lastHitGain = 0;
      this.score = Math.max(0, this.score - this.config.wrongPenalty);
    }

    this.emit();
  }

  tapEmpty() {
    if (!this.isRunning) {
      return;
    }
    this.combo = 0;
    this.comboMultiplier = 1;
    this.lastHitGain = 0;
    this.misses += 1;
    this.score = Math.max(0, this.score - this.config.wrongPenalty);
    this.emit();
  }

  useFreeze() {
    if (!this.isRunning || this.freezeCount <= 0 || this.isFrozen) {
      return false;
    }
    this.freezeCount -= 1;
    this.isFrozen = true;
    this.emit();

    setTimeout(() => {
      this.isFrozen = false;
      this.emit();
    }, 3000);
    return true;
  }

  useDouble() {
    if (!this.isRunning || this.doubleCount <= 0 || this.isDouble) {
      return false;
    }
    this.doubleCount -= 1;
    this.isDouble = true;
    this.emit();

    setTimeout(() => {
      this.isDouble = false;
      this.emit();
    }, 5000);
    return true;
  }

  finish() {
    this.stopTimers();
    this.isRunning = false;
    this.entities = [];

    const stars = starsByScore(this.score);
    const isWin = stars >= 2;
    this.saveBestScore();
    this.emit();

    this.onResult({
      score: this.score,
      isWin,
      stars,
      mode: this.mode,
      modeName: this.modeName,
      levelId: this.config.id,
      durationSec: this.config.durationSec,
      hits: this.hits,
      misses: this.misses,
      bestCombo: this.bestCombo,
      maxComboMultiplier: this.maxComboMultiplier,
      levelName: this.config.name,
      bestScore: this.getBestScore(),
    });
  }

  saveBestScore() {
    const key = `${BEST_KEY}:${this.config.id}`;
    const prev = Number(localStorage.getItem(key) || 0);
    if (this.score > prev) {
      localStorage.setItem(key, String(this.score));
    }
  }

  getBestScore() {
    if (!this.config) {
      return 0;
    }
    const key = `${BEST_KEY}:${this.config.id}`;
    return Number(localStorage.getItem(key) || 0);
  }

  emit() {
    this.onStateChange({
      config: this.config,
      timeLeft: this.timeLeft,
      score: this.score,
      combo: this.combo,
      bestCombo: this.bestCombo,
      comboMultiplier: this.comboMultiplier,
      maxComboMultiplier: this.maxComboMultiplier,
      lastHitGain: this.lastHitGain,
      hits: this.hits,
      misses: this.misses,
      entities: this.entities,
      isRunning: this.isRunning,
      isFrozen: this.isFrozen,
      isDouble: this.isDouble,
      freezeCount: this.freezeCount,
      doubleCount: this.doubleCount,
      bestScore: this.getBestScore(),
    });
  }
}
