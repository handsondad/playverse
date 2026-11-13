import { OddOneGame } from "./oddOneGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";
import { loadSettings } from "../shared/settings.js";
import { mountSettingsButtons, speakSettingChanges } from "../shared/settingsButtons.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { bindDelegatedTap, createSoftTap } from "../shared/tap.js";
import { hashText, todayString } from "../shared/random.js";
import { readNumber, readNumbers, writeJson, writeValue } from "../shared/storage.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { setHtml, setText } from "../shared/dom.js";

const SETTINGS_KEY = "oddone-settings";
const STATS_KEY = "oddone-stats";
const BEST_KEY = "oddone-best-score";

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const hintBtn = document.querySelector("#hintBtn");

const modeButtonsEl = document.querySelector("#modeButtons");
const levelButtonsEl = document.querySelector("#levelButtons");
const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");
const promptTitle = document.querySelector("#promptTitle");
const feedbackText = document.querySelector("#feedbackText");
const cardGrid = document.querySelector("#cardGrid");

const roundsValue = document.querySelector("#roundsValue");
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
const stats = readNumbers(STATS_KEY, { plays: 0, wins: 0, solved: 0, bestStreak: 0 });

let levelsData = null;
let currentModeId = "visual";
let currentLevelId = "easy";
let latestState = null;
let nextTimer = 0;

function getModeById(id) {
  return levelsData.modes.find((item) => item.id === id) || levelsData.modes[0];
}

function getLevelById(id) {
  return levelsData.levels.find((item) => item.id === id) || levelsData.levels[0];
}

function renderSelectors() {
  setHtml(modeButtonsEl, levelsData.modes.map((mode) => {
    const cls = mode.id === currentModeId ? "mode-btn is-active" : "mode-btn";
    return `<button type="button" class="${cls}" data-mode-id="${mode.id}">${mode.emoji} ${mode.name}</button>`;
  }).join(""));

  setHtml(levelButtonsEl, levelsData.levels.map((level) => {
    const cls = level.id === currentLevelId ? "level-btn is-active" : "level-btn";
    return `<button type="button" class="${cls}" data-level-id="${level.id}">${level.name}</button>`;
  }).join(""));
}

function gridColumns(cardCount, modeId) {
  if (modeId === "category") {
    return cardCount <= 4 ? 2 : 3;
  }
  return cardCount <= 9 ? 3 : 4;
}

function updateUi(state) {
  latestState = state;
  roundsValue.textContent = `${state.roundIndex} / ${state.targetRounds}`;
  scoreValue.textContent = String(state.score);
  streakValue.textContent = String(state.streak);
  hintsValue.textContent = String(state.hintsLeft);
  bestValue.textContent = String(state.bestScore);

  hintBtn.disabled = !state.isRunning || state.solved || state.hintsLeft <= 0;
  retryBtn.disabled = !state.levelId;

  promptTitle.textContent = state.promptText;
  setText(feedbackText, state.lastFeedback);
  setText(guideText, state.isRunning
    ? `当前：${state.modeName} · ${state.levelName}，找对 ${state.targetRounds} 轮即可过关。`
    : "选「眼力找一找」或「逻辑挑不同」，点出唯一不一样的那张卡片。");

  if (!state.cards.length) {
    cardGrid.style.setProperty("--cols", "3");
    setHtml(cardGrid, "");
    return;
  }

  cardGrid.style.setProperty("--cols", String(gridColumns(state.cards.length, state.modeId)));
  const disabled = !state.isRunning || state.solved;
  setHtml(cardGrid, state.cards.map((card) => {
    const classes = [
      "spot-card",
      card.dimmed ? "is-dimmed" : "",
      card.status === "correct" ? "is-correct" : "",
    ].filter(Boolean).join(" ");
    return `
      <button type="button" class="${classes}" data-card-index="${card.index}" aria-label="${card.name}" ${disabled ? "disabled" : ""}>
        <span class="emoji">${card.icon}</span>
        ${card.showLabel ? `<span class="label">${card.name}</span>` : ""}
      </button>
    `;
  }).join(""));
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = "观察小侦探通关啦 ⭐";
  resultText.textContent = `模式：${payload.modeName} | 难度：${payload.levelName} | 完成：${payload.roundsDone}/${payload.targetRounds} | 分数：${payload.score} | 准确率：${payload.accuracy}%`;
  gameAudio.win();

  stats.plays += 1;
  stats.wins += 1;
  stats.solved += payload.roundsDone;
  stats.bestStreak = Math.max(stats.bestStreak, payload.bestStreak);
  writeJson(STATS_KEY, stats);

  if (payload.bestScore > readNumber(BEST_KEY)) {
    writeValue(BEST_KEY, payload.bestScore);
  }
  speak("太厉害了，不一样的卡片全被你找出来啦！");
}

const game = new OddOneGame({
  onStateChange: updateUi,
  onResult: showResult,
});

function startGame(options = {}) {
  if (!levelsData) {
    return;
  }
  window.clearTimeout(nextTimer);
  resultEl.hidden = true;
  const mode = getModeById(options.modeId || currentModeId);
  const level = getLevelById(options.levelId || currentLevelId);
  selectorHint.textContent = mode.description;
  game.start(level.id, {
    modeId: mode.id,
    seed: options.seed,
  });
  speak(latestState.promptText);
}

bindUiTapSounds(document.body, gameAudio);

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(dailyBtn, () => {
  if (!levelsData) {
    return;
  }
  const day = todayString();
  const hash = hashText(`${day}|oddone`);
  const mode = levelsData.modes[hash % levelsData.modes.length];
  const level = levelsData.levels[Math.floor(hash / 5) % levelsData.levels.length];
  currentModeId = mode.id;
  currentLevelId = level.id;
  renderSelectors();
  startGame({
    modeId: mode.id,
    levelId: level.id,
    seed: `${day}|${mode.id}|${level.id}|oddone`,
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

bindDelegatedTap(modeButtonsEl, "[data-mode-id]", (button) => {
  currentModeId = button.dataset.modeId;
  renderSelectors();
  selectorHint.textContent = getModeById(currentModeId).description;
});

bindDelegatedTap(levelButtonsEl, "[data-level-id]", (button) => {
  currentLevelId = button.dataset.levelId;
  renderSelectors();
  selectorHint.textContent = `已选难度：${getLevelById(currentLevelId).name}`;
});

bindDelegatedTap(cardGrid, "[data-card-index]", (button) => {
  const outcome = game.tapCard(Number(button.dataset.cardIndex));
  if (!outcome.ok && outcome.correct === false) {
    gameAudio.wrong();
    speak(latestState.lastFeedback);
    return;
  }
  if (outcome.correct) {
    gameAudio.success(880);
    speak(latestState.lastFeedback);
    window.clearTimeout(nextTimer);
    nextTimer = window.setTimeout(() => {
      game.nextRound();
    }, 850);
  }
});

async function bootstrap() {
  try {
    levelsData = await loadGameConfig("../../configs/levels/odd-one-out.levels.json", ["modes", "levels", "visualPairs", "categories"]);
  } catch (error) {
    showConfigError(error);
    return;
  }
  currentModeId = levelsData.modes[0].id;
  currentLevelId = levelsData.levels[0].id;
  renderSelectors();
  selectorHint.textContent = levelsData.modes[0].description;
  game.init(levelsData, readNumber(BEST_KEY));
}

bootstrap();
