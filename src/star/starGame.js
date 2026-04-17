function hashSeed(seedText) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedText) {
  let state = hashSeed(seedText || "star-default-seed") || 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class StarGame {
  constructor({ onStateChange, onResult, onToast }) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.onToast = onToast;
    this.levels = [];
    this.stations = [];
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
      targetSignals: 0,
      scanned: 0,
      lives: 0,
      score: 0,
      streak: 0,
      bestScore: 0,
      stationPool: [],
      activeSignal: null,
      activeSignalAgeMs: 0,
      queue: [],
      spawnMs: 1300,
      weatherCycleMs: 8500,
      weatherRemainingMs: 0,
      weatherId: "clear",
      weatherName: "晴夜",
      weatherPool: [],
      urgentChance: 0,
      rareChance: 0,
      urgentLimitMs: 2400,
      spawnCooldownMs: 0,
      lastEvent: "等待观测",
    };
  }

  init(data, bestScore = 0) {
    this.levels = Array.isArray(data?.levels) ? data.levels : [];
    this.stations = Array.isArray(data?.stations) ? data.stations : [];
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
    this.random = createSeededRandom(options.seed || `${Date.now()}|${level.id}|star`);

    const stationIds = Array.isArray(level.stationIds) ? level.stationIds : [];
    const stationPool = this.stations.filter((item) => stationIds.includes(item.id));
    const weatherPool = Array.isArray(options.weatherPool) && options.weatherPool.length > 0
      ? options.weatherPool
      : [{ id: "clear", name: "晴夜" }, { id: "cloudy", name: "薄云" }, { id: "aurora", name: "极光" }];
    const firstWeather = weatherPool[0] || { id: "clear", name: "晴夜" };

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      levelId: level.id,
      levelName: level.name,
      timeLeft: Number(level.timeLimitSec || 80),
      targetSignals: Number(level.targetSignals || 18),
      lives: Number(level.lives || 3),
      spawnMs: Number(level.spawnMs || 1300),
      weatherCycleMs: Number(level.weatherCycleMs || options.weatherCycleMs || 8500),
      weatherRemainingMs: Number(level.weatherCycleMs || options.weatherCycleMs || 8500),
      weatherId: firstWeather.id,
      weatherName: firstWeather.name,
      weatherPool,
      urgentChance: Number(level.urgentChance || 0),
      rareChance: Number(level.rareChance || 0),
      urgentLimitMs: Number(level.urgentLimitMs || 2400),
      spawnCooldownMs: 200,
      bestScore: this.state.bestScore,
      stationPool,
      queue: this.createQueue(stationPool, 5),
      lastEvent: "观测开始，按星图线索送到对应观测台",
    };

    this.emit();
    this.timerId = window.setInterval(() => this.tick(), 100);
  }

  createQueue(pool, count) {
    const list = [];
    for (let i = 0; i < count; i += 1) {
      list.push(this.createSignal(pool));
    }
    return list;
  }

  createSignal(pool = this.state.stationPool) {
    if (!Array.isArray(pool) || pool.length === 0) {
      return null;
    }
    const index = Math.floor(this.random() * pool.length);
    const station = pool[index];
    const isRare = this.random() < this.state.rareChance;
    const isUrgent = !isRare && this.random() < this.state.urgentChance;
    return {
      id: `${Date.now()}-${Math.floor(this.random() * 100000)}`,
      stationId: station.id,
      type: isRare ? "rare" : (isUrgent ? "urgent" : "normal"),
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

    if (!this.state.activeSignal && this.state.spawnCooldownMs <= 0) {
      this.state.activeSignal = this.state.queue.shift() || this.createSignal();
      this.state.activeSignalAgeMs = 0;
      this.state.queue.push(this.createSignal());
      this.state.spawnCooldownMs = this.state.spawnMs;
    }

    if (this.state.activeSignal) {
      this.state.activeSignalAgeMs += 100;
      if (this.state.activeSignal.type === "urgent" && this.state.activeSignalAgeMs >= this.state.urgentLimitMs) {
        this.state.lives -= 1;
        this.state.streak = 0;
        this.state.lastEvent = "限时信号等待过久，损失 1 点精力";
        this.onToast?.("限时信号需要优先记录。");
        this.state.activeSignal = null;
        this.state.activeSignalAgeMs = 0;

        if (this.state.lives <= 0) {
          this.finish(false);
          return;
        }
      }
    }

    if (this.state.timeLeft <= 0) {
      this.finish(this.state.scanned >= this.state.targetSignals);
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
    this.state.lastEvent = `天空变化：${next.name}`;
    this.onToast?.(`天空变化：${next.name}`);
  }

  submit(stationId) {
    if (!this.state.isRunning || !this.state.activeSignal) {
      return;
    }

    if (stationId === this.state.activeSignal.stationId) {
      const type = this.state.activeSignal.type || "normal";
      this.state.scanned += 1;
      this.state.streak += 1;
      let gained = 8 + Math.min(8, this.state.streak);
      if (type === "urgent") {
        gained += 6;
        this.state.timeLeft = Math.min(99, this.state.timeLeft + 0.8);
      }
      if (type === "rare") {
        gained *= 2;
      }
      this.state.score += gained;
      this.state.bestScore = Math.max(this.state.bestScore, this.state.score);
      const typeText = type === "urgent" ? "（限时）" : (type === "rare" ? "（稀有）" : "");
      this.state.lastEvent = `观测正确 +${gained} 分${typeText}`;
      this.onToast?.("记录正确，继续观测。");
      this.state.activeSignal = null;
      this.state.activeSignalAgeMs = 0;

      if (this.state.scanned > 0 && this.state.scanned % 6 === 0) {
        this.state.timeLeft = Math.min(99, this.state.timeLeft + 1);
        this.state.lastEvent = `${this.state.lastEvent}，奖励 1 秒`;
      }

      if (this.state.scanned >= this.state.targetSignals) {
        this.finish(true);
        return;
      }
    } else {
      const loseLife = this.state.activeSignal.type === "rare" ? 2 : 1;
      this.state.lives -= loseLife;
      this.state.streak = 0;
      this.state.lastEvent = `观测错误，损失 ${loseLife} 点精力`;
      this.onToast?.("观测错误，请再看清星图线索。");
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
      scanned: this.state.scanned,
      targetSignals: this.state.targetSignals,
      lives: this.state.lives,
      score: this.state.score,
      bestScore: this.state.bestScore,
      remainTime: Math.max(0, Math.ceil(this.state.timeLeft)),
    });
  }

  emit() {
    this.onStateChange?.({
      ...this.state,
      stationPool: this.state.stationPool.map((item) => ({ ...item })),
      queue: this.state.queue.filter(Boolean).map((item) => ({ ...item })),
      activeSignal: this.state.activeSignal ? { ...this.state.activeSignal } : null,
    });
  }
}