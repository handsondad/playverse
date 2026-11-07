import { FruitCountGame } from "./fruitCountGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";
import { loadSettings } from "../shared/settings.js";
import { mountSettingsButtons } from "../shared/settingsButtons.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { readNumbers, writeJson } from "../shared/storage.js";
import { setText } from "../shared/dom.js";

const PROGRESS_KEY = "fruitcount-game-progress";
const SETTINGS_KEY = "fruitcount-game-settings";

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

const settingsState = loadSettings(SETTINGS_KEY);
const speak = createSpeaker(settingsState, SPEECH_PRESETS.toddler);
const progressState = readNumbers(PROGRESS_KEY, { bestScore: 0, bestStreak: 0 });
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

function saveProgress() {
  writeJson(PROGRESS_KEY, progressState);
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

  setText(feedbackEl, snapshot.feedback);
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
  speak("重新开始，数一数有几个水果。", { force: true });
  gameAudio.uiTap();
});

mountSettingsButtons({ storageKey: SETTINGS_KEY, settings: settingsState });
bindUiTapSounds(document.body, gameAudio);
render(game.getSnapshot());
speak(`数一数有几个${game.getSnapshot().question.fruit.name}？`, { force: true });
