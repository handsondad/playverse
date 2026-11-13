import { createSeededRandom } from "../shared/random.js";

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export class PatternGame {
  constructor({ onStateChange, onResult, onToast } = {}) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.onToast = onToast;
    this.levels = [];
    this.themes = [];
    this.bestScore = 0;
    this.random = Math.random;
    this.state = this.createIdleState();
  }

  createIdleState() {
    return {
      isRunning: false,
      levelId: "",
      levelName: "",
      themeId: "",
      themeName: "",
      modeName: "普通发车",
      seed: "",
      roundIndex: 0,
      targetTrains: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      wrongCount: 0,
      hintsLeft: 0,
      bestScore: this.bestScore || 0,
      carriages: [],
      missingIndex: -1,
      answerItem: null,
      options: [],
      hintText: "",
      lastFeedback: "选好难度和专列主题，点开始发车吧。",
      departed: false,
    };
  }

  init(data, bestScore = 0) {
    this.levels = Array.isArray(data?.levels) ? data.levels : [];
    this.themes = Array.isArray(data?.themes) ? data.themes : [];
    this.bestScore = Number(bestScore || 0);
    this.state = this.createIdleState();
    this.emit();
  }

  start(levelId, options = {}) {
    const level = this.levels.find((item) => item.id === levelId) || this.levels[0];
    const theme = this.themes.find((item) => item.id === options.themeId) || this.themes[0];
    if (!level || !theme) {
      return;
    }

    const seed = options.seed || `${Date.now()}|pattern|${level.id}|${theme.id}`;
    this.random = createSeededRandom(seed);
    this.currentLevel = level;
    this.currentTheme = theme;

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      levelId: level.id,
      levelName: level.name,
      themeId: theme.id,
      themeName: theme.name,
      modeName: options.modeName || "普通发车",
      seed,
      targetTrains: level.targetTrains,
      hintsLeft: Number(level.hints ?? 2),
      bestScore: this.bestScore,
      lastFeedback: "看看车厢是怎么排队的，点下方车厢补上空位。",
    };

    this.buildRound();
  }

  buildRound() {
    const level = this.currentLevel;
    const theme = this.currentTheme;
    const template = level.templates[Math.floor(this.random() * level.templates.length)];
    const distinctCount = Math.max(...template) + 1;
    const chosenItems = shuffle(theme.items, this.random).slice(0, distinctCount);
    const fullSequence = template.map((slot) => chosenItems[slot]);

    let missingIndex = fullSequence.length - 1;
    if (level.allowMiddleGap && this.random() < 0.5 && fullSequence.length >= 6) {
      missingIndex = 2 + Math.floor(this.random() * (fullSequence.length - 3));
    }

    const answerItem = fullSequence[missingIndex];
    const decoys = shuffle(
      theme.items.filter((item) => item.id !== answerItem.id),
      this.random,
    ).slice(0, 3);
    const options = shuffle([answerItem, ...decoys], this.random);

    this.state.carriages = fullSequence.map((item, index) => ({
      index,
      isMissing: index === missingIndex,
      filled: index !== missingIndex,
      item: index === missingIndex ? null : item,
    }));
    this.state.missingIndex = missingIndex;
    this.state.answerItem = answerItem;
    this.state.options = options;
    this.state.hintText = "";
    this.state.departed = false;
    this.emit();
  }

  useHint() {
    if (!this.state.isRunning || this.state.hintsLeft <= 0 || !this.state.answerItem) {
      return "";
    }
    this.state.hintsLeft -= 1;
    const chant = this.state.carriages
      .map((c) => (c.isMissing ? "（谁呢）" : c.item.name))
      .join("、");
    this.state.hintText = `跟着念：${chant} —— 空位该挂「${this.state.answerItem.name}」哦。`;
    this.state.lastFeedback = this.state.hintText;
    this.emit();
    return this.state.hintText;
  }

  choose(itemId) {
    if (!this.state.isRunning || this.state.departed || !this.state.answerItem) {
      return { ok: false };
    }

    const picked = this.state.options.find((item) => item.id === itemId);
    if (!picked) {
      return { ok: false };
    }

    if (picked.id !== this.state.answerItem.id) {
      this.state.wrongCount += 1;
      this.state.streak = 0;
      this.state.score = Math.max(0, this.state.score - 3);
      this.state.lastFeedback = `这节是${picked.name}，再顺着前面的车厢念一遍试试看。`;
      this.onToast?.(this.state.lastFeedback);
      this.emit();
      return { ok: false, correct: false, picked };
    }

    this.state.streak += 1;
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak);
    this.state.score += 15 + Math.min(10, this.state.streak * 2);
    this.state.roundIndex += 1;
    this.state.departed = true;
    this.state.carriages = this.state.carriages.map((carriage) => (
      carriage.isMissing ? { ...carriage, filled: true, item: picked } : carriage
    ));
    this.state.lastFeedback = `挂对啦！${picked.name}上车，小火车呜呜出发！`;
    this.onToast?.(this.state.lastFeedback);

    if (this.state.score > this.bestScore) {
      this.bestScore = this.state.score;
      this.state.bestScore = this.bestScore;
    }

    this.emit();
    return {
      ok: true,
      correct: true,
      picked,
      finished: this.state.roundIndex >= this.state.targetTrains,
    };
  }

  nextTrain() {
    if (!this.state.isRunning) {
      return;
    }
    if (this.state.roundIndex >= this.state.targetTrains) {
      this.finish();
      return;
    }
    this.state.lastFeedback = "下一列小火车进站啦，看看这次是什么规律。";
    this.buildRound();
  }

  finish() {
    this.state.isRunning = false;
    this.emit();
    const totalAttempts = this.state.roundIndex + this.state.wrongCount;
    const accuracy = totalAttempts > 0 ? Math.round((this.state.roundIndex / totalAttempts) * 100) : 100;
    this.onResult?.({
      isWin: true,
      levelId: this.state.levelId,
      levelName: this.state.levelName,
      themeName: this.state.themeName,
      modeName: this.state.modeName,
      trainsDone: this.state.roundIndex,
      targetTrains: this.state.targetTrains,
      score: this.state.score,
      bestScore: this.bestScore,
      bestStreak: this.state.bestStreak,
      wrongCount: this.state.wrongCount,
      accuracy,
    });
  }

  emit() {
    this.onStateChange?.({
      ...this.state,
      carriages: this.state.carriages.map((c) => ({ ...c })),
      options: this.state.options.map((o) => ({ ...o })),
    });
  }
}
