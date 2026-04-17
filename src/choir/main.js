import { ChoirGame } from "./choirGame.js";
import { createGameAudio } from "../shared/audio.js";

const SETTINGS_KEY = "choir-settings";
const GLOBAL_SETTINGS_KEY = "kids-global-settings";
const BEST_KEY = "choir-best-streak";

const FALLBACK_DATA = {
  themes: [
    {
      id: "forest",
      name: "森林合唱",
      wave: "triangle",
      toneShift: 0,
      tempoMs: 360,
      gapMs: 140,
      gain: 1,
      palette: { accent: "#5f9f6c", accentSoft: "#e6f4ea" },
    },
    {
      id: "ocean",
      name: "海洋合唱",
      wave: "sine",
      toneShift: -3,
      tempoMs: 380,
      gapMs: 150,
      gain: 0.9,
      palette: { accent: "#4c96d8", accentSoft: "#e4f1fb" },
    },
    {
      id: "farm",
      name: "农场合唱",
      wave: "square",
      toneShift: 4,
      tempoMs: 340,
      gapMs: 120,
      gain: 0.85,
      palette: { accent: "#cc8d45", accentSoft: "#fff3e2" },
    },
  ],
  levels: [
    { id: "easy", name: "慢慢唱", targetRounds: 5, timeLimitSec: 85, animalIds: ["cat", "dog", "duck", "frog"] },
    { id: "normal", name: "刚刚好", targetRounds: 7, timeLimitSec: 80, animalIds: ["cat", "dog", "duck", "frog", "cow"] },
    { id: "hard", name: "合唱大师", targetRounds: 9, timeLimitSec: 75, animalIds: ["cat", "dog", "duck", "frog", "cow", "sheep"] },
  ],
  animals: [
    { id: "cat", name: "小猫", emoji: "🐱", freq: 523, color: "#f19c79" },
    { id: "dog", name: "小狗", emoji: "🐶", freq: 587, color: "#7cb4f8" },
    { id: "duck", name: "小鸭", emoji: "🦆", freq: 659, color: "#f2cc67" },
    { id: "frog", name: "小青蛙", emoji: "🐸", freq: 698, color: "#7fd48e" },
    { id: "cow", name: "小牛", emoji: "🐮", freq: 784, color: "#b7a3f0" },
    { id: "sheep", name: "小羊", emoji: "🐑", freq: 880, color: "#f7b0c1" },
  ],
};

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const hintBtn = document.querySelector("#hintBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const narrationBtn = document.querySelector("#narrationBtn");
const parentModeBtn = document.querySelector("#parentModeBtn");

const levelButtonsEl = document.querySelector("#levelButtons");
const themeButtonsEl = document.querySelector("#themeButtons");
const selectorHint = document.querySelector("#selectorHint");
const hintText = document.querySelector("#hintText");
const guideText = document.querySelector("#guideText");

const roundValue = document.querySelector("#roundValue");
const timeValue = document.querySelector("#timeValue");
const streakValue = document.querySelector("#streakValue");
const bestStreakValue = document.querySelector("#bestStreakValue");
const phaseValue = document.querySelector("#phaseValue");
const inputProgressValue = document.querySelector("#inputProgressValue");
const feedbackText = document.querySelector("#feedbackText");
const perfectComboText = document.querySelector("#perfectComboText");
const mimicTrack = document.querySelector("#mimicTrack");
const rewardHint = document.querySelector("#rewardHint");

const animalGrid = document.querySelector("#animalGrid");
const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

const CARE_MODES = ["standard", "soft", "quiet"];
const settingsState = { voiceOn: true, careMode: "standard", narrationLevel: "key" };
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

let levelsData = FALLBACK_DATA;
let currentLevelId = "easy";
let currentThemeId = "forest";
let latestState = null;
let lastWatchRound = 0;
let playSequenceToken = 0;
let rewardHintResetTimer = 0;

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

function loadBestStreak() {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0);
  } catch {
    return 0;
  }
}

function saveBestStreak(streak) {
  localStorage.setItem(BEST_KEY, String(streak));
}

function getAnimalById(id) {
  return levelsData.animals.find((item) => item.id === id) || null;
}

function getLevelById(id) {
  return levelsData.levels.find((item) => item.id === id) || levelsData.levels[0];
}

function getThemes() {
  return Array.isArray(levelsData.themes) && levelsData.themes.length > 0 ? levelsData.themes : FALLBACK_DATA.themes;
}

function getThemeById(id) {
  return getThemes().find((item) => item.id === id) || getThemes()[0];
}

function renderLevelButtons() {
  levelButtonsEl.innerHTML = levelsData.levels.map((level) => {
    const cls = level.id === currentLevelId ? "level-btn is-active" : "level-btn";
    return `<button class="${cls}" data-level-id="${level.id}" type="button">${level.name}</button>`;
  }).join("");
}

function applyThemePalette(theme) {
  if (!theme?.palette) {
    return;
  }
  document.documentElement.style.setProperty("--brand", theme.palette.accent || "#5d86e5");
  document.documentElement.style.setProperty("--panel", theme.palette.accentSoft || "rgba(255, 255, 255, 0.95)");
}

function renderThemeButtons() {
  const themes = getThemes();
  themeButtonsEl.innerHTML = themes.map((theme) => {
    const cls = theme.id === currentThemeId ? "theme-btn is-active" : "theme-btn";
    const accent = theme.palette?.accent || "#5d86e5";
    const style = theme.id === currentThemeId
      ? `background: linear-gradient(180deg, ${accent} 0%, #516cae 100%);`
      : `border: 2px solid ${accent};`;
    return `<button class="${cls}" data-theme-id="${theme.id}" type="button" style="${style}">${theme.name}</button>`;
  }).join("");
  applyThemePalette(getThemeById(currentThemeId));
}

function phaseLabel(phase) {
  if (phase === "watch") {
    return "听合唱";
  }
  if (phase === "input") {
    return "跟唱中";
  }
  if (phase === "done") {
    return "已结束";
  }
  return "待开始";
}

function renderAnimalButtons(state) {
  animalGrid.innerHTML = state.animalsInPlay.map((animal) => {
    const isActive = state.activeAnimalId === animal.id;
    const classes = ["animal-btn"];
    if (isActive) {
      classes.push("is-active");
    }
    const disabled = !state.isRunning || !state.canInput;
    return `<button class="${classes.join(" ")}" data-animal-id="${animal.id}" type="button" style="background:${animal.color};" ${disabled ? "disabled" : ""}><span class="emoji">${animal.emoji}</span><span class="name">${animal.name}</span><span class="note">跟唱点这里</span></button>`;
  }).join("");
}

function renderMimicTrack(state) {
  if (!mimicTrack) {
    return;
  }
  mimicTrack.innerHTML = state.sequence.map((animalId, index) => {
    const animal = getAnimalById(animalId);
    const classes = ["mimic-step"];

    if (state.phase === "watch") {
      if (index < state.activeStepIndex) {
        classes.push("is-done");
      } else if (index === state.activeStepIndex) {
        classes.push("is-active");
      } else {
        classes.push("is-pending");
      }
    } else if (state.phase === "input") {
      if (index < state.inputIndex) {
        classes.push("is-done");
      } else if (index === state.inputIndex) {
        classes.push("is-active");
      } else {
        classes.push("is-pending");
      }
    } else if (state.phase === "done") {
      classes.push("is-done");
    } else {
      classes.push("is-pending");
    }

    return `<span class="${classes.join(" ")}">${animal?.emoji || "•"}</span>`;
  }).join("");
}

function flashPerfectInput(animalId) {
  const button = animalGrid.querySelector(`[data-animal-id="${animalId}"]`);
  if (!button) {
    return;
  }
  button.classList.add("is-perfect");
  window.setTimeout(() => button.classList.remove("is-perfect"), 420);
}

function showRewardBurst(payload) {
  if (!rewardHint || !perfectComboText) {
    return;
  }
  perfectComboText.textContent = `完美连击 ${payload.perfectCombo}`;
  rewardHint.textContent = `完美演出 +${payload.rewardSec} 秒，连击 ${payload.perfectCombo}`;
  rewardHint.classList.add("is-burst");
  window.clearTimeout(rewardHintResetTimer);
  rewardHintResetTimer = window.setTimeout(() => {
    rewardHint.textContent = "连续完美回合会奖励额外时间。";
    rewardHint.classList.remove("is-burst");
  }, 1200);
}

function playTone(freq = 520, durationMs = 220) {
  const theme = getThemeById(currentThemeId);
  const ratio = Math.pow(2, Number(theme?.toneShift || 0) / 12);
  gameAudio.note(freq * ratio, {
    style: "bell",
    durationMs,
    gain: 0.028 * Number(theme?.gain || 1),
    wave: theme?.wave || "triangle",
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function playWatchSequence(state) {
  playSequenceToken += 1;
  const token = playSequenceToken;
  const theme = getThemeById(currentThemeId);
  const tempoMs = Number(theme?.tempoMs || 350);
  const gapMs = Number(theme?.gapMs || 130);

  for (let index = 0; index < state.sequence.length; index += 1) {
    const animalId = state.sequence[index];
    if (!latestState?.isRunning || latestState.phase !== "watch" || token !== playSequenceToken) {
      return;
    }
    const animal = getAnimalById(animalId);
    game.setActiveAnimal(animalId, index);
    playTone(animal?.freq || 520, 220);
    await wait(tempoMs);
    game.setActiveAnimal("", -1);
    await wait(gapMs);
  }

  if (latestState?.isRunning && latestState.phase === "watch" && token === playSequenceToken) {
    game.setWatchDone();
  }
}

function updateUi(state) {
  latestState = state;

  roundValue.textContent = `${Math.min(state.round, state.targetRounds)} / ${state.targetRounds}`;
  timeValue.textContent = `${Math.max(0, Math.ceil(state.timeLeft))} 秒`;
  streakValue.textContent = String(state.streak);
  bestStreakValue.textContent = String(state.bestStreak);
  phaseValue.textContent = phaseLabel(state.phase);
  inputProgressValue.textContent = `${state.inputIndex} / ${state.sequence.length}`;

  retryBtn.disabled = !state.levelId;
  hintBtn.disabled = !state.isRunning || state.phase !== "input";

  feedbackText.textContent = state.lastEvent;
  guideText.textContent = state.isRunning
    ? (state.phase === "watch" ? "认真听顺序，等会轮到你跟唱。" : "按相同顺序点动物，完成当前回合。")
    : (state.isWin ? "合唱成功，掌声送给你。" : "先听一遍动物合唱顺序，再按同样顺序点出来。");

  renderAnimalButtons(state);
  renderMimicTrack(state);
  if (perfectComboText) {
    perfectComboText.textContent = `完美连击 ${state.perfectCombo}`;
  }

  if (state.phase === "watch" && state.round !== lastWatchRound) {
    lastWatchRound = state.round;
    playWatchSequence(state);
  }
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = payload.isWin ? "合唱成功 ⭐" : "演出结束，再来一次";
  resultText.textContent = `难度：${payload.levelName} | 回合：${Math.min(payload.round, payload.targetRounds)}/${payload.targetRounds} | 最好连对：${payload.bestStreak} | 完美回合：${payload.perfectRounds} | 最佳完美连击：${payload.bestPerfectCombo} | 提示：${payload.hintCount} 次 | 剩余时间：${payload.remainTime} 秒`;

  if (payload.bestStreak > loadBestStreak()) {
    saveBestStreak(payload.bestStreak);
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

const game = new ChoirGame({
  onStateChange: updateUi,
  onResult: showResult,
  onToast: (text) => {
    hintText.textContent = text;
    speak(text, true);
  },
  onReward: (payload) => {
    showRewardBurst(payload);
    if (payload.animalId) {
      flashPerfectInput(payload.animalId);
    }
    speak(`完美合唱，奖励 ${payload.rewardSec} 秒`, true);
  },
});

function startGame(seed = "") {
  resultEl.hidden = true;
  lastWatchRound = 0;
  const level = getLevelById(currentLevelId);
  const theme = getThemeById(currentThemeId);
  selectorHint.textContent = `已开始：${level.name}，主题 ${theme.name}，完成 ${level.targetRounds} 轮。`;
  game.start(level.id, seed ? { seed } : {});
}

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(dailyBtn, () => startGame(`${todayString()}|${currentLevelId}|${currentThemeId}|choir`));
bindSoftTap(hintBtn, () => {
  const nextId = game.requestHint();
  if (!nextId) {
    return;
  }
  const animal = getAnimalById(nextId);
  hintText.textContent = `提示：下一步点 ${animal?.name || nextId}。`;
  if (animal) {
    game.setActiveAnimal(animal.id, latestState?.inputIndex ?? -1);
    playTone(animal.freq || 520, 200);
    window.setTimeout(() => game.setActiveAnimal("", -1), 260);
  }
});

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
  selectorHint.textContent = `已选择：${level.name} + ${theme.name}，目标 ${level.targetRounds} 轮。`;
});

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
  selectorHint.textContent = `已选择：${level.name} + ${theme.name}，目标 ${level.targetRounds} 轮。`;
});

animalGrid.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-animal-id]");
  if (!button || !latestState?.canInput) {
    return;
  }
  event.preventDefault();
  const animalId = button.dataset.animalId;
  const animal = getAnimalById(animalId);
  playTone(animal?.freq || 520, 190);
  flashPerfectInput(animalId);
  game.inputAnimal(animalId);
});

async function bootstrap() {
  try {
    const response = await fetch("../../configs/levels/animal-choir.levels.json");
    if (!response.ok) {
      throw new Error(`Failed to load levels: ${response.status}`);
    }
    levelsData = await response.json();
  } catch {
    levelsData = FALLBACK_DATA;
    selectorHint.textContent = "配置加载失败，已使用内置合唱关卡。";
  }

  levelsData.levels = Array.isArray(levelsData.levels) && levelsData.levels.length > 0 ? levelsData.levels : FALLBACK_DATA.levels;
  levelsData.animals = Array.isArray(levelsData.animals) && levelsData.animals.length > 0 ? levelsData.animals : FALLBACK_DATA.animals;
  levelsData.themes = Array.isArray(levelsData.themes) && levelsData.themes.length > 0 ? levelsData.themes : FALLBACK_DATA.themes;

  loadSettings();
  applySettingsUi();

  currentLevelId = levelsData.levels[0].id;
  currentThemeId = levelsData.themes[0].id;
  renderLevelButtons();
  renderThemeButtons();
  game.init(levelsData, loadBestStreak());
}

bootstrap();
