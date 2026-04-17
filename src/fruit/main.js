import { FruitGame } from "./fruitGame.js";
import { createGameAudio } from "../shared/audio.js";

const SETTINGS_KEY = "fruit-settings";
const GLOBAL_SETTINGS_KEY = "kids-global-settings";
const BEST_KEY = "fruit-best-score";

const FALLBACK_DATA = {
  levels: [
    { id: "easy", name: "晨间采摘", timeLimitSec: 85, targetDeliveries: 16, spawnMs: 1500, lives: 4, weatherCycleMs: 9200, perishableChance: 0.12, goldenChance: 0.08, spoilLimitMs: 2700, basketIds: ["red", "yellow", "green"] },
    { id: "normal", name: "午后分拣", timeLimitSec: 80, targetDeliveries: 22, spawnMs: 1250, lives: 4, weatherCycleMs: 8600, perishableChance: 0.15, goldenChance: 0.1, spoilLimitMs: 2400, basketIds: ["red", "yellow", "green", "purple"] },
    { id: "hard", name: "傍晚冲刺", timeLimitSec: 75, targetDeliveries: 28, spawnMs: 1050, lives: 3, weatherCycleMs: 7800, perishableChance: 0.18, goldenChance: 0.12, spoilLimitMs: 2100, basketIds: ["red", "yellow", "green", "purple", "blue"] },
  ],
  baskets: [
    { id: "red", name: "红果篮", emoji: "🍎", color: "#e56f67", freq: 520 },
    { id: "yellow", name: "黄果篮", emoji: "🍋", color: "#e2bc55", freq: 590 },
    { id: "green", name: "青果篮", emoji: "🥝", color: "#68bd7a", freq: 650 },
    { id: "purple", name: "紫果篮", emoji: "🍇", color: "#8d77dc", freq: 720 },
    { id: "blue", name: "蓝果篮", emoji: "🫐", color: "#6297e8", freq: 790 },
  ],
  themes: [
    {
      id: "sunrise",
      name: "晨曦果园",
      palette: { brand: "#d47b48", bg: "#fff4e6", panel: "rgba(255, 255, 255, 0.95)" },
      weatherPool: [{ id: "sunny", name: "晴天" }, { id: "cloudy", name: "晨云" }, { id: "windy", name: "微风" }],
    },
    {
      id: "valley",
      name: "山谷果园",
      palette: { brand: "#4f8b62", bg: "#eef8ec", panel: "rgba(255, 255, 255, 0.95)" },
      weatherPool: [{ id: "sunny", name: "晴天" }, { id: "rainy", name: "细雨" }, { id: "cloudy", name: "薄云" }],
    },
    {
      id: "harvest",
      name: "丰收果园",
      palette: { brand: "#b45d3c", bg: "#fff0e5", panel: "rgba(255, 255, 255, 0.95)" },
      weatherPool: [{ id: "sunny", name: "晴天" }, { id: "aurora", name: "晚霞" }, { id: "windy", name: "秋风" }],
    },
  ],
};

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const narrationBtn = document.querySelector("#narrationBtn");
const parentModeBtn = document.querySelector("#parentModeBtn");

const levelButtonsEl = document.querySelector("#levelButtons");
const themeButtonsEl = document.querySelector("#themeButtons");
const basketButtonsEl = document.querySelector("#basketButtons");
const queueList = document.querySelector("#queueList");

const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");
const feedbackText = document.querySelector("#feedbackText");
const weatherText = document.querySelector("#weatherText");
const shellEl = document.querySelector(".fruit-shell");

const progressValue = document.querySelector("#progressValue");
const timeValue = document.querySelector("#timeValue");
const livesValue = document.querySelector("#livesValue");
const scoreValue = document.querySelector("#scoreValue");
const streakValue = document.querySelector("#streakValue");
const bestValue = document.querySelector("#bestValue");

const fruitLabel = document.querySelector("#fruitLabel");
const fruitEmoji = document.querySelector("#fruitEmoji");
const fruitHint = document.querySelector("#fruitHint");
const fruitTypeBadge = document.querySelector("#fruitTypeBadge");

const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

const CARE_MODES = ["standard", "soft", "quiet"];
const settingsState = { voiceOn: true, careMode: "standard", narrationLevel: "key" };
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

let data = FALLBACK_DATA;
let currentLevelId = "easy";
let currentThemeId = "sunrise";

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

function getLevelById(id) {
  return data.levels.find((item) => item.id === id) || data.levels[0];
}

function getBasketById(id) {
  return data.baskets.find((item) => item.id === id) || null;
}

function getThemes() {
  return Array.isArray(data.themes) && data.themes.length > 0 ? data.themes : FALLBACK_DATA.themes;
}

function getThemeById(id) {
  return getThemes().find((item) => item.id === id) || getThemes()[0];
}

function playTone(freq = 560, durationMs = 130) {
  gameAudio.note(freq, { style: "pluck", durationMs, gain: 0.038 });
}

function renderLevelButtons() {
  levelButtonsEl.innerHTML = data.levels.map((level) => {
    const cls = level.id === currentLevelId ? "level-btn is-active" : "level-btn";
    return `<button class="${cls}" data-level-id="${level.id}" type="button">${level.name}</button>`;
  }).join("");
}

function applyThemePalette(theme) {
  if (!theme?.palette) {
    return;
  }
  document.documentElement.style.setProperty("--brand", theme.palette.brand || "#d47b48");
  document.documentElement.style.setProperty("--bg", theme.palette.bg || "#fff4e6");
  document.documentElement.style.setProperty("--panel", theme.palette.panel || "rgba(255, 255, 255, 0.95)");
}

function renderThemeButtons() {
  if (!themeButtonsEl) {
    return;
  }
  const themes = getThemes();
  themeButtonsEl.innerHTML = themes.map((theme) => {
    const cls = theme.id === currentThemeId ? "theme-btn is-active" : "theme-btn";
    const accent = theme.palette?.brand || "#d47b48";
    const style = theme.id === currentThemeId
      ? `background: linear-gradient(180deg, ${accent} 0%, #8d5d48 100%); color: #fff;`
      : `border: 2px solid ${accent};`;
    return `<button class="${cls}" data-theme-id="${theme.id}" style="${style}" type="button">${theme.name}</button>`;
  }).join("");
  applyThemePalette(getThemeById(currentThemeId));
}

function applyWeatherLook(weatherId) {
  if (!shellEl) {
    return;
  }
  shellEl.classList.remove("weather-sunny", "weather-cloudy", "weather-rainy", "weather-windy", "weather-aurora");
  shellEl.classList.add(`weather-${weatherId || "sunny"}`);
}

function renderBasketButtons(state) {
  const pool = Array.isArray(state?.basketPool) ? state.basketPool : [];
  basketButtonsEl.innerHTML = pool.map((basket) => {
    const classes = ["basket-btn"];
    if (state.activeFruit?.basketId === basket.id) {
      classes.push("is-active");
    }
    const disabled = !state.isRunning || !state.activeFruit;
    return `<button class="${classes.join(" ")}" data-basket-id="${basket.id}" style="background:${basket.color};" type="button" ${disabled ? "disabled" : ""}><span class="emoji">${basket.emoji}</span><span class="name">${basket.name}</span></button>`;
  }).join("");
}

function renderQueue(state) {
  const queue = Array.isArray(state?.queue) ? state.queue.slice(0, 5) : [];
  while (queue.length < 5) {
    queue.push(null);
  }
  queueList.innerHTML = queue.map((fruit) => {
    if (!fruit) {
      return "<div class=\"queue-item empty\">·</div>";
    }
    const basket = getBasketById(fruit.basketId);
    const cls = ["queue-item"];
    if (fruit.type === "perishable") {
      cls.push("perishable");
    }
    if (fruit.type === "golden") {
      cls.push("golden");
    }
    const tag = fruit.type === "perishable" ? "⏱" : (fruit.type === "golden" ? "✨" : "");
    return `<div class="${cls.join(" ")}" title="${basket?.name || fruit.basketId}">${basket?.emoji || "🍎"}${tag}</div>`;
  }).join("");
}

function updateUi(state) {
  progressValue.textContent = `${state.delivered} / ${state.targetDeliveries}`;
  timeValue.textContent = `${Math.max(0, Math.ceil(state.timeLeft))} 秒`;
  livesValue.textContent = String(state.lives);
  scoreValue.textContent = String(state.score);
  streakValue.textContent = String(state.streak);
  bestValue.textContent = String(state.bestScore);

  feedbackText.textContent = state.lastEvent;
  if (weatherText) {
    weatherText.textContent = `天气：${state.weatherName || "晴天"}`;
  }
  applyWeatherLook(state.weatherId);
  guideText.textContent = state.isRunning
    ? "看水果颜色，快速点同色果篮完成分拣。"
    : (state.isWin ? "分拣完成，今天的果园任务很顺利。" : "看清水果颜色，把它放进同色果篮。");

  retryBtn.disabled = !state.levelId;

  if (state.activeFruit) {
    const basket = getBasketById(state.activeFruit.basketId);
    fruitLabel.textContent = `目标：${basket?.name || state.activeFruit.basketId}`;
    fruitEmoji.textContent = basket?.emoji || "🍎";
    if (state.activeFruit.type === "perishable") {
      fruitHint.textContent = "易坏果：要尽快分拣，放太久会扣生命。";
      if (fruitTypeBadge) {
        fruitTypeBadge.textContent = "易坏果";
        fruitTypeBadge.className = "badge perishable";
      }
    } else if (state.activeFruit.type === "golden") {
      fruitHint.textContent = "双倍果：分拣正确分数翻倍，分错惩罚更重。";
      if (fruitTypeBadge) {
        fruitTypeBadge.textContent = "双倍果";
        fruitTypeBadge.className = "badge golden";
      }
    } else {
      fruitHint.textContent = "请选择对应颜色的果篮。";
      if (fruitTypeBadge) {
        fruitTypeBadge.textContent = "普通果";
        fruitTypeBadge.className = "badge normal";
      }
    }
  } else {
    fruitLabel.textContent = "等待水果...";
    fruitEmoji.textContent = "🍎";
    fruitHint.textContent = "下一颗水果即将到达。";
    if (fruitTypeBadge) {
      fruitTypeBadge.textContent = "待分拣";
      fruitTypeBadge.className = "badge normal";
    }
  }

  renderBasketButtons(state);
  renderQueue(state);
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = payload.isWin ? "分拣成功 ⭐" : "分拣结束，再试一次";
  resultText.textContent = `难度：${payload.levelName} | 分拣：${payload.delivered}/${payload.targetDeliveries} | 分数：${payload.score} | 生命：${payload.lives} | 剩余时间：${payload.remainTime} 秒`;
  if (payload.bestScore > loadBestScore()) {
    saveBestScore(payload.bestScore);
  }
}

function todayString() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startGame(seed = "") {
  resultEl.hidden = true;
  const level = getLevelById(currentLevelId);
  const theme = getThemeById(currentThemeId);
  selectorHint.textContent = `已开始：${level.name}，主题 ${theme.name}，目标分拣 ${level.targetDeliveries} 篮水果。`;
  game.start(level.id, {
    ...(seed ? { seed } : {}),
    weatherPool: theme.weatherPool,
  });
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

function bindDelegatedTap(container, selector, handler) {
  if (!container) {
    return;
  }

  let lastPointerUpAt = 0;

  container.addEventListener("pointerup", (event) => {
    const button = event.target.closest(selector);
    if (!button) {
      return;
    }
    event.preventDefault();
    lastPointerUpAt = Date.now();
    handler(button);
  });

  container.addEventListener("click", (event) => {
    const button = event.target.closest(selector);
    if (!button) {
      return;
    }
    event.preventDefault();
    // Ignore the synthetic click that often follows pointerup.
    if (Date.now() - lastPointerUpAt < 350) {
      return;
    }
    handler(button);
  });
}

const game = new FruitGame({
  onStateChange: updateUi,
  onResult: showResult,
  onToast: (text) => {
    feedbackText.textContent = text;
    speak(text, true);
  },
});

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(dailyBtn, () => startGame(`${todayString()}|${currentLevelId}|${currentThemeId}|fruit`));

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

bindDelegatedTap(levelButtonsEl, "[data-level-id]", (button) => {
  currentLevelId = button.dataset.levelId;
  renderLevelButtons();
  const level = getLevelById(currentLevelId);
  const theme = getThemeById(currentThemeId);
  selectorHint.textContent = `已选择：${level.name} + ${theme.name}，目标分拣 ${level.targetDeliveries} 篮水果。`;
});

bindDelegatedTap(themeButtonsEl, "[data-theme-id]", (button) => {
  currentThemeId = button.dataset.themeId;
  renderThemeButtons();
  const level = getLevelById(currentLevelId);
  const theme = getThemeById(currentThemeId);
  selectorHint.textContent = `已选择：${level.name} + ${theme.name}，目标分拣 ${level.targetDeliveries} 篮水果。`;
});

bindDelegatedTap(basketButtonsEl, "[data-basket-id]", (button) => {
  const basketId = button.dataset.basketId;
  const basket = getBasketById(basketId);
  playTone(basket?.freq || 560, 120);
  game.sort(basketId);
});

async function loadData() {
  try {
    const response = await fetch("../../configs/levels/fruit-sorter.levels.json");
    if (!response.ok) {
      throw new Error(`Failed to load level data: ${response.status}`);
    }
    data = await response.json();
  } catch {
    data = FALLBACK_DATA;
    feedbackText.textContent = "关卡配置加载失败，已切换默认配置。";
  }

  data.levels = Array.isArray(data.levels) && data.levels.length > 0 ? data.levels : FALLBACK_DATA.levels;
  data.baskets = Array.isArray(data.baskets) && data.baskets.length > 0 ? data.baskets : FALLBACK_DATA.baskets;
  data.themes = Array.isArray(data.themes) && data.themes.length > 0 ? data.themes : FALLBACK_DATA.themes;
  data.levels = data.levels.map((level) => ({
    weatherCycleMs: 8500,
    perishableChance: 0.12,
    goldenChance: 0.08,
    spoilLimitMs: 2400,
    ...level,
  }));

  currentLevelId = data.levels[0].id;
  currentThemeId = data.themes[0].id;
  renderLevelButtons();
  renderThemeButtons();
  game.init(data, loadBestScore());
}

async function bootstrap() {
  loadSettings();
  applySettingsUi();
  await loadData();
  const level = getLevelById(currentLevelId);
  const theme = getThemeById(currentThemeId);
  selectorHint.textContent = `已选择：${level.name} + ${theme.name}，目标分拣 ${level.targetDeliveries} 篮水果。`;
  speak("欢迎来到果园分拣员，准备开始。", true);
}

bootstrap();
