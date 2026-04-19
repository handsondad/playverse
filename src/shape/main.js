import { ShapeGame } from "./shapeGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";

const PROGRESS_KEY = "shape-game-progress";
const SETTINGS_KEY = "shape-game-settings";
const GLOBAL_SETTINGS_KEY = "kids-global-settings";

const game = new ShapeGame();

const targetBadge = document.querySelector("#targetBadge");
const guideText = document.querySelector("#guideText");
const winsValue = document.querySelector("#winsValue");
const tapsValue = document.querySelector("#tapsValue");
const bestValue = document.querySelector("#bestValue");
const feedback = document.querySelector("#feedback");
const celebration = document.querySelector("#celebration");
const board = document.querySelector("#board");
const nextBtn = document.querySelector("#nextBtn");
const resetBtn = document.querySelector("#resetBtn");
const statsToggleBtn = document.querySelector("#statsToggleBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const parentModeBtn = document.querySelector("#parentModeBtn");

const settingsState = { voiceOn: true, careMode: "standard" };
const progressState = { bestWins: 0 };
const CARE_MODES = ["standard", "soft", "quiet"];
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });
const uiState = { statsOpen: false };
let celebrationTimer = 0;

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
  } catch {
    settingsState.voiceOn = true;
    settingsState.careMode = "standard";
  }
}

function saveSettings() {
  const payload = {
    voiceOn: settingsState.voiceOn,
    careMode: settingsState.careMode,
    parentMode: settingsState.careMode !== "standard",
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(payload));
}

function loadProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    progressState.bestWins = Number(parsed.bestWins || 0);
  } catch {
    progressState.bestWins = 0;
  }
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressState));
}

function speak(text, force = false) {
  if (!window.speechSynthesis || !settingsState.voiceOn) {
    return;
  }
  if (settingsState.careMode === "quiet" && !force) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = settingsState.careMode === "soft" ? 0.88 : 0.96;
  window.speechSynthesis.speak(utterance);
}

function renderSettingsUi() {
  if (statsToggleBtn) {
    statsToggleBtn.textContent = uiState.statsOpen ? "收起数据" : "家长查看";
  }
  voiceBtn.textContent = `语音引导：${settingsState.voiceOn ? "开" : "关"}`;
  parentModeBtn.textContent = `护眼模式：${careModeLabel(settingsState.careMode)}`;
}

function showCelebration(text) {
  if (!celebration) {
    return;
  }
  window.clearTimeout(celebrationTimer);
  celebration.innerHTML = `<span class="celebration-icon">💫</span><span>${text}</span><span class="celebration-icon">💫</span>`;
  celebration.classList.add("is-visible");
  targetBadge.classList.add("is-celebrating");
  celebrationTimer = window.setTimeout(() => {
    celebration.classList.remove("is-visible");
    targetBadge.classList.remove("is-celebrating");
  }, 1200);
}

function renderCards(snapshot) {
  board.innerHTML = snapshot.cards.map((card) => `
    <button class="card ${snapshot.lastTappedId === card.id ? "is-active" : ""}" type="button" data-shape-id="${card.id}" style="--accent:${card.accent}">
      <span class="card-icon">${card.symbol}</span>
      <span class="card-label">${card.name}</span>
    </button>
  `).join("");
}

function render(snapshot) {
  targetBadge.innerHTML = `<span class="target-icon" style="color:${snapshot.target.accent}">${snapshot.target.symbol}</span><span>${snapshot.target.name}</span>`;
  guideText.textContent = `点 ${snapshot.target.name}`;
  winsValue.textContent = String(snapshot.wins);
  tapsValue.textContent = String(snapshot.totalTaps);
  bestValue.textContent = String(progressState.bestWins);
  feedback.textContent = snapshot.feedback;
  feedback.className = `feedback ${snapshot.lastTappedId && snapshot.lastTappedId === snapshot.target.id ? "is-good" : ""}`;
  renderCards(snapshot);
  document.body.classList.toggle("stats-open", uiState.statsOpen);
}

function refresh() {
  render(game.getSnapshot());
}

board.addEventListener("click", (event) => {
  const button = event.target.closest("[data-shape-id]");
  if (!button) {
    return;
  }
  const snapshot = game.tapShape(button.dataset.shapeId);
  progressState.bestWins = Math.max(progressState.bestWins, snapshot.wins);
  saveProgress();
  render(snapshot);
  if (snapshot.success) {
    gameAudio.success();
    showCelebration("点到啦");
    // Get the new target after success and prompt for it
    const newSnapshot = game.getSnapshot();
    setTimeout(() => {
      speak(`现在找${newSnapshot.target.name}。`);
    }, 1000);
  }
  speak(snapshot.feedback);
});

nextBtn.addEventListener("click", () => {
  game.nextTarget();
  refresh();
  speak(game.getSnapshot().feedback);
});

resetBtn.addEventListener("click", () => {
  game.reset();
  refresh();
  const snapshot = game.getSnapshot();
  const targetName = snapshot.target?.name || "形状";
  speak(`重新来，点${targetName}。`, true);
});

statsToggleBtn?.addEventListener("click", () => {
  uiState.statsOpen = !uiState.statsOpen;
  renderSettingsUi();
  document.body.classList.toggle("stats-open", uiState.statsOpen);
});

voiceBtn.addEventListener("click", () => {
  settingsState.voiceOn = !settingsState.voiceOn;
  saveSettings();
  renderSettingsUi();
  if (settingsState.voiceOn) {
    speak(game.getSnapshot().feedback, true);
  }
});

parentModeBtn.addEventListener("click", () => {
  settingsState.careMode = nextCareMode(settingsState.careMode);
  saveSettings();
  renderSettingsUi();
});

loadSettings();
loadProgress();
renderSettingsUi();
bindUiTapSounds(document.body, gameAudio);
refresh();
// Initial voice prompt
const initialSnapshot = game.getSnapshot();
speak(`找${initialSnapshot.target.name}。`, true);