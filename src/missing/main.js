import { MissingGame } from "./missingGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";
import { loadSettings } from "../shared/settings.js";
import { mountSettingsButtons, speakSettingChanges } from "../shared/settingsButtons.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { bindDelegatedTap, createSoftTap } from "../shared/tap.js";
import { hashText, todayString } from "../shared/random.js";
import { readNumber, readNumbers, writeJson, writeValue } from "../shared/storage.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { setHtml, setText } from "../shared/dom.js";

const SETTINGS_KEY = "missing-settings";
const STATS_KEY = "missing-stats";
const BEST_KEY = "missing-best-score";

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const readyNowBtn = document.querySelector("#readyNowBtn");
const hintBtn = document.querySelector("#hintBtn");

const levelButtonsEl = document.querySelector("#levelButtons");
const themeButtonsEl = document.querySelector("#themeButtons");
const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");
const phaseBadge = document.querySelector("#phaseBadge");
const feedbackText = document.querySelector("#feedbackText");
const tableBoard = document.querySelector("#tableBoard");
const curtainOverlay = document.querySelector("#curtainOverlay");
const choiceButtons = document.querySelector("#choiceButtons");

const roundsValue = document.querySelector("#roundsValue");
const livesValue = document.querySelector("#livesValue");
const scoreValue = document.querySelector("#scoreValue");
const streakValue = document.querySelector("#streakValue");
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
let currentLevelId = "easy";
let currentThemeId = "toys";
let latestState = null;
let watchTimer = 0;
let curtainTimer = 0;
let nextTimer = 0;

function clearAllTimers() {
  window.clearTimeout(watchTimer);
  window.clearTimeout(curtainTimer);
  window.clearTimeout(nextTimer);
  watchTimer = 0;
  curtainTimer = 0;
  nextTimer = 0;
}

function getLevelById(id) {
  return levelsData.levels.find((item) => item.id === id) || levelsData.levels[0];
}

function getThemeById(id) {
  return levelsData.themes.find((item) => item.id === id) || levelsData.themes[0];
}

function renderSelectors() {
  setHtml(levelButtonsEl, levelsData.levels.map((level) => {
    const cls = level.id === currentLevelId ? "level-btn is-active" : "level-btn";
    return `<button type="button" class="${cls}" data-level-id="${level.id}">${level.name}</button>`;
  }).join(""));

  setHtml(themeButtonsEl, levelsData.themes.map((theme) => {
    const cls = theme.id === currentThemeId ? "theme-btn is-active" : "theme-btn";
    return `<button type="button" class="${cls}" data-theme-id="${theme.id}">${theme.emoji} ${theme.name}</button>`;
  }).join(""));
}

const PHASE_LABELS = {
  idle: "🪄 记忆小圆桌",
  memorize: "👀 快记住桌上的物品",
  curtain: "🎭 幕布拉上啦",
  guessing: "🤔 看看少了谁？",
  roundWin: "🎉 找对啦",
  finished: "⭐ 本局结束",
};

function updateUi(state) {
  latestState = state;
  roundsValue.textContent = `${state.roundIndex} / ${state.targetRounds}`;
  livesValue.textContent = String(state.lives);
  scoreValue.textContent = String(state.score);
  streakValue.textContent = String(state.streak);
  bestValue.textContent = String(state.bestScore);

  readyNowBtn.disabled = !state.isRunning || state.phase !== "memorize";
  hintBtn.textContent = `排除干扰（${state.hintsLeft}）`;
  hintBtn.disabled = !state.isRunning || state.phase !== "guessing" || state.hintsLeft <= 0;
  retryBtn.disabled = !state.levelId;

  phaseBadge.textContent = PHASE_LABELS[state.phase] || PHASE_LABELS.idle;
  curtainOverlay.hidden = state.phase !== "curtain";

  setText(feedbackText, state.lastFeedback);
  setText(guideText, state.isRunning
    ? `当前：${state.levelName} · ${state.themeName}，猜对 ${state.targetRounds} 轮即可过关。`
    : "先记住桌上的几样小物品，幕布拉开后点出悄悄躲起来的那一件。");

  setHtml(tableBoard, state.tableItems.map((item) => `
    <div class="table-item ${item.isPlaceholder ? "is-placeholder" : ""}">
      <span class="emoji">${item.icon}</span>
      <span class="name">${item.name}</span>
    </div>
  `).join(""));

  const canChoose = state.phase === "guessing";
  const eliminatedSet = new Set(state.eliminatedIds);
  setHtml(choiceButtons, state.choices.map((item) => {
    const isOut = eliminatedSet.has(item.id);
    return `
      <button type="button" class="choice-btn ${isOut ? "is-eliminated" : ""}" data-choice-id="${item.id}" style="background:${item.color};" ${!canChoose || isOut ? "disabled" : ""}>
        <span class="emoji">${item.icon}</span>
        <span class="name">${item.name}</span>
      </button>
    `;
  }).join(""));
}

function triggerCurtainTransition() {
  window.clearTimeout(watchTimer);
  if (!game.closeCurtain()) {
    return;
  }
  gameAudio.swipe();
  curtainTimer = window.setTimeout(() => {
    if (game.openCurtain()) {
      speak("看看桌上少了谁？", { detailOnly: true });
    }
  }, 650);
}

function scheduleWatchPhase() {
  clearAllTimers();
  watchTimer = window.setTimeout(() => {
    triggerCurtainTransition();
  }, latestState?.watchMs || 3000);
}

function showResult(payload) {
  clearAllTimers();
  resultEl.hidden = false;
  resultTitle.textContent = payload.isWin ? "记忆小超人通关 ⭐" : "这局结束啦，再来一次";
  resultText.textContent = `难度：${payload.levelName} | 主题：${payload.themeName} | 找对：${payload.roundsDone}/${payload.targetRounds} 轮 | 分数：${payload.score}`;
  payload.isWin ? gameAudio.win() : gameAudio.lose();

  stats.plays += 1;
  if (payload.isWin) {
    stats.wins += 1;
  }
  stats.solved += payload.roundsDone;
  stats.bestStreak = Math.max(stats.bestStreak, payload.bestStreak);
  writeJson(STATS_KEY, stats);

  if (payload.bestScore > readNumber(BEST_KEY)) {
    writeValue(BEST_KEY, payload.bestScore);
  }
  speak(payload.isWin ? "太棒啦，谁躲起来都瞒不过你的好记性！" : "没关系，深呼吸再来试一局吧。");
}

const game = new MissingGame({
  onStateChange: updateUi,
  onResult: showResult,
});

function startGame(options = {}) {
  if (!levelsData) {
    return;
  }
  clearAllTimers();
  resultEl.hidden = true;
  const level = getLevelById(options.levelId || currentLevelId);
  const theme = getThemeById(options.themeId || currentThemeId);
  selectorHint.textContent = level.tip;
  game.start(level.id, {
    themeId: theme.id,
    modeName: options.modeName || "记忆闯关",
    seed: options.seed,
  });
  speak(latestState.lastFeedback);
  scheduleWatchPhase();
}

bindUiTapSounds(document.body, gameAudio);

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(dailyBtn, () => {
  if (!levelsData) {
    return;
  }
  const day = todayString();
  const hash = hashText(`${day}|missing`);
  const level = levelsData.levels[hash % levelsData.levels.length];
  const theme = levelsData.themes[Math.floor(hash / 5) % levelsData.themes.length];
  currentLevelId = level.id;
  currentThemeId = theme.id;
  renderSelectors();
  startGame({
    levelId: level.id,
    themeId: theme.id,
    modeName: `今日记忆 ${day}`,
    seed: `${day}|${level.id}|${theme.id}|missing`,
  });
});

bindSoftTap(readyNowBtn, () => {
  triggerCurtainTransition();
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
  renderSelectors();
  selectorHint.textContent = getLevelById(currentLevelId).tip;
});

bindDelegatedTap(themeButtonsEl, "[data-theme-id]", (button) => {
  currentThemeId = button.dataset.themeId;
  renderSelectors();
  selectorHint.textContent = `已切换桌面：${getThemeById(currentThemeId).name}`;
});

bindDelegatedTap(choiceButtons, "[data-choice-id]", (button) => {
  const outcome = game.choose(button.dataset.choiceId);
  if (!outcome.ok && outcome.correct === false && !outcome.lost) {
    gameAudio.wrong();
    speak(latestState.lastFeedback);
    return;
  }
  if (outcome.correct) {
    gameAudio.success(880);
    speak(latestState.lastFeedback);
    clearAllTimers();
    nextTimer = window.setTimeout(() => {
      game.nextRound();
      if (latestState?.isRunning && latestState.phase === "memorize") {
        scheduleWatchPhase();
      }
    }, 1050);
  }
});

window.addEventListener("beforeunload", clearAllTimers);

async function bootstrap() {
  try {
    levelsData = await loadGameConfig("../../configs/levels/whats-missing.levels.json", ["levels", "themes"]);
  } catch (error) {
    showConfigError(error);
    return;
  }
  currentLevelId = levelsData.levels[0].id;
  currentThemeId = levelsData.themes[0].id;
  renderSelectors();
  selectorHint.textContent = levelsData.levels[0].tip;
  game.init(levelsData, readNumber(BEST_KEY));
}

bootstrap();
