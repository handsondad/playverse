import { createSeededRandom } from "../shared/random.js";

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export class OddOneGame {
  constructor({ onStateChange, onResult } = {}) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.modes = [];
    this.levels = [];
    this.visualPairs = [];
    this.categories = [];
    this.bestScore = 0;
    this.random = Math.random;
    this.state = this.createIdleState();
  }

  createIdleState() {
    return {
      isRunning: false,
      modeId: "visual",
      modeName: "眼力找一找",
      levelId: "",
      levelName: "",
      seed: "",
      roundIndex: 0,
      targetRounds: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      wrongCount: 0,
      hintsLeft: 0,
      bestScore: this.bestScore || 0,
      cards: [],
      promptText: "选好玩法模式和难度，点开始挑战。",
      lastFeedback: "准备好了就点开始吧。",
      solved: false,
    };
  }

  init(data, bestScore = 0) {
    this.modes = Array.isArray(data?.modes) ? data.modes : [];
    this.levels = Array.isArray(data?.levels) ? data.levels : [];
    this.visualPairs = Array.isArray(data?.visualPairs) ? data.visualPairs : [];
    this.categories = Array.isArray(data?.categories) ? data.categories : [];
    this.bestScore = Number(bestScore || 0);
    this.state = this.createIdleState();
    this.emit();
  }

  start(levelId, options = {}) {
    const level = this.levels.find((item) => item.id === levelId) || this.levels[0];
    const mode = this.modes.find((item) => item.id === options.modeId) || this.modes[0];
    if (!level || !mode) {
      return;
    }

    const seed = options.seed || `${Date.now()}|oddone|${mode.id}|${level.id}`;
    this.random = createSeededRandom(seed);
    this.currentLevel = level;
    this.currentMode = mode;

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      modeId: mode.id,
      modeName: mode.name,
      levelId: level.id,
      levelName: level.name,
      seed,
      targetRounds: level.targetRounds,
      hintsLeft: Number(level.hints ?? 2),
      bestScore: this.bestScore,
    };

    this.buildRound();
  }

  buildRound() {
    if (this.currentMode.id === "category") {
      this.buildCategoryRound();
    } else {
      this.buildVisualRound();
    }
  }

  buildVisualRound() {
    const count = this.currentLevel.visualCount;
    const pair = this.visualPairs[Math.floor(this.random() * this.visualPairs.length)];
    const oddIndex = Math.floor(this.random() * count);
    this.currentMeta = {
      type: "visual",
      commonName: pair.common.name,
      oddName: pair.odd.name,
      oddIndex,
    };

    this.state.cards = Array.from({ length: count }, (_, idx) => {
      const isOdd = idx === oddIndex;
      const entry = isOdd ? pair.odd : pair.common;
      return {
        index: idx,
        icon: entry.icon,
        name: entry.name,
        isOdd,
        dimmed: false,
        showLabel: false,
        status: "",
      };
    });
    this.state.promptText = `在 ${count} 张「${pair.common.name}」里，藏着哪一个不一样的伙伴？`;
    this.state.lastFeedback = "仔细看每一行，点出唯一不一样的那张卡片。";
    this.state.solved = false;
    this.emit();
  }

  buildCategoryRound() {
    const count = this.currentLevel.categoryCount;
    const [mainCat, oddCat] = shuffle(this.categories, this.random);
    const sameItems = shuffle(mainCat.items, this.random).slice(0, count - 1);
    const oddItem = oddCat.items[Math.floor(this.random() * oddCat.items.length)];
    const mixed = shuffle([
      ...sameItems.map((item) => ({ ...item, isOdd: false, categoryLabel: mainCat.label })),
      { ...oddItem, isOdd: true, categoryLabel: oddCat.label },
    ], this.random);

    this.currentMeta = {
      type: "category",
      mainLabel: mainCat.label,
      oddLabel: oddCat.label,
      oddName: oddItem.name,
    };

    this.state.cards = mixed.map((entry, idx) => ({
      index: idx,
      icon: entry.icon,
      name: entry.name,
      isOdd: entry.isOdd,
      dimmed: false,
      showLabel: true,
      status: "",
    }));
    this.state.promptText = "看看下面几张卡片，哪一个和大家不是同一类？";
    this.state.lastFeedback = "想想它们平时是吃的、穿的，还是坐的呢？";
    this.state.solved = false;
    this.emit();
  }

  useHint() {
    if (!this.state.isRunning || this.state.solved || this.state.hintsLeft <= 0) {
      return "";
    }
    this.state.hintsLeft -= 1;

    if (this.currentMeta.type === "visual") {
      const candidates = this.state.cards.filter((c) => !c.isOdd && !c.dimmed);
      const toDim = shuffle(candidates, this.random).slice(0, Math.ceil(candidates.length / 2));
      const dimSet = new Set(toDim.map((c) => c.index));
      this.state.cards = this.state.cards.map((c) => (dimSet.has(c.index) ? { ...c, dimmed: true } : c));
      this.state.lastFeedback = `提示：已经帮你排除了几张「${this.currentMeta.commonName}」，在剩下的亮卡里找找「${this.currentMeta.oddName}」！`;
    } else {
      this.state.lastFeedback = `提示：这里大多数都是「${this.currentMeta.mainLabel}」，找找谁不属于「${this.currentMeta.mainLabel}」吧！`;
    }

    this.emit();
    return this.state.lastFeedback;
  }

  tapCard(index) {
    if (!this.state.isRunning || this.state.solved) {
      return { ok: false };
    }
    const card = this.state.cards[index];
    if (!card) {
      return { ok: false };
    }

    if (!card.isOdd) {
      this.state.wrongCount += 1;
      this.state.streak = 0;
      this.state.score = Math.max(0, this.state.score - 3);
      this.state.cards = this.state.cards.map((c) => (
        c.index === index ? { ...c, dimmed: true, status: "wrong" } : c
      ));
      this.state.lastFeedback = this.currentMeta.type === "visual"
        ? `这张是${card.name}，和大家一样哦，再找找不一样的。`
        : `${card.name}也是「${this.currentMeta.mainLabel}」哦，再看看别的卡片。`;
      this.emit();
      return { ok: false, correct: false, card };
    }

    this.state.solved = true;
    this.state.streak += 1;
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak);
    this.state.score += 15 + Math.min(12, this.state.streak * 2);
    this.state.roundIndex += 1;
    this.state.cards = this.state.cards.map((c) => (
      c.index === index ? { ...c, status: "correct" } : c
    ));
    this.state.lastFeedback = this.currentMeta.type === "visual"
      ? `好眼力！一下子就找到了藏在里面的「${card.name}」！`
      : `答对啦！「${card.name}」是${this.currentMeta.oddLabel}，其他都是${this.currentMeta.mainLabel}！`;

    if (this.state.score > this.bestScore) {
      this.bestScore = this.state.score;
      this.state.bestScore = this.bestScore;
    }

    this.emit();
    return {
      ok: true,
      correct: true,
      card,
      finished: this.state.roundIndex >= this.state.targetRounds,
    };
  }

  nextRound() {
    if (!this.state.isRunning) {
      return;
    }
    if (this.state.roundIndex >= this.state.targetRounds) {
      this.finish();
      return;
    }
    this.buildRound();
  }

  finish() {
    this.state.isRunning = false;
    this.emit();
    const attempts = this.state.roundIndex + this.state.wrongCount;
    const accuracy = attempts > 0 ? Math.round((this.state.roundIndex / attempts) * 100) : 100;
    this.onResult?.({
      isWin: true,
      modeName: this.state.modeName,
      levelName: this.state.levelName,
      roundsDone: this.state.roundIndex,
      targetRounds: this.state.targetRounds,
      score: this.state.score,
      bestScore: this.bestScore,
      bestStreak: this.state.bestStreak,
      accuracy,
    });
  }

  emit() {
    this.onStateChange?.({
      ...this.state,
      cards: this.state.cards.map((c) => ({ ...c })),
    });
  }
}
