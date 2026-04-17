function hashSeed(seedText) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedText) {
  let state = hashSeed(seedText || "lighthouse-default-seed") || 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WEATHER_EVENTS = [
  { id: "clear", name: "晴朗", speedFactor: 1, hint: "航道清晰，保持节奏。" },
  { id: "fog", name: "迷雾", speedFactor: 0.9, hint: "迷雾来临，部分信号会被遮挡。" },
  { id: "tailwind", name: "顺风", speedFactor: 1.18, hint: "顺风加速，船速变快。" },
  { id: "headwind", name: "逆风", speedFactor: 0.84, hint: "逆风减速，留意节奏变化。" },
];

export class LighthouseGame {
  constructor({ onStateChange, onResult, onToast }) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.onToast = onToast;
    this.levels = [];
    this.signals = [];
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
      targetBoats: 0,
      solvedBoats: 0,
      lives: 0,
      score: 0,
      streak: 0,
      bestScore: 0,
      beamId: "",
      activeBoat: null,
      queue: [],
      signalPool: [],
      boatTravelMs: 2200,
      spawnMs: 800,
      weatherCycleMs: 9000,
      jammerChance: 0,
      dualChance: 0,
      spawnCooldownMs: 0,
      weatherEvent: WEATHER_EVENTS[0],
      weatherRemainingMs: 0,
      lastEvent: "等待守护",
    };
  }

  init(data, bestScore = 0) {
    this.levels = Array.isArray(data?.levels) ? data.levels : [];
    this.signals = Array.isArray(data?.signals) ? data.signals : [];
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
    this.random = createSeededRandom(options.seed || `${Date.now()}|${level.id}|lighthouse`);

    const signalIds = Array.isArray(level.signalIds) ? level.signalIds : [];
    const signalPool = this.signals.filter((item) => signalIds.includes(item.id));
    const beamId = signalPool[0]?.id || "";

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      levelId: level.id,
      levelName: level.name,
      timeLeft: Number(level.timeLimitSec || 80),
      targetBoats: Number(level.targetBoats || 14),
      lives: Number(level.lives || 3),
      boatTravelMs: Number(level.boatTravelMs || 2200),
      spawnMs: Number(level.spawnMs || 800),
      weatherCycleMs: Number(level.weatherCycleMs || 9000),
      jammerChance: Number(level.jammerChance || 0),
      dualChance: Number(level.dualChance || 0),
      spawnCooldownMs: 200,
      beamId,
      bestScore: this.state.bestScore,
      signalPool,
      queue: this.createInitialQueue(signalPool, 5),
      weatherEvent: WEATHER_EVENTS[0],
      weatherRemainingMs: Number(level.weatherCycleMs || 9000),
      lastEvent: "值守开始，保持灯光匹配来船信号",
    };

    this.emit();
    this.timerId = window.setInterval(() => this.tick(), 100);
  }

  createInitialQueue(pool, count) {
    const list = [];
    for (let i = 0; i < count; i += 1) {
      list.push(this.createBoat(pool));
    }
    return list;
  }

  createBoat(pool = this.state.signalPool) {
    if (!Array.isArray(pool) || pool.length === 0) {
      return null;
    }
    const index = Math.floor(this.random() * pool.length);
    const signal = pool[index];

    const isJammer = this.random() < this.state.jammerChance;
    const isDual = !isJammer && pool.length > 1 && this.random() < this.state.dualChance;

    let acceptedSignalIds = [signal.id];
    let displaySignalId = signal.id;
    let displaySignalIds = [signal.id];

    if (isDual) {
      const candidates = pool.filter((item) => item.id !== signal.id);
      const second = candidates[Math.floor(this.random() * candidates.length)] || signal;
      acceptedSignalIds = [signal.id, second.id];
      displaySignalIds = [...acceptedSignalIds];
    }

    if (isJammer) {
      const candidates = pool.filter((item) => item.id !== signal.id);
      const fake = candidates[Math.floor(this.random() * candidates.length)] || signal;
      displaySignalId = fake.id;
      displaySignalIds = [fake.id];
    }

    return {
      id: `${Date.now()}-${Math.floor(this.random() * 100000)}`,
      signalId: signal.id,
      acceptedSignalIds,
      displaySignalId,
      displaySignalIds,
      isJammer,
      isDual,
      progressMs: 0,
    };
  }

  rollWeatherEvent() {
    const index = Math.floor(this.random() * WEATHER_EVENTS.length);
    return WEATHER_EVENTS[index] || WEATHER_EVENTS[0];
  }

  applyNewWeatherEvent() {
    const event = this.rollWeatherEvent();
    this.state.weatherEvent = event;
    this.state.weatherRemainingMs = this.state.weatherCycleMs;
    this.state.lastEvent = `天气变化：${event.name}`;
    this.onToast?.(event.hint);
  }

  setBeam(beamId) {
    if (!this.state.isRunning) {
      return;
    }
    this.state.beamId = beamId;
    this.state.lastEvent = "已切换灯光";
    this.emit();
  }

  tick() {
    if (!this.state.isRunning) {
      return;
    }

    this.state.timeLeft = Math.max(0, this.state.timeLeft - 0.1);
    this.state.spawnCooldownMs -= 100;
    this.state.weatherRemainingMs -= 100;

    if (this.state.weatherRemainingMs <= 0) {
      this.applyNewWeatherEvent();
    }

    if (!this.state.activeBoat && this.state.spawnCooldownMs <= 0) {
      this.spawnNextBoat();
      this.state.spawnCooldownMs = this.state.spawnMs;
    }

    if (this.state.activeBoat) {
      const speed = Number(this.state.weatherEvent?.speedFactor || 1);
      this.state.activeBoat.progressMs += 100 * speed;
      if (this.state.activeBoat.progressMs >= this.state.boatTravelMs) {
        this.resolveBoat();
      }
    }

    if (this.state.timeLeft <= 0) {
      this.finish(this.state.solvedBoats >= this.state.targetBoats);
      return;
    }

    this.emit();
  }

  spawnNextBoat() {
    const nextBoat = this.state.queue.shift() || this.createBoat();
    if (!nextBoat) {
      return;
    }
    nextBoat.progressMs = 0;
    this.state.activeBoat = nextBoat;
    this.state.queue.push(this.createBoat());
  }

  resolveBoat() {
    const boat = this.state.activeBoat;
    if (!boat) {
      return;
    }

    const accepted = Array.isArray(boat.acceptedSignalIds) && boat.acceptedSignalIds.length > 0
      ? boat.acceptedSignalIds
      : [boat.signalId];

    if (accepted.includes(this.state.beamId)) {
      this.state.solvedBoats += 1;
      this.state.streak += 1;
      const gained = 10 + Math.min(8, this.state.streak);
      this.state.score += gained;
      this.state.bestScore = Math.max(this.state.bestScore, this.state.score);
      const typeText = boat.isJammer ? "（识破干扰）" : (boat.isDual ? "（双信号）" : "");
      this.state.lastEvent = `护送成功 +${gained} 分${typeText}`;
      this.onToast?.("护送成功，继续保持。");

      if (this.state.solvedBoats >= this.state.targetBoats) {
        this.finish(true);
        return;
      }
    } else {
      this.state.lives -= 1;
      this.state.streak = 0;
      this.state.lastEvent = "信号不匹配，船只偏航";
      this.onToast?.("偏航了，快调整灯光。");

      if (this.state.lives <= 0) {
        this.finish(false);
        return;
      }
    }

    this.state.activeBoat = null;
  }

  finish(isWin) {
    this.stop();
    this.state.isRunning = false;
    this.state.isWin = isWin;
    this.state.activeBoat = null;
    this.emit();

    this.onResult?.({
      isWin,
      levelId: this.state.levelId,
      levelName: this.state.levelName,
      solvedBoats: this.state.solvedBoats,
      targetBoats: this.state.targetBoats,
      lives: this.state.lives,
      score: this.state.score,
      bestScore: this.state.bestScore,
      weatherName: this.state.weatherEvent?.name || "晴朗",
      remainTime: Math.max(0, Math.ceil(this.state.timeLeft)),
    });
  }

  emit() {
    const travel = Math.max(1, this.state.boatTravelMs);
    this.onStateChange?.({
      ...this.state,
      signalPool: this.state.signalPool.map((item) => ({ ...item })),
      queue: this.state.queue.filter(Boolean).map((item) => ({ ...item })),
      activeBoat: this.state.activeBoat ? { ...this.state.activeBoat } : null,
      activeProgressPct: this.state.activeBoat ? Math.min(100, (this.state.activeBoat.progressMs / travel) * 100) : 0,
    });
  }
}
