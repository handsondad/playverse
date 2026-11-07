import { OceanGame } from "./oceanGame.js";
import { createGameAudio } from "../shared/audio.js";
import { careModeLabel, loadSettings, nextCareMode, saveSettings } from "../shared/settings.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { bindSoftTap } from "../shared/tap.js";
import { todayString } from "../shared/random.js";
import { readNumber, writeValue } from "../shared/storage.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { setHtml } from "../shared/dom.js";

const SETTINGS_KEY = "ocean-settings";
const BEST_KEY = "ocean-best-score";

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const narrationBtn = document.querySelector("#narrationBtn");
const parentModeBtn = document.querySelector("#parentModeBtn");

const levelButtonsEl = document.querySelector("#levelButtons");
const themeButtonsEl = document.querySelector("#themeButtons");
const netButtonsEl = document.querySelector("#netButtons");
const queueList = document.querySelector("#queueList");

const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");
const feedbackText = document.querySelector("#feedbackText");
const weatherText = document.querySelector("#weatherText");
const shellEl = document.querySelector(".ocean-shell");

const progressValue = document.querySelector("#progressValue");
const timeValue = document.querySelector("#timeValue");
const livesValue = document.querySelector("#livesValue");
const scoreValue = document.querySelector("#scoreValue");
const streakValue = document.querySelector("#streakValue");
const bestValue = document.querySelector("#bestValue");

const trashLabel = document.querySelector("#trashLabel");
const trashEmoji = document.querySelector("#trashEmoji");
const trashHint = document.querySelector("#trashHint");
const trashTypeBadge = document.querySelector("#trashTypeBadge");

const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

const settingsState = loadSettings(SETTINGS_KEY);
const speak = createSpeaker(settingsState, SPEECH_PRESETS.standard);
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

let data = null;
let currentLevelId = "easy";
let currentThemeId = "bay";

function applySettingsUi() {
  voiceBtn.textContent = `语音引导：${settingsState.voiceOn ? "开" : "关"}`;
  narrationBtn.textContent = `播报模式：${settingsState.narrationLevel === "detailed" ? "详细" : "关键"}`;
  parentModeBtn.textContent = `护眼模式：${careModeLabel(settingsState.careMode)}`;
}

function getLevelById(id) {
  return data.levels.find((item) => item.id === id) || data.levels[0];
}

function getNetById(id) {
  return data.nets.find((item) => item.id === id) || null;
}

function getThemes() {
  return data.themes;
}

function getThemeById(id) {
  return getThemes().find((item) => item.id === id) || getThemes()[0];
}

function playTone(freq = 560, durationMs = 130) {
  gameAudio.pop(Math.min(980, freq * 1.4));
  gameAudio.note(freq * 0.82, { style: "pluck", durationMs: Math.max(80, durationMs - 18), gain: 0.028 });
  gameAudio.note(freq * 1.1, { style: "bell", durationMs: 110, gain: 0.016, delayMs: 42 });
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
  document.documentElement.style.setProperty("--brand", theme.palette.brand || "#3f8fce");
  document.documentElement.style.setProperty("--bg", theme.palette.bg || "#e7f4ff");
  document.documentElement.style.setProperty("--panel", theme.palette.panel || "rgba(255, 255, 255, 0.95)");
}

function renderThemeButtons() {
  if (!themeButtonsEl) {
    return;
  }
  const themes = getThemes();
  themeButtonsEl.innerHTML = themes.map((theme) => {
    const cls = theme.id === currentThemeId ? "theme-btn is-active" : "theme-btn";
    const accent = theme.palette?.brand || "#3f8fce";
    const style = theme.id === currentThemeId
      ? `background: linear-gradient(180deg, ${accent} 0%, #4769a3 100%); color: #fff;`
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

function renderNetButtons(state) {
  const pool = Array.isArray(state?.netPool) ? state.netPool : [];
  setHtml(netButtonsEl, pool.map((net) => {
    const classes = ["net-btn"];
    if (state.activeTrash?.netId === net.id) {
      classes.push("is-active");
    }
    const disabled = !state.isRunning || !state.activeTrash;
    return `<button class="${classes.join(" ")}" data-net-id="${net.id}" style="background:${net.color};" type="button" ${disabled ? "disabled" : ""}><span class="emoji">${net.emoji}</span><span class="name">${net.name}</span></button>`;
  }).join(""));
}

function renderQueue(state) {
  const queue = Array.isArray(state?.queue) ? state.queue.slice(0, 5) : [];
  while (queue.length < 5) {
    queue.push(null);
  }
  setHtml(queueList, queue.map((trash) => {
    if (!trash) {
      return "<div class=\"queue-item empty\">·</div>";
    }
    const net = getNetById(trash.netId);
    const cls = ["queue-item"];
    if (trash.type === "hazard") {
      cls.push("hazard");
    }
    if (trash.type === "treasure") {
      cls.push("treasure");
    }
    const tag = trash.type === "hazard" ? "☣" : (trash.type === "treasure" ? "✨" : "");
    return `<div class="${cls.join(" ")}" title="${net?.name || trash.netId}">${net?.emoji || "🧴"}${tag}</div>`;
  }).join(""));
}

function updateUi(state) {
  progressValue.textContent = `${state.cleaned} / ${state.targetCleanups}`;
  timeValue.textContent = `${Math.max(0, Math.ceil(state.timeLeft))} 秒`;
  livesValue.textContent = String(state.lives);
  scoreValue.textContent = String(state.score);
  streakValue.textContent = String(state.streak);
  bestValue.textContent = String(state.bestScore);

  feedbackText.textContent = state.lastEvent;
  if (weatherText) {
    weatherText.textContent = `海况：${state.weatherName || "晴海"}`;
  }
  applyWeatherLook(state.weatherId);
  guideText.textContent = state.isRunning
    ? "看漂浮物类型，快速点对应回收网完成清理。"
    : (state.isWin ? "清理完成，海域恢复清澈。" : "看清漂浮物类型，把它放进对应回收网。");

  retryBtn.disabled = !state.levelId;

  if (state.activeTrash) {
    const net = getNetById(state.activeTrash.netId);
    trashLabel.textContent = `目标：${net?.name || state.activeTrash.netId}`;
    trashEmoji.textContent = net?.emoji || "🧴";
    if (state.activeTrash.type === "hazard") {
      trashHint.textContent = "危险品：要优先清理，扩散会扣生命。";
      if (trashTypeBadge) {
        trashTypeBadge.textContent = "危险品";
        trashTypeBadge.className = "badge hazard";
      }
    } else if (state.activeTrash.type === "treasure") {
      trashHint.textContent = "宝藏件：清理成功分数翻倍，分错惩罚更重。";
      if (trashTypeBadge) {
        trashTypeBadge.textContent = "宝藏件";
        trashTypeBadge.className = "badge treasure";
      }
    } else {
      trashHint.textContent = "请选择对应类型的回收网。";
      if (trashTypeBadge) {
        trashTypeBadge.textContent = "普通件";
        trashTypeBadge.className = "badge normal";
      }
    }
  } else {
    trashLabel.textContent = "等待漂浮物...";
    trashEmoji.textContent = "🧴";
    trashHint.textContent = "下一批漂浮物即将到达。";
    if (trashTypeBadge) {
      trashTypeBadge.textContent = "待处理";
      trashTypeBadge.className = "badge normal";
    }
  }

  renderNetButtons(state);
  renderQueue(state);
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = payload.isWin ? "清理成功 ⭐" : "清理结束，再试一次";
  resultText.textContent = `难度：${payload.levelName} | 清理：${payload.cleaned}/${payload.targetCleanups} | 分数：${payload.score} | 生命：${payload.lives} | 剩余时间：${payload.remainTime} 秒`;
  if (payload.isWin) {
    gameAudio.pop(760);
    gameAudio.success(760);
    gameAudio.sparkle(920);
  } else {
    gameAudio.lose();
  }
  if (payload.bestScore > readNumber(BEST_KEY)) {
    writeValue(BEST_KEY, payload.bestScore);
  }
}

function startGame(seed = "") {
  resultEl.hidden = true;
  const level = getLevelById(currentLevelId);
  const theme = getThemeById(currentThemeId);
  selectorHint.textContent = `已开始：${level.name}，主题 ${theme.name}，目标清理 ${level.targetCleanups} 份漂浮物。`;
  game.start(level.id, {
    ...(seed ? { seed } : {}),
    weatherPool: theme.weatherPool,
  });
}

const game = new OceanGame({
  onStateChange: updateUi,
  onResult: showResult,
  onToast: (text) => {
    feedbackText.textContent = text;
    speak(text, { detailOnly: true });
  },
});

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(dailyBtn, () => startGame(`${todayString()}|${currentLevelId}|${currentThemeId}|ocean`));

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
  selectorHint.textContent = `已选择：${level.name} + ${theme.name}，目标清理 ${level.targetCleanups} 份漂浮物。`;
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
    selectorHint.textContent = `已选择：${level.name} + ${theme.name}，目标清理 ${level.targetCleanups} 份漂浮物。`;
  });
}

netButtonsEl.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-net-id]");
  if (!button) {
    return;
  }
  event.preventDefault();
  const netId = button.dataset.netId;
  const net = getNetById(netId);
  playTone(net?.freq || 560, 120);
  game.cleanup(netId);
});

async function loadData() {
  try {
    data = await loadGameConfig("../../configs/levels/ocean-cleanup.levels.json", ["levels", "themes", "nets"]);
  } catch (error) {
    showConfigError(error);
    return false;
  }

  data.levels = data.levels.map((level) => ({
    weatherCycleMs: 8500,
    hazardChance: 0.12,
    treasureChance: 0.08,
    hazardLimitMs: 2400,
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
  selectorHint.textContent = `已选择：${level.name} + ${theme.name}，目标清理 ${level.targetCleanups} 份漂浮物。`;
  speak("欢迎加入海底清洁队，准备开始。", { detailOnly: true });
}

bootstrap();
