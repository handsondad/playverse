import { AnimalGame } from "./animalGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";

const PROGRESS_KEY = "animal-game-progress";
const SETTINGS_KEY = "animal-game-settings";
const GLOBAL_SETTINGS_KEY = "kids-global-settings";

const game = new AnimalGame();

const targetBadge = document.querySelector("#targetBadge");
const guideText = document.querySelector("#guideText");
const foundValue = document.querySelector("#foundValue");
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
const progressState = { bestFound: 0 };
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
    progressState.bestFound = Number(parsed.bestFound || 0);
  } catch {
    progressState.bestFound = 0;
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
  celebration.innerHTML = `<span class="celebration-icon">🌟</span><span>${text}</span><span class="celebration-icon">🌟</span>`;
  celebration.classList.add("is-visible");
  targetBadge.classList.add("is-celebrating");
  celebrationTimer = window.setTimeout(() => {
    celebration.classList.remove("is-visible");
    targetBadge.classList.remove("is-celebrating");
  }, 1200);
}

function renderCards(snapshot) {
  board.innerHTML = snapshot.cards.map((card) => `
    <button class="card ${snapshot.lastTappedId === card.id ? "is-active" : ""}" type="button" data-animal-id="${card.id}" style="--accent:${card.accent}">
      <span class="card-icon">${card.icon}</span>
      <span class="card-label">${card.name}</span>
    </button>
  `).join("");
}

function render(snapshot) {
  targetBadge.innerHTML = `<span class="target-icon">${snapshot.target.icon}</span><span>${snapshot.target.name}</span>`;
  guideText.textContent = `点 ${snapshot.target.name}`;
  foundValue.textContent = String(snapshot.found);
  tapsValue.textContent = String(snapshot.totalTaps);
  bestValue.textContent = String(progressState.bestFound);
  feedback.textContent = snapshot.feedback;
  feedback.className = `feedback ${snapshot.lastTappedId && snapshot.lastTappedId === snapshot.target.id ? "is-good" : ""}`;
  renderCards(snapshot);
  document.body.classList.toggle("stats-open", uiState.statsOpen);
}

function refresh() {
  render(game.getSnapshot());
}

board.addEventListener("click", (event) => {
  const button = event.target.closest("[data-animal-id]");
  if (!button) {
    return;
  }
  const snapshot = game.tapAnimal(button.dataset.animalId);
  progressState.bestFound = Math.max(progressState.bestFound, snapshot.found);
  saveProgress();
  render(snapshot);
  if (snapshot.success) {
    gameAudio.success();
    showCelebration("找到了");
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
  speak("我们重新点小动物吧。", true);
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