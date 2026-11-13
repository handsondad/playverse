import { ClockGame } from "./clockGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";
import { loadSettings } from "../shared/settings.js";
import { mountSettingsButtons, speakSettingChanges } from "../shared/settingsButtons.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { bindDelegatedTap, createSoftTap } from "../shared/tap.js";
import { hashText, todayString } from "../shared/random.js";
import { readNumber, readNumbers, writeJson, writeValue } from "../shared/storage.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { setHtml, setText } from "../shared/dom.js";

const SETTINGS_KEY = "clock-settings";
const STATS_KEY = "clock-stats";
const BEST_KEY = "clock-best-score";

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const hintBtn = document.querySelector("#hintBtn");

const levelButtonsEl = document.querySelector("#levelButtons");
const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");
const routineBadge = document.querySelector("#routineBadge");
const feedbackText = document.querySelector("#feedbackText");
const clockFace = document.querySelector("#clockFace");
const choiceButtons = document.querySelector("#choiceButtons");

const progressValue = document.querySelector("#progressValue");
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
let currentLevelId = "easy";
let latestState = null;
let nextTimer = 0;

function getLevelById(id) {
  return levelsData.levels.find((item) => item.id === id) || levelsData.levels[0];
}

function renderLevelButtons() {
  setHtml(levelButtonsEl, levelsData.levels.map((level) => {
    const cls = level.id === currentLevelId ? "level-btn is-active" : "level-btn";
    return `<button type="button" class="${cls}" data-level-id="${level.id}">${level.name}</button>`;
  }).join(""));
}

function buildClockSvg(question, showMinuteGuide) {
  const hourAngle = question ? question.hourAngle : 0;
  const minuteAngle = question ? question.minuteAngle : 0;
  const ticks = [];
  for (let i = 0; i < 60; i += 1) {
    const deg = i * 6;
    const isMajor = i % 5 === 0;
    ticks.push(`<line x1="120" y1="${isMajor ? 18 : 20}" x2="120" y2="${isMajor ? 28 : 24}" stroke="${isMajor ? "#7c6550" : "#ccbba6"}" stroke-width="${isMajor ? 3 : 1.5}" stroke-linecap="round" transform="rotate(${deg} 120 120)" />`);
  }

  const numbers = [];
  for (let n = 1; n <= 12; n += 1) {
    const rad = ((n * 30) - 90) * (Math.PI / 180);
    const x = 120 + Math.cos(rad) * 78;
    const y = 120 + Math.sin(rad) * 78;
    numbers.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="18" font-weight="800" fill="#3e352c">${n}</text>`);
    if (showMinuteGuide) {
      const mx = 120 + Math.cos(rad) * 103;
      const my = 120 + Math.sin(rad) * 103;
      const mins = (n * 5) % 60;
      numbers.push(`<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="10" font-weight="700" fill="#4484d4">${String(mins).padStart(2, "0")}</text>`);
    }
  }

  return `
    <svg viewBox="0 0 240 240" role="img" aria-label="时钟圆盘">
      <circle cx="120" cy="120" r="112" fill="#fffdf9" stroke="#e8b882" stroke-width="8" />
      <circle cx="120" cy="120" r="96" fill="none" stroke="#f5e6d2" stroke-width="2" />
      ${ticks.join("")}
      ${numbers.join("")}
      <line x1="120" y1="120" x2="120" y2="68" stroke="#e06d53" stroke-width="8" stroke-linecap="round" transform="rotate(${hourAngle} 120 120)" />
      <line x1="120" y1="120" x2="120" y2="42" stroke="#4484d4" stroke-width="5.5" stroke-linecap="round" transform="rotate(${minuteAngle} 120 120)" />
      <circle cx="120" cy="120" r="7" fill="#5a4636" />
    </svg>
  `;
}

function updateUi(state) {
  latestState = state;
  progressValue.textContent = `${state.questionIndex} / ${state.targetQuestions}`;
  scoreValue.textContent = String(state.score);
  streakValue.textContent = String(state.streak);
  hintsValue.textContent = String(state.hintsLeft);
  bestValue.textContent = String(state.bestScore);

  hintBtn.disabled = !state.isRunning || state.answered || state.hintsLeft <= 0;
  retryBtn.disabled = !state.levelId;

  const r = state.question?.routine;
  routineBadge.textContent = r ? `${r.icon} ${r.period} · ${r.title}` : "🕒 日常小作息";
  setText(feedbackText, state.lastFeedback);
  setText(guideText, state.isRunning
    ? `当前：${state.levelName}，认对 ${state.targetQuestions} 个时间即可过关。`
    : "看清圆盘上的短时针和长分针，选出正确的时间。");

  setHtml(clockFace, buildClockSvg(state.question, state.showMinuteGuide));

  const disabled = !state.isRunning || state.answered;
  setHtml(choiceButtons, state.options.map((opt) => `
    <button type="button" class="choice-btn" data-choice="${opt.key}" ${disabled ? "disabled" : ""}>
      <span class="digital">${opt.digital}</span>
      <span class="spoken">${opt.spoken}</span>
    </button>
  `).join(""));
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = "时间小达人通关啦 ⭐";
  resultText.textContent = `难度：${payload.levelName} | 认对：${payload.solved}/${payload.targetQuestions} | 分数：${payload.score} | 准确率：${payload.accuracy}%`;
  gameAudio.win();

  stats.plays += 1;
  stats.wins += 1;
  stats.solved += payload.solved;
  stats.bestStreak = Math.max(stats.bestStreak, payload.bestStreak);
  writeJson(STATS_KEY, stats);

  if (payload.bestScore > readNumber(BEST_KEY)) {
    writeValue(BEST_KEY, payload.bestScore);
  }
  speak("恭喜你，所有时间都认准啦！");
}

const game = new ClockGame({
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
    modeName: options.modeName || "日常作息",
    seed: options.seed,
  });
  speak("看看短时针和长分针，现在是几点钟呢？");
}

bindUiTapSounds(document.body, gameAudio);

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(dailyBtn, () => {
  if (!levelsData) {
    return;
  }
  const day = todayString();
  const hash = hashText(`${day}|clock`);
  const level = levelsData.levels[hash % levelsData.levels.length];
  currentLevelId = level.id;
  renderLevelButtons();
  startGame({
    levelId: level.id,
    modeName: `今日时钟 ${day}`,
    seed: `${day}|${level.id}|clock`,
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

bindDelegatedTap(choiceButtons, "[data-choice]", (button) => {
  const outcome = game.answer(button.dataset.choice);
  if (!outcome.ok && outcome.correct === false) {
    gameAudio.wrong();
    speak(latestState.lastFeedback);
    return;
  }
  if (outcome.correct) {
    gameAudio.success(860);
    speak(latestState.lastFeedback);
    window.clearTimeout(nextTimer);
    nextTimer = window.setTimeout(() => {
      game.nextQuestion();
    }, 900);
  }
});

async function bootstrap() {
  try {
    levelsData = await loadGameConfig("../../configs/levels/clock-time.levels.json", ["levels", "routines"]);
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
