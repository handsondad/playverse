import { ChefGame } from "./chefGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";

const SETTINGS_KEY = "chef-settings";
const GLOBAL_SETTINGS_KEY = "kids-global-settings";
const STATS_KEY = "chef-stats";
const BEST_KEY = "chef-best-score";

const FALLBACK_DATA = {
  levels: [
    { id: "easy", name: "慢慢配", timeLimitSec: 95, targetOrders: 3, menuPool: ["fruit-bowl", "happy-breakfast", "veggie-plate"] },
    { id: "normal", name: "刚刚好", timeLimitSec: 85, targetOrders: 5, menuPool: ["fruit-bowl", "happy-breakfast", "veggie-plate", "sunny-sandwich"] },
    { id: "hard", name: "忙碌厨房", timeLimitSec: 76, targetOrders: 7, menuPool: ["fruit-bowl", "happy-breakfast", "veggie-plate", "sunny-sandwich", "party-snack"] },
  ],
  ingredients: [],
  recipes: [],
};

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const clearTrayBtn = document.querySelector("#clearTrayBtn");
const submitBtn = document.querySelector("#submitBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const narrationBtn = document.querySelector("#narrationBtn");
const parentModeBtn = document.querySelector("#parentModeBtn");

const levelButtonsEl = document.querySelector("#levelButtons");
const themeButtonsEl = document.querySelector("#themeButtons");
const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");
const orderReward = document.querySelector("#orderReward");
const orderName = document.querySelector("#orderName");
const orderNeed = document.querySelector("#orderNeed");
const customerMoodBadge = document.querySelector("#customerMoodBadge");
const traySlots = document.querySelector("#traySlots");
const trayHint = document.querySelector("#trayHint");
const ingredientsGrid = document.querySelector("#ingredientsGrid");
const feedbackText = document.querySelector("#feedbackText");

const scoreValue = document.querySelector("#scoreValue");
const timeValue = document.querySelector("#timeValue");
const ordersValue = document.querySelector("#ordersValue");
const comboValue = document.querySelector("#comboValue");
const bestValue = document.querySelector("#bestValue");
const accuracyValue = document.querySelector("#accuracyValue");

const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

const CARE_MODES = ["standard", "soft", "quiet"];
const settingsState = { voiceOn: true, careMode: "standard", narrationLevel: "key" };
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });
const stats = { plays: 0, completedOrders: 0, wins: 0, bestCombo: 0 };

let latestState = null;
let levelsData = FALLBACK_DATA;
let currentLevelId = "easy";
let currentThemeId = "breakfast";
let draggingIngredientId = "";
let draggingTrayIndex = -1;

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
  return index === -1 ? "standard" : CARE_MODES[(index + 1) % CARE_MODES.length];
}

function speak(text, detailOnly = false) {
  if (!settingsState.voiceOn || !window.speechSynthesis || settingsState.careMode === "quiet") {
    return;
  }
  if (detailOnly && settingsState.narrationLevel !== "detailed") {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = settingsState.careMode === "standard" ? 1 : 0.92;
  window.speechSynthesis.speak(utterance);
}

function loadSettings() {
  try {
    const globalParsed = JSON.parse(localStorage.getItem(GLOBAL_SETTINGS_KEY) || "{}");
    const localParsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const merged = { ...localParsed, ...globalParsed };
    settingsState.voiceOn = merged.voiceOn !== false;
    settingsState.careMode = CARE_MODES.includes(merged.careMode) ? merged.careMode : "standard";
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
    narrationLevel: settingsState.narrationLevel,
    parentMode: settingsState.careMode !== "standard",
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(payload));
}

function applySettingsUi() {
  voiceBtn.textContent = `语音引导：${settingsState.voiceOn ? "开" : "关"}`;
  narrationBtn.textContent = `播报模式：${settingsState.narrationLevel === "detailed" ? "详细" : "关键"}`;
  parentModeBtn.textContent = `护眼模式：${careModeLabel(settingsState.careMode)}`;
}

function loadStats() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATS_KEY) || "{}");
    stats.plays = Number(parsed.plays || 0);
    stats.completedOrders = Number(parsed.completedOrders || 0);
    stats.wins = Number(parsed.wins || 0);
    stats.bestCombo = Number(parsed.bestCombo || 0);
  } catch {
    stats.plays = 0;
    stats.completedOrders = 0;
    stats.wins = 0;
    stats.bestCombo = 0;
  }
}

function saveStats() {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function loadBestScore() {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0);
  } catch {
    return 0;
  }
}

function saveBestScore(score) {
  localStorage.setItem(BEST_KEY, String(score));
}

function getLevelById(levelId) {
  return levelsData.levels.find((item) => item.id === levelId) || levelsData.levels[0];
}

function getIngredient(id) {
  return latestState?.ingredients?.find((item) => item.id === id) || levelsData.ingredients.find((item) => item.id === id) || null;
}

function renderLevelButtons() {
  levelButtonsEl.innerHTML = levelsData.levels.map((level) => {
    const cls = level.id === currentLevelId ? "level-btn is-active" : "level-btn";
    return `<button class="${cls}" data-level-id="${level.id}" type="button">${level.name}</button>`;
  }).join("");
}

function getThemeById(themeId) {
  return (levelsData.themes || []).find((item) => item.id === themeId) || levelsData.themes?.[0] || null;
}

function renderThemeButtons() {
  if (!themeButtonsEl) {
    return;
  }
  const themes = Array.isArray(levelsData.themes) ? levelsData.themes : [];
  themeButtonsEl.innerHTML = themes.map((theme) => {
    const cls = theme.id === currentThemeId ? "theme-btn is-active" : "theme-btn";
    return `<button class="${cls}" data-theme-id="${theme.id}" type="button"><strong>${theme.emoji || "🍽️"} ${theme.name}</strong><small>${theme.description || ""}</small></button>`;
  }).join("");
}

function formatIngredientList(ids) {
  return ids.map((id) => getIngredient(id)?.name || id).join("、");
}

function renderTray(state) {
  const slots = Array.from({ length: state.trayMax }).map((_, index) => {
    const ingredientId = state.tray[index];
    if (!ingredientId) {
      return `<button class="tray-slot" type="button" data-tray-index="${index}"><span>空位</span></button>`;
    }
    const ingredient = getIngredient(ingredientId);
    return `<button class="tray-slot filled" draggable="true" type="button" data-tray-index="${index}"><span class="slot-icon">${ingredient?.icon || "🍽️"}</span><strong>${ingredient?.name || ingredientId}</strong></button>`;
  });
  traySlots.innerHTML = slots.join("");
}

function renderIngredients(state) {
  ingredientsGrid.innerHTML = state.ingredients.map((item) => {
    return `<button class="ingredient-btn" draggable="true" type="button" data-ingredient-id="${item.id}" style="background:${item.color};"><span class="icon">${item.icon}</span><span class="name">${item.name}</span><span class="count">点一下或拖拽到餐盘</span></button>`;
  }).join("");
}

function renderCustomerMood(state) {
  if (!customerMoodBadge) {
    return;
  }
  const mood = state.customerMood || "waiting";
  const moodMap = {
    waiting: { emoji: "🙂", text: "顾客等待中" },
    happy: { emoji: "😊", text: "顾客满意" },
    excited: { emoji: "🤩", text: "顾客超满意" },
    sad: { emoji: "😕", text: "顾客有点失望" },
  };
  const detail = moodMap[mood] || moodMap.waiting;
  customerMoodBadge.className = `customer-badge ${mood}`;
  customerMoodBadge.textContent = `${detail.emoji} ${state.customerMoodText || detail.text}`;
}

function updateUi(state) {
  latestState = state;
  scoreValue.textContent = String(state.score);
  timeValue.textContent = `${Math.max(0, Math.ceil(state.timeLeft))} 秒`;
  ordersValue.textContent = `${state.ordersDone} / ${state.targetOrders}`;
  comboValue.textContent = String(state.combo);
  bestValue.textContent = String(state.bestScore);
  accuracyValue.textContent = `${state.accuracy}%`;

  submitBtn.disabled = !state.isRunning;
  clearTrayBtn.disabled = !state.isRunning || state.tray.length === 0;
  retryBtn.disabled = !state.levelId;

  if (state.currentOrder) {
    orderReward.textContent = `奖励 ${state.currentOrder.reward} 分`;
    orderName.textContent = state.currentOrder.name;
    orderNeed.textContent = `所需食材：${formatIngredientList(state.currentOrder.ingredients)}`;
  } else {
    orderReward.textContent = "奖励 0 分";
    orderName.textContent = "请先开始营业";
    orderNeed.textContent = "所需食材会显示在这里。";
  }

  trayHint.textContent = state.tray.length > 0
    ? `当前已放入：${formatIngredientList(state.tray)}`
    : "先从下方食材区点选食材放进餐盘。";
  feedbackText.textContent = state.lastFeedback;
  guideText.textContent = state.isRunning
    ? `完成 ${state.targetOrders} 单即可通关（当前：${state.currentThemeName || "主题菜单"}）。`
    : (state.isWin ? "营业成功，顾客们都很满意。" : "看清订单后，把需要的食材点到餐盘里，再点击提交。");

  renderTray(state);
  renderIngredients(state);
  renderCustomerMood(state);
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = payload.isWin ? "营业成功 ⭐" : "营业结束，再试一次";
  resultText.textContent = `难度：${payload.levelName} | 分数：${payload.score} | 完成订单：${payload.ordersDone}/${payload.targetOrders} | 准确率：${payload.accuracy}% | 最高连击：${payload.bestCombo}`;
  payload.isWin ? gameAudio.win() : gameAudio.lose();

  stats.plays += 1;
  stats.completedOrders += payload.ordersDone;
  if (payload.isWin) {
    stats.wins += 1;
  }
  stats.bestCombo = Math.max(stats.bestCombo, payload.bestCombo);
  saveStats();

  if (payload.score > loadBestScore()) {
    saveBestScore(payload.score);
  }
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function bindSoftTap(button, handler) {
  button.addEventListener("pointerup", (event) => {
    event.preventDefault();
    if (button.disabled) {
      return;
    }
    handler();
  });
  button.addEventListener("click", (event) => event.preventDefault());
}

const game = new ChefGame({
  onStateChange: updateUi,
  onResult: showResult,
  onToast: (text) => {
    feedbackText.textContent = text;
    speak(text, true);
  },
});

bindUiTapSounds(document.body, gameAudio);

function startGame(seed = "") {
  resultEl.hidden = true;
  const level = getLevelById(currentLevelId);
  const theme = getThemeById(currentThemeId);
  selectorHint.textContent = `已开始：${level.name} / ${theme?.name || "主题菜单"}，目标完成 ${level.targetOrders} 单。`;
  game.start(level.id, seed ? { seed, themeId: theme?.id || "", themeName: theme?.name || "" } : { themeId: theme?.id || "", themeName: theme?.name || "" });
}

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(dailyBtn, () => startGame(`${todayString()}|${currentLevelId}|chef`));
bindSoftTap(clearTrayBtn, () => game.clearTray());
bindSoftTap(submitBtn, () => game.submitTray());

bindSoftTap(voiceBtn, () => {
  settingsState.voiceOn = !settingsState.voiceOn;
  saveSettings();
  applySettingsUi();
});

bindSoftTap(narrationBtn, () => {
  settingsState.narrationLevel = settingsState.narrationLevel === "detailed" ? "key" : "detailed";
  saveSettings();
  applySettingsUi();
});

bindSoftTap(parentModeBtn, () => {
  settingsState.careMode = nextCareMode(settingsState.careMode);
  saveSettings();
  applySettingsUi();
});

levelButtonsEl.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-level-id]");
  if (!button) {
    return;
  }
  event.preventDefault();
  currentLevelId = button.dataset.levelId;
  renderLevelButtons();
  const level = getLevelById(currentLevelId);
  selectorHint.textContent = `已选择：${level.name}，目标 ${level.targetOrders} 单。`;
});

themeButtonsEl?.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-theme-id]");
  if (!button) {
    return;
  }
  event.preventDefault();
  currentThemeId = button.dataset.themeId;
  renderThemeButtons();
  const theme = getThemeById(currentThemeId);
  selectorHint.textContent = `已切换菜单主题：${theme?.name || "主题菜单"}`;
});

ingredientsGrid.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-ingredient-id]");
  if (!button) {
    return;
  }
  event.preventDefault();
  game.addIngredient(button.dataset.ingredientId);
});

ingredientsGrid.addEventListener("dragstart", (event) => {
  const button = event.target.closest("[data-ingredient-id]");
  if (!button) {
    return;
  }
  draggingIngredientId = button.dataset.ingredientId;
  draggingTrayIndex = -1;
  button.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "copy";
});

ingredientsGrid.addEventListener("dragend", (event) => {
  const button = event.target.closest("[data-ingredient-id]");
  button?.classList.remove("is-dragging");
  draggingIngredientId = "";
});

traySlots.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-tray-index]");
  if (!button) {
    return;
  }
  event.preventDefault();
  const index = Number(button.dataset.trayIndex);
  if (Number.isInteger(index) && latestState?.tray[index]) {
    game.removeTrayAt(index);
  }
});

traySlots.addEventListener("dragstart", (event) => {
  const slot = event.target.closest("[data-tray-index]");
  if (!slot || !slot.classList.contains("filled")) {
    return;
  }
  const index = Number(slot.dataset.trayIndex);
  if (!Number.isInteger(index)) {
    return;
  }
  draggingTrayIndex = index;
  draggingIngredientId = "";
  event.dataTransfer.effectAllowed = "move";
});

traySlots.addEventListener("dragover", (event) => {
  const slot = event.target.closest("[data-tray-index]");
  if (!slot) {
    return;
  }
  event.preventDefault();
  slot.classList.add("drag-over");
  event.dataTransfer.dropEffect = draggingTrayIndex !== -1 ? "move" : "copy";
});

traySlots.addEventListener("dragleave", (event) => {
  const slot = event.target.closest("[data-tray-index]");
  slot?.classList.remove("drag-over");
});

traySlots.addEventListener("drop", (event) => {
  const slot = event.target.closest("[data-tray-index]");
  if (!slot) {
    return;
  }
  event.preventDefault();
  slot.classList.remove("drag-over");
  const toIndex = Number(slot.dataset.trayIndex);
  if (!Number.isInteger(toIndex)) {
    return;
  }

  if (draggingTrayIndex !== -1) {
    game.moveTrayItem(draggingTrayIndex, toIndex);
    draggingTrayIndex = -1;
    draggingIngredientId = "";
    return;
  }

  if (draggingIngredientId) {
    game.placeIngredientAt(toIndex, draggingIngredientId);
    draggingIngredientId = "";
  }
});

traySlots.addEventListener("dragend", () => {
  traySlots.querySelectorAll(".drag-over").forEach((node) => node.classList.remove("drag-over"));
  draggingTrayIndex = -1;
  draggingIngredientId = "";
});

async function bootstrap() {
  try {
    const response = await fetch("../../configs/levels/chef-plating.levels.json");
    if (!response.ok) {
      throw new Error(`Failed to load levels: ${response.status}`);
    }
    levelsData = await response.json();
  } catch {
    levelsData = FALLBACK_DATA;
    selectorHint.textContent = "菜单配置加载失败，已使用内置数据。";
  }

  levelsData.levels = Array.isArray(levelsData.levels) && levelsData.levels.length > 0 ? levelsData.levels : FALLBACK_DATA.levels;
  levelsData.themes = Array.isArray(levelsData.themes) && levelsData.themes.length > 0
    ? levelsData.themes
    : [
        { id: "breakfast", name: "早餐厨房", emoji: "🍳", description: "面包和鸡蛋主题，节奏轻快。" },
        { id: "picnic", name: "野餐时光", emoji: "🧺", description: "水果和轻食主题，适合休闲配餐。" },
        { id: "festival", name: "节日派对", emoji: "🎉", description: "点心和拼盘主题，组合更丰富。" },
      ];
  levelsData.ingredients = Array.isArray(levelsData.ingredients) ? levelsData.ingredients : [];
  levelsData.recipes = Array.isArray(levelsData.recipes) ? levelsData.recipes : [];

  loadSettings();
  loadStats();
  applySettingsUi();

  currentLevelId = levelsData.levels[0].id;
  currentThemeId = levelsData.themes[0]?.id || "breakfast";
  renderLevelButtons();
  renderThemeButtons();
  game.init(levelsData, loadBestScore());
}

bootstrap();
