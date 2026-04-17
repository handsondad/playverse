import { FarmGame } from "./farmGame.js";
import { createGameAudio } from "../shared/audio.js";

const STATS_KEY = "farm-stats";
const SETTINGS_KEY = "farm-settings";
const GLOBAL_SETTINGS_KEY = "kids-global-settings";

const FALLBACK_LEVELS = {
  plots: 6,
  startCoins: 20,
  xpPerLevel: 30,
  crops: [
    { id: "carrot", name: "胡萝卜", growSec: 20, yield: 2, sellPrice: 3, xp: 3, color: "#f08b3e" },
    { id: "corn", name: "玉米", growSec: 32, yield: 3, sellPrice: 4, xp: 4, color: "#e3b53a" },
    { id: "strawberry", name: "草莓", growSec: 44, yield: 2, sellPrice: 7, xp: 6, color: "#df6b65" },
  ],
  orderRules: {
    qtyMin: 3,
    qtyMax: 7,
    rewardCoinBase: 12,
    rewardXpBase: 8,
  },
  fertility: {
    min: 35,
    max: 100,
    start: 90,
    dropPerHarvest: 8,
    restoreCost: 4,
    restoreAmount: 24,
  },
  recipes: [
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
  ],
};

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const harvestAllBtn = document.querySelector("#harvestAllBtn");
const deliverBtn = document.querySelector("#deliverBtn");
const fertilizeBtn = document.querySelector("#fertilizeBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const narrationBtn = document.querySelector("#narrationBtn");
const parentModeBtn = document.querySelector("#parentModeBtn");

const seedButtonsEl = document.querySelector("#seedButtons");
const seedHint = document.querySelector("#seedHint");
const fieldEl = document.querySelector("#field");
const orderText = document.querySelector("#orderText");
const missionText = document.querySelector("#missionText");
const missionReward = document.querySelector("#missionReward");
const guideText = document.querySelector("#guideText");
const playDurationHint = document.querySelector("#playDurationHint");
const weatherBadge = document.querySelector("#weatherBadge");
const weatherHint = document.querySelector("#weatherHint");
const recipeButtonsEl = document.querySelector("#recipeButtons");
const processStatus = document.querySelector("#processStatus");
const tutorialStepsEl = document.querySelector("#tutorialSteps");

const coinValue = document.querySelector("#coinValue");
const xpValue = document.querySelector("#xpValue");
const levelValue = document.querySelector("#levelValue");
const bagValue = document.querySelector("#bagValue");
const readyValue = document.querySelector("#readyValue");
const dayValue = document.querySelector("#dayValue");
const soilValue = document.querySelector("#soilValue");

const metaDays = document.querySelector("#metaDays");
const metaHarvests = document.querySelector("#metaHarvests");
const metaOrders = document.querySelector("#metaOrders");
const metaTopLevel = document.querySelector("#metaTopLevel");
const metaCoins = document.querySelector("#metaCoins");

const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

let levelsData = null;
let latestState = null;
let lastToastTimer = null;

const stats = {
  totalDays: 0,
  totalHarvests: 0,
  totalOrders: 0,
  topLevel: 1,
  totalCoins: 0,
};

const settingsState = {
  voiceOn: true,
  careMode: "standard",
  narrationLevel: "key",
};

const CARE_MODES = ["standard", "soft", "quiet"];
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

function careModeLabel(mode) {
  if (mode === "soft") {
    return "柔和";
  }
  if (mode === "quiet") {
    return "安静";
  }
  return "标准";
}

function nextCareMode(current) {
  const index = CARE_MODES.indexOf(current);
  if (index === -1) {
    return "standard";
  }
  return CARE_MODES[(index + 1) % CARE_MODES.length];
}

function isSoundEnabled() {
  return settingsState.careMode !== "quiet";
}

function getSoundGainMultiplier() {
  return settingsState.careMode === "soft" ? 0.6 : 1;
}

const soundFx = (() => {
  return {
    unlock() {
      gameAudio.unlock();
    },
    tap() {
      gameAudio.uiTap();
    },
    plant() {
      gameAudio.plant();
    },
    harvest() {
      gameAudio.harvest();
    },
    order() {
      gameAudio.order();
    },
    craft() {
      gameAudio.craft();
    },
  };
})();

function loadStats() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATS_KEY) || "{}");
    stats.totalDays = Number(parsed.totalDays || 0);
    stats.totalHarvests = Number(parsed.totalHarvests || 0);
    stats.totalOrders = Number(parsed.totalOrders || 0);
    stats.topLevel = Number(parsed.topLevel || 1);
    stats.totalCoins = Number(parsed.totalCoins || 0);
  } catch {
    stats.totalDays = 0;
  }
}

function saveStats() {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function renderMeta() {
  metaDays.textContent = String(stats.totalDays);
  metaHarvests.textContent = String(stats.totalHarvests);
  metaOrders.textContent = String(stats.totalOrders);
  metaTopLevel.textContent = String(stats.topLevel);
  metaCoins.textContent = String(stats.totalCoins);
}

function loadSettings() {
  try {
    const globalParsed = JSON.parse(localStorage.getItem(GLOBAL_SETTINGS_KEY) || "{}");
    const localParsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const merged = {
      ...localParsed,
      ...globalParsed,
    };
    settingsState.voiceOn = merged.voiceOn !== false;
    if (CARE_MODES.includes(merged.careMode)) {
      settingsState.careMode = merged.careMode;
    } else {
      settingsState.careMode = merged.parentMode ? "soft" : "standard";
    }
    settingsState.narrationLevel = merged.narrationLevel === "detailed" ? "detailed" : "key";
  } catch {
    settingsState.voiceOn = true;
    settingsState.careMode = "standard";
    settingsState.narrationLevel = "key";
  }
}

function saveSettings() {
  const payload = {
    voiceOn: settingsState.voiceOn,
    careMode: settingsState.careMode,
    parentMode: settingsState.careMode !== "standard",
    narrationLevel: settingsState.narrationLevel,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(payload));
}

function speakGuide(text, options = {}) {
  if (!settingsState.voiceOn || !window.speechSynthesis) {
    return;
  }
  if (settingsState.careMode === "quiet" && !options.force) {
    return;
  }
  if (options.detailOnly && settingsState.narrationLevel !== "detailed") {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = settingsState.careMode === "standard" ? 1 : 0.92;
  utterance.volume = settingsState.careMode === "standard" ? 0.95 : 0.72;
  window.speechSynthesis.speak(utterance);
}

function applySettingsUi() {
  voiceBtn.textContent = `语音引导：${settingsState.voiceOn ? "开" : "关"}`;
  narrationBtn.textContent = `播报模式：${settingsState.narrationLevel === "detailed" ? "详细" : "关键"}`;
  parentModeBtn.textContent = `护眼模式：${careModeLabel(settingsState.careMode)}`;

  if (settingsState.careMode === "quiet") {
    playDurationHint.textContent = "安静模式：关闭音效并减少播报，建议每次经营 5-8 分钟。";
    return;
  }
  if (settingsState.careMode === "soft") {
    playDurationHint.textContent = "柔和模式：降低动画和音量，建议每次经营 6-10 分钟。";
    return;
  }
  playDurationHint.textContent = "标准模式：建议每次经营 6-12 分钟，保持轻松节奏。";
}

function renderSeedButtons(state) {
  seedButtonsEl.innerHTML = levelsData.crops.map((crop) => {
    const activeClass = crop.id === state.currentSeedId ? "seed-button is-active" : "seed-button";
    return `
      <button class="${activeClass}" data-crop-id="${crop.id}" style="--seed-color:${crop.color};">
        <span>${crop.name}</span>
        <small>${crop.growSec} 秒成熟</small>
      </button>
    `;
  }).join("");
}

function inputText(inputs) {
  if (!inputs || typeof inputs !== "object") {
    return "";
  }
  return Object.entries(inputs).map(([cropId, amount]) => {
    const crop = levelsData.crops.find((item) => item.id === cropId);
    return `${crop?.name || cropId}×${amount}`;
  }).join(" + ");
}

function canCraft(state, recipe) {
  return Object.entries(recipe.inputs || {}).every(([cropId, amount]) => {
    return (state.inventory[cropId] || 0) >= amount;
  });
}

function renderRecipeButtons(state) {
  if (!recipeButtonsEl) {
    return;
  }
  recipeButtonsEl.innerHTML = (state.recipes || []).map((recipe) => {
    const enabled = canCraft(state, recipe) && !state.process.active;
    return `
      <button class="recipe-btn" data-recipe-id="${recipe.id}" ${enabled ? "" : "disabled"}>
        <strong>${recipe.name}</strong>
        <small>${inputText(recipe.inputs)} -> +${recipe.rewardCoins} 金币</small>
      </button>
    `;
  }).join("");
}

function renderProcess(state) {
  if (!processStatus) {
    return;
  }
  if (!state.process?.active) {
    processStatus.textContent = "加工台空闲：可制作沙拉或果汁。";
    return;
  }
  processStatus.textContent = `加工中：${state.process.active.recipeName}，剩余 ${state.process.remainSec} 秒`;
}

function getGuideStep(state) {
  if (!state.isRunning) {
    return "start";
  }
  if (state.process?.active) {
    return "process";
  }
  const canDeliver = state.order && (state.inventory[state.order.cropId] || 0) >= state.order.qty;
  if (canDeliver) {
    return "deliver";
  }
  if (state.readyCount > 0) {
    return "harvest";
  }
  const canProcess = (state.recipes || []).some((recipe) => canCraft(state, recipe));
  if (canProcess) {
    return "process";
  }
  return "plant";
}

function renderTutorial(state) {
  if (!tutorialStepsEl) {
    return;
  }
  const activeStep = getGuideStep(state);
  const nodes = tutorialStepsEl.querySelectorAll(".tutorial-step");
  nodes.forEach((node) => {
    node.classList.toggle("is-active", node.dataset.step === activeStep);
  });
}

function renderField(state) {
  const markup = state.plots.map((plot) => {
    if (plot.status === "empty") {
      return `
        <button class="plot empty" data-plot-id="${plot.id}">
          <strong>空地</strong>
          <span>点击种植</span>
          <small>肥力 ${plot.fertility}</small>
        </button>
      `;
    }

    if (plot.status === "growing") {
      const crop = levelsData.crops.find((item) => item.id === plot.cropId);
      return `
        <button class="plot growing" data-plot-id="${plot.id}" style="--plot-color:${crop?.color || '#d0b68c'};">
          <strong>${crop?.name || "作物"}</strong>
          <span>成长中 ${plot.remainSec} 秒</span>
          <small>肥力 ${plot.fertility}</small>
        </button>
      `;
    }

    const crop = levelsData.crops.find((item) => item.id === plot.cropId);
    return `
      <button class="plot ready" data-plot-id="${plot.id}" style="--plot-color:${crop?.color || '#7cc47f'};">
        <strong>${crop?.name || "作物"}</strong>
        <span>已成熟，点击收获</span>
        <small>肥力 ${plot.fertility}</small>
      </button>
    `;
  }).join("");

  fieldEl.innerHTML = markup;
}

function renderOrder(state) {
  if (!state.order) {
    orderText.textContent = "请先开始经营。";
    return;
  }

  const have = state.inventory[state.order.cropId] || 0;
  orderText.textContent = `需要 ${state.order.cropName} × ${state.order.qty}（当前 ${have}）| 奖励：${state.order.rewardCoins} 金币 + ${state.order.rewardXp} 经验`;
}

function renderMission(state) {
  if (!missionText || !missionReward) {
    return;
  }
  if (!state.mission) {
    missionText.textContent = "请先开始经营。";
    missionReward.textContent = "奖励：0 金币 + 0 经验";
    return;
  }

  missionText.textContent = `${state.mission.title}（${state.mission.progress}/${state.mission.target}）`;
  missionReward.textContent = `奖励：${state.mission.rewardCoins} 金币 + ${state.mission.rewardXp} 经验`;
}

function showToast(text) {
  resultEl.hidden = false;
  resultTitle.textContent = "提示";
  resultTitle.className = "hint";
  resultText.textContent = text;
  if (lastToastTimer) {
    clearTimeout(lastToastTimer);
  }
  lastToastTimer = setTimeout(() => {
    resultEl.hidden = true;
  }, 1300);
}

function renderState(state) {
  latestState = state;
  coinValue.textContent = String(state.coins);
  xpValue.textContent = String(state.xp);
  levelValue.textContent = String(state.level);
  bagValue.textContent = String(Object.values(state.inventory).reduce((sum, amount) => sum + amount, 0));
  readyValue.textContent = String(state.readyCount);
  dayValue.textContent = String(state.day);
  soilValue.textContent = String(state.fertilityAvg || 0);

  if (weatherBadge) {
    weatherBadge.textContent = `${state.weather.icon || "☀️"} ${state.weather.name || "晴天"}`;
  }
  if (weatherHint) {
    weatherHint.textContent = state.weather.hint || "今天适合慢慢经营。";
  }

  renderSeedButtons(state);
  renderField(state);
  renderOrder(state);
  renderMission(state);
  renderRecipeButtons(state);
  renderProcess(state);
  renderTutorial(state);

  deliverBtn.disabled = !state.order || (state.inventory[state.order.cropId] || 0) < state.order.qty;
  harvestAllBtn.disabled = state.readyCount <= 0;
  if (fertilizeBtn) {
    fertilizeBtn.textContent = `施肥（${levelsData.fertility.restoreCost} 金币）`;
    fertilizeBtn.disabled = state.coins < levelsData.fertility.restoreCost;
  }

  if (!state.isRunning) {
    guideText.textContent = "点击开始经营，开启今天的农场循环。";
  } else if (state.readyCount > 0) {
    guideText.textContent = `今天是${state.weather.name}，有地块成熟啦，快去收获并交付订单。`;
  } else {
    guideText.textContent = `今天是${state.weather.name}，先种满地块，等成熟后收获，再交付订单。`;
  }
}

function updateStatsFromDay(state) {
  stats.totalDays += 1;
  stats.totalHarvests += state.harvestCount;
  stats.totalOrders += state.completedOrders;
  stats.topLevel = Math.max(stats.topLevel, state.level);
  stats.totalCoins += state.coins;
  saveStats();
  renderMeta();
}

function hashText(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dailySeed() {
  const day = todayString();
  const hash = hashText(`${day}|farm`);
  return `${day}|farm|${hash}`;
}

function startDay(options = {}) {
  soundFx.unlock();

  if (latestState?.isRunning) {
    updateStatsFromDay(latestState);
  }

  const mode = options.mode || "normal";
  const modeName = options.modeName || "普通经营";
  const seed = options.seed || `${Date.now()}|farm`;
  const orderBoost = options.orderBoost || 0;

  game.state.day += 1;
  game.start({ mode, modeName, seed, orderBoost });
  if (latestState?.weather?.name) {
    speakGuide(`今天是${latestState.weather.name}，${latestState.weather.hint || "开始经营吧"}`);
  }
}

function bindSoftTap(button, handler) {
  if (!button) {
    return;
  }
  const run = () => {
    if (button.disabled) {
      return;
    }
    button.classList.add("tap-flash");
    setTimeout(() => {
      button.classList.remove("tap-flash");
      soundFx.tap();
      handler();
    }, 70);
  };

  button.addEventListener("pointerup", (event) => {
    event.preventDefault();
    run();
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
  });
}

const game = new FarmGame({
  onStateChange: renderState,
  onToast: showToast,
});

async function bootstrap() {
  try {
    const response = await fetch("../../configs/levels/mini-farm-town.levels.json");
    if (!response.ok) {
      throw new Error(`Failed to load levels: ${response.status}`);
    }
    levelsData = await response.json();
  } catch {
    levelsData = FALLBACK_LEVELS;
    guideText.textContent = "农场配置加载失败，已使用内置配置。";
  }

  levelsData = {
    ...FALLBACK_LEVELS,
    ...levelsData,
    crops: Array.isArray(levelsData?.crops) && levelsData.crops.length > 0 ? levelsData.crops : FALLBACK_LEVELS.crops,
    orderRules: levelsData?.orderRules || FALLBACK_LEVELS.orderRules,
    fertility: levelsData?.fertility || FALLBACK_LEVELS.fertility,
    recipes: Array.isArray(levelsData?.recipes) && levelsData.recipes.length > 0 ? levelsData.recipes : FALLBACK_LEVELS.recipes,
  };

  loadStats();
  loadSettings();
  renderMeta();
  applySettingsUi();

  game.init(levelsData);
  retryBtn.disabled = true;

  window.addEventListener("storage", (event) => {
    if (event.key !== GLOBAL_SETTINGS_KEY) {
      return;
    }
    loadSettings();
    applySettingsUi();
  });
}

bindSoftTap(startBtn, () => {
  retryBtn.disabled = false;
  startDay({ mode: "normal", modeName: "普通经营" });
});

bindSoftTap(retryBtn, () => {
  startDay({ mode: latestState?.mode || "normal", modeName: latestState?.modeName || "普通经营" });
});

bindSoftTap(harvestAllBtn, () => {
  const harvested = game.harvestAll();
  if (harvested > 0) {
    soundFx.harvest();
    showToast(`已收获 ${harvested} 块地`);
  } else {
    showToast("还没有成熟作物");
  }
});

bindSoftTap(fertilizeBtn, () => {
  if (game.fertilizeWeakestPlot()) {
    showToast("已给最低肥力地块施肥");
  } else {
    showToast("无法施肥：金币不足或土地已经很肥沃");
  }
});

bindSoftTap(deliverBtn, () => {
  if (game.deliverOrder()) {
    soundFx.order();
  } else {
    showToast("库存还不够交付订单");
  }
});

bindSoftTap(dailyBtn, () => {
  retryBtn.disabled = false;
  startDay({
    mode: "daily",
    modeName: `每日挑战 ${todayString()}`,
    seed: dailySeed(),
    orderBoost: 2,
  });
  showToast("已进入每日挑战：订单数量会更多");
});

bindSoftTap(voiceBtn, () => {
  settingsState.voiceOn = !settingsState.voiceOn;
  saveSettings();
  applySettingsUi();
  if (settingsState.voiceOn) {
    speakGuide(guideText.textContent);
  }
});

bindSoftTap(narrationBtn, () => {
  settingsState.narrationLevel = settingsState.narrationLevel === "detailed" ? "key" : "detailed";
  saveSettings();
  applySettingsUi();
  speakGuide(`已切换到${settingsState.narrationLevel === "detailed" ? "详细" : "关键"}播报`);
});

bindSoftTap(parentModeBtn, () => {
  settingsState.careMode = nextCareMode(settingsState.careMode);
  saveSettings();
  applySettingsUi();
  speakGuide(`已切换到${careModeLabel(settingsState.careMode)}模式`, { force: true });
});

seedButtonsEl.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-crop-id]");
  if (!button) {
    return;
  }
  event.preventDefault();
  game.setSeed(button.dataset.cropId);
  seedHint.textContent = `当前已选择：${button.textContent.trim()}，去点击地块种植。`;
  speakGuide(seedHint.textContent);
});

fieldEl.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-plot-id]");
  if (!button) {
    return;
  }
  event.preventDefault();

  const plot = latestState?.plots.find((item) => item.id === button.dataset.plotId);
  if (!plot) {
    return;
  }

  if (plot.status === "empty") {
    const planted = game.plant(plot.id);
    if (planted) {
      soundFx.plant();
    }
    return;
  }

  if (plot.status === "ready") {
    const harvested = game.harvest(plot.id);
    if (harvested) {
      soundFx.harvest();
    }
  }
});

recipeButtonsEl?.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-recipe-id]");
  if (!button) {
    return;
  }
  event.preventDefault();
  const result = game.startProcess(button.dataset.recipeId);
  if (result.ok) {
    soundFx.craft();
    showToast("加工台已开始工作");
    return;
  }

  if (result.reason === "busy") {
    showToast("加工台正在忙，稍后再试");
    return;
  }
  if (result.reason === "lack-input") {
    showToast("仓库材料不够，先去收获更多作物");
    return;
  }
  showToast("当前还不能加工");
});

bootstrap();
