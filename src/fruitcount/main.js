import { FruitCountGame } from "./fruitCountGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";

const PROGRESS_KEY = "fruitcount-game-progress";
const SETTINGS_KEY = "fruitcount-game-settings";
const GLOBAL_SETTINGS_KEY = "kids-global-settings";

const game = new FruitCountGame();

const scoreValue = document.querySelector("#scoreValue");
const streakValue = document.querySelector("#streakValue");
const bestStreakValue = document.querySelector("#bestStreakValue");
const levelValue = document.querySelector("#levelValue");
const answeredValue = document.querySelector("#answeredValue");
const fruitDisplay = document.querySelector("#fruitDisplay");
const fruitLabel = document.querySelector("#fruitLabel");
const questionText = document.querySelector("#questionText");
const choiceButtons = document.querySelector("#choiceButtons");
const nextBtn = document.querySelector("#nextBtn");
const feedbackEl = document.querySelector("#feedback");
const resetBtn = document.querySelector("#resetBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const parentModeBtn = document.querySelector("#parentModeBtn");

const settingsState = { voiceOn: true, careMode: "standard" };
const progressState = { bestScore: 0, bestStreak: 0 };
const CARE_MODES = ["standard", "soft", "quiet"];
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

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
    progressState.bestScore = Number(parsed.bestScore || 0);
    progressState.bestStreak = Number(parsed.bestStreak || 0);
  } catch {
    progressState.bestScore = 0;
    progressState.bestStreak = 0;
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
  voiceBtn.textContent = `语音引导：${settingsState.voiceOn ? "开" : "关"}`;
  parentModeBtn.textContent = `护眼模式：${careModeLabel(settingsState.careMode)}`;
}

function renderFruits(question) {
  fruitDisplay.innerHTML = Array.from({ length: question.count }, () =>
    `<span class="fruit-item">${question.fruit.icon}</span>`,
  ).join("");
  fruitLabel.textContent = question.fruit.name;
}

function renderChoices(snapshot) {
  choiceButtons.innerHTML = snapshot.question.choices.map((choice) => {
    let extraClass = "";
    if (snapshot.answered) {
      if (choice === snapshot.question.count) {
        extraClass = "is-correct";
      } else if (choice === snapshot.lastChosen) {
        extraClass = "is-wrong";
      }
    }
    return `
      <button class="choice-btn ${extraClass}" type="button" data-choice="${choice}" ${snapshot.answered ? "disabled" : ""}>
        ${choice}
      </button>
    `;
  }).join("");
}

function render(snapshot) {
  scoreValue.textContent = String(snapshot.score);
  streakValue.textContent = String(snapshot.streak);
  bestStreakValue.textContent = String(Math.max(snapshot.bestStreak, progressState.bestStreak));
  levelValue.textContent = String(snapshot.currentLevel);
  answeredValue.textContent = String(snapshot.totalAnswered);

  renderFruits(snapshot.question);
  questionText.textContent = `有几个${snapshot.question.fruit.name}？`;
  renderChoices(snapshot);

  feedbackEl.textContent = snapshot.feedback;
  feedbackEl.className = snapshot.answered
    ? (snapshot.lastCorrect ? "is-correct" : "is-wrong")
    : "";

  nextBtn.hidden = !snapshot.answered;
}

choiceButtons.addEventListener("click", (event) => {
  const button = event.target.closest("[data-choice]");
  if (!button || button.disabled) {
    return;
  }
  const choice = Number(button.dataset.choice);
  const snapshot = game.answer(choice);

  progressState.bestScore = Math.max(progressState.bestScore, snapshot.score);
  progressState.bestStreak = Math.max(progressState.bestStreak, snapshot.bestStreak);
  saveProgress();

  render(snapshot);

  if (snapshot.correct) {
    gameAudio.success(840);
    speak(snapshot.feedback);
  } else {
    gameAudio.wrong();
    speak(snapshot.feedback);
  }
});

nextBtn.addEventListener("click", () => {
  const snapshot = game.nextQuestion();
  render(snapshot);
  speak(`${snapshot.question.fruit.name}，有几个？`);
  gameAudio.uiTap();
});

resetBtn.addEventListener("click", () => {
  game.reset();
  const snapshot = game.getSnapshot();
  render(snapshot);
  speak("重新开始，数一数有几个水果。", true);
  gameAudio.uiTap();
});

voiceBtn.addEventListener("click", () => {
  settingsState.voiceOn = !settingsState.voiceOn;
  saveSettings();
  renderSettingsUi();
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
render(game.getSnapshot());
speak(`数一数有几个${game.getSnapshot().question.fruit.name}？`, true);
