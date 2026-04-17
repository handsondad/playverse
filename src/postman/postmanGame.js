function hashSeed(seedText) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedText) {
  let state = hashSeed(seedText || "postman-default-seed") || 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class PostmanGame {
  constructor({ onStateChange, onResult, onToast }) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.onToast = onToast;
    this.levels = [];
    this.mailboxes = [];
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
      mailboxPool: [],
      activeMail: null,
      activeMailAgeMs: 0,
      queue: [],
      spawnMs: 1300,
      weatherCycleMs: 8500,
      weatherRemainingMs: 0,
      weatherId: "sunny",
      weatherName: "晴天",
      weatherPool: [],
      expressChance: 0,
      registeredChance: 0,
      expressLimitMs: 2300,
      spawnCooldownMs: 0,
      lastEvent: "等待送信",
    };
  }

  init(data, bestScore = 0) {
    this.levels = Array.isArray(data?.levels) ? data.levels : [];
    this.mailboxes = Array.isArray(data?.mailboxes) ? data.mailboxes : [];
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
    this.random = createSeededRandom(options.seed || `${Date.now()}|${level.id}|postman`);

    const mailboxIds = Array.isArray(level.mailboxIds) ? level.mailboxIds : [];
    const mailboxPool = this.mailboxes.filter((item) => mailboxIds.includes(item.id));

    const weatherPool = Array.isArray(options.weatherPool) && options.weatherPool.length > 0
      ? options.weatherPool
      : [{ id: "sunny", name: "晴天" }, { id: "cloudy", name: "多云" }, { id: "rainy", name: "小雨" }];
    const firstWeather = weatherPool[0] || { id: "sunny", name: "晴天" };

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      levelId: level.id,
      levelName: level.name,
      timeLeft: Number(level.timeLimitSec || 80),
      targetDeliveries: Number(level.targetDeliveries || 16),
      lives: Number(level.lives || 3),
      spawnMs: Number(level.spawnMs || 1300),
      weatherCycleMs: Number(level.weatherCycleMs || options.weatherCycleMs || 8500),
      weatherRemainingMs: Number(level.weatherCycleMs || options.weatherCycleMs || 8500),
      weatherId: firstWeather.id,
      weatherName: firstWeather.name,
      weatherPool,
      expressChance: Number(level.expressChance || 0),
      registeredChance: Number(level.registeredChance || 0),
      expressLimitMs: Number(level.expressLimitMs || 2300),
      spawnCooldownMs: 200,
      bestScore: this.state.bestScore,
      mailboxPool,
      queue: this.createQueue(mailboxPool, 5),
      lastEvent: "送信开始，按颜色投递",
    };

    this.emit();
    this.timerId = window.setInterval(() => this.tick(), 100);
  }

  createQueue(pool, count) {
    const list = [];
    for (let i = 0; i < count; i += 1) {
      list.push(this.createMail(pool));
    }
    return list;
  }

  createMail(pool = this.state.mailboxPool) {
    if (!Array.isArray(pool) || pool.length === 0) {
      return null;
    }
    const index = Math.floor(this.random() * pool.length);
    const mailbox = pool[index];
    const isRegistered = this.random() < this.state.registeredChance;
    const isExpress = !isRegistered && this.random() < this.state.expressChance;
    const type = isRegistered ? "registered" : (isExpress ? "express" : "normal");
    return {
      id: `${Date.now()}-${Math.floor(this.random() * 100000)}`,
      mailboxId: mailbox.id,
      type,
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

    if (!this.state.activeMail && this.state.spawnCooldownMs <= 0) {
      this.state.activeMail = this.state.queue.shift() || this.createMail();
      this.state.activeMailAgeMs = 0;
      this.state.queue.push(this.createMail());
      this.state.spawnCooldownMs = this.state.spawnMs;
    }

    if (this.state.activeMail) {
      this.state.activeMailAgeMs += 100;
      if (this.state.activeMail.type === "express" && this.state.activeMailAgeMs >= this.state.expressLimitMs) {
        this.state.lives -= 1;
        this.state.streak = 0;
        this.state.lastEvent = "加急件超时，损失 1 点生命";
        this.onToast?.("加急件超时啦，注意优先处理。");
        this.state.activeMail = null;
        this.state.activeMailAgeMs = 0;

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

  deliver(mailboxId) {
    if (!this.state.isRunning || !this.state.activeMail) {
      return;
    }

    if (mailboxId === this.state.activeMail.mailboxId) {
      const type = this.state.activeMail.type || "normal";
      const deliveredCount = type === "registered" ? 2 : 1;
      this.state.delivered += deliveredCount;
      this.state.streak += 1;
      let gained = 8 + Math.min(8, this.state.streak);
      if (type === "express") {
        gained += 6;
        this.state.timeLeft = Math.min(99, this.state.timeLeft + 1.2);
      }
      if (type === "registered") {
        gained += 10;
      }
      this.state.score += gained;
      this.state.bestScore = Math.max(this.state.bestScore, this.state.score);
      const typeText = type === "express" ? "（加急）" : (type === "registered" ? "（挂号）" : "");
      this.state.lastEvent = `投递成功 +${gained} 分${typeText}`;
      this.onToast?.("投递成功，继续。");
      this.state.activeMail = null;
      this.state.activeMailAgeMs = 0;

      if (this.state.delivered >= this.state.targetDeliveries) {
        this.finish(true);
        return;
      }
    } else {
      const loseLife = this.state.activeMail.type === "registered" ? 2 : 1;
      this.state.lives -= loseLife;
      this.state.streak = 0;
      this.state.lastEvent = `投错信箱，损失 ${loseLife} 点生命`;
      this.onToast?.("投错了，请看清颜色。");

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
      mailboxPool: this.state.mailboxPool.map((item) => ({ ...item })),
      queue: this.state.queue.filter(Boolean).map((item) => ({ ...item })),
      activeMail: this.state.activeMail ? { ...this.state.activeMail } : null,
    });
  }
}
