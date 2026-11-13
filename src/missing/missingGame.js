import { createSeededRandom } from "../shared/random.js";

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export class MissingGame {
  constructor({ onStateChange, onResult } = {}) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.levels = [];
    this.themes = [];
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
      themeId: "",
      themeName: "",
      modeName: "记忆闯关",
      seed: "",
      roundIndex: 0,
      targetRounds: 0,
      watchMs: 3000,
      lives: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      hintsLeft: 0,
      bestScore: this.bestScore || 0,
      tableItems: [],
      missingItem: null,
      choices: [],
      eliminatedIds: [],
      lastFeedback: "选好难度和主题，点开始记住桌上的物品吧。",
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

    const seed = options.seed || `${Date.now()}|missing|${level.id}|${theme.id}`;
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
      modeName: options.modeName || "记忆闯关",
      seed,
      targetRounds: level.targetRounds,
      watchMs: level.watchMs,
      lives: level.lives,
      hintsLeft: Number(level.hints ?? 2),
      bestScore: this.bestScore,
    };

    this.prepareRound();
  }

  prepareRound() {
    const { tableCount, shuffleAfter } = this.currentLevel;
    const pool = shuffle(this.currentTheme.items, this.random);
    const onTable = pool.slice(0, tableCount);
    const outsiders = pool.slice(tableCount);

    const missingIndex = Math.floor(this.random() * onTable.length);
    const missingItem = onTable[missingIndex];
    const remaining = onTable.filter((_, idx) => idx !== missingIndex);

    const decoyFromTable = shuffle(remaining, this.random).slice(0, 1);
    const decoyOutsiders = outsiders.slice(0, 2);
    const choices = shuffle([missingItem, ...decoyFromTable, ...decoyOutsiders], this.random);

    this.fullTable = onTable;
    this.afterTable = shuffleAfter
      ? shuffle([...remaining, { id: "__empty__", name: "谁躲起来了？", icon: "❓", isPlaceholder: true }], this.random)
      : onTable.map((item, idx) => (idx === missingIndex
        ? { id: "__empty__", name: "谁躲起来了？", icon: "❓", isPlaceholder: true }
        : item));

    this.state.phase = "memorize";
    this.state.tableItems = onTable.map((item) => ({ ...item, isPlaceholder: false }));
    this.state.missingItem = missingItem;
    this.state.choices = choices;
    this.state.eliminatedIds = [];
    this.state.lastFeedback = `快记住桌上的 ${tableCount} 样物品，幕布马上要拉上啦！`;
    this.emit();
  }

  closeCurtain() {
    if (!this.state.isRunning || this.state.phase !== "memorize") {
      return false;
    }
    this.state.phase = "curtain";
    this.state.lastFeedback = "呼啦啦——有一件小宝贝悄悄躲起来啦！";
    this.emit();
    return true;
  }

  openCurtain() {
    if (!this.state.isRunning || this.state.phase !== "curtain") {
      return false;
    }
    this.state.phase = "guessing";
    this.state.tableItems = this.afterTable.map((item) => ({ ...item }));
    this.state.lastFeedback = "幕布拉开啦！看看桌上少了谁，在下方点出来！";
    this.emit();
    return true;
  }

  useHint() {
    if (!this.state.isRunning || this.state.phase !== "guessing" || this.state.hintsLeft <= 0) {
      return "";
    }
    const candidates = this.state.choices.filter(
      (item) => item.id !== this.state.missingItem.id && !this.state.eliminatedIds.includes(item.id),
    );
    if (!candidates.length) {
      return "";
    }
    this.state.hintsLeft -= 1;
    const toDrop = candidates.slice(0, 2).map((item) => item.id);
    this.state.eliminatedIds = [...this.state.eliminatedIds, ...toDrop];
    const text = "提示：已经帮你排除掉干扰选项，在剩下的里面选吧！";
    this.state.lastFeedback = text;
    this.emit();
    return text;
  }

  choose(itemId) {
    if (!this.state.isRunning || this.state.phase !== "guessing" || !this.state.missingItem) {
      return { ok: false };
    }
    if (this.state.eliminatedIds.includes(itemId)) {
      return { ok: false };
    }
    const picked = this.state.choices.find((item) => item.id === itemId);
    if (!picked) {
      return { ok: false };
    }

    if (picked.id !== this.state.missingItem.id) {
      this.state.lives = Math.max(0, this.state.lives - 1);
      this.state.streak = 0;
      this.state.eliminatedIds = [...this.state.eliminatedIds, itemId];

      if (this.state.lives <= 0) {
        this.state.tableItems = this.fullTable.map((item) => ({ ...item, isPlaceholder: false }));
        this.finish(false);
        return { ok: false, correct: false, lost: true };
      }

      const stillOnTable = this.afterTable.some((item) => item.id === picked.id);
      this.state.lastFeedback = stillOnTable
        ? `「${picked.name}」还在桌子上呢，再回忆一下少了谁！`
        : `刚才桌上没有「${picked.name}」哦，再想一想！`;
      this.emit();
      return { ok: false, correct: false, lost: false };
    }

    this.state.phase = "roundWin";
    this.state.streak += 1;
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak);
    this.state.score += 20 + Math.min(12, this.state.streak * 3);
    this.state.roundIndex += 1;
    this.state.tableItems = this.fullTable.map((item) => ({ ...item, isPlaceholder: false }));
    this.state.lastFeedback = `记性真棒！躲起来的果然是「${picked.name}」！`;

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
      themeName: this.state.themeName,
      modeName: this.state.modeName,
      roundsDone: this.state.roundIndex,
      targetRounds: this.state.targetRounds,
      score: this.state.score,
      bestScore: this.bestScore,
      bestStreak: this.state.bestStreak,
    });
  }

  emit() {
    this.onStateChange?.({
      ...this.state,
      tableItems: this.state.tableItems.map((i) => ({ ...i })),
      choices: this.state.choices.map((c) => ({ ...c })),
      eliminatedIds: [...this.state.eliminatedIds],
    });
  }
}
