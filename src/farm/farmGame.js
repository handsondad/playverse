function hashSeed(seedText) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedText) {
  let state = hashSeed(seedText || "farm-default-seed") || 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEFAULT_WEATHER_PRESETS = [
  {
    id: "sunny",
    name: "晴天",
    icon: "☀️",
    hint: "作物长得更快，适合快速补订单。",
    growMultiplier: 1.15,
    yieldMultiplier: 1,
    xpMultiplier: 1,
    fertilityHit: 2,
    weight: 3,
  },
  {
    id: "breezy",
    name: "微风",
    icon: "🍃",
    hint: "均衡天气，适合稳定经营。",
    growMultiplier: 1,
    yieldMultiplier: 1.08,
    xpMultiplier: 1,
    fertilityHit: 0,
    weight: 4,
  },
  {
    id: "rainy",
    name: "小雨",
    icon: "🌦️",
    hint: "产量稍高，土地也更滋润。",
    growMultiplier: 0.94,
    yieldMultiplier: 1.2,
    xpMultiplier: 1.08,
    fertilityHit: -2,
    weight: 2,
  },
  {
    id: "cloudy",
    name: "多云",
    icon: "⛅",
    hint: "成熟速度稍慢，经验更容易上涨。",
    growMultiplier: 0.9,
    yieldMultiplier: 1,
    xpMultiplier: 1.16,
    fertilityHit: -1,
    weight: 1,
  },
];

const DEFAULT_RECIPES = [
  {
    id: "veggie-salad",
    name: "农场沙拉",
    inputs: { carrot: 2, corn: 1 },
    processSec: 14,
    rewardCoins: 14,
    rewardXp: 9,
  },
  {
    id: "berry-juice",
    name: "草莓果汁",
    inputs: { strawberry: 2 },
    processSec: 18,
    rewardCoins: 20,
    rewardXp: 12,
  },
];

export class FarmGame {
  constructor({ onStateChange, onToast }) {
    this.onStateChange = onStateChange;
    this.onToast = onToast;
    this.config = null;
    this.state = this.createIdleState();
    this.timerId = null;
    this.random = Math.random;
  }

  createIdleState() {
    return {
      isRunning: false,
      mode: "normal",
      modeName: "普通经营",
      day: 1,
      currentSeedId: "",
      plots: [],
      inventory: {},
      coins: 0,
      xp: 0,
      level: 1,
      order: null,
      readyCount: 0,
      harvestCount: 0,
      completedOrders: 0,
      completedProcesses: 0,
      completedMissions: 0,
      todaySeed: "",
      harvestStreak: 0,
      weather: DEFAULT_WEATHER_PRESETS[0],
      mission: null,
      process: {
        active: null,
      },
    };
  }

  getWeatherPresets() {
    const presets = this.config?.weatherRules?.presets;
    if (!Array.isArray(presets) || presets.length === 0) {
      return DEFAULT_WEATHER_PRESETS;
    }
    return presets.map((item) => ({
      growMultiplier: 1,
      yieldMultiplier: 1,
      xpMultiplier: 1,
      fertilityHit: 0,
      weight: 1,
      ...item,
    }));
  }

  getRecipes() {
    if (!Array.isArray(this.config?.recipes) || this.config.recipes.length === 0) {
      return DEFAULT_RECIPES;
    }
    return this.config.recipes;
  }

  getFertilityRules() {
    return {
      min: 35,
      max: 100,
      start: 90,
      dropPerHarvest: 8,
      restoreCost: 4,
      restoreAmount: 24,
      ...this.config?.fertility,
    };
  }

  createEmptyPlot(index, fertility = 90) {
    return {
      id: `plot-${index}`,
      cropId: "",
      status: "empty",
      plantedAt: 0,
      readyAt: 0,
      growSec: 0,
      fertility,
    };
  }

  init(config) {
    this.config = config;
    const firstCrop = config.crops[0];
    const fertilityRules = this.getFertilityRules();
    this.state = {
      ...this.createIdleState(),
      currentSeedId: firstCrop.id,
      inventory: Object.fromEntries(config.crops.map((crop) => [crop.id, 0])),
      coins: config.startCoins,
      plots: Array.from({ length: config.plots }, (_, index) => this.createEmptyPlot(index + 1, fertilityRules.start)),
    };
    this.state.weather = this.pickWeather();
    this.state.order = this.createOrder();
    this.state.mission = this.createMission();
    this.emit();
  }

  createMission() {
    const missionType = this.random() < 0.5 ? "harvest-streak" : "deliver-crop";
    if (missionType === "harvest-streak") {
      const target = 3 + Math.floor(this.random() * 2);
      return {
        id: `mission-${Date.now()}-${Math.floor(this.random() * 999)}`,
        type: missionType,
        title: `连续收获 ${target} 块地`,
        progress: 0,
        target,
        rewardCoins: 12 + (target * 2),
        rewardXp: 8 + target,
      };
    }

    const crop = this.config.crops[Math.floor(this.random() * this.config.crops.length)];
    const qty = 3 + Math.floor(this.random() * 3);
    return {
      id: `mission-${Date.now()}-${Math.floor(this.random() * 999)}`,
      type: missionType,
      cropId: crop.id,
      cropName: crop.name,
      title: `交付 ${crop.name} ${qty} 个`,
      progress: 0,
      target: qty,
      rewardCoins: 14 + (qty * 2),
      rewardXp: 10 + qty,
    };
  }

  completeMission() {
    if (!this.state.mission) {
      return;
    }

    this.state.coins += this.state.mission.rewardCoins;
    this.state.xp += this.state.mission.rewardXp;
    this.state.completedMissions += 1;
    this.onToast?.(`任务完成 +${this.state.mission.rewardCoins} 金币`);
    this.state.mission = this.createMission();
    this.updateLevel();
  }

  updateMissionProgress(type, payload = {}) {
    const mission = this.state.mission;
    if (!mission) {
      return;
    }

    if (mission.type === "harvest-streak" && type === "harvest") {
      mission.progress = Math.min(mission.target, this.state.harvestStreak);
    }

    if (mission.type === "deliver-crop" && type === "deliver") {
      if (payload.cropId === mission.cropId) {
        mission.progress = Math.min(mission.target, mission.progress + (payload.qty || 0));
      }
    }

    if (mission.progress >= mission.target) {
      this.completeMission();
    }
  }

  pickWeather() {
    const presets = this.getWeatherPresets();
    const totalWeight = presets.reduce((sum, item) => sum + (item.weight || 1), 0);
    let cursor = this.random() * totalWeight;
    for (const item of presets) {
      cursor -= (item.weight || 1);
      if (cursor <= 0) {
        return item;
      }
    }
    return presets[0];
  }

  start(options = {}) {
    if (!this.config) {
      return;
    }
    this.stop();

    const daySeed = options.seed || `${Date.now()}|farm-day-${this.state.day}`;
    this.random = createSeededRandom(daySeed);
    const fertilityRules = this.getFertilityRules();

    this.state.mode = options.mode || "normal";
    this.state.modeName = options.modeName || "普通经营";
    this.state.todaySeed = daySeed;
    this.state.isRunning = true;
    this.state.plots = Array.from(
      { length: this.config.plots },
      (_, index) => this.createEmptyPlot(index + 1, fertilityRules.start),
    );
    this.state.inventory = Object.fromEntries(this.config.crops.map((crop) => [crop.id, 0]));
    this.state.coins = this.config.startCoins;
    this.state.xp = 0;
    this.state.level = 1;
    this.state.harvestCount = 0;
    this.state.completedOrders = 0;
    this.state.completedProcesses = 0;
    this.state.completedMissions = 0;
    this.state.harvestStreak = 0;
    this.state.readyCount = 0;
    this.state.weather = this.pickWeather();
    this.state.mission = this.createMission();
    this.state.process = { active: null };

    this.state.order = this.createOrder(options.orderBoost || 0);

    this.timerId = setInterval(() => this.tick(), 300);
    this.emit();
  }

  getFertilityAverage() {
    if (this.state.plots.length === 0) {
      return 0;
    }
    const total = this.state.plots.reduce((sum, plot) => sum + plot.fertility, 0);
    return Math.round(total / this.state.plots.length);
  }

  tick() {
    if (!this.state.isRunning) {
      return;
    }

    const now = Date.now();
    let readyCount = 0;

    this.state.plots.forEach((plot) => {
      if (plot.status === "growing" && now >= plot.readyAt) {
        plot.status = "ready";
      }
      if (plot.status === "ready") {
        readyCount += 1;
      }
    });

    if (this.state.process.active && now >= this.state.process.active.finishAt) {
      const active = this.state.process.active;
      this.state.coins += active.rewardCoins;
      this.state.xp += active.rewardXp;
      this.state.completedProcesses += 1;
      this.state.process.active = null;
      this.updateLevel();
      this.onToast?.(`${active.recipeName} 完成 +${active.rewardCoins} 金币`);
    }

    this.state.readyCount = readyCount;
    this.emit();
  }

  setSeed(cropId) {
    this.state.currentSeedId = cropId;
    this.emit();
  }

  getPlantGrowSec(baseSec, fertility) {
    const weatherGrow = Math.max(0.7, this.state.weather.growMultiplier || 1);
    const fertilitySlowdown = 1 + ((100 - fertility) / 180);
    return Math.max(7, Math.round((baseSec / weatherGrow) * fertilitySlowdown));
  }

  plant(plotId) {
    if (!this.state.isRunning) {
      return false;
    }
    const plot = this.state.plots.find((item) => item.id === plotId);
    if (!plot || plot.status !== "empty") {
      return false;
    }

    const crop = this.config.crops.find((item) => item.id === this.state.currentSeedId);
    if (!crop) {
      return false;
    }

    const now = Date.now();
    const growSec = this.getPlantGrowSec(crop.growSec, plot.fertility);
    plot.cropId = crop.id;
    plot.status = "growing";
    plot.plantedAt = now;
    plot.growSec = growSec;
    plot.readyAt = now + (growSec * 1000);

    this.emit();
    return true;
  }

  getHarvestYield(crop, plot) {
    const weatherYield = this.state.weather.yieldMultiplier || 1;
    const fertilityFactor = 0.75 + (plot.fertility / 220);
    return Math.max(1, Math.round(crop.yield * weatherYield * fertilityFactor));
  }

  getHarvestXp(crop) {
    return Math.max(1, Math.round(crop.xp * (this.state.weather.xpMultiplier || 1)));
  }

  lowerFertility(plot) {
    const rule = this.getFertilityRules();
    const hit = rule.dropPerHarvest + (this.state.weather.fertilityHit || 0);
    const next = plot.fertility - hit;
    plot.fertility = Math.min(rule.max, Math.max(rule.min, next));
  }

  harvest(plotId) {
    if (!this.state.isRunning) {
      return false;
    }

    const plot = this.state.plots.find((item) => item.id === plotId);
    if (!plot || plot.status !== "ready") {
      return false;
    }

    const crop = this.config.crops.find((item) => item.id === plot.cropId);
    if (!crop) {
      return false;
    }

    const yieldCount = this.getHarvestYield(crop, plot);
    const xpGain = this.getHarvestXp(crop);
    this.state.inventory[crop.id] += yieldCount;
    this.state.coins += crop.sellPrice * yieldCount;
    this.state.xp += xpGain;
    this.state.harvestCount += 1;
    this.state.harvestStreak += 1;

    this.updateLevel();
    this.lowerFertility(plot);

    plot.cropId = "";
    plot.status = "empty";
    plot.plantedAt = 0;
    plot.readyAt = 0;
    plot.growSec = 0;

    this.state.readyCount = Math.max(0, this.state.readyCount - 1);
    this.updateMissionProgress("harvest");

    this.emit();
    return true;
  }

  harvestAll() {
    let harvested = 0;
    this.state.plots.forEach((plot) => {
      if (plot.status === "ready") {
        if (this.harvest(plot.id)) {
          harvested += 1;
        }
      }
    });
    return harvested;
  }

  fertilizeWeakestPlot() {
    if (!this.state.isRunning) {
      return false;
    }
    const rule = this.getFertilityRules();
    if (this.state.coins < rule.restoreCost) {
      return false;
    }

    const target = [...this.state.plots].sort((a, b) => a.fertility - b.fertility)[0];
    if (!target || target.fertility >= rule.max) {
      return false;
    }

    this.state.coins -= rule.restoreCost;
    target.fertility = Math.min(rule.max, target.fertility + rule.restoreAmount);
    this.state.harvestStreak = 0;
    this.onToast?.(`已给地块施肥，土地肥力提升到 ${target.fertility}`);
    this.emit();
    return true;
  }

  canCraft(recipe) {
    return Object.entries(recipe.inputs || {}).every(([cropId, amount]) => {
      return (this.state.inventory[cropId] || 0) >= amount;
    });
  }

  startProcess(recipeId) {
    if (!this.state.isRunning) {
      return { ok: false, reason: "not-running" };
    }
    if (this.state.process.active) {
      return { ok: false, reason: "busy" };
    }

    const recipe = this.getRecipes().find((item) => item.id === recipeId);
    if (!recipe) {
      return { ok: false, reason: "missing-recipe" };
    }
    if (!this.canCraft(recipe)) {
      return { ok: false, reason: "lack-input" };
    }

    Object.entries(recipe.inputs || {}).forEach(([cropId, amount]) => {
      this.state.inventory[cropId] -= amount;
    });

    const now = Date.now();
    const processSpeed = this.state.weather.id === "sunny" ? 0.9 : 1;
    const duration = Math.max(6, Math.round((recipe.processSec || 12) * processSpeed));
    this.state.process.active = {
      recipeId: recipe.id,
      recipeName: recipe.name,
      finishAt: now + (duration * 1000),
      rewardCoins: recipe.rewardCoins,
      rewardXp: recipe.rewardXp,
      durationSec: duration,
    };

    this.emit();
    return { ok: true };
  }

  deliverOrder() {
    if (!this.state.order) {
      return false;
    }

    const currentAmount = this.state.inventory[this.state.order.cropId] || 0;
    if (currentAmount < this.state.order.qty) {
      return false;
    }

    this.state.inventory[this.state.order.cropId] -= this.state.order.qty;
    const deliveredCropId = this.state.order.cropId;
    const deliveredQty = this.state.order.qty;
    this.state.coins += this.state.order.rewardCoins;
    this.state.xp += this.state.order.rewardXp;
    this.state.completedOrders += 1;
    this.state.harvestStreak = 0;
    this.updateLevel();
    this.updateMissionProgress("deliver", { cropId: deliveredCropId, qty: deliveredQty });

    this.onToast?.(`订单完成 +${this.state.order.rewardCoins} 金币`);
    this.state.order = this.createOrder(this.state.mode === "daily" ? 1 : 0);
    this.emit();
    return true;
  }

  updateLevel() {
    const xpPerLevel = this.config.xpPerLevel;
    this.state.level = Math.max(1, Math.floor(this.state.xp / xpPerLevel) + 1);
  }

  createOrder(boost = 0) {
    const rule = this.config.orderRules;
    const crop = this.config.crops[Math.floor(this.random() * this.config.crops.length)];
    const qty = rule.qtyMin + Math.floor(this.random() * ((rule.qtyMax - rule.qtyMin) + 1)) + boost;
    const weatherBonus = this.state.weather.id === "rainy" ? 3 : 0;
    const rewardCoins = rule.rewardCoinBase + (qty * crop.sellPrice) + (boost * 4) + weatherBonus;
    const rewardXp = rule.rewardXpBase + (qty * 2) + (boost * 3) + Math.round((this.state.weather.xpMultiplier - 1) * 6);

    return {
      cropId: crop.id,
      cropName: crop.name,
      qty,
      rewardCoins,
      rewardXp,
    };
  }

  getPlotRemainingSec(plot) {
    if (plot.status !== "growing") {
      return 0;
    }
    return Math.max(0, Math.ceil((plot.readyAt - Date.now()) / 1000));
  }

  getProcessRemainingSec() {
    if (!this.state.process.active) {
      return 0;
    }
    return Math.max(0, Math.ceil((this.state.process.active.finishAt - Date.now()) / 1000));
  }

  stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.state.isRunning = false;
  }

  emit() {
    this.onStateChange({
      ...this.state,
      plots: this.state.plots.map((plot) => ({
        ...plot,
        remainSec: this.getPlotRemainingSec(plot),
      })),
      fertilityAvg: this.getFertilityAverage(),
      inventory: { ...this.state.inventory },
      order: this.state.order ? { ...this.state.order } : null,
      recipes: this.getRecipes().map((recipe) => ({ ...recipe })),
      process: {
        active: this.state.process.active ? { ...this.state.process.active } : null,
        remainSec: this.getProcessRemainingSec(),
      },
      mission: this.state.mission ? { ...this.state.mission } : null,
    });
  }
}
