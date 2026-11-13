import { WeatherWearGame } from "./weatherWearGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";
import { loadSettings } from "../shared/settings.js";
import { mountSettingsButtons, speakSettingChanges } from "../shared/settingsButtons.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { bindDelegatedTap, createSoftTap } from "../shared/tap.js";
import { hashText, todayString } from "../shared/random.js";
import { readNumber, readNumbers, writeJson, writeValue } from "../shared/storage.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { setHtml, setText } from "../shared/dom.js";

const SETTINGS_KEY = "weatherwear-settings";
const STATS_KEY = "weatherwear-stats";
const BEST_KEY = "weatherwear-best-score";

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const hintBtn = document.querySelector("#hintBtn");
const clearBtn = document.querySelector("#clearBtn");
const submitBtn = document.querySelector("#submitBtn");

const levelButtonsEl = document.querySelector("#levelButtons");
const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");
const weatherIcon = document.querySelector("#weatherIcon");
const weatherTitle = document.querySelector("#weatherTitle");
const activityText = document.querySelector("#activityText");
const feedbackText = document.querySelector("#feedbackText");
const bagCount = document.querySelector("#bagCount");
const bagSlots = document.querySelector("#bagSlots");
const shelfGrid = document.querySelector("#shelfGrid");

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
const stats = readNumbers(STATS_KEY, { plays: 0, wins: 0, outfits: 0, bestStreak: 0 });

let levelsData = null;
let currentLevelId = "easy";
let latestState = null;
let nextTimer = 0;

function getLevelById(id) {
  return levelsData.levels.find((item) => item.id === id) || levelsData.levels[0];
}

function getItemById(id) {
  return levelsData?.items.find((item) => item.id === id) || null;
}

function renderLevelButtons() {
  setHtml(levelButtonsEl, levelsData.levels.map((level) => {
    const cls = level.id === currentLevelId ? "level-btn is-active" : "level-btn";
    return `<button type="button" class="${cls}" data-level-id="${level.id}">${level.name}</button>`;
  }).join(""));
}

function updateUi(state) {
  latestState = state;
  roundsValue.textContent = `${state.roundIndex} / ${state.targetRounds}`;
  scoreValue.textContent = String(state.score);
  streakValue.textContent = String(state.streak);
  hintsValue.textContent = String(state.hintsLeft);
  bestValue.textContent = String(state.bestScore);

  bagCount.textContent = `${state.selectedIds.length} / ${state.needCount}`;
  hintBtn.disabled = !state.isRunning || state.completedRound || state.hintsLeft <= 0;
  clearBtn.disabled = !state.isRunning || state.completedRound || state.selectedIds.length === 0;
  submitBtn.disabled = !state.isRunning || state.completedRound;
  retryBtn.disabled = !state.levelId;

  if (state.scene) {
    weatherIcon.textContent = state.scene.icon;
    weatherTitle.textContent = `${state.scene.weather} · ${state.scene.temp}`;
    activityText.textContent = `今日安排：${state.scene.activity}`;
  } else {
    weatherIcon.textContent = "☀️";
    weatherTitle.textContent = "等待拉开窗帘";
    activityText.textContent = "点「开始穿搭」看看今天去哪儿玩";
  }

  setText(feedbackText, state.lastFeedback);
  setText(guideText, state.isRunning
    ? `当前：${state.levelName}，挑对 ${state.needCount} 件穿戴后点「准备出门」。`
    : "看看窗外是什么天气和温度，帮小朋友挑对合适的衣物出门。");

  const slotsHtml = Array.from({ length: state.needCount }, (_, idx) => {
    const id = state.selectedIds[idx];
    const item = id ? getItemById(id) : null;
    if (!item) {
      return `<button type="button" class="bag-slot" disabled><span>空位 ${idx + 1}</span></button>`;
    }
    return `
      <button type="button" class="bag-slot is-filled" data-bag-item-id="${item.id}" ${state.completedRound ? "disabled" : ""}>
        <span class="emoji">${item.icon}</span>
        <span>${item.name}</span>
      </button>
    `;
  }).join("");
  setHtml(bagSlots, slotsHtml);

  const selectedSet = new Set(state.selectedIds);
  setHtml(shelfGrid, state.shelf.map((item) => {
    const picked = selectedSet.has(item.id);
    const cls = picked ? "garment-btn is-picked" : "garment-btn";
    return `
      <button type="button" class="${cls}" data-item-id="${item.id}" style="background:${item.color};" ${!state.isRunning || state.completedRound ? "disabled" : ""}>
        <span class="emoji">${item.icon}</span>
        <span class="name">${item.name}${picked ? " ✓" : ""}</span>
      </button>
    `;
  }).join(""));
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = "自理小达人开心出发 ⭐";
  resultText.textContent = `难度：${payload.levelName} | 完成：${payload.roundsDone}/${payload.targetRounds} 次出行 | 分数：${payload.score} | 准确率：${payload.accuracy}%`;
  gameAudio.win();

  stats.plays += 1;
  stats.wins += 1;
  stats.outfits += payload.roundsDone;
  stats.bestStreak = Math.max(stats.bestStreak, payload.bestStreak);
  writeJson(STATS_KEY, stats);

  if (payload.bestScore > readNumber(BEST_KEY)) {
    writeValue(BEST_KEY, payload.bestScore);
  }
  speak("太棒啦，不管晴天雨天还是下雪天，你都会自己穿对衣服啦！");
}

const game = new WeatherWearGame({
  onStateChange: updateUi,
  onResult: showResult,
});

function startGame(options = {}) {
  if (!levelsData) {
    return;
  }
  window.clearTimeout(nextTimer);
  resultEl.hidden = true;
  const level = getLevelById(options.levelId || currentLevelId);
  selectorHint.textContent = level.tip;
  game.start(level.id, {
    modeName: options.modeName || "看天穿搭",
    seed: options.seed,
  });
  speak(latestState.lastFeedback);
}

bindUiTapSounds(document.body, gameAudio);

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(dailyBtn, () => {
  if (!levelsData) {
    return;
  }
  const day = todayString();
  const hash = hashText(`${day}|weatherwear`);
  const level = levelsData.levels[hash % levelsData.levels.length];
  currentLevelId = level.id;
  renderLevelButtons();
  startGame({
    levelId: level.id,
    modeName: `今日穿搭 ${day}`,
    seed: `${day}|${level.id}|weatherwear`,
  });
});

bindSoftTap(hintBtn, () => {
  const text = game.useHint();
  if (text) {
    gameAudio.sparkle();
    speak(text);
  }
});

bindSoftTap(clearBtn, () => {
  if (game.clearOutfit()) {
    gameAudio.place(320);
  }
});

bindSoftTap(submitBtn, () => {
  const outcome = game.submitOutfit();
  if (!outcome.ok && outcome.correct === false) {
    gameAudio.wrong();
    speak(latestState.lastFeedback);
    return;
  }
  if (!outcome.ok && outcome.incomplete) {
    speak(latestState.lastFeedback);
    return;
  }
  if (outcome.correct) {
    gameAudio.success(880);
    speak(latestState.lastFeedback);
    window.clearTimeout(nextTimer);
    nextTimer = window.setTimeout(() => {
      game.nextRound();
    }, 950);
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
  selectorHint.textContent = getLevelById(currentLevelId).tip;
});

bindDelegatedTap(shelfGrid, "[data-item-id]", (button) => {
  const res = game.toggleItem(button.dataset.itemId);
  if (res.ok) {
    gameAudio.pickup(res.equipped ? 660 : 420);
  }
});

bindDelegatedTap(bagSlots, "[data-bag-item-id]", (button) => {
  if (game.toggleItem(button.dataset.bagItemId).ok) {
    gameAudio.place(400);
  }
});

async function bootstrap() {
  try {
    levelsData = await loadGameConfig("../../configs/levels/weather-wear.levels.json", ["levels", "items", "scenes"]);
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
