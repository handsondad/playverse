import { ChoirGame } from "./choirGame.js";
import { createGameAudio } from "../shared/audio.js";
import { careModeLabel, loadSettings, nextCareMode, saveSettings } from "../shared/settings.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { bindSoftTap } from "../shared/tap.js";
import { todayString } from "../shared/random.js";
import { readNumber, writeValue } from "../shared/storage.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { setHtml, setText } from "../shared/dom.js";

const SETTINGS_KEY = "choir-settings";
const BEST_KEY = "choir-best-streak";

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

const settingsState = loadSettings(SETTINGS_KEY);
const speak = createSpeaker(settingsState, SPEECH_PRESETS.standard);
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

let levelsData = null;
let currentLevelId = "easy";
let currentThemeId = "forest";
let latestState = null;
let lastWatchRound = 0;
let playSequenceToken = 0;
let rewardHintResetTimer = 0;

function applySettingsUi() {
  voiceBtn.textContent = `语音引导：${settingsState.voiceOn ? "开" : "关"}`;
  narrationBtn.textContent = `播报模式：${settingsState.narrationLevel === "detailed" ? "详细" : "关键"}`;
  parentModeBtn.textContent = `护眼模式：${careModeLabel(settingsState.careMode)}`;
}

function loadBestStreak() {
  return readNumber(BEST_KEY);
}

function saveBestStreak(streak) {
  writeValue(BEST_KEY, streak);
}

function getAnimalById(id) {
  return levelsData.animals.find((item) => item.id === id) || null;
}

function getLevelById(id) {
  return levelsData.levels.find((item) => item.id === id) || levelsData.levels[0];
}

function getThemes() {
  return levelsData.themes;
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
  setHtml(animalGrid, state.animalsInPlay.map((animal) => {
    const isActive = state.activeAnimalId === animal.id;
    const classes = ["animal-btn"];
    if (isActive) {
      classes.push("is-active");
    }
    const disabled = !state.isRunning || !state.canInput;
    return `<button class="${classes.join(" ")}" data-animal-id="${animal.id}" type="button" style="background:${animal.color};" ${disabled ? "disabled" : ""}><span class="emoji">${animal.emoji}</span><span class="name">${animal.name}</span><span class="note">跟唱点这里</span></button>`;
  }).join(""));
}

function renderMimicTrack(state) {
  if (!mimicTrack) {
    return;
  }
  setHtml(mimicTrack, state.sequence.map((animalId, index) => {
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
  }).join(""));
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

  setText(feedbackText, state.lastEvent);
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

const game = new ChoirGame({
  onStateChange: updateUi,
  onResult: showResult,
  onToast: (text) => {
    hintText.textContent = text;
    speak(text, { detailOnly: true });
  },
  onReward: (payload) => {
    showRewardBurst(payload);
    if (payload.animalId) {
      flashPerfectInput(payload.animalId);
    }
    speak(`完美合唱，奖励 ${payload.rewardSec} 秒`, { detailOnly: true });
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
    levelsData = await loadGameConfig("../../configs/levels/animal-choir.levels.json", ["themes", "levels", "animals"]);
  } catch (error) {
    showConfigError(error);
    return;
  }


  applySettingsUi();

  currentLevelId = levelsData.levels[0].id;
  currentThemeId = levelsData.themes[0].id;
  renderLevelButtons();
  renderThemeButtons();
  game.init(levelsData, loadBestStreak());
}

bootstrap();
