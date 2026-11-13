import { LighthouseGame } from "./lighthouseGame.js";
import { createGameAudio } from "../shared/audio.js";
import { loadSettings } from "../shared/settings.js";
import { mountSettingsButtons } from "../shared/settingsButtons.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { bindSoftTap } from "../shared/tap.js";
import { todayString } from "../shared/random.js";
import { readNumber, writeValue } from "../shared/storage.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { setHtml, setText } from "../shared/dom.js";

const SETTINGS_KEY = "lighthouse-settings";
const BEST_KEY = "lighthouse-best-score";

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");

const levelButtonsEl = document.querySelector("#levelButtons");
const beamButtonsEl = document.querySelector("#beamButtons");
const queueList = document.querySelector("#queueList");

const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");
const feedbackText = document.querySelector("#feedbackText");
const weatherText = document.querySelector("#weatherText");

const progressValue = document.querySelector("#progressValue");
const timeValue = document.querySelector("#timeValue");
const livesValue = document.querySelector("#livesValue");
const scoreValue = document.querySelector("#scoreValue");
const streakValue = document.querySelector("#streakValue");
const bestValue = document.querySelector("#bestValue");

const boatLabel = document.querySelector("#boatLabel");
const boatSignal = document.querySelector("#boatSignal");
const boatProgressBar = document.querySelector("#boatProgressBar");
const boatType = document.querySelector("#boatType");

const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

const settingsState = loadSettings(SETTINGS_KEY);
const speak = createSpeaker(settingsState, SPEECH_PRESETS.standard);
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

let data = null;
let currentLevelId = "easy";
let latestState = null;

function getLevelById(id) {
  return data.levels.find((item) => item.id === id) || data.levels[0];
}

function getSignalById(id) {
  return data.signals.find((item) => item.id === id) || null;
}

function playTone(freq = 560, durationMs = 160) {
  gameAudio.note(freq * 0.72, { style: "thunk", durationMs: Math.max(90, durationMs - 36), gain: 0.02 });
  gameAudio.note(freq, { style: "bell", durationMs: durationMs + 10, gain: 0.024, delayMs: 34 });
}

function renderLevelButtons() {
  levelButtonsEl.innerHTML = data.levels.map((level) => {
    const cls = level.id === currentLevelId ? "level-btn is-active" : "level-btn";
    return `<button class="${cls}" data-level-id="${level.id}" type="button">${level.name}</button>`;
  }).join("");
}

function renderBeamButtons(state) {
  const pool = Array.isArray(state?.signalPool) ? state.signalPool : [];
  setHtml(beamButtonsEl, pool.map((signal) => {
    const classes = ["beam-btn"];
    if (signal.id === state.beamId) {
      classes.push("is-active");
    }
    return `<button class="${classes.join(" ")}" data-beam-id="${signal.id}" style="background:${signal.color};" type="button"><span class="emoji">${signal.emoji}</span><span class="name">${signal.name}</span></button>`;
  }).join(""));
}

function renderQueue(state) {
  const queue = Array.isArray(state?.queue) ? state.queue.slice(0, 5) : [];
  while (queue.length < 5) {
    queue.push(null);
  }
  setHtml(queueList, queue.map((boat) => {
    if (!boat) {
      return "<div class=\"queue-item empty\">·</div>";
    }
    const title = boat.isJammer
      ? "干扰船：显示信号可能是假的"
      : (boat.isDual ? "双信号船：两种灯光都可护航" : "普通来船");
    return `<div class="queue-item ${boat.isJammer ? "jammer" : ""} ${boat.isDual ? "dual" : ""}" title="${title}">${getBoatSignalText(boat, state.weatherEvent)}</div>`;
  }).join(""));
}

function getBoatSignalText(boat, weatherEvent) {
  if (!boat) {
    return "--";
  }
  if (weatherEvent?.id === "fog") {
    return "❔";
  }
  if (boat.isJammer) {
    const fake = getSignalById(boat.displaySignalId);
    return `${fake?.emoji || "?"}🌀`;
  }
  if (boat.isDual) {
    const ids = Array.isArray(boat.acceptedSignalIds) ? boat.acceptedSignalIds.slice(0, 2) : [boat.signalId];
    const emojis = ids.map((id) => getSignalById(id)?.emoji || "?");
    return `${emojis[0]}${emojis[1] || ""}`;
  }
  const signal = getSignalById(boat.signalId);
  return signal?.emoji || "?";
}

function getBoatTypeText(boat, weatherEvent) {
  if (!boat) {
    return "等待下一艘来船";
  }
  if (weatherEvent?.id === "fog") {
    return boat.isJammer ? "迷雾+干扰：谨慎判断" : "迷雾中：信号模糊";
  }
  if (boat.isJammer) {
    return "干扰船：显示信号可能不真实";
  }
  if (boat.isDual) {
    return "双信号船：任意匹配其中一个灯光";
  }
  return "普通来船";
}

function updateUi(state) {
  latestState = state;

  progressValue.textContent = `${state.solvedBoats} / ${state.targetBoats}`;
  timeValue.textContent = `${Math.max(0, Math.ceil(state.timeLeft))} 秒`;
  livesValue.textContent = String(state.lives);
  scoreValue.textContent = String(state.score);
  streakValue.textContent = String(state.streak);
  bestValue.textContent = String(state.bestScore);
  if (weatherText) {
    weatherText.textContent = `天气：${state.weatherEvent?.name || "晴朗"}`;
  }

  setText(feedbackText, state.lastEvent);
  guideText.textContent = state.isRunning
    ? "切换到与来船相同的灯光，保证每艘船都安全进港。"
    : (state.isWin ? "值守成功，今晚港口很安全。" : "观察来船信号，切换相同灯光，护送船只安全进港。");

  retryBtn.disabled = !state.levelId;

  if (state.activeBoat) {
    boatLabel.textContent = "来船信号";
    boatSignal.textContent = getBoatSignalText(state.activeBoat, state.weatherEvent);
    if (boatType) {
      boatType.textContent = getBoatTypeText(state.activeBoat, state.weatherEvent);
    }
    boatProgressBar.style.width = `${Math.max(0, Math.min(100, state.activeProgressPct || 0))}%`;
  } else {
    boatLabel.textContent = "等待来船...";
    boatSignal.textContent = "--";
    if (boatType) {
      boatType.textContent = "等待下一艘来船";
    }
    boatProgressBar.style.width = "0%";
  }

  renderBeamButtons(state);
  renderQueue(state);
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = payload.isWin ? "值守成功 ⭐" : "值守结束，再试一次";
  resultText.textContent = `难度：${payload.levelName} | 进港：${payload.solvedBoats}/${payload.targetBoats} | 分数：${payload.score} | 生命：${payload.lives} | 天气：${payload.weatherName} | 剩余时间：${payload.remainTime} 秒`;
  if (payload.isWin) {
    gameAudio.note(340, { style: "thunk", durationMs: 150, gain: 0.018 });
    gameAudio.note(560, { style: "bell", durationMs: 150, gain: 0.022, delayMs: 70 });
    gameAudio.note(740, { style: "bell", durationMs: 180, gain: 0.02, delayMs: 166 });
  } else {
    gameAudio.lose();
  }
  if (payload.bestScore > readNumber(BEST_KEY)) {
    writeValue(BEST_KEY, payload.bestScore);
  }
}

const game = new LighthouseGame({
  onStateChange: updateUi,
  onResult: showResult,
  onToast: (text) => {
    setText(feedbackText, text);
    speak(text, { detailOnly: true });
  },
});

function startGame(seed = "") {
  if (!data) {
    return;
  }
  resultEl.hidden = true;
  const level = getLevelById(currentLevelId);
  selectorHint.textContent = `已开始：${level.name}，目标护送 ${level.targetBoats} 艘船。`;
  game.start(level.id, seed ? { seed } : {});
}

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(dailyBtn, () => startGame(`${todayString()}|${currentLevelId}|lighthouse`));

mountSettingsButtons({
  storageKey: SETTINGS_KEY,
  settings: settingsState,
  bindTap: bindSoftTap,
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
  selectorHint.textContent = `已选择：${level.name}，目标护送 ${level.targetBoats} 艘船。`;
});

beamButtonsEl.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-beam-id]");
  if (!button || !latestState?.isRunning) {
    return;
  }
  event.preventDefault();
  const beamId = button.dataset.beamId;
  const signal = getSignalById(beamId);
  playTone(signal?.freq || 560, 130);
  game.setBeam(beamId);
});

async function bootstrap() {
  try {
    data = await loadGameConfig("../../configs/levels/lighthouse-keeper.levels.json", ["levels", "signals"]);
  } catch (error) {
    showConfigError(error);
    return;
  }

  data.levels = data.levels.map((level) => ({
    weatherCycleMs: 9000,
    jammerChance: 0.1,
    dualChance: 0.12,
    ...level,
  }));

  currentLevelId = data.levels[0].id;
  renderLevelButtons();
  game.init(data, readNumber(BEST_KEY));
}

bootstrap();
