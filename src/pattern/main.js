import { PatternGame } from "./patternGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";
import { loadSettings } from "../shared/settings.js";
import { mountSettingsButtons, speakSettingChanges } from "../shared/settingsButtons.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { bindDelegatedTap, createSoftTap } from "../shared/tap.js";
import { hashText, todayString } from "../shared/random.js";
import { readNumber, readNumbers, writeJson, writeValue } from "../shared/storage.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { setHtml, setText } from "../shared/dom.js";

const SETTINGS_KEY = "pattern-settings";
const STATS_KEY = "pattern-stats";
const BEST_KEY = "pattern-best-score";

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const hintBtn = document.querySelector("#hintBtn");

const levelButtonsEl = document.querySelector("#levelButtons");
const themeButtonsEl = document.querySelector("#themeButtons");
const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");
const feedbackText = document.querySelector("#feedbackText");
const trainTrack = document.querySelector("#trainTrack");
const optionButtons = document.querySelector("#optionButtons");

const trainsValue = document.querySelector("#trainsValue");
const scoreValue = document.querySelector("#scoreValue");
const streakValue = document.querySelector("#streakValue");
const hintsValue = document.querySelector("#hintsValue");
const bestValue = document.querySelector("#bestValue");

const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

const settingsState = loadSettings(SETTINGS_KEY);
const speak = createSpeaker(settingsState, SPEECH_PRESETS.guide);
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });
const bindSoftTap = createSoftTap({ flashMs: 70 });
const stats = readNumbers(STATS_KEY, { plays: 0, wins: 0, trainsDone: 0, bestStreak: 0 });

let levelsData = null;
let currentLevelId = "easy";
let currentThemeId = "fruit";
let latestState = null;
let nextTrainTimer = 0;

function getLevelById(id) {
  return levelsData.levels.find((item) => item.id === id) || levelsData.levels[0];
}

function getThemeById(id) {
  return levelsData.themes.find((item) => item.id === id) || levelsData.themes[0];
}

function renderLevelButtons() {
  setHtml(levelButtonsEl, levelsData.levels.map((level) => {
    const cls = level.id === currentLevelId ? "level-btn is-active" : "level-btn";
    return `<button type="button" class="${cls}" data-level-id="${level.id}">${level.name}</button>`;
  }).join(""));
}

function renderThemeButtons() {
  setHtml(themeButtonsEl, levelsData.themes.map((theme) => {
    const cls = theme.id === currentThemeId ? "theme-btn is-active" : "theme-btn";
    return `<button type="button" class="${cls}" data-theme-id="${theme.id}">${theme.emoji} ${theme.name}</button>`;
  }).join(""));
}

function renderTrain(state) {
  if (!state.carriages.length) {
    setHtml(trainTrack, `<div class="engine-car"><span class="car-emoji">🚂</span><span class="car-name">待发车</span></div>`);
    return;
  }
  const cars = state.carriages.map((car) => {
    if (!car.filled || !car.item) {
      return `<div class="carriage-card is-missing"><span class="car-emoji">❓</span><span class="car-name">挂哪节？</span></div>`;
    }
    return `<div class="carriage-card" style="--car-color:${car.item.color}"><span class="car-emoji">${car.item.icon}</span><span class="car-name">${car.item.name}</span></div>`;
  }).join("");
  setHtml(trainTrack, `<div class="engine-car"><span class="car-emoji">🚂</span><span class="car-name">车头</span></div>${cars}`);
}

function renderOptions(state) {
  const disabled = !state.isRunning || state.departed;
  setHtml(optionButtons, state.options.map((item) => `
    <button type="button" class="option-btn" data-item-id="${item.id}" style="background:${item.color};" ${disabled ? "disabled" : ""}>
      <span class="emoji">${item.icon}</span>
      <span class="name">${item.name}</span>
    </button>
  `).join(""));
}

function updateUi(state) {
  latestState = state;
  trainsValue.textContent = `${state.roundIndex} / ${state.targetTrains}`;
  scoreValue.textContent = String(state.score);
  streakValue.textContent = String(state.streak);
  hintsValue.textContent = String(state.hintsLeft);
  bestValue.textContent = String(state.bestScore);

  hintBtn.disabled = !state.isRunning || state.departed || state.hintsLeft <= 0;
  retryBtn.disabled = !state.levelId;

  setText(feedbackText, state.lastFeedback);
  setText(guideText, state.isRunning
    ? `当前：${state.levelName} · ${state.themeName}，再发走 ${Math.max(0, state.targetTrains - state.roundIndex)} 列火车就通关啦。`
    : "看看车厢是怎么排队的，选出空位该挂哪一节车厢。");

  trainTrack.classList.toggle("is-departing", state.departed);
  renderTrain(state);
  renderOptions(state);
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = "专列全部准点发车 ⭐";
  resultText.textContent = `难度：${payload.levelName} | 主题：${payload.themeName} | 完成：${payload.trainsDone}/${payload.targetTrains} 列 | 分数：${payload.score} | 准确率：${payload.accuracy}%`;
  gameAudio.win();

  stats.plays += 1;
  stats.wins += 1;
  stats.trainsDone += payload.trainsDone;
  stats.bestStreak = Math.max(stats.bestStreak, payload.bestStreak);
  writeJson(STATS_KEY, stats);

  if (payload.bestScore > readNumber(BEST_KEY)) {
    writeValue(BEST_KEY, payload.bestScore);
  }
  speak("太棒啦，所有规律小火车都发车啦！");
}

const game = new PatternGame({
  onStateChange: updateUi,
  onResult: showResult,
});

function startGame(options = {}) {
  if (!levelsData) {
    return;
  }
  window.clearTimeout(nextTrainTimer);
  resultEl.hidden = true;
  const level = getLevelById(options.levelId || currentLevelId);
  const theme = getThemeById(options.themeId || currentThemeId);
  selectorHint.textContent = `${level.tip}`;
  game.start(level.id, {
    themeId: theme.id,
    modeName: options.modeName || "普通发车",
    seed: options.seed,
  });
  speak(`小火车进站啦，看看车厢规律选对空位。`);
}

bindUiTapSounds(document.body, gameAudio);

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(dailyBtn, () => {
  if (!levelsData) {
    return;
  }
  const day = todayString();
  const hash = hashText(`${day}|pattern`);
  const level = levelsData.levels[hash % levelsData.levels.length];
  const theme = levelsData.themes[Math.floor(hash / 7) % levelsData.themes.length];
  currentLevelId = level.id;
  currentThemeId = theme.id;
  renderLevelButtons();
  renderThemeButtons();
  startGame({
    levelId: level.id,
    themeId: theme.id,
    modeName: `今日专列 ${day}`,
    seed: `${day}|${level.id}|${theme.id}|pattern`,
  });
});

bindSoftTap(hintBtn, () => {
  const text = game.useHint();
  if (text) {
    gameAudio.sparkle();
    speak(text);
  }
});

mountSettingsButtons({
  storageKey: SETTINGS_KEY,
  settings: settingsState,
  bindTap: bindSoftTap,
  announce: speakSettingChanges(speak, guideText),
});

bindDelegatedTap(levelButtonsEl, "[data-level-id]", (button) => {
  currentLevelId = button.dataset.levelId;
  renderLevelButtons();
  const level = getLevelById(currentLevelId);
  selectorHint.textContent = `已选：${level.name}。${level.tip}`;
});

bindDelegatedTap(themeButtonsEl, "[data-theme-id]", (button) => {
  currentThemeId = button.dataset.themeId;
  renderThemeButtons();
  const theme = getThemeById(currentThemeId);
  selectorHint.textContent = `已切换专列：${theme.name}`;
});

bindDelegatedTap(optionButtons, "[data-item-id]", (button) => {
  const outcome = game.choose(button.dataset.itemId);
  if (!outcome.ok && outcome.correct === false) {
    gameAudio.wrong();
    speak(latestState.lastFeedback);
    return;
  }
  if (outcome.correct) {
    gameAudio.success(860);
    speak(latestState.lastFeedback, { detailOnly: true });
    window.clearTimeout(nextTrainTimer);
    nextTrainTimer = window.setTimeout(() => {
      game.nextTrain();
    }, 650);
  }
});

async function bootstrap() {
  try {
    levelsData = await loadGameConfig("../../configs/levels/pattern-train.levels.json", ["levels", "themes"]);
  } catch (error) {
    showConfigError(error);
    return;
  }
  currentLevelId = levelsData.levels[0].id;
  currentThemeId = levelsData.themes[0].id;
  renderLevelButtons();
  renderThemeButtons();
  selectorHint.textContent = levelsData.levels[0].tip;
  game.init(levelsData, readNumber(BEST_KEY));
}

bootstrap();
