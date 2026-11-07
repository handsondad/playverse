import { BubbleGame } from "./bubbleGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";
import { careModeLabel, loadSettings, nextCareMode, saveSettings } from "../shared/settings.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { bindSoftTap } from "../shared/tap.js";
import { todayString } from "../shared/random.js";
import { readNumber, writeJson, writeValue } from "../shared/storage.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { setHtml } from "../shared/dom.js";

const SETTINGS_KEY = "bubble-settings";
const STATS_KEY = "bubble-stats";
const BEST_KEY = "bubble-best-score";

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const hintBtn = document.querySelector("#hintBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const narrationBtn = document.querySelector("#narrationBtn");
const parentModeBtn = document.querySelector("#parentModeBtn");

const levelButtonsEl = document.querySelector("#levelButtons");
const selectorHint = document.querySelector("#selectorHint");
const hintText = document.querySelector("#hintText");
const guideText = document.querySelector("#guideText");

const scoreValue = document.querySelector("#scoreValue");
const targetValue = document.querySelector("#targetValue");
const timeValue = document.querySelector("#timeValue");
const comboValue = document.querySelector("#comboValue");
const bestComboValue = document.querySelector("#bestComboValue");
const bestScoreValue = document.querySelector("#bestScoreValue");

const boardEl = document.querySelector("#board");
const effectsLayer = document.querySelector("#effectsLayer");
const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

const settingsState = loadSettings(SETTINGS_KEY);
const speak = createSpeaker(settingsState, SPEECH_PRESETS.standard);
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });
const stats = { plays: 0, wins: 0, totalScore: 0, bestCombo: 0 };

let levelsData = null;
let currentLevelId = "easy";
let latestState = null;
let pointerActive = false;
let lastClearEffectId = 0;
let effectClearTimer = 0;

function applySettingsUi() {
  voiceBtn.textContent = `语音引导：${settingsState.voiceOn ? "开" : "关"}`;
  narrationBtn.textContent = `播报模式：${settingsState.narrationLevel === "detailed" ? "详细" : "关键"}`;
  parentModeBtn.textContent = `护眼模式：${careModeLabel(settingsState.careMode)}`;
}

function loadStats() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATS_KEY) || "{}");
    stats.plays = Number(parsed.plays || 0);
    stats.wins = Number(parsed.wins || 0);
    stats.totalScore = Number(parsed.totalScore || 0);
    stats.bestCombo = Number(parsed.bestCombo || 0);
  } catch {
    stats.plays = 0;
    stats.wins = 0;
    stats.totalScore = 0;
    stats.bestCombo = 0;
  }
}

function saveStats() {
  writeJson(STATS_KEY, stats);
}

function getLevelById(levelId) {
  return levelsData.levels.find((item) => item.id === levelId) || levelsData.levels[0];
}

function renderLevelButtons() {
  levelButtonsEl.innerHTML = levelsData.levels.map((level) => {
    const cls = level.id === currentLevelId ? "level-btn is-active" : "level-btn";
    return `<button class="${cls}" data-level-id="${level.id}" type="button">${level.name}</button>`;
  }).join("");
}

function keyOf(x, y) {
  return `${x},${y}`;
}

function getCellCenter(x, y) {
  const cell = boardEl.querySelector(`[data-x="${x}"][data-y="${y}"]`);
  if (!cell) {
    return null;
  }
  return {
    x: cell.offsetLeft + cell.offsetWidth / 2,
    y: cell.offsetTop + cell.offsetHeight / 2,
  };
}

function renderPathOverlay(state) {
  const existing = boardEl.querySelector(".path-overlay");
  existing?.remove();

  if (!state.activePath || state.activePath.length < 2) {
    return;
  }

  const points = state.activePath
    .map((point) => getCellCenter(point.x, point.y))
    .filter(Boolean);

  if (points.length < 2) {
    return;
  }

  const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const circles = points.map((point) => `<circle class="path-node" cx="${point.x}" cy="${point.y}" r="7"></circle>`).join("");

  boardEl.insertAdjacentHTML(
    "beforeend",
    `<svg class="path-overlay" viewBox="0 0 ${boardEl.clientWidth} ${boardEl.clientHeight}" preserveAspectRatio="none" aria-hidden="true">
      <polyline class="path-line" points="${polylinePoints}"></polyline>
      <polyline class="path-line-accent" points="${polylinePoints}"></polyline>
      ${circles}
    </svg>`,
  );
}

function showClearEffect(effect) {
  if (!effectsLayer || !effect || !Array.isArray(effect.cells) || effect.cells.length === 0) {
    return;
  }

  const centers = effect.cells.map((point) => getCellCenter(point.x, point.y)).filter(Boolean);
  if (centers.length === 0) {
    return;
  }

  const chips = centers.map((point, index) => {
    const dx = ((index % 3) - 1) * 10;
    const dy = Math.floor(index / 3) * 3;
    return `<span class="burst-chip" style="left:${point.x + dx}px; top:${point.y - dy}px;"></span>`;
  }).join("");

  const avgX = centers.reduce((sum, point) => sum + point.x, 0) / centers.length;
  const avgY = centers.reduce((sum, point) => sum + point.y, 0) / centers.length;

  effectsLayer.innerHTML = `${chips}<span class="burst-label" style="left:${avgX}px; top:${avgY}px;">${effect.label}</span>`;

  if (effectClearTimer) {
    window.clearTimeout(effectClearTimer);
  }
  effectClearTimer = window.setTimeout(() => {
    effectsLayer.innerHTML = "";
    effectClearTimer = 0;
  }, 820);
}

function renderBoard(state) {
  if (!state.grid?.length) {
    setHtml(boardEl, "<p class=\"empty-note\">点击开始救援，棋盘会出现彩色泡泡。</p>");
    return;
  }

  boardEl.style.gridTemplateColumns = `repeat(${state.width}, minmax(0, 1fr))`;
  const selectedSet = new Set(state.activePath.map((point) => keyOf(point.x, point.y)));
  const hintSet = new Set(state.hintCells.map((point) => keyOf(point.x, point.y)));

  setHtml(boardEl, state.grid.map((row, y) => {
    return row.map((cell, x) => {
      const key = keyOf(x, y);
      const classes = ["bubble-cell", `bubble-${cell.color}`];
      if (selectedSet.has(key)) {
        classes.push("is-selected");
      }
      if (hintSet.has(key)) {
        classes.push("hint");
      }
      if (cell.special && cell.special !== "none") {
        classes.push(`special-${cell.special}`);
      }
      const symbol = cell.special === "rainbow" ? "✦" : "●";
      return `<div class="${classes.join(" ")}" data-x="${x}" data-y="${y}"><span class="bubble-symbol">${symbol}</span></div>`;
    }).join("");
  }).join(""));

  renderPathOverlay(state);
}

function updateUi(state) {
  latestState = state;

  scoreValue.textContent = String(state.score);
  targetValue.textContent = String(state.targetScore);
  timeValue.textContent = `${Math.max(0, Math.ceil(state.timeLeft))} 秒`;
  comboValue.textContent = String(state.combo);
  bestComboValue.textContent = String(state.bestCombo);
  bestScoreValue.textContent = String(state.bestScore);

  retryBtn.disabled = !state.levelId;
  hintBtn.disabled = !state.isRunning;

  if (!state.isRunning) {
    guideText.textContent = state.isWin
      ? "救援成功，试试更高难度吧。"
      : "按住并划过相邻同色泡泡，松手消除。";
  } else if (state.lastEvent) {
    guideText.textContent = state.lastEvent;
  }

  renderBoard(state);

  if (state.clearEffect?.id && state.clearEffect.id !== lastClearEffectId) {
    lastClearEffectId = state.clearEffect.id;
    gameAudio.pop();
    showClearEffect(state.clearEffect);
  }
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = payload.isWin ? "救援成功 ⭐" : "时间到啦，再试一次";
  resultText.textContent = `难度：${payload.levelName} | 分数：${payload.score}/${payload.targetScore} | 最高连击：${payload.bestCombo} | 消除：${payload.clearedCount}`;
  payload.isWin ? gameAudio.win() : gameAudio.lose();

  stats.plays += 1;
  if (payload.isWin) {
    stats.wins += 1;
  }
  stats.totalScore += payload.score;
  stats.bestCombo = Math.max(stats.bestCombo, payload.bestCombo);
  saveStats();

  const currentBest = readNumber(BEST_KEY);
  if (payload.score > currentBest) {
    writeValue(BEST_KEY, payload.score);
  }

  if (payload.isWin) {
    speak("太棒了，救援成功。", { detailOnly: true });
  }
}

function startGame(seed = "") {
  resultEl.hidden = true;
  const level = getLevelById(currentLevelId);
  game.start(level.id, seed ? { seed } : {});
  selectorHint.textContent = `已开始：${level.name}，目标分数 ${level.targetScore}`;
}

const game = new BubbleGame({
  onStateChange: updateUi,
  onResult: showResult,
  onToast: (text) => {
    selectorHint.textContent = text;
    speak(text, { detailOnly: true });
  },
});

bindUiTapSounds(document.body, gameAudio);

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(dailyBtn, () => {
  startGame(`${todayString()}|${currentLevelId}|bubble`);
});
bindSoftTap(hintBtn, () => {
  const hints = game.requestHint();
  if (hints.length > 0) {
    hintText.textContent = "提示已高亮：试着把这两个可连泡泡划在一起。";
  } else {
    hintText.textContent = "当前没有可连泡泡，下一次消除后会自动重排。";
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
  selectorHint.textContent = `已选择：${level.name}，目标 ${level.targetScore} 分。`;
});

boardEl.addEventListener("pointerdown", (event) => {
  const cell = event.target.closest(".bubble-cell");
  if (!cell || !latestState?.isRunning) {
    return;
  }
  event.preventDefault();

  pointerActive = true;

  const x = Number(cell.dataset.x);
  const y = Number(cell.dataset.y);
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return;
  }

  game.beginPath(x, y);
});

boardEl.addEventListener("pointermove", (event) => {
  if (!pointerActive || !latestState?.isRunning) {
    return;
  }
  const cell = event.target.closest(".bubble-cell");
  if (!cell) {
    return;
  }
  event.preventDefault();

  const x = Number(cell.dataset.x);
  const y = Number(cell.dataset.y);
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return;
  }

  game.extendPath(x, y);
});

const finishPointerPath = () => {
  if (!pointerActive) {
    return;
  }
  pointerActive = false;
  game.releasePath();
};

boardEl.addEventListener("pointerup", (event) => {
  event.preventDefault();
  finishPointerPath();
});
boardEl.addEventListener("pointercancel", finishPointerPath);
window.addEventListener("pointerup", finishPointerPath);

async function bootstrap() {
  try {
    levelsData = await loadGameConfig("../../configs/levels/bubble-link-rescue.levels.json", ["levels"]);
  } catch (error) {
    showConfigError(error);
    return;
  }


  loadStats();
  applySettingsUi();

  currentLevelId = levelsData.levels[0].id;
  renderLevelButtons();

  game.init(levelsData.levels, readNumber(BEST_KEY));
}

bootstrap();
