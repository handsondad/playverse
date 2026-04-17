import { PetClinicGame } from "./petClinicGame.js";
import { createGameAudio } from "../shared/audio.js";

const SETTINGS_KEY = "pet-settings";
const GLOBAL_SETTINGS_KEY = "kids-global-settings";
const BEST_KEY = "pet-best-score";

const FALLBACK_DATA = {
  levels: [
    { id: "easy", name: "晨间接诊", timeLimitSec: 85, targetTreatments: 16, spawnMs: 1500, lives: 4, weatherCycleMs: 9200, emergencyChance: 0.12, vipChance: 0.08, emergencyLimitMs: 2700, roomIds: ["cold", "stomach", "check"] },
    { id: "normal", name: "午后门诊", timeLimitSec: 80, targetTreatments: 22, spawnMs: 1250, lives: 4, weatherCycleMs: 8600, emergencyChance: 0.15, vipChance: 0.1, emergencyLimitMs: 2400, roomIds: ["cold", "stomach", "check", "injury"] },
    { id: "hard", name: "夜间急诊", timeLimitSec: 75, targetTreatments: 28, spawnMs: 1050, lives: 3, weatherCycleMs: 7800, emergencyChance: 0.18, vipChance: 0.12, emergencyLimitMs: 2100, roomIds: ["cold", "stomach", "check", "injury", "eye"] },
  ],
  themes: [
    {
      id: "warm",
      name: "暖心诊所",
      palette: { brand: "#d26b8f", bg: "#fff2f5", panel: "rgba(255, 255, 255, 0.95)" },
      weatherPool: [{ id: "sunny", name: "晴天" }, { id: "cloudy", name: "多云" }, { id: "windy", name: "微风" }],
    },
    {
      id: "garden",
      name: "花园诊所",
      palette: { brand: "#6ea77d", bg: "#f0faef", panel: "rgba(255, 255, 255, 0.95)" },
      weatherPool: [{ id: "sunny", name: "晴天" }, { id: "rainy", name: "细雨" }, { id: "cloudy", name: "薄云" }],
    },
    {
      id: "night",
      name: "夜班诊所",
      palette: { brand: "#7b7fce", bg: "#f1f2ff", panel: "rgba(255, 255, 255, 0.95)" },
      weatherPool: [{ id: "sunny", name: "晴天" }, { id: "aurora", name: "晚霞" }, { id: "windy", name: "夜风" }],
    },
  ],
  rooms: [
    { id: "cold", name: "感冒诊室", emoji: "🤧", color: "#6ea9e5", freq: 520 },
    { id: "stomach", name: "肠胃诊室", emoji: "🤢", color: "#e4a86a", freq: 590 },
    { id: "check", name: "体检诊室", emoji: "🩺", color: "#6fbb87", freq: 650 },
    { id: "injury", name: "外伤诊室", emoji: "🩹", color: "#d97f8b", freq: 720 },
    { id: "eye", name: "眼科诊室", emoji: "👀", color: "#7b8fde", freq: 790 },
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
const roomButtonsEl = document.querySelector("#roomButtons");
const queueList = document.querySelector("#queueList");

const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");
const feedbackText = document.querySelector("#feedbackText");
const weatherText = document.querySelector("#weatherText");
const shellEl = document.querySelector(".pet-shell");

const progressValue = document.querySelector("#progressValue");
const timeValue = document.querySelector("#timeValue");
const livesValue = document.querySelector("#livesValue");
const scoreValue = document.querySelector("#scoreValue");
const streakValue = document.querySelector("#streakValue");
const bestValue = document.querySelector("#bestValue");

const caseLabel = document.querySelector("#caseLabel");
const caseEmoji = document.querySelector("#caseEmoji");
const caseHint = document.querySelector("#caseHint");
const caseTypeBadge = document.querySelector("#caseTypeBadge");

const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

const CARE_MODES = ["standard", "soft", "quiet"];
const settingsState = { voiceOn: true, careMode: "standard", narrationLevel: "key" };
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

let data = FALLBACK_DATA;
let currentLevelId = "easy";
let currentThemeId = "warm";

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

function getRoomById(id) {
  return data.rooms.find((item) => item.id === id) || null;
}

function getThemes() {
  return Array.isArray(data.themes) && data.themes.length > 0 ? data.themes : FALLBACK_DATA.themes;
}

function getThemeById(id) {
  return getThemes().find((item) => item.id === id) || getThemes()[0];
}

function playTone(freq = 560, durationMs = 130) {
  gameAudio.note(freq, { style: "pluck", durationMs, gain: 0.036 });
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
  document.documentElement.style.setProperty("--brand", theme.palette.brand || "#d26b8f");
  document.documentElement.style.setProperty("--bg", theme.palette.bg || "#fff2f5");
  document.documentElement.style.setProperty("--panel", theme.palette.panel || "rgba(255, 255, 255, 0.95)");
}

function renderThemeButtons() {
  if (!themeButtonsEl) {
    return;
  }
  const themes = getThemes();
  themeButtonsEl.innerHTML = themes.map((theme) => {
    const cls = theme.id === currentThemeId ? "theme-btn is-active" : "theme-btn";
    const accent = theme.palette?.brand || "#d26b8f";
    const style = theme.id === currentThemeId
      ? `background: linear-gradient(180deg, ${accent} 0%, #7f5ea5 100%); color: #fff;`
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

function renderRoomButtons(state) {
  const pool = Array.isArray(state?.roomPool) ? state.roomPool : [];
  roomButtonsEl.innerHTML = pool.map((room) => {
    const classes = ["room-btn"];
    if (state.activeCase?.roomId === room.id) {
      classes.push("is-active");
    }
    const disabled = !state.isRunning || !state.activeCase;
    return `<button class="${classes.join(" ")}" data-room-id="${room.id}" style="background:${room.color};" type="button" ${disabled ? "disabled" : ""}><span class="emoji">${room.emoji}</span><span class="name">${room.name}</span></button>`;
  }).join("");
}

function renderQueue(state) {
  const queue = Array.isArray(state?.queue) ? state.queue.slice(0, 5) : [];
  while (queue.length < 5) {
    queue.push(null);
  }
  queueList.innerHTML = queue.map((item) => {
    if (!item) {
      return "<div class=\"queue-item empty\">·</div>";
    }
    const room = getRoomById(item.roomId);
    const cls = ["queue-item"];
    if (item.type === "emergency") {
      cls.push("emergency");
    }
    if (item.type === "vip") {
      cls.push("vip");
    }
    const tag = item.type === "emergency" ? "⚡" : (item.type === "vip" ? "⭐" : "");
    return `<div class="${cls.join(" ")}" title="${room?.name || item.roomId}">${room?.emoji || "🤧"}${tag}</div>`;
  }).join("");
}

function updateUi(state) {
  progressValue.textContent = `${state.treated} / ${state.targetTreatments}`;
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
    ? "看宠物症状，快速点对应诊室完成分诊。"
    : (state.isWin ? "接诊完成，今天的诊所很顺利。" : "看清宠物症状，把它安排到对应诊室。");

  retryBtn.disabled = !state.levelId;

  if (state.activeCase) {
    const room = getRoomById(state.activeCase.roomId);
    caseLabel.textContent = `目标：${room?.name || state.activeCase.roomId}`;
    caseEmoji.textContent = room?.emoji || "🤧";
    if (state.activeCase.type === "emergency") {
      caseHint.textContent = "急诊：要优先安排，等待过久会扣耐心。";
      if (caseTypeBadge) {
        caseTypeBadge.textContent = "急诊";
        caseTypeBadge.className = "badge emergency";
      }
    } else if (state.activeCase.type === "vip") {
      caseHint.textContent = "VIP：分诊正确分数翻倍，分错惩罚更重。";
      if (caseTypeBadge) {
        caseTypeBadge.textContent = "VIP";
        caseTypeBadge.className = "badge vip";
      }
    } else {
      caseHint.textContent = "请选择对应症状的诊室。";
      if (caseTypeBadge) {
        caseTypeBadge.textContent = "普通";
        caseTypeBadge.className = "badge normal";
      }
    }
  } else {
    caseLabel.textContent = "等待病例...";
    caseEmoji.textContent = "🤧";
    caseHint.textContent = "下一位宠物即将到达。";
    if (caseTypeBadge) {
      caseTypeBadge.textContent = "待分诊";
      caseTypeBadge.className = "badge normal";
    }
  }

  renderRoomButtons(state);
  renderQueue(state);
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = payload.isWin ? "接诊成功 ⭐" : "接诊结束，再试一次";
  resultText.textContent = `难度：${payload.levelName} | 接诊：${payload.treated}/${payload.targetTreatments} | 分数：${payload.score} | 耐心：${payload.lives} | 剩余时间：${payload.remainTime} 秒`;
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
  selectorHint.textContent = `已开始：${level.name}，主题 ${theme.name}，目标接诊 ${level.targetTreatments} 位宠物。`;
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

const game = new PetClinicGame({
  onStateChange: updateUi,
  onResult: showResult,
  onToast: (text) => {
    feedbackText.textContent = text;
    speak(text, true);
  },
});

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(dailyBtn, () => startGame(`${todayString()}|${currentLevelId}|${currentThemeId}|pet`));

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
  const theme = getThemeById(currentThemeId);
  selectorHint.textContent = `已选择：${level.name} + ${theme.name}，目标接诊 ${level.targetTreatments} 位宠物。`;
});

if (themeButtonsEl) {
  themeButtonsEl.addEventListener("pointerup", (event) => {
    const button = event.target.closest("[data-theme-id]");
    if (!button) {
      return;
    }
    event.preventDefault();
    currentThemeId = button.dataset.themeId;
    renderThemeButtons();
    const level = getLevelById(currentLevelId);
    const theme = getThemeById(currentThemeId);
    selectorHint.textContent = `已选择：${level.name} + ${theme.name}，目标接诊 ${level.targetTreatments} 位宠物。`;
  });
}

roomButtonsEl.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-room-id]");
  if (!button) {
    return;
  }
  event.preventDefault();
  const roomId = button.dataset.roomId;
  const room = getRoomById(roomId);
  playTone(room?.freq || 560, 120);
  game.assign(roomId);
});

async function loadData() {
  try {
    const response = await fetch("../../configs/levels/pet-clinic.levels.json");
    if (!response.ok) {
      throw new Error(`Failed to load level data: ${response.status}`);
    }
    data = await response.json();
  } catch {
    data = FALLBACK_DATA;
    feedbackText.textContent = "关卡配置加载失败，已切换默认配置。";
  }

  data.levels = Array.isArray(data.levels) && data.levels.length > 0 ? data.levels : FALLBACK_DATA.levels;
  data.themes = Array.isArray(data.themes) && data.themes.length > 0 ? data.themes : FALLBACK_DATA.themes;
  data.rooms = Array.isArray(data.rooms) && data.rooms.length > 0 ? data.rooms : FALLBACK_DATA.rooms;
  data.levels = data.levels.map((level) => ({
    weatherCycleMs: 8500,
    emergencyChance: 0.12,
    vipChance: 0.08,
    emergencyLimitMs: 2400,
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
  selectorHint.textContent = `已选择：${level.name} + ${theme.name}，目标接诊 ${level.targetTreatments} 位宠物。`;
  speak("欢迎来到小小宠物诊所，准备开始。", true);
}

bootstrap();
