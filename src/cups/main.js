import { CupsGame } from "./cupsGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";
import { loadSettings } from "../shared/settings.js";
import { mountSettingsButtons, speakSettingChanges } from "../shared/settingsButtons.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { bindDelegatedTap, createSoftTap } from "../shared/tap.js";
import { hashText, todayString } from "../shared/random.js";
import { readNumber, readNumbers, writeJson, writeValue } from "../shared/storage.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { clearGameInterval, setGameInterval } from "../shared/timers.js";
import { setClass, setHtml, setStyle, setText, syncKeyed } from "../shared/dom.js";

const SETTINGS_KEY = "cups-settings";
const STATS_KEY = "cups-stats";
const BEST_KEY = "cups-best-score";

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const hintBtn = document.querySelector("#hintBtn");

const levelButtonsEl = document.querySelector("#levelButtons");
const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");
const phaseBadge = document.querySelector("#phaseBadge");
const feedbackText = document.querySelector("#feedbackText");
const cupStage = document.querySelector("#cupStage");

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
const stats = readNumbers(STATS_KEY, { plays: 0, wins: 0, roundsDone: 0, bestStreak: 0 });

let levelsData = null;
let currentLevelId = "easy";
let latestState = null;
let shuffleIntervalId = 0;
let stageTimeoutId = 0;

function stopStageTimers() {
  if (shuffleIntervalId) {
    clearGameInterval(shuffleIntervalId);
    shuffleIntervalId = 0;
  }
  window.clearTimeout(stageTimeoutId);
  stageTimeoutId = 0;
}

function getLevelById(id) {
  return levelsData.levels.find((item) => item.id === id) || levelsData.levels[0];
}

function renderLevelButtons() {
  setHtml(levelButtonsEl, levelsData.levels.map((level) => {
    const cls = level.id === currentLevelId ? "level-btn is-active" : "level-btn";
    return `<button type="button" class="${cls}" data-level-id="${level.id}">${level.name}</button>`;
  }).join(""));
}

const PHASE_LABELS = {
  idle: "🎩 等待开场",
  peek: "👀 记住宝物位置",
  shuffling: "🌀 魔术杯交换中",
  guessing: "👆 点一只杯子猜猜看",
  roundWin: "🎉 猜中啦",
  finished: "⭐ 本局结束",
};

function renderCups(state) {
  if (!state.cups.length) {
    syncKeyed(cupStage, [], { create: () => document.createElement("div"), update() {} });
    setHtml(cupStage, "<p class=\"empty-stage-note\">点「开始变魔术」，看小星星藏进哪只杯子。</p>");
    return;
  }
  if (cupStage.querySelector(".empty-stage-note")) {
    cupStage.innerHTML = "";
  }
  cupStage.style.setProperty("--count", String(state.cupCount));
  cupStage.style.setProperty("--swap-ms", `${state.swapMs}ms`);

  const canGuess = state.phase === "guessing";
  syncKeyed(cupStage, state.cups, {
    create() {
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <span class="treasure-spot" aria-hidden="true"></span>
        <button type="button" class="cup-btn">
          <span class="cup-icon">🥤</span>
          <span class="cup-label">魔术杯</span>
        </button>
      `;
      return wrap;
    },
    update(el, cup) {
      setClass(el, cup.lifted ? "cup-slot is-lifted" : "cup-slot");
      setStyle(el, `--slot:${cup.slot};`);
      const spot = el.querySelector(".treasure-spot");
      setText(spot, cup.hasTreasure ? state.treasure.icon : "💨");
      const btn = el.querySelector(".cup-btn");
      btn.dataset.cupId = cup.id;
      btn.setAttribute("aria-label", `第 ${cup.slot + 1} 个位置的魔术杯`);
      btn.disabled = !canGuess || cup.lifted;
      setText(el.querySelector(".cup-label"), `${cup.slot + 1} 号位`);
    },
  });
}

function updateUi(state) {
  latestState = state;
  roundsValue.textContent = `${state.roundIndex} / ${state.targetRounds}`;
  livesValue.textContent = String(state.lives);
  scoreValue.textContent = String(state.score);
  streakValue.textContent = String(state.streak);
  bestValue.textContent = String(state.bestScore);

  hintBtn.textContent = `排除空杯（${state.hintsLeft}）`;
  hintBtn.disabled = !state.isRunning || state.phase !== "guessing" || state.hintsLeft <= 0;
  retryBtn.disabled = !state.levelId;

  phaseBadge.textContent = PHASE_LABELS[state.phase] || PHASE_LABELS.idle;
  setText(feedbackText, state.lastFeedback);
  setText(guideText, state.isRunning
    ? `当前：${state.levelName}，找对 ${state.targetRounds} 轮过关。`
    : "看清宝物藏进哪只魔术杯，盯着交换后的位置把它点出来。");

  renderCups(state);
}

function schedulePeekAndShuffle() {
  stopStageTimers();
  stageTimeoutId = window.setTimeout(() => {
    if (!game.beginShuffle()) {
      return;
    }
    const intervalMs = Math.max(260, latestState.swapMs + 60);
    shuffleIntervalId = setGameInterval(() => {
      const step = game.stepSwap();
      if (step.done) {
        clearGameInterval(shuffleIntervalId);
        shuffleIntervalId = 0;
        speak(`猜猜看，${latestState.treasure.name}在哪只杯子下面？`, { detailOnly: true });
      } else {
        gameAudio.swipe();
      }
    }, intervalMs);
  }, 1250);
}

function showResult(payload) {
  stopStageTimers();
  resultEl.hidden = false;
  resultTitle.textContent = payload.isWin ? "火眼小魔术师通关 ⭐" : "这局结束啦，再试一次";
  resultText.textContent = `难度：${payload.levelName} | 找对：${payload.roundsDone}/${payload.targetRounds} 轮 | 分数：${payload.score} | 最高连对：${payload.bestStreak}`;
  payload.isWin ? gameAudio.win() : gameAudio.lose();

  stats.plays += 1;
  if (payload.isWin) {
    stats.wins += 1;
  }
  stats.roundsDone += payload.roundsDone;
  stats.bestStreak = Math.max(stats.bestStreak, payload.bestStreak);
  writeJson(STATS_KEY, stats);

  if (payload.bestScore > readNumber(BEST_KEY)) {
    writeValue(BEST_KEY, payload.bestScore);
  }
  speak(payload.isWin ? "太厉害啦，每一次魔术都没逃过你的眼睛！" : "没关系，休息一下眼睛再来一局吧。");
}

const game = new CupsGame({
  onStateChange: updateUi,
  onResult: showResult,
});

function startGame(options = {}) {
  if (!levelsData) {
    return;
  }
  stopStageTimers();
  resultEl.hidden = true;
  const level = getLevelById(options.levelId || currentLevelId);
  selectorHint.textContent = level.tip;
  game.start(level.id, {
    modeName: options.modeName || "魔术闯关",
    seed: options.seed,
  });
  speak(latestState.lastFeedback);
  schedulePeekAndShuffle();
}

bindUiTapSounds(document.body, gameAudio);

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(dailyBtn, () => {
  if (!levelsData) {
    return;
  }
  const day = todayString();
  const hash = hashText(`${day}|cups`);
  const level = levelsData.levels[hash % levelsData.levels.length];
  currentLevelId = level.id;
  renderLevelButtons();
  startGame({
    levelId: level.id,
    modeName: `今日魔术 ${day}`,
    seed: `${day}|${level.id}|cups`,
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

bindDelegatedTap(cupStage, "[data-cup-id]", (button) => {
  const outcome = game.guess(button.dataset.cupId);
  if (!outcome.ok && outcome.correct === false && !outcome.lost) {
    gameAudio.wrong();
    speak(latestState.lastFeedback);
    return;
  }
  if (outcome.correct) {
    gameAudio.success(880);
    speak(latestState.lastFeedback);
    stopStageTimers();
    stageTimeoutId = window.setTimeout(() => {
      game.nextRound();
      if (latestState?.isRunning && latestState.phase === "peek") {
        schedulePeekAndShuffle();
      }
    }, 1050);
  }
});

window.addEventListener("beforeunload", stopStageTimers);

async function bootstrap() {
  try {
    levelsData = await loadGameConfig("../../configs/levels/magic-cups.levels.json", ["levels", "treasures"]);
  } catch (error) {
    showConfigError(error);
    return;
  }
  currentLevelId = levelsData.levels[0].id;
  renderLevelButtons();
  selectorHint.textContent = levelsData.levels[0].tip;
  game.init(levelsData, readNumber(BEST_KEY));
}

bootstrap();
