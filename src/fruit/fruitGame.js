function hashSeed(seedText) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedText) {
  let state = hashSeed(seedText || "fruit-default-seed") || 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class FruitGame {
  constructor({ onStateChange, onResult, onToast }) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.onToast = onToast;
    this.levels = [];
    this.baskets = [];
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
      targetDeliveries: 0,
      delivered: 0,
      lives: 0,
      score: 0,
      streak: 0,
      bestScore: 0,
      basketPool: [],
      activeFruit: null,
      activeFruitAgeMs: 0,
      queue: [],
      spawnMs: 1300,
      weatherCycleMs: 8500,
      weatherRemainingMs: 0,
      weatherId: "sunny",
      weatherName: "晴天",
      weatherPool: [],
      perishableChance: 0,
      goldenChance: 0,
      spoilLimitMs: 2400,
      spawnCooldownMs: 0,
      lastEvent: "等待分拣",
    };
  }

  init(data, bestScore = 0) {
    this.levels = Array.isArray(data?.levels) ? data.levels : [];
    this.baskets = Array.isArray(data?.baskets) ? data.baskets : [];
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
    this.random = createSeededRandom(options.seed || `${Date.now()}|${level.id}|fruit`);

    const basketIds = Array.isArray(level.basketIds) ? level.basketIds : [];
    const basketPool = this.baskets.filter((item) => basketIds.includes(item.id));
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
      targetDeliveries: Number(level.targetDeliveries || 18),
      lives: Number(level.lives || 3),
      spawnMs: Number(level.spawnMs || 1300),
      weatherCycleMs: Number(level.weatherCycleMs || options.weatherCycleMs || 8500),
      weatherRemainingMs: Number(level.weatherCycleMs || options.weatherCycleMs || 8500),
      weatherId: firstWeather.id,
      weatherName: firstWeather.name,
      weatherPool,
      perishableChance: Number(level.perishableChance || 0),
      goldenChance: Number(level.goldenChance || 0),
      spoilLimitMs: Number(level.spoilLimitMs || 2400),
      spawnCooldownMs: 200,
      bestScore: this.state.bestScore,
      basketPool,
      queue: this.createQueue(basketPool, 5),
      lastEvent: "分拣开始，按颜色点对应果篮",
    };

    this.emit();
    this.timerId = window.setInterval(() => this.tick(), 100);
  }

  createQueue(pool, count) {
    const list = [];
    for (let i = 0; i < count; i += 1) {
      list.push(this.createFruit(pool));
    }
    return list;
  }

  createFruit(pool = this.state.basketPool) {
    if (!Array.isArray(pool) || pool.length === 0) {
      return null;
    }
    const index = Math.floor(this.random() * pool.length);
    const basket = pool[index];
    const isGolden = this.random() < this.state.goldenChance;
    const isPerishable = !isGolden && this.random() < this.state.perishableChance;
    return {
      id: `${Date.now()}-${Math.floor(this.random() * 100000)}`,
      basketId: basket.id,
      type: isGolden ? "golden" : (isPerishable ? "perishable" : "normal"),
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

    if (!this.state.activeFruit && this.state.spawnCooldownMs <= 0) {
      this.state.activeFruit = this.state.queue.shift() || this.createFruit();
      this.state.activeFruitAgeMs = 0;
      this.state.queue.push(this.createFruit());
      this.state.spawnCooldownMs = this.state.spawnMs;
    }

    if (this.state.activeFruit) {
      this.state.activeFruitAgeMs += 100;
      if (this.state.activeFruit.type === "perishable" && this.state.activeFruitAgeMs >= this.state.spoilLimitMs) {
        this.state.lives -= 1;
        this.state.streak = 0;
        this.state.lastEvent = "易坏果变软了，损失 1 点生命";
        this.onToast?.("易坏果要优先分拣。");
        this.state.activeFruit = null;
        this.state.activeFruitAgeMs = 0;

        if (this.state.lives <= 0) {
          this.finish(false);
          return;
        }
      }
    }

    if (this.state.timeLeft <= 0) {
      this.finish(this.state.delivered >= this.state.targetDeliveries);
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

  sort(basketId) {
    if (!this.state.isRunning || !this.state.activeFruit) {
      return;
    }

    if (basketId === this.state.activeFruit.basketId) {
      const type = this.state.activeFruit.type || "normal";
      this.state.delivered += 1;
      this.state.streak += 1;
      let gained = 8 + Math.min(8, this.state.streak);
      if (type === "perishable") {
        gained += 6;
        this.state.timeLeft = Math.min(99, this.state.timeLeft + 0.8);
      }
      if (type === "golden") {
        gained *= 2;
      }
      this.state.score += gained;
      this.state.bestScore = Math.max(this.state.bestScore, this.state.score);
      const typeText = type === "perishable" ? "（易坏果）" : (type === "golden" ? "（双倍果）" : "");
      this.state.lastEvent = `分拣成功 +${gained} 分${typeText}`;
      this.onToast?.("分拣正确，继续。");
      this.state.activeFruit = null;
      this.state.activeFruitAgeMs = 0;

      if (this.state.delivered > 0 && this.state.delivered % 6 === 0) {
        this.state.timeLeft = Math.min(99, this.state.timeLeft + 1);
        this.state.lastEvent = `${this.state.lastEvent}，奖励 1 秒`;
      }

      if (this.state.delivered >= this.state.targetDeliveries) {
        this.finish(true);
        return;
      }
    } else {
      const loseLife = this.state.activeFruit.type === "golden" ? 2 : 1;
      this.state.lives -= loseLife;
      this.state.streak = 0;
      this.state.lastEvent = `分拣错误，损失 ${loseLife} 点生命`;
      this.onToast?.("分拣错误，请再看清颜色。");
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
      delivered: this.state.delivered,
      targetDeliveries: this.state.targetDeliveries,
      lives: this.state.lives,
      score: this.state.score,
      bestScore: this.state.bestScore,
      remainTime: Math.max(0, Math.ceil(this.state.timeLeft)),
    });
  }

  emit() {
    this.onStateChange?.({
      ...this.state,
      basketPool: this.state.basketPool.map((item) => ({ ...item })),
      queue: this.state.queue.filter(Boolean).map((item) => ({ ...item })),
      activeFruit: this.state.activeFruit ? { ...this.state.activeFruit } : null,
    });
  }
}
