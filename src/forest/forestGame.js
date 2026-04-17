function hashSeed(seedText) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedText) {
  let state = hashSeed(seedText || "forest-default-seed") || 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ForestGame {
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
      targetFindings: 0,
      found: 0,
      lives: 0,
      score: 0,
      streak: 0,
      bestScore: 0,
      stationPool: [],
      activeClue: null,
      activeClueAgeMs: 0,
      queue: [],
      spawnMs: 1300,
      weatherCycleMs: 8500,
      weatherRemainingMs: 0,
      weatherId: "sunny",
      weatherName: "晴光",
      weatherPool: [],
      urgentChance: 0,
      rareChance: 0,
      urgentLimitMs: 2400,
      spawnCooldownMs: 0,
      lastEvent: "等待巡护",
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
    this.random = createSeededRandom(options.seed || `${Date.now()}|${level.id}|forest`);

    const stationIds = Array.isArray(level.stationIds) ? level.stationIds : [];
    const stationPool = this.stations.filter((item) => stationIds.includes(item.id));
    const weatherPool = Array.isArray(options.weatherPool) && options.weatherPool.length > 0
      ? options.weatherPool
      : [{ id: "sunny", name: "晴光" }, { id: "cloudy", name: "薄云" }, { id: "windy", name: "林风" }];
    const firstWeather = weatherPool[0] || { id: "sunny", name: "晴光" };

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      levelId: level.id,
      levelName: level.name,
      timeLeft: Number(level.timeLimitSec || 80),
      targetFindings: Number(level.targetFindings || 18),
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
      lastEvent: "巡护开始，按线索送到对应观察站",
    };

    this.emit();
    this.timerId = window.setInterval(() => this.tick(), 100);
  }

  createQueue(pool, count) {
    const list = [];
    for (let i = 0; i < count; i += 1) {
      list.push(this.createClue(pool));
    }
    return list;
  }

  createClue(pool = this.state.stationPool) {
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

    if (!this.state.activeClue && this.state.spawnCooldownMs <= 0) {
      this.state.activeClue = this.state.queue.shift() || this.createClue();
      this.state.activeClueAgeMs = 0;
      this.state.queue.push(this.createClue());
      this.state.spawnCooldownMs = this.state.spawnMs;
    }

    if (this.state.activeClue) {
      this.state.activeClueAgeMs += 100;
      if (this.state.activeClue.type === "urgent" && this.state.activeClueAgeMs >= this.state.urgentLimitMs) {
        this.state.lives -= 1;
        this.state.streak = 0;
        this.state.lastEvent = "紧急线索等待过久，损失 1 点体力";
        this.onToast?.("紧急线索需要优先处理。");
        this.state.activeClue = null;
        this.state.activeClueAgeMs = 0;

        if (this.state.lives <= 0) {
          this.finish(false);
          return;
        }
      }
    }

    if (this.state.timeLeft <= 0) {
      this.finish(this.state.found >= this.state.targetFindings);
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

  submit(stationId) {
    if (!this.state.isRunning || !this.state.activeClue) {
      return;
    }

    if (stationId === this.state.activeClue.stationId) {
      const type = this.state.activeClue.type || "normal";
      this.state.found += 1;
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
      const typeText = type === "urgent" ? "（紧急）" : (type === "rare" ? "（稀有）" : "");
      this.state.lastEvent = `识别正确 +${gained} 分${typeText}`;
      this.onToast?.("判断正确，继续巡护。");
      this.state.activeClue = null;
      this.state.activeClueAgeMs = 0;

      if (this.state.found > 0 && this.state.found % 6 === 0) {
        this.state.timeLeft = Math.min(99, this.state.timeLeft + 1);
        this.state.lastEvent = `${this.state.lastEvent}，奖励 1 秒`;
      }

      if (this.state.found >= this.state.targetFindings) {
        this.finish(true);
        return;
      }
    } else {
      const loseLife = this.state.activeClue.type === "rare" ? 2 : 1;
      this.state.lives -= loseLife;
      this.state.streak = 0;
      this.state.lastEvent = `识别错误，损失 ${loseLife} 点体力`;
      this.onToast?.("识别错误，请再看清线索。");
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
      found: this.state.found,
      targetFindings: this.state.targetFindings,
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
      activeClue: this.state.activeClue ? { ...this.state.activeClue } : null,
    });
  }
}
