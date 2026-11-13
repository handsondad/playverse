import { createSeededRandom } from "../shared/random.js";

export class CupsGame {
  constructor({ onStateChange, onResult } = {}) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.levels = [];
    this.treasures = [];
    this.bestScore = 0;
    this.random = Math.random;
    this.state = this.createIdleState();
  }

  createIdleState() {
    return {
      isRunning: false,
      phase: "idle",
      levelId: "",
      levelName: "",
      modeName: "魔术闯关",
      seed: "",
      roundIndex: 0,
      targetRounds: 0,
      lives: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      hintsLeft: 0,
      bestScore: this.bestScore || 0,
      swapMs: 500,
      cupCount: 3,
      cups: [],
      treasure: { id: "star", name: "小金星", icon: "🌟" },
      targetCupId: "",
      swapQueue: [],
      lastFeedback: "选好难度，点开始看魔术师藏星星吧。",
    };
  }

  init(data, bestScore = 0) {
    this.levels = Array.isArray(data?.levels) ? data.levels : [];
    this.treasures = Array.isArray(data?.treasures) ? data.treasures : [];
    this.bestScore = Number(bestScore || 0);
    this.state = this.createIdleState();
    this.emit();
  }

  start(levelId, options = {}) {
    const level = this.levels.find((item) => item.id === levelId) || this.levels[0];
    if (!level) {
      return;
    }

    const seed = options.seed || `${Date.now()}|cups|${level.id}`;
    this.random = createSeededRandom(seed);
    this.currentLevel = level;

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      levelId: level.id,
      levelName: level.name,
      modeName: options.modeName || "魔术闯关",
      seed,
      targetRounds: level.targetRounds,
      lives: level.lives,
      hintsLeft: Number(level.hints ?? 2),
      bestScore: this.bestScore,
      swapMs: level.swapMs,
      cupCount: level.cupCount,
    };

    this.prepareRound();
  }

  prepareRound() {
    const count = this.currentLevel.cupCount;
    const treasure = this.treasures[Math.floor(this.random() * this.treasures.length)]
      || { id: "star", name: "小金星", icon: "🌟" };
    const targetIndex = Math.floor(this.random() * count);
    const targetCupId = `cup-${targetIndex}`;

    const cups = Array.from({ length: count }, (_, idx) => ({
      id: `cup-${idx}`,
      label: `${idx + 1}号杯`,
      slot: idx,
      hasTreasure: idx === targetIndex,
      lifted: idx === targetIndex,
      wiggle: false,
    }));

    const swapQueue = [];
    let lastPair = "";
    for (let i = 0; i < this.currentLevel.swapCount; i += 1) {
      let a = 0;
      let b = 1;
      for (let tries = 0; tries < 10; tries += 1) {
        a = Math.floor(this.random() * count);
        b = Math.floor(this.random() * count);
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (a !== b && key !== lastPair) {
          lastPair = key;
          break;
        }
      }
      if (a === b) {
        b = (a + 1) % count;
      }
      swapQueue.push([a, b]);
    }

    this.state.cups = cups;
    this.state.treasure = treasure;
    this.state.targetCupId = targetCupId;
    this.state.swapQueue = swapQueue;
    this.state.phase = "peek";
    this.state.lastFeedback = `看清楚啦！${treasure.name}藏进了这只杯子，马上开始交换！`;
    this.emit();
  }

  beginShuffle() {
    if (!this.state.isRunning || this.state.phase !== "peek") {
      return false;
    }
    this.state.cups = this.state.cups.map((cup) => ({ ...cup, lifted: false, wiggle: false }));
    this.state.phase = "shuffling";
    this.state.lastFeedback = "杯子正在交换位置，眼睛盯紧别眨眼哦！";
    this.emit();
    return true;
  }

  stepSwap() {
    if (!this.state.isRunning || this.state.phase !== "shuffling") {
      return { done: true };
    }
    if (this.state.swapQueue.length === 0) {
      this.state.phase = "guessing";
      this.state.lastFeedback = `停！猜猜看，${this.state.treasure.name}现在在哪只杯子下面？`;
      this.emit();
      return { done: true };
    }

    const [slotA, slotB] = this.state.swapQueue.shift();
    this.state.cups = this.state.cups.map((cup) => {
      if (cup.slot === slotA) {
        return { ...cup, slot: slotB };
      }
      if (cup.slot === slotB) {
        return { ...cup, slot: slotA };
      }
      return cup;
    });
    this.emit();
    return { done: false };
  }

  useHint() {
    if (!this.state.isRunning || this.state.phase !== "guessing" || this.state.hintsLeft <= 0) {
      return "";
    }
    const emptyClosed = this.state.cups.filter((cup) => !cup.hasTreasure && !cup.lifted);
    if (emptyClosed.length === 0) {
      return "";
    }
    this.state.hintsLeft -= 1;
    const opened = emptyClosed[Math.floor(this.random() * emptyClosed.length)];
    this.state.cups = this.state.cups.map((cup) => (
      cup.id === opened.id ? { ...cup, lifted: true } : cup
    ));
    const text = "提示：帮你掀开了一只空杯子，剩下的杯子里就有答案！";
    this.state.lastFeedback = text;
    this.emit();
    return text;
  }

  guess(cupId) {
    if (!this.state.isRunning || this.state.phase !== "guessing") {
      return { ok: false };
    }
    const cup = this.state.cups.find((item) => item.id === cupId);
    if (!cup || cup.lifted) {
      return { ok: false };
    }

    if (!cup.hasTreasure) {
      this.state.lives = Math.max(0, this.state.lives - 1);
      this.state.streak = 0;
      this.state.cups = this.state.cups.map((item) => (
        item.id === cupId ? { ...item, lifted: true } : item
      ));

      if (this.state.lives <= 0) {
        this.state.cups = this.state.cups.map((item) => (
          item.hasTreasure ? { ...item, lifted: true } : item
        ));
        this.finish(false);
        return { ok: false, correct: false, lost: true };
      }

      this.state.lastFeedback = "这只杯子是空的，再猜猜剩下的杯子吧！";
      this.emit();
      return { ok: false, correct: false, lost: false };
    }

    this.state.phase = "roundWin";
    this.state.streak += 1;
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak);
    this.state.score += 20 + Math.min(12, this.state.streak * 3);
    this.state.roundIndex += 1;
    this.state.cups = this.state.cups.map((item) => (
      item.id === cupId ? { ...item, lifted: true } : item
    ));
    this.state.lastFeedback = `找对啦！${this.state.treasure.name}果然藏在这里！`;

    if (this.state.score > this.bestScore) {
      this.bestScore = this.state.score;
      this.state.bestScore = this.bestScore;
    }

    this.emit();
    return {
      ok: true,
      correct: true,
      finished: this.state.roundIndex >= this.state.targetRounds,
    };
  }

  nextRound() {
    if (!this.state.isRunning) {
      return;
    }
    if (this.state.roundIndex >= this.state.targetRounds) {
      this.finish(true);
      return;
    }
    this.prepareRound();
  }

  finish(isWin) {
    this.state.isRunning = false;
    this.state.phase = "finished";
    this.emit();
    this.onResult?.({
      isWin,
      levelName: this.state.levelName,
      modeName: this.state.modeName,
      roundsDone: this.state.roundIndex,
      targetRounds: this.state.targetRounds,
      lives: this.state.lives,
      score: this.state.score,
      bestScore: this.bestScore,
      bestStreak: this.state.bestStreak,
    });
  }

  emit() {
    this.onStateChange?.({
      ...this.state,
      cups: this.state.cups.map((c) => ({ ...c })),
      treasure: { ...this.state.treasure },
    });
  }
}
