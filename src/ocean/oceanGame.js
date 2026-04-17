function hashSeed(seedText) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedText) {
  let state = hashSeed(seedText || "ocean-default-seed") || 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class OceanGame {
  constructor({ onStateChange, onResult, onToast }) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.onToast = onToast;
    this.levels = [];
    this.nets = [];
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
      targetCleanups: 0,
      cleaned: 0,
      lives: 0,
      score: 0,
      streak: 0,
      bestScore: 0,
      netPool: [],
      activeTrash: null,
      activeTrashAgeMs: 0,
      queue: [],
      spawnMs: 1300,
      weatherCycleMs: 8500,
      weatherRemainingMs: 0,
      weatherId: "sunny",
      weatherName: "晴海",
      weatherPool: [],
      hazardChance: 0,
      treasureChance: 0,
      hazardLimitMs: 2400,
      spawnCooldownMs: 0,
      lastEvent: "等待清理",
    };
  }

  init(data, bestScore = 0) {
    this.levels = Array.isArray(data?.levels) ? data.levels : [];
    this.nets = Array.isArray(data?.nets) ? data.nets : [];
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
    this.random = createSeededRandom(options.seed || `${Date.now()}|${level.id}|ocean`);

    const netIds = Array.isArray(level.netIds) ? level.netIds : [];
    const netPool = this.nets.filter((item) => netIds.includes(item.id));
    const weatherPool = Array.isArray(options.weatherPool) && options.weatherPool.length > 0
      ? options.weatherPool
      : [{ id: "sunny", name: "晴海" }, { id: "cloudy", name: "薄云" }, { id: "windy", name: "海风" }];
    const firstWeather = weatherPool[0] || { id: "sunny", name: "晴海" };

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      levelId: level.id,
      levelName: level.name,
      timeLeft: Number(level.timeLimitSec || 80),
      targetCleanups: Number(level.targetCleanups || 18),
      lives: Number(level.lives || 3),
      spawnMs: Number(level.spawnMs || 1300),
      weatherCycleMs: Number(level.weatherCycleMs || options.weatherCycleMs || 8500),
      weatherRemainingMs: Number(level.weatherCycleMs || options.weatherCycleMs || 8500),
      weatherId: firstWeather.id,
      weatherName: firstWeather.name,
      weatherPool,
      hazardChance: Number(level.hazardChance || 0),
      treasureChance: Number(level.treasureChance || 0),
      hazardLimitMs: Number(level.hazardLimitMs || 2400),
      spawnCooldownMs: 200,
      bestScore: this.state.bestScore,
      netPool,
      queue: this.createQueue(netPool, 5),
      lastEvent: "清理开始，按类型拖入对应回收网",
    };

    this.emit();
    this.timerId = window.setInterval(() => this.tick(), 100);
  }

  createQueue(pool, count) {
    const list = [];
    for (let i = 0; i < count; i += 1) {
      list.push(this.createTrash(pool));
    }
    return list;
  }

  createTrash(pool = this.state.netPool) {
    if (!Array.isArray(pool) || pool.length === 0) {
      return null;
    }
    const index = Math.floor(this.random() * pool.length);
    const net = pool[index];
    const isTreasure = this.random() < this.state.treasureChance;
    const isHazard = !isTreasure && this.random() < this.state.hazardChance;
    return {
      id: `${Date.now()}-${Math.floor(this.random() * 100000)}`,
      netId: net.id,
      type: isTreasure ? "treasure" : (isHazard ? "hazard" : "normal"),
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

    if (!this.state.activeTrash && this.state.spawnCooldownMs <= 0) {
      this.state.activeTrash = this.state.queue.shift() || this.createTrash();
      this.state.activeTrashAgeMs = 0;
      this.state.queue.push(this.createTrash());
      this.state.spawnCooldownMs = this.state.spawnMs;
    }

    if (this.state.activeTrash) {
      this.state.activeTrashAgeMs += 100;
      if (this.state.activeTrash.type === "hazard" && this.state.activeTrashAgeMs >= this.state.hazardLimitMs) {
        this.state.lives -= 1;
        this.state.streak = 0;
        this.state.lastEvent = "危险漂浮物扩散，损失 1 点生命";
        this.onToast?.("危险漂浮物要优先清理。");
        this.state.activeTrash = null;
        this.state.activeTrashAgeMs = 0;

        if (this.state.lives <= 0) {
          this.finish(false);
          return;
        }
      }
    }

    if (this.state.timeLeft <= 0) {
      this.finish(this.state.cleaned >= this.state.targetCleanups);
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
    this.state.lastEvent = `海况切换：${next.name}`;
    this.onToast?.(`海况变化：${next.name}`);
  }

  cleanup(netId) {
    if (!this.state.isRunning || !this.state.activeTrash) {
      return;
    }

    if (netId === this.state.activeTrash.netId) {
      const type = this.state.activeTrash.type || "normal";
      this.state.cleaned += 1;
      this.state.streak += 1;
      let gained = 8 + Math.min(8, this.state.streak);
      if (type === "hazard") {
        gained += 6;
        this.state.timeLeft = Math.min(99, this.state.timeLeft + 0.8);
      }
      if (type === "treasure") {
        gained *= 2;
      }
      this.state.score += gained;
      this.state.bestScore = Math.max(this.state.bestScore, this.state.score);
      const typeText = type === "hazard" ? "（危险品）" : (type === "treasure" ? "（宝藏件）" : "");
      this.state.lastEvent = `清理成功 +${gained} 分${typeText}`;
      this.onToast?.("分类正确，继续清理。");
      this.state.activeTrash = null;
      this.state.activeTrashAgeMs = 0;

      if (this.state.cleaned > 0 && this.state.cleaned % 6 === 0) {
        this.state.timeLeft = Math.min(99, this.state.timeLeft + 1);
        this.state.lastEvent = `${this.state.lastEvent}，奖励 1 秒`;
      }

      if (this.state.cleaned >= this.state.targetCleanups) {
        this.finish(true);
        return;
      }
    } else {
      const loseLife = this.state.activeTrash.type === "treasure" ? 2 : 1;
      this.state.lives -= loseLife;
      this.state.streak = 0;
      this.state.lastEvent = `分类错误，损失 ${loseLife} 点生命`;
      this.onToast?.("分类错误，请再看清类型。");
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
      cleaned: this.state.cleaned,
      targetCleanups: this.state.targetCleanups,
      lives: this.state.lives,
      score: this.state.score,
      bestScore: this.state.bestScore,
      remainTime: Math.max(0, Math.ceil(this.state.timeLeft)),
    });
  }

  emit() {
    this.onStateChange?.({
      ...this.state,
      netPool: this.state.netPool.map((item) => ({ ...item })),
      queue: this.state.queue.filter(Boolean).map((item) => ({ ...item })),
      activeTrash: this.state.activeTrash ? { ...this.state.activeTrash } : null,
    });
  }
}
