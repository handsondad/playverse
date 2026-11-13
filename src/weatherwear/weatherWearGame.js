import { createSeededRandom } from "../shared/random.js";

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export class WeatherWearGame {
  constructor({ onStateChange, onResult } = {}) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.levels = [];
    this.items = [];
    this.scenes = [];
    this.bestScore = 0;
    this.random = Math.random;
    this.state = this.createIdleState();
  }

  createIdleState() {
    return {
      isRunning: false,
      levelId: "",
      levelName: "",
      modeName: "看天穿搭",
      seed: "",
      roundIndex: 0,
      targetRounds: 0,
      needCount: 2,
      score: 0,
      streak: 0,
      bestStreak: 0,
      wrongCount: 0,
      hintsLeft: 0,
      bestScore: this.bestScore || 0,
      scene: null,
      shelf: [],
      selectedIds: [],
      targetIds: [],
      completedRound: false,
      lastFeedback: "选好难度，点开始帮小朋友准备出门穿搭吧。",
    };
  }

  init(data, bestScore = 0) {
    this.levels = Array.isArray(data?.levels) ? data.levels : [];
    this.items = Array.isArray(data?.items) ? data.items : [];
    this.scenes = Array.isArray(data?.scenes) ? data.scenes : [];
    this.bestScore = Number(bestScore || 0);
    this.state = this.createIdleState();
    this.emit();
  }

  itemById(id) {
    return this.items.find((item) => item.id === id) || null;
  }

  start(levelId, options = {}) {
    const level = this.levels.find((item) => item.id === levelId) || this.levels[0];
    if (!level) {
      return;
    }

    const seed = options.seed || `${Date.now()}|weatherwear|${level.id}`;
    this.random = createSeededRandom(seed);
    this.currentLevel = level;
    this.lastSceneId = "";

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      levelId: level.id,
      levelName: level.name,
      modeName: options.modeName || "看天穿搭",
      seed,
      targetRounds: level.targetRounds,
      needCount: level.needCount,
      hintsLeft: Number(level.hints ?? 2),
      bestScore: this.bestScore,
    };

    this.buildRound();
  }

  buildRound() {
    const { needCount, shelfCount } = this.currentLevel;
    let scene = this.scenes[0];
    for (let tries = 0; tries < 8; tries += 1) {
      const candidate = this.scenes[Math.floor(this.random() * this.scenes.length)];
      if (candidate.id !== this.lastSceneId) {
        scene = candidate;
        break;
      }
    }
    this.lastSceneId = scene.id;

    const chosenGood = shuffle(scene.goodIds, this.random)
      .slice(0, needCount)
      .map((id) => this.itemById(id))
      .filter(Boolean);
    const chosenBad = shuffle(scene.badIds, this.random)
      .slice(0, Math.max(2, shelfCount - chosenGood.length))
      .map((id) => this.itemById(id))
      .filter(Boolean);

    this.state.scene = { ...scene };
    this.state.targetIds = chosenGood.map((item) => item.id);
    this.state.shelf = shuffle([...chosenGood, ...chosenBad], this.random);
    this.state.selectedIds = [];
    this.state.completedRound = false;
    this.state.lastFeedback = `窗外是${scene.weather}（${scene.temp}），要${scene.activity}，请挑 ${needCount} 件合适的装备！`;
    this.emit();
  }

  toggleItem(itemId) {
    if (!this.state.isRunning || this.state.completedRound) {
      return { ok: false };
    }
    const item = this.state.shelf.find((entry) => entry.id === itemId);
    if (!item) {
      return { ok: false };
    }

    if (this.state.selectedIds.includes(itemId)) {
      this.state.selectedIds = this.state.selectedIds.filter((id) => id !== itemId);
      this.state.lastFeedback = `已放回「${item.name}」。还需要选满 ${this.state.needCount} 件。`;
      this.emit();
      return { ok: true, equipped: false, item };
    }

    if (this.state.selectedIds.length >= this.state.needCount) {
      this.state.lastFeedback = `小背包已经装满 ${this.state.needCount} 件啦，点已选物品可以换掉，或者直接点「准备出门」！`;
      this.emit();
      return { ok: false, full: true };
    }

    this.state.selectedIds = [...this.state.selectedIds, itemId];
    this.state.lastFeedback = `选上了「${item.name}」（${this.state.selectedIds.length}/${this.state.needCount}）。`;
    this.emit();
    return { ok: true, equipped: true, item };
  }

  clearOutfit() {
    if (!this.state.isRunning || this.state.completedRound) {
      return false;
    }
    this.state.selectedIds = [];
    this.state.lastFeedback = `已清空小衣筐，重新挑 ${this.state.needCount} 件合适的装备吧。`;
    this.emit();
    return true;
  }

  useHint() {
    if (!this.state.isRunning || this.state.completedRound || this.state.hintsLeft <= 0) {
      return "";
    }
    const targetSet = new Set(this.state.targetIds);
    const cleanSelected = this.state.selectedIds.filter((id) => targetSet.has(id));
    const missingId = this.state.targetIds.find((id) => !cleanSelected.includes(id));
    if (!missingId) {
      return "";
    }

    this.state.hintsLeft -= 1;
    this.state.selectedIds = [...cleanSelected, missingId].slice(0, this.state.needCount);
    const item = this.itemById(missingId);
    const text = `提示：${this.state.scene.weather}出门记得带上「${item.name}」哦！`;
    this.state.lastFeedback = text;
    this.emit();
    return text;
  }

  submitOutfit() {
    if (!this.state.isRunning || this.state.completedRound) {
      return { ok: false };
    }
    if (this.state.selectedIds.length < this.state.needCount) {
      this.state.lastFeedback = `还要再挑 ${this.state.needCount - this.state.selectedIds.length} 件装备才够出门哦。`;
      this.emit();
      return { ok: false, incomplete: true };
    }

    const targetSet = new Set(this.state.targetIds);
    const wrongIds = this.state.selectedIds.filter((id) => !targetSet.has(id));

    if (wrongIds.length > 0) {
      this.state.wrongCount += 1;
      this.state.streak = 0;
      this.state.score = Math.max(0, this.state.score - 4);
      const wrongNames = wrongIds.map((id) => this.itemById(id)?.name).filter(Boolean).join("、");
      this.state.lastFeedback = `${this.state.scene.weather}（${this.state.scene.temp}）不太适合带「${wrongNames}」，点它换一件试试！`;
      this.emit();
      return { ok: false, correct: false, wrongNames };
    }

    this.state.completedRound = true;
    this.state.streak += 1;
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak);
    this.state.score += 18 + Math.min(12, this.state.streak * 2);
    this.state.roundIndex += 1;
    this.state.lastFeedback = `穿搭满分！穿戴整齐去${this.state.scene.activity}喽！`;

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
      levelName: this.state.levelName,
      modeName: this.state.modeName,
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
      scene: this.state.scene ? { ...this.state.scene } : null,
      shelf: this.state.shelf.map((item) => ({ ...item })),
      selectedIds: [...this.state.selectedIds],
    });
  }
}
