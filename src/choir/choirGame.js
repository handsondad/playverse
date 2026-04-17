function hashSeed(seedText) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedText) {
  let state = hashSeed(seedText || "choir-default-seed") || 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ChoirGame {
  constructor({ onStateChange, onResult, onToast, onReward }) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.onToast = onToast;
    this.onReward = onReward;
    this.levels = [];
    this.animals = [];
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
      round: 0,
      targetRounds: 0,
      sequence: [],
      inputIndex: 0,
      streak: 0,
      bestStreak: 0,
      phase: "idle",
      canInput: false,
      activeAnimalId: "",
      hintCount: 0,
      roundHintCount: 0,
      roundHadMistake: false,
      perfectRounds: 0,
      perfectCombo: 0,
      bestPerfectCombo: 0,
      activeStepIndex: -1,
      lastEvent: "准备开始",
      animalsInPlay: [],
      maxTimeCap: 0,
    };
  }

  init(data, bestStreak = 0) {
    this.levels = Array.isArray(data?.levels) ? data.levels : [];
    this.animals = Array.isArray(data?.animals) ? data.animals : [];
    this.state = {
      ...this.createIdleState(),
      bestStreak: Number(bestStreak || 0),
    };
    this.emit();
  }

  stopTimer() {
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

    this.stopTimer();
    this.random = createSeededRandom(options.seed || `${Date.now()}|${level.id}|choir`);

    const animalIds = Array.isArray(level.animalIds) ? level.animalIds : [];
    const animalsInPlay = this.animals.filter((item) => animalIds.includes(item.id));

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      levelId: level.id,
      levelName: level.name,
      timeLeft: Number(level.timeLimitSec || 80),
      targetRounds: Number(level.targetRounds || 5),
      bestStreak: this.state.bestStreak,
      animalsInPlay,
      maxTimeCap: Number(level.timeLimitSec || 80) + 25,
      lastEvent: "认真听第一轮合唱",
    };

    this.beginNextRound();
    this.emit();

    this.timerId = window.setInterval(() => this.tick(), 100);
  }

  tick() {
    if (!this.state.isRunning) {
      return;
    }
    this.state.timeLeft = Math.max(0, this.state.timeLeft - 0.1);
    if (this.state.timeLeft <= 0) {
      this.finish(false);
      return;
    }
    this.emit();
  }

  pickAnimalId() {
    if (!this.state.animalsInPlay.length) {
      return "";
    }
    const index = Math.floor(this.random() * this.state.animalsInPlay.length);
    return this.state.animalsInPlay[index]?.id || "";
  }

  beginNextRound() {
    const nextId = this.pickAnimalId();
    if (!nextId) {
      return;
    }
    this.state.sequence = [...this.state.sequence, nextId];
    this.state.round = this.state.sequence.length;
    this.state.inputIndex = 0;
    this.state.phase = "watch";
    this.state.canInput = false;
    this.state.activeAnimalId = "";
    this.state.activeStepIndex = -1;
    this.state.roundHintCount = 0;
    this.state.roundHadMistake = false;
    this.state.lastEvent = `第 ${this.state.round} 轮，先听后唱`;
  }

  setWatchDone() {
    if (!this.state.isRunning || this.state.phase !== "watch") {
      return;
    }
    this.state.phase = "input";
    this.state.canInput = true;
    this.state.activeAnimalId = "";
    this.state.activeStepIndex = -1;
    this.state.lastEvent = "轮到你跟唱了";
    this.emit();
  }

  setActiveAnimal(animalId, stepIndex = -1) {
    if (!this.state.isRunning) {
      return;
    }
    this.state.activeAnimalId = animalId;
    this.state.activeStepIndex = stepIndex;
    this.emit();
  }

  inputAnimal(animalId) {
    if (!this.state.isRunning || !this.state.canInput || this.state.phase !== "input") {
      return;
    }

    const expected = this.state.sequence[this.state.inputIndex];
    if (animalId === expected) {
      this.state.inputIndex += 1;
      this.state.streak += 1;
      this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak);
      this.state.lastEvent = "节奏正确，继续";

      if (this.state.inputIndex >= this.state.sequence.length) {
        const isPerfectRound = !this.state.roundHadMistake && this.state.roundHintCount === 0;
        if (isPerfectRound) {
          this.state.perfectRounds += 1;
          this.state.perfectCombo += 1;
          this.state.bestPerfectCombo = Math.max(this.state.bestPerfectCombo, this.state.perfectCombo);

          const rewardSec = this.state.perfectCombo >= 3 ? 2 : 1;
          this.state.timeLeft = Math.min(this.state.maxTimeCap, this.state.timeLeft + rewardSec);
          this.state.lastEvent = `完美回合，奖励 +${rewardSec} 秒`;
          this.onReward?.({
            rewardSec,
            perfectCombo: this.state.perfectCombo,
            perfectRounds: this.state.perfectRounds,
            animalId,
          });
        } else {
          this.state.perfectCombo = 0;
        }

        if (this.state.round >= this.state.targetRounds) {
          this.finish(true);
          return;
        }
        this.beginNextRound();
      }
      this.emit();
      return;
    }

    this.state.streak = 0;
    this.state.inputIndex = 0;
    this.state.roundHadMistake = true;
    this.state.timeLeft = Math.max(0, this.state.timeLeft - 3);
    this.state.lastEvent = "顺序错啦，重新试这一轮";
    if (this.onToast) {
      this.onToast("顺序错了，听清楚再跟唱。");
    }
    this.emit();

    if (this.state.timeLeft <= 0) {
      this.finish(false);
    }
  }

  requestHint() {
    if (!this.state.isRunning || this.state.phase !== "input") {
      return "";
    }
    const nextId = this.state.sequence[this.state.inputIndex] || "";
    if (!nextId) {
      return "";
    }
    this.state.hintCount += 1;
    this.state.roundHintCount += 1;
    this.state.timeLeft = Math.max(0, this.state.timeLeft - 2);
    if (this.onToast) {
      this.onToast("提示已给出，时间会减少 2 秒。");
    }
    this.emit();
    return nextId;
  }

  finish(isWin) {
    this.stopTimer();
    this.state.isRunning = false;
    this.state.isWin = isWin;
    this.state.phase = "done";
    this.state.canInput = false;
    this.state.activeAnimalId = "";
    this.state.activeStepIndex = -1;
    this.emit();
    this.onResult?.({
      isWin,
      levelId: this.state.levelId,
      levelName: this.state.levelName,
      round: this.state.round,
      targetRounds: this.state.targetRounds,
      bestStreak: this.state.bestStreak,
      hintCount: this.state.hintCount,
      perfectRounds: this.state.perfectRounds,
      bestPerfectCombo: this.state.bestPerfectCombo,
      remainTime: Math.max(0, Math.ceil(this.state.timeLeft)),
    });
  }

  emit() {
    this.onStateChange?.({
      ...this.state,
      sequence: [...this.state.sequence],
      animalsInPlay: this.state.animalsInPlay.map((item) => ({ ...item })),
    });
  }
}
