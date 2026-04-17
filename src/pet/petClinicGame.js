function hashSeed(seedText) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedText) {
  let state = hashSeed(seedText || "pet-default-seed") || 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class PetClinicGame {
  constructor({ onStateChange, onResult, onToast }) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.onToast = onToast;
    this.levels = [];
    this.rooms = [];
    this.random = Math.random;
    this.timerId = 0;
    this.state = this.createIdleState();
  }

  createIdleState() {
    return {
      isRunning: false,
      isWin: false,
      levelId: "",
      levelName: "",
      timeLeft: 0,
      targetTreatments: 0,
      treated: 0,
      lives: 0,
      score: 0,
      streak: 0,
      bestScore: 0,
      roomPool: [],
      activeCase: null,
      activeCaseAgeMs: 0,
      queue: [],
      spawnMs: 1300,
      weatherCycleMs: 8500,
      weatherRemainingMs: 0,
      weatherId: "sunny",
      weatherName: "晴天",
      weatherPool: [],
      emergencyChance: 0,
      vipChance: 0,
      emergencyLimitMs: 2400,
      spawnCooldownMs: 0,
      lastEvent: "等待接诊",
    };
  }

  init(data, bestScore = 0) {
    this.levels = Array.isArray(data?.levels) ? data.levels : [];
    this.rooms = Array.isArray(data?.rooms) ? data.rooms : [];
    this.state = {
      ...this.createIdleState(),
      bestScore: Number(bestScore || 0),
    };
    this.emit();
  }

  stop() {
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = 0;
    }
  }

  start(levelId, options = {}) {
    const level = this.levels.find((item) => item.id === levelId) || this.levels[0];
    if (!level) {
      return;
    }

    this.stop();
    this.random = createSeededRandom(options.seed || `${Date.now()}|${level.id}|pet`);

    const roomIds = Array.isArray(level.roomIds) ? level.roomIds : [];
    const roomPool = this.rooms.filter((item) => roomIds.includes(item.id));
    const weatherPool = Array.isArray(options.weatherPool) && options.weatherPool.length > 0
      ? options.weatherPool
      : [{ id: "sunny", name: "晴天" }, { id: "cloudy", name: "多云" }, { id: "windy", name: "微风" }];
    const firstWeather = weatherPool[0] || { id: "sunny", name: "晴天" };

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      levelId: level.id,
      levelName: level.name,
      timeLeft: Number(level.timeLimitSec || 80),
      targetTreatments: Number(level.targetTreatments || 18),
      lives: Number(level.lives || 3),
      spawnMs: Number(level.spawnMs || 1300),
      weatherCycleMs: Number(level.weatherCycleMs || options.weatherCycleMs || 8500),
      weatherRemainingMs: Number(level.weatherCycleMs || options.weatherCycleMs || 8500),
      weatherId: firstWeather.id,
      weatherName: firstWeather.name,
      weatherPool,
      emergencyChance: Number(level.emergencyChance || 0),
      vipChance: Number(level.vipChance || 0),
      emergencyLimitMs: Number(level.emergencyLimitMs || 2400),
      spawnCooldownMs: 200,
      bestScore: this.state.bestScore,
      roomPool,
      queue: this.createQueue(roomPool, 5),
      lastEvent: "接诊开始，按症状安排到对应诊室",
    };

    this.emit();
    this.timerId = window.setInterval(() => this.tick(), 100);
  }

  createQueue(pool, count) {
    const list = [];
    for (let i = 0; i < count; i += 1) {
      list.push(this.createCase(pool));
    }
    return list;
  }

  createCase(pool = this.state.roomPool) {
    if (!Array.isArray(pool) || pool.length === 0) {
      return null;
    }
    const index = Math.floor(this.random() * pool.length);
    const room = pool[index];
    const isVip = this.random() < this.state.vipChance;
    const isEmergency = !isVip && this.random() < this.state.emergencyChance;
    return {
      id: `${Date.now()}-${Math.floor(this.random() * 100000)}`,
      roomId: room.id,
      type: isVip ? "vip" : (isEmergency ? "emergency" : "normal"),
    };
  }

  tick() {
    if (!this.state.isRunning) {
      return;
    }

    this.state.timeLeft = Math.max(0, this.state.timeLeft - 0.1);
    this.state.spawnCooldownMs -= 100;
    this.state.weatherRemainingMs -= 100;

    if (this.state.weatherRemainingMs <= 0) {
      this.rotateWeather();
    }

    if (!this.state.activeCase && this.state.spawnCooldownMs <= 0) {
      this.state.activeCase = this.state.queue.shift() || this.createCase();
      this.state.activeCaseAgeMs = 0;
      this.state.queue.push(this.createCase());
      this.state.spawnCooldownMs = this.state.spawnMs;
    }

    if (this.state.activeCase) {
      this.state.activeCaseAgeMs += 100;
      if (this.state.activeCase.type === "emergency" && this.state.activeCaseAgeMs >= this.state.emergencyLimitMs) {
        this.state.lives -= 1;
        this.state.streak = 0;
        this.state.lastEvent = "急诊等待过久，损失 1 点耐心";
        this.onToast?.("急诊病例要优先处理。");
        this.state.activeCase = null;
        this.state.activeCaseAgeMs = 0;

        if (this.state.lives <= 0) {
          this.finish(false);
          return;
        }
      }
    }

    if (this.state.timeLeft <= 0) {
      this.finish(this.state.treated >= this.state.targetTreatments);
      return;
    }

    this.emit();
  }

  rotateWeather() {
    const pool = Array.isArray(this.state.weatherPool) ? this.state.weatherPool : [];
    if (!pool.length) {
      return;
    }
    const next = pool[Math.floor(this.random() * pool.length)] || pool[0];
    this.state.weatherId = next.id;
    this.state.weatherName = next.name;
    this.state.weatherRemainingMs = this.state.weatherCycleMs;
    this.state.lastEvent = `天气切换：${next.name}`;
    this.onToast?.(`天气变化：${next.name}`);
  }

  assign(roomId) {
    if (!this.state.isRunning || !this.state.activeCase) {
      return;
    }

    if (roomId === this.state.activeCase.roomId) {
      const type = this.state.activeCase.type || "normal";
      this.state.treated += 1;
      this.state.streak += 1;
      let gained = 8 + Math.min(8, this.state.streak);
      if (type === "emergency") {
        gained += 6;
        this.state.timeLeft = Math.min(99, this.state.timeLeft + 0.8);
      }
      if (type === "vip") {
        gained *= 2;
      }
      this.state.score += gained;
      this.state.bestScore = Math.max(this.state.bestScore, this.state.score);
      const typeText = type === "emergency" ? "（急诊）" : (type === "vip" ? "（VIP）" : "");
      this.state.lastEvent = `安排正确 +${gained} 分${typeText}`;
      this.onToast?.("分诊正确，继续接诊。");
      this.state.activeCase = null;
      this.state.activeCaseAgeMs = 0;

      if (this.state.treated > 0 && this.state.treated % 6 === 0) {
        this.state.timeLeft = Math.min(99, this.state.timeLeft + 1);
        this.state.lastEvent = `${this.state.lastEvent}，奖励 1 秒`;
      }

      if (this.state.treated >= this.state.targetTreatments) {
        this.finish(true);
        return;
      }
    } else {
      const loseLife = this.state.activeCase.type === "vip" ? 2 : 1;
      this.state.lives -= loseLife;
      this.state.streak = 0;
      this.state.lastEvent = `安排错误，损失 ${loseLife} 点耐心`;
      this.onToast?.("分诊错误，请再看清症状。");
      if (this.state.lives <= 0) {
        this.finish(false);
        return;
      }
    }

    this.emit();
  }

  finish(isWin) {
    this.stop();
    this.state.isRunning = false;
    this.state.isWin = isWin;
    this.emit();

    this.onResult?.({
      isWin,
      levelId: this.state.levelId,
      levelName: this.state.levelName,
      treated: this.state.treated,
      targetTreatments: this.state.targetTreatments,
      lives: this.state.lives,
      score: this.state.score,
      bestScore: this.state.bestScore,
      remainTime: Math.max(0, Math.ceil(this.state.timeLeft)),
    });
  }

  emit() {
    this.onStateChange?.({
      ...this.state,
      roomPool: this.state.roomPool.map((item) => ({ ...item })),
      queue: this.state.queue.filter(Boolean).map((item) => ({ ...item })),
      activeCase: this.state.activeCase ? { ...this.state.activeCase } : null,
    });
  }
}
