function hashSeed(seedText) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedText) {
  let state = hashSeed(seedText || "chef-default-seed") || 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function countBy(items) {
  const counts = new Map();
  for (const item of items) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  return counts;
}

function compareIngredients(expected, actual) {
  const expectedCounts = countBy(expected);
  const actualCounts = countBy(actual);
  const missing = [];
  const extra = [];

  for (const [id, count] of expectedCounts.entries()) {
    const current = actualCounts.get(id) || 0;
    for (let index = current; index < count; index += 1) {
      missing.push(id);
    }
  }

  for (const [id, count] of actualCounts.entries()) {
    const current = expectedCounts.get(id) || 0;
    for (let index = current; index < count; index += 1) {
      extra.push(id);
    }
  }

  return {
    isMatch: missing.length === 0 && extra.length === 0,
    missing,
    extra,
  };
}

export class ChefGame {
  constructor({ onStateChange, onResult, onToast }) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.onToast = onToast;
    this.random = Math.random;
    this.levels = [];
    this.ingredients = [];
    this.recipes = [];
    this.levelMenuPool = [];
    this.timerId = 0;
    this.state = this.createIdleState();
  }

  createIdleState() {
    return {
      isRunning: false,
      isWin: false,
      levelId: "",
      levelName: "",
      score: 0,
      timeLeft: 0,
      ordersDone: 0,
      targetOrders: 0,
      combo: 0,
      bestCombo: 0,
      bestScore: 0,
      tray: Array(5).fill(""),
      trayMax: 5,
      currentOrder: null,
      currentThemeId: "",
      currentThemeName: "",
      customerMood: "waiting",
      customerMoodText: "顾客等待中",
      accuracy: 0,
      correctSubmissions: 0,
      totalSubmissions: 0,
      lastFeedback: "厨房准备好了，等你开工。",
    };
  }

  init(data, bestScore = 0) {
    this.levels = Array.isArray(data?.levels) ? data.levels : [];
    this.ingredients = Array.isArray(data?.ingredients) ? data.ingredients : [];
    this.recipes = Array.isArray(data?.recipes) ? data.recipes : [];
    this.levelMenuPool = [];
    this.state = {
      ...this.createIdleState(),
      bestScore: Number(bestScore || 0),
    };
    this.emit();
  }

  stopTimer() {
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = 0;
    }
  }

  getIngredient(id) {
    return this.ingredients.find((item) => item.id === id) || null;
  }

  getRecipe(id) {
    return this.recipes.find((item) => item.id === id) || null;
  }

  pickRecipe(menuPool, themeId = "") {
    let pool = this.recipes.filter((recipe) => menuPool.includes(recipe.id));
    if (themeId) {
      const themed = pool.filter((recipe) => recipe.themeId === themeId);
      if (themed.length > 0) {
        pool = themed;
      }
    }
    if (pool.length === 0) {
      return null;
    }
    return pool[Math.floor(this.random() * pool.length)] || null;
  }

  buildOrder(recipeId) {
    const recipe = this.getRecipe(recipeId);
    if (!recipe) {
      return null;
    }
    return {
      id: recipe.id,
      name: recipe.name,
      reward: Number(recipe.reward || 0),
      ingredients: [...(recipe.ingredients || [])],
    };
  }

  start(levelId, options = {}) {
    const level = this.levels.find((item) => item.id === levelId) || this.levels[0];
    if (!level) {
      return;
    }

    this.stopTimer();
    this.random = createSeededRandom(options.seed || `${Date.now()}|${level.id}|chef`);
    const themeId = options.themeId || "";
    const themeName = options.themeName || "";
    this.levelMenuPool = Array.isArray(level.menuPool) ? [...level.menuPool] : [];

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      levelId: level.id,
      levelName: level.name,
      timeLeft: Number(level.timeLimitSec || 90),
      targetOrders: Number(level.targetOrders || 3),
      bestScore: this.state.bestScore,
      currentThemeId: themeId,
      currentThemeName: themeName,
      lastFeedback: "第一位顾客到了，开始配餐吧。",
    };

    this.nextOrder();
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

  nextOrder() {
    const recipe = this.pickRecipe(this.levelMenuPool, this.state.currentThemeId);
    this.state.currentOrder = recipe ? this.buildOrder(recipe.id) : null;
    this.state.tray = Array(this.state.trayMax).fill("");
    this.state.customerMood = "waiting";
    this.state.customerMoodText = "顾客等待中";
  }

  addIngredient(id) {
    if (!this.state.isRunning || !this.state.currentOrder) {
      return;
    }
    const emptyIndex = this.state.tray.findIndex((item) => !item);
    if (emptyIndex === -1) {
      if (this.onToast) {
        this.onToast("餐盘已经满了，可以先清空或提交。");
      }
      return;
    }
    this.state.tray[emptyIndex] = id;
    this.state.lastFeedback = `已放入：${this.getIngredient(id)?.name || id}`;
    this.emit();
  }

  placeIngredientAt(index, id) {
    if (!this.state.isRunning || !this.state.currentOrder) {
      return;
    }
    if (index < 0 || index >= this.state.trayMax) {
      return;
    }

    const old = this.state.tray[index];
    this.state.tray[index] = id;
    if (!old) {
      this.state.lastFeedback = `摆盘成功：${this.getIngredient(id)?.name || id}`;
    } else if (old === id) {
      this.state.lastFeedback = `继续保持：${this.getIngredient(id)?.name || id}`;
    } else {
      const emptyIndex = this.state.tray.findIndex((item, slotIndex) => !item && slotIndex !== index);
      if (emptyIndex !== -1) {
        this.state.tray[emptyIndex] = old;
      }
      this.state.lastFeedback = `已替换：${this.getIngredient(old)?.name || old} -> ${this.getIngredient(id)?.name || id}`;
    }
    this.emit();
  }

  moveTrayItem(fromIndex, toIndex) {
    if (!this.state.isRunning) {
      return;
    }
    if (fromIndex === toIndex) {
      return;
    }
    if (fromIndex < 0 || fromIndex >= this.state.trayMax || toIndex < 0 || toIndex >= this.state.trayMax) {
      return;
    }
    const fromItem = this.state.tray[fromIndex];
    if (!fromItem) {
      return;
    }
    const toItem = this.state.tray[toIndex];
    this.state.tray[toIndex] = fromItem;
    this.state.tray[fromIndex] = toItem || "";
    this.state.lastFeedback = "餐盘摆放已调整。";
    this.emit();
  }

  removeTrayAt(index) {
    if (!this.state.isRunning) {
      return;
    }
    if (index < 0 || index >= this.state.trayMax) {
      return;
    }
    const removed = this.state.tray[index];
    if (!removed) {
      return;
    }
    this.state.tray[index] = "";
    this.state.lastFeedback = `已拿回：${this.getIngredient(removed)?.name || removed}`;
    this.emit();
  }

  clearTray() {
    if (!this.state.isRunning || this.state.tray.every((item) => !item)) {
      return;
    }
    this.state.tray = Array(this.state.trayMax).fill("");
    this.state.lastFeedback = "餐盘已经清空，可以重新配餐。";
    this.emit();
  }

  updateAccuracy() {
    this.state.accuracy = this.state.totalSubmissions > 0
      ? Math.round((this.state.correctSubmissions / this.state.totalSubmissions) * 100)
      : 0;
  }

  submitTray() {
    if (!this.state.isRunning || !this.state.currentOrder) {
      return;
    }

    this.state.totalSubmissions += 1;
    const actualTray = this.state.tray.filter(Boolean);
    const result = compareIngredients(this.state.currentOrder.ingredients, actualTray);

    if (result.isMatch) {
      this.state.ordersDone += 1;
      this.state.correctSubmissions += 1;
      this.state.combo += 1;
      this.state.bestCombo = Math.max(this.state.bestCombo, this.state.combo);
      this.state.score += this.state.currentOrder.reward + this.state.combo * 4;
      this.state.lastFeedback = "配餐正确，顾客很满意。";
      this.state.customerMood = this.state.combo >= 2 ? "excited" : "happy";
      this.state.customerMoodText = this.state.combo >= 2 ? "顾客超满意" : "顾客满意";
      if (this.onToast) {
        this.onToast(`完成订单：${this.state.currentOrder.name}`);
      }
      this.updateAccuracy();

      if (this.state.ordersDone >= this.state.targetOrders) {
        this.finish(true);
        return;
      }

      this.nextOrder();
      this.emit();
      return;
    }

    this.state.combo = 0;
    this.state.score = Math.max(0, this.state.score - 8);
  this.state.customerMood = "sad";
  this.state.customerMoodText = "顾客有点失望";
    this.updateAccuracy();
    const missingText = result.missing.map((id) => this.getIngredient(id)?.name || id).join("、");
    const extraText = result.extra.map((id) => this.getIngredient(id)?.name || id).join("、");
    const parts = [];
    if (missingText) {
      parts.push(`还缺 ${missingText}`);
    }
    if (extraText) {
      parts.push(`多放了 ${extraText}`);
    }
    this.state.lastFeedback = `这单还没配对：${parts.join("；")}`;
    this.emit();
  }

  finish(isWin) {
    this.stopTimer();
    this.state.isRunning = false;
    this.state.isWin = isWin;
    this.updateAccuracy();
    this.state.bestScore = Math.max(this.state.bestScore, this.state.score);
    this.emit();
    this.onResult?.({
      isWin,
      levelId: this.state.levelId,
      levelName: this.state.levelName,
      score: this.state.score,
      bestScore: this.state.bestScore,
      ordersDone: this.state.ordersDone,
      targetOrders: this.state.targetOrders,
      accuracy: this.state.accuracy,
      bestCombo: this.state.bestCombo,
    });
  }

  emit() {
    this.onStateChange?.({
      ...this.state,
      tray: [...this.state.tray],
      currentOrder: this.state.currentOrder
        ? {
            ...this.state.currentOrder,
            ingredients: [...this.state.currentOrder.ingredients],
          }
        : null,
      ingredients: this.ingredients.map((item) => ({ ...item })),
    });
  }
}
