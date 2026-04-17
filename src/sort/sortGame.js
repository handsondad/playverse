const STORAGE_KEY = "sort-best-score";

const SHAPES = [
  { id: "circle", name: "圆形", symbol: "●" },
  { id: "square", name: "方形", symbol: "■" },
  { id: "triangle", name: "三角", symbol: "▲" },
  { id: "star", name: "星星", symbol: "★" },
];

const COLORS = [
  { id: "red", name: "红色", hex: "#ec6b63" },
  { id: "blue", name: "蓝色", hex: "#5ea6f2" },
  { id: "yellow", name: "黄色", hex: "#f2c758" },
  { id: "green", name: "绿色", hex: "#69bf74" },
];

const MIXED_TARGETS = [
  { key: "red-circle", colorId: "red", shapeId: "circle", label: "红色圆形" },
  { key: "blue-square", colorId: "blue", shapeId: "square", label: "蓝色方形" },
  { key: "yellow-triangle", colorId: "yellow", shapeId: "triangle", label: "黄色三角" },
  { key: "green-star", colorId: "green", shapeId: "star", label: "绿色星星" },
];

function hashSeed(seedText) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedText) {
  let state = hashSeed(seedText || "sort-default-seed") || 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function byId(list, id) {
  return list.find((item) => item.id === id);
}

function pick(list, random) {
  return list[Math.floor(random() * list.length)];
}

export class SortGame {
  constructor({ onStateChange, onResult }) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.timerId = null;
    this.random = Math.random;
    this.state = this.createIdleState();
  }

  createIdleState() {
    return {
      isRunning: false,
      level: null,
      mode: "color",
      modeName: "颜色分类",
      seed: "",
      items: [],
      bins: [],
      selectedItemId: "",
      timeLeft: 0,
      score: 0,
      correctCount: 0,
      wrongCount: 0,
      streak: 0,
      bestScore: this.loadBestScore(),
      selectedPrompt: "请先点一个物品，再点下方分类盒。",
      highlightedBinKey: "",
      lastJudge: "",
    };
  }

  loadBestScore() {
    try {
      return Number(localStorage.getItem(STORAGE_KEY) || 0);
    } catch {
      return 0;
    }
  }

  saveBestScore(score) {
    localStorage.setItem(STORAGE_KEY, String(score));
  }

  makeBins(mode) {
    if (mode.id === "color") {
      return COLORS.slice(0, 3).map((item) => ({ key: item.id, label: item.name, colorHex: item.hex }));
    }
    if (mode.id === "shape") {
      return SHAPES.slice(0, 3).map((item) => ({ key: item.id, label: item.name, colorHex: "#8fb0f0" }));
    }
    return MIXED_TARGETS.map((item) => ({ key: item.key, label: item.label, colorHex: byId(COLORS, item.colorId).hex }));
  }

  makeItem(mode, bins, random, index) {
    const shape = pick(SHAPES, random);
    const color = pick(COLORS, random);

    if (mode.id === "color") {
      const target = pick(bins, random);
      const targetColor = byId(COLORS, target.key);
      return {
        id: `item-${index}`,
        label: `${targetColor.name}${shape.name}`,
        colorId: targetColor.id,
        shapeId: shape.id,
        symbol: shape.symbol,
        colorHex: targetColor.hex,
        targetKey: target.key,
        hasGuide: false,
      };
    }

    if (mode.id === "shape") {
      const target = pick(bins, random);
      const targetShape = byId(SHAPES, target.key);
      return {
        id: `item-${index}`,
        label: `${color.name}${targetShape.name}`,
        colorId: color.id,
        shapeId: targetShape.id,
        symbol: targetShape.symbol,
        colorHex: color.hex,
        targetKey: target.key,
        hasGuide: false,
      };
    }

    const target = pick(MIXED_TARGETS, random);
    const fixedColor = byId(COLORS, target.colorId);
    const fixedShape = byId(SHAPES, target.shapeId);
    return {
      id: `item-${index}`,
      label: target.label,
      colorId: fixedColor.id,
      shapeId: fixedShape.id,
      symbol: fixedShape.symbol,
      colorHex: fixedColor.hex,
      targetKey: target.key,
      hasGuide: false,
    };
  }

  start(level, mode, options = {}) {
    this.stop();

    const seed = options.seed || `${Date.now()}|${level.id}|${mode.id}`;
    const random = createSeededRandom(seed);
    this.random = random;

    const bins = this.makeBins(mode);
    const items = Array.from({ length: level.itemCount }).map((_, index) => this.makeItem(mode, bins, random, index + 1));

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      level,
      mode: mode.id,
      modeName: mode.name,
      seed,
      bins,
      items,
      timeLeft: level.timeLimitSec,
      selectedPrompt: "请先点一个物品，再点下方分类盒。",
    };

    this.emit();
    this.timerId = setInterval(() => this.tick(), 100);
  }

  tick() {
    if (!this.state.isRunning) {
      return;
    }

    this.state.timeLeft = Math.max(0, this.state.timeLeft - 0.1);
    this.emit();

    if (this.state.timeLeft <= 0) {
      this.finish(false);
    }
  }

  emit() {
    this.onStateChange({
      ...this.state,
      items: [...this.state.items],
      bins: [...this.state.bins],
    });
  }

  selectItem(itemId) {
    if (!this.state.isRunning) {
      return;
    }

    const item = this.state.items.find((entry) => entry.id === itemId);
    if (item) {
      this.state.selectedItemId = itemId;
      this.state.highlightedBinKey = item.hasGuide ? item.targetKey : "";
      this.state.selectedPrompt = `已选中：${item.label}，请点正确分类盒。`;
    }
    this.emit();
  }

  classify(binKey) {
    if (!this.state.isRunning || !this.state.selectedItemId) {
      return;
    }

    const index = this.state.items.findIndex((entry) => entry.id === this.state.selectedItemId);
    if (index === -1) {
      this.state.selectedItemId = "";
      this.emit();
      return;
    }

    const item = this.state.items[index];
    if (item.targetKey === binKey) {
      this.state.items.splice(index, 1);
      this.state.correctCount += 1;
      this.state.streak += 1;
      this.state.score += 10 + Math.min(8, this.state.streak);
      this.state.lastJudge = "correct";
      this.state.highlightedBinKey = "";
      this.state.selectedItemId = "";
      this.state.selectedPrompt = this.state.items.length > 0
        ? "做得好，再选下一个物品。"
        : "全部分类完成，太棒了。";
    } else {
      this.state.wrongCount += 1;
      this.state.streak = 0;
      this.state.score = Math.max(0, this.state.score - 4);
      this.state.lastJudge = "wrong";
      this.state.selectedItemId = item.id;
      if (!item.hasGuide) {
        item.hasGuide = true;
        this.state.highlightedBinKey = item.targetKey;
        this.state.selectedPrompt = `再试试：${item.label} 还没放对，发光的分类盒就是答案。`;
      } else {
        this.state.highlightedBinKey = item.targetKey;
        this.state.selectedPrompt = `再试试：${item.label} 还没放对，可以放到发光的分类盒。`;
      }
    }
    this.emit();

    if (this.state.items.length === 0) {
      this.finish(true);
    }
  }

  finish(isWin) {
    this.stop();
    this.state.isRunning = false;

    const finalScore = Math.max(0, Math.round(this.state.score));
    const bestScore = Math.max(this.state.bestScore, finalScore);
    this.state.score = finalScore;
    this.state.bestScore = bestScore;
    this.saveBestScore(bestScore);

    this.emit();

    this.onResult({
      isWin,
      mode: this.state.mode,
      modeName: this.state.modeName,
      levelId: this.state.level.id,
      levelName: this.state.level.name,
      score: finalScore,
      correctCount: this.state.correctCount,
      wrongCount: this.state.wrongCount,
      bestScore,
      seed: this.state.seed,
      usedSec: Math.round(this.state.level.timeLimitSec - this.state.timeLeft),
    });
  }

  stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}
