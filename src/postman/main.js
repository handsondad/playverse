import { PostmanGame } from "./postmanGame.js";
import { createGameAudio } from "../shared/audio.js";

const SETTINGS_KEY = "postman-settings";
const GLOBAL_SETTINGS_KEY = "kids-global-settings";
const BEST_KEY = "postman-best-score";

const FALLBACK_DATA = {
  levels: [
    { id: "easy", name: "社区慢送", timeLimitSec: 85, targetDeliveries: 16, spawnMs: 1500, lives: 4, expressChance: 0.12, registeredChance: 0.08, expressLimitMs: 2600, mailboxIds: ["red", "blue", "green"] },
    { id: "normal", name: "街区速递", timeLimitSec: 80, targetDeliveries: 22, spawnMs: 1250, lives: 4, expressChance: 0.16, registeredChance: 0.1, expressLimitMs: 2300, mailboxIds: ["red", "blue", "green", "yellow"] },
    { id: "hard", name: "城市急送", timeLimitSec: 75, targetDeliveries: 28, spawnMs: 1050, lives: 3, expressChance: 0.2, registeredChance: 0.12, expressLimitMs: 2000, mailboxIds: ["red", "blue", "green", "yellow", "purple"] },
  ],
  mailboxes: [
    { id: "red", name: "红色信箱", emoji: "📮", color: "#e36a6a", freq: 520 },
    { id: "blue", name: "蓝色信箱", emoji: "📪", color: "#5a9be5", freq: 610 },
    { id: "green", name: "绿色信箱", emoji: "📫", color: "#65b877", freq: 680 },
    { id: "yellow", name: "黄色信箱", emoji: "📬", color: "#e0b354", freq: 740 },
    { id: "purple", name: "紫色信箱", emoji: "📯", color: "#9870db", freq: 810 },
  ],
  themes: [
    {
      id: "classic",
      name: "经典邮局",
      palette: { brand: "#d5754f", bg: "#fff3e2", panel: "rgba(255, 255, 255, 0.95)" },
      weatherPool: [{ id: "sunny", name: "晴天" }, { id: "cloudy", name: "多云" }, { id: "rainy", name: "小雨" }],
    },
    {
      id: "campus",
      name: "校园邮局",
      palette: { brand: "#4a86cf", bg: "#ecf4ff", panel: "rgba(255, 255, 255, 0.95)" },
      weatherPool: [{ id: "sunny", name: "晴天" }, { id: "windy", name: "微风" }, { id: "cloudy", name: "多云" }],
    },
    {
      id: "festival",
      name: "节日邮局",
      palette: { brand: "#b85a9c", bg: "#fff0fa", panel: "rgba(255, 255, 255, 0.95)" },
      weatherPool: [{ id: "sunny", name: "晴天" }, { id: "aurora", name: "晚霞" }, { id: "rainy", name: "细雨" }],
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
const mailboxButtonsEl = document.querySelector("#mailboxButtons");
const queueList = document.querySelector("#queueList");

const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");
const feedbackText = document.querySelector("#feedbackText");
const weatherText = document.querySelector("#weatherText");
const shellEl = document.querySelector(".postman-shell");

const progressValue = document.querySelector("#progressValue");
const timeValue = document.querySelector("#timeValue");
const livesValue = document.querySelector("#livesValue");
const scoreValue = document.querySelector("#scoreValue");
const streakValue = document.querySelector("#streakValue");
const bestValue = document.querySelector("#bestValue");

const mailLabel = document.querySelector("#mailLabel");
const mailEmoji = document.querySelector("#mailEmoji");
const mailHint = document.querySelector("#mailHint");
const mailTypeBadge = document.querySelector("#mailTypeBadge");

const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

const CARE_MODES = ["standard", "soft", "quiet"];
const settingsState = { voiceOn: true, careMode: "standard", narrationLevel: "key" };
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

let data = FALLBACK_DATA;
let currentLevelId = "easy";
let currentThemeId = "classic";
let latestState = null;

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

function getLevelById(id) {
  return data.levels.find((item) => item.id === id) || data.levels[0];
}

function getMailboxById(id) {
  return data.mailboxes.find((item) => item.id === id) || null;
}

function getThemes() {
  return Array.isArray(data.themes) && data.themes.length > 0 ? data.themes : FALLBACK_DATA.themes;
}

function getThemeById(id) {
  return getThemes().find((item) => item.id === id) || getThemes()[0];
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

function playTone(freq = 560, durationMs = 130) {
  gameAudio.note(freq * 0.92, { style: "bell", durationMs: Math.max(90, durationMs - 20), gain: 0.024 });
  gameAudio.note(freq * 1.28, { style: "bell", durationMs: 130, gain: 0.022, delayMs: 86 });
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
  document.documentElement.style.setProperty("--brand", theme.palette.brand || "#d5754f");
  document.documentElement.style.setProperty("--bg", theme.palette.bg || "#fff3e2");
  document.documentElement.style.setProperty("--panel", theme.palette.panel || "rgba(255, 255, 255, 0.95)");
}

function renderThemeButtons() {
  if (!themeButtonsEl) {
    return;
  }
  const themes = getThemes();
  themeButtonsEl.innerHTML = themes.map((theme) => {
    const cls = theme.id === currentThemeId ? "theme-btn is-active" : "theme-btn";
    const accent = theme.palette?.brand || "#d5754f";
    const style = theme.id === currentThemeId
      ? `background: linear-gradient(180deg, ${accent} 0%, #7b5b91 100%); color: #fff;`
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

function renderMailboxButtons(state) {
  const pool = Array.isArray(state?.mailboxPool) ? state.mailboxPool : [];
  mailboxButtonsEl.innerHTML = pool.map((mailbox) => {
    const classes = ["mailbox-btn"];
    if (state.activeMail?.mailboxId === mailbox.id) {
      classes.push("is-active");
    }
    const disabled = !state.isRunning || !state.activeMail;
    return `<button class="${classes.join(" ")}" data-mailbox-id="${mailbox.id}" style="background:${mailbox.color};" type="button" ${disabled ? "disabled" : ""}><span class="emoji">${mailbox.emoji}</span><span class="name">${mailbox.name}</span></button>`;
  }).join("");
}

function renderQueue(state) {
  const queue = Array.isArray(state?.queue) ? state.queue.slice(0, 5) : [];
  while (queue.length < 5) {
    queue.push(null);
  }
  queueList.innerHTML = queue.map((mail) => {
    if (!mail) {
      return "<div class=\"queue-item empty\">·</div>";
    }
    const mailbox = getMailboxById(mail.mailboxId);
    const cls = ["queue-item"];
    if (mail.type === "express") {
      cls.push("express");
    }
    if (mail.type === "registered") {
      cls.push("registered");
    }
    const tag = mail.type === "express" ? "⚡" : (mail.type === "registered" ? "🔒" : "");
    return `<div class="${cls.join(" ")}" title="${mailbox?.name || mail.mailboxId}">${mailbox?.emoji || "✉️"}${tag}</div>`;
  }).join("");
}

function updateUi(state) {
  latestState = state;

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
    ? "看信件颜色，快速点同色信箱完成投递。"
    : (state.isWin ? "投递完成，今天任务很顺利。" : "看清信封颜色，把信件投进同色信箱。");

  retryBtn.disabled = !state.levelId;

  if (state.activeMail) {
    const mailbox = getMailboxById(state.activeMail.mailboxId);
    mailLabel.textContent = `目标：${mailbox?.name || state.activeMail.mailboxId}`;
    mailEmoji.textContent = mailbox?.emoji || "✉️";
    if (state.activeMail.type === "express") {
      mailHint.textContent = "加急件：请尽快投递，超时会扣生命。";
      if (mailTypeBadge) {
        mailTypeBadge.textContent = "加急件";
        mailTypeBadge.className = "badge express";
      }
    } else if (state.activeMail.type === "registered") {
      mailHint.textContent = "挂号件：投递正确奖励更高，投错惩罚更重。";
      if (mailTypeBadge) {
        mailTypeBadge.textContent = "挂号件";
        mailTypeBadge.className = "badge registered";
      }
    } else {
      mailHint.textContent = "请选择对应颜色的信箱。";
      if (mailTypeBadge) {
        mailTypeBadge.textContent = "普通件";
        mailTypeBadge.className = "badge normal";
      }
    }
  } else {
    mailLabel.textContent = "等待信件...";
    mailEmoji.textContent = "✉️";
    mailHint.textContent = "下一封信即将到达。";
    if (mailTypeBadge) {
      mailTypeBadge.textContent = "待分拣";
      mailTypeBadge.className = "badge normal";
    }
  }

  renderMailboxButtons(state);
  renderQueue(state);
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = payload.isWin ? "投递成功 ⭐" : "送信结束，再试一次";
  resultText.textContent = `难度：${payload.levelName} | 投递：${payload.delivered}/${payload.targetDeliveries} | 分数：${payload.score} | 生命：${payload.lives} | 特殊信件：已启用 | 剩余时间：${payload.remainTime} 秒`;
  if (payload.isWin) {
    gameAudio.note(640, { style: "bell", durationMs: 120, gain: 0.022 });
    gameAudio.note(860, { style: "bell", durationMs: 140, gain: 0.022, delayMs: 88 });
    gameAudio.note(1080, { style: "bell", durationMs: 160, gain: 0.02, delayMs: 186 });
  } else {
    gameAudio.lose();
  }
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

const game = new PostmanGame({
  onStateChange: updateUi,
  onResult: showResult,
  onToast: (text) => {
    feedbackText.textContent = text;
    speak(text, true);
  },
});

function startGame(seed = "") {
  resultEl.hidden = true;
  const level = getLevelById(currentLevelId);
  const theme = getThemeById(currentThemeId);
  selectorHint.textContent = `已开始：${level.name}，主题 ${theme.name}，目标投递 ${level.targetDeliveries} 封信。`;
  game.start(level.id, {
    ...(seed ? { seed } : {}),
    weatherPool: theme.weatherPool,
  });
}

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(dailyBtn, () => startGame(`${todayString()}|${currentLevelId}|${currentThemeId}|postman`));

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
  selectorHint.textContent = `已选择：${level.name} + ${theme.name}，目标投递 ${level.targetDeliveries} 封信。`;
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
    selectorHint.textContent = `已选择：${level.name} + ${theme.name}，目标投递 ${level.targetDeliveries} 封信。`;
  });
}

mailboxButtonsEl.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-mailbox-id]");
  if (!button || !latestState?.isRunning || !latestState.activeMail) {
    return;
  }
  event.preventDefault();
  const mailboxId = button.dataset.mailboxId;
  const mailbox = getMailboxById(mailboxId);
  playTone(mailbox?.freq || 560, 120);
  game.deliver(mailboxId);
});

async function bootstrap() {
  try {
    const response = await fetch("../../configs/levels/postman-delivery.levels.json");
    if (!response.ok) {
      throw new Error(`Failed to load levels: ${response.status}`);
    }
    data = await response.json();
  } catch {
    data = FALLBACK_DATA;
    selectorHint.textContent = "配置加载失败，已使用内置路线。";
  }

  data.levels = Array.isArray(data.levels) && data.levels.length > 0 ? data.levels : FALLBACK_DATA.levels;
  data.mailboxes = Array.isArray(data.mailboxes) && data.mailboxes.length > 0 ? data.mailboxes : FALLBACK_DATA.mailboxes;
  data.themes = Array.isArray(data.themes) && data.themes.length > 0 ? data.themes : FALLBACK_DATA.themes;
  data.levels = data.levels.map((level) => ({
    expressChance: 0.15,
    registeredChance: 0.1,
    expressLimitMs: 2300,
    weatherCycleMs: 8500,
    ...level,
  }));

  loadSettings();
  applySettingsUi();

  currentLevelId = data.levels[0].id;
  currentThemeId = data.themes[0].id;
  renderLevelButtons();
  renderThemeButtons();
  game.init(data, loadBestScore());
}

bootstrap();
