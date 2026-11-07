import { ForestGame } from "./forestGame.js";
import { createGameAudio } from "../shared/audio.js";
import { careModeLabel, loadSettings, nextCareMode, saveSettings } from "../shared/settings.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { bindSoftTap } from "../shared/tap.js";
import { todayString } from "../shared/random.js";
import { readNumber, writeValue } from "../shared/storage.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { setHtml } from "../shared/dom.js";

const SETTINGS_KEY = "forest-settings";
const BEST_KEY = "forest-best-score";

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const narrationBtn = document.querySelector("#narrationBtn");
const parentModeBtn = document.querySelector("#parentModeBtn");

const levelButtonsEl = document.querySelector("#levelButtons");
const themeButtonsEl = document.querySelector("#themeButtons");
const stationButtonsEl = document.querySelector("#stationButtons");
const queueList = document.querySelector("#queueList");

const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");
const feedbackText = document.querySelector("#feedbackText");
const weatherText = document.querySelector("#weatherText");
const shellEl = document.querySelector(".forest-shell");

const progressValue = document.querySelector("#progressValue");
const timeValue = document.querySelector("#timeValue");
const livesValue = document.querySelector("#livesValue");
const scoreValue = document.querySelector("#scoreValue");
const streakValue = document.querySelector("#streakValue");
const bestValue = document.querySelector("#bestValue");

const clueLabel = document.querySelector("#clueLabel");
const clueEmoji = document.querySelector("#clueEmoji");
const clueHint = document.querySelector("#clueHint");
const clueTypeBadge = document.querySelector("#clueTypeBadge");

const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

const settingsState = loadSettings(SETTINGS_KEY);
const speak = createSpeaker(settingsState, SPEECH_PRESETS.standard);
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

let data = null;
let currentLevelId = "easy";
let currentThemeId = "pine";

function applySettingsUi() {
  voiceBtn.textContent = `语音引导：${settingsState.voiceOn ? "开" : "关"}`;
  narrationBtn.textContent = `播报模式：${settingsState.narrationLevel === "detailed" ? "详细" : "关键"}`;
  parentModeBtn.textContent = `护眼模式：${careModeLabel(settingsState.careMode)}`;
}

function getLevelById(id) {
  return data.levels.find((item) => item.id === id) || data.levels[0];
}

function getStationById(id) {
  return data.stations.find((item) => item.id === id) || null;
}

function getThemes() {
  return data.themes;
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
  document.documentElement.style.setProperty("--brand", theme.palette.brand || "#6b9d56");
  document.documentElement.style.setProperty("--bg", theme.palette.bg || "#eef7e8");
  document.documentElement.style.setProperty("--panel", theme.palette.panel || "rgba(255, 255, 255, 0.95)");
}

function renderThemeButtons() {
  if (!themeButtonsEl) {
    return;
  }
  const themes = getThemes();
  themeButtonsEl.innerHTML = themes.map((theme) => {
    const cls = theme.id === currentThemeId ? "theme-btn is-active" : "theme-btn";
    const accent = theme.palette?.brand || "#6b9d56";
    const style = theme.id === currentThemeId
      ? `background: linear-gradient(180deg, ${accent} 0%, #3d6130 100%); color: #fff;`
      : `border: 2px solid ${accent};`;
    return `<button class="${cls}" data-theme-id="${theme.id}" style="${style}" type="button">${theme.name}</button>`;
  }).join("");
  applyThemePalette(getThemeById(currentThemeId));
}

function applyWeatherLook(weatherId) {
  if (!shellEl) {
    return;
  }
  shellEl.classList.remove("weather-sunny", "weather-cloudy", "weather-rainy", "weather-windy", "weather-mist");
  shellEl.classList.add(`weather-${weatherId || "sunny"}`);
}

function renderStationButtons(state) {
  const pool = Array.isArray(state?.stationPool) ? state.stationPool : [];
  setHtml(stationButtonsEl, pool.map((station) => {
    const classes = ["station-btn"];
    if (state.activeClue?.stationId === station.id) {
      classes.push("is-active");
    }
    const disabled = !state.isRunning || !state.activeClue;
    return `<button class="${classes.join(" ")}" data-station-id="${station.id}" style="background:${station.color};" type="button" ${disabled ? "disabled" : ""}><span class="emoji">${station.emoji}</span><span class="name">${station.name}</span></button>`;
  }).join(""));
}

function renderQueue(state) {
  const queue = Array.isArray(state?.queue) ? state.queue.slice(0, 5) : [];
  while (queue.length < 5) {
    queue.push(null);
  }
  setHtml(queueList, queue.map((item) => {
    if (!item) {
      return "<div class=\"queue-item empty\">·</div>";
    }
    const station = getStationById(item.stationId);
    const cls = ["queue-item"];
    if (item.type === "urgent") {
      cls.push("urgent");
    }
    if (item.type === "rare") {
      cls.push("rare");
    }
    const tag = item.type === "urgent" ? "⚡" : (item.type === "rare" ? "⭐" : "");
    return `<div class="${cls.join(" ")}" title="${station?.name || item.stationId}">${station?.emoji || "🐾"}${tag}</div>`;
  }).join(""));
}

function updateUi(state) {
  progressValue.textContent = `${state.found} / ${state.targetFindings}`;
  timeValue.textContent = `${Math.max(0, Math.ceil(state.timeLeft))} 秒`;
  livesValue.textContent = String(state.lives);
  scoreValue.textContent = String(state.score);
  streakValue.textContent = String(state.streak);
  bestValue.textContent = String(state.bestScore);

  feedbackText.textContent = state.lastEvent;
  if (weatherText) {
    weatherText.textContent = `天气：${state.weatherName || "晴光"}`;
  }
  applyWeatherLook(state.weatherId);
  guideText.textContent = state.isRunning
    ? "看森林线索，快速点对应观察站完成登记。"
    : (state.isWin ? "巡护完成，今天的森林记录很完整。" : "看清森林线索，把它送到对应观察站。");

  retryBtn.disabled = !state.levelId;

  if (state.activeClue) {
    const station = getStationById(state.activeClue.stationId);
    clueLabel.textContent = `目标：${station?.name || state.activeClue.stationId}`;
    clueEmoji.textContent = station?.emoji || "🐾";
    if (state.activeClue.type === "urgent") {
      clueHint.textContent = "紧急线索：要优先处理，拖太久会扣体力。";
      if (clueTypeBadge) {
        clueTypeBadge.textContent = "紧急";
        clueTypeBadge.className = "badge urgent";
      }
    } else if (state.activeClue.type === "rare") {
      clueHint.textContent = "稀有线索：识别正确双倍分，分错惩罚更重。";
      if (clueTypeBadge) {
        clueTypeBadge.textContent = "稀有";
        clueTypeBadge.className = "badge rare";
      }
    } else {
      clueHint.textContent = "请选择对应线索的观察站。";
      if (clueTypeBadge) {
        clueTypeBadge.textContent = "普通";
        clueTypeBadge.className = "badge normal";
      }
    }
  } else {
    clueLabel.textContent = "等待线索...";
    clueEmoji.textContent = "🐾";
    clueHint.textContent = "下一条线索即将出现。";
    if (clueTypeBadge) {
      clueTypeBadge.textContent = "待识别";
      clueTypeBadge.className = "badge normal";
    }
  }

  renderStationButtons(state);
  renderQueue(state);
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = payload.isWin ? "巡护成功 ⭐" : "巡护结束，再试一次";
  resultText.textContent = `难度：${payload.levelName} | 识别：${payload.found}/${payload.targetFindings} | 分数：${payload.score} | 体力：${payload.lives} | 剩余时间：${payload.remainTime} 秒`;
  if (payload.bestScore > readNumber(BEST_KEY)) {
    writeValue(BEST_KEY, payload.bestScore);
  }
}

function startGame(seed = "") {
  resultEl.hidden = true;
  const level = getLevelById(currentLevelId);
  const theme = getThemeById(currentThemeId);
  selectorHint.textContent = `已开始：${level.name}，主题 ${theme.name}，目标识别 ${level.targetFindings} 条线索。`;
  game.start(level.id, {
    ...(seed ? { seed } : {}),
    weatherPool: theme.weatherPool,
  });
}

const game = new ForestGame({
  onStateChange: updateUi,
  onResult: showResult,
  onToast: (text) => {
    feedbackText.textContent = text;
    speak(text, { detailOnly: true });
  },
});

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(dailyBtn, () => startGame(`${todayString()}|${currentLevelId}|${currentThemeId}|forest`));

bindSoftTap(voiceBtn, () => {
  settingsState.voiceOn = !settingsState.voiceOn;
  saveSettings(SETTINGS_KEY, settingsState);
  applySettingsUi();
});

bindSoftTap(narrationBtn, () => {
  settingsState.narrationLevel = settingsState.narrationLevel === "detailed" ? "key" : "detailed";
  saveSettings(SETTINGS_KEY, settingsState);
  applySettingsUi();
});

bindSoftTap(parentModeBtn, () => {
  settingsState.careMode = nextCareMode(settingsState.careMode);
  saveSettings(SETTINGS_KEY, settingsState);
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
  selectorHint.textContent = `已选择：${level.name} + ${theme.name}，目标识别 ${level.targetFindings} 条线索。`;
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
    selectorHint.textContent = `已选择：${level.name} + ${theme.name}，目标识别 ${level.targetFindings} 条线索。`;
  });
}

stationButtonsEl.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-station-id]");
  if (!button) {
    return;
  }
  event.preventDefault();
  const stationId = button.dataset.stationId;
  const station = getStationById(stationId);
  playTone(station?.freq || 560, 120);
  game.submit(stationId);
});

async function loadData() {
  try {
    data = await loadGameConfig("../../configs/levels/forest-ranger.levels.json", ["levels", "themes", "stations"]);
  } catch (error) {
    showConfigError(error);
    return false;
  }

  data.levels = data.levels.map((level) => ({
    weatherCycleMs: 8500,
    urgentChance: 0.12,
    rareChance: 0.08,
    urgentLimitMs: 2400,
    ...level,
  }));

  currentLevelId = data.levels[0].id;
  currentThemeId = data.themes[0].id;
  renderLevelButtons();
  renderThemeButtons();
  game.init(data, readNumber(BEST_KEY));
  return true;
}

async function bootstrap() {
  applySettingsUi();
  if (!(await loadData())) {
    return;
  }
  const level = getLevelById(currentLevelId);
  const theme = getThemeById(currentThemeId);
  selectorHint.textContent = `已选择：${level.name} + ${theme.name}，目标识别 ${level.targetFindings} 条线索。`;
  speak("欢迎来到森林巡护员，准备开始。", { detailOnly: true });
}

bootstrap();
