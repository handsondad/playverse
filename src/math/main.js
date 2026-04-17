import { MathGame } from "./mathGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";

const GLOBAL_SETTINGS_KEY = "kids-global-settings";
const SETTINGS_KEY = "math-settings";
const STATS_KEY = "math-stats";
const WRONG_QUESTIONS_KEY = "math-wrong-questions";

const FALLBACK_DATA = {
  stages: [
    { id: "ma-1", name: "加法新手", operators: ["+"], range: [1, 10], enemyHp: 60, playerHp: 3, questionCount: 6, skillCombo: 3, damage: 12, wrongDamage: 1 },
  ],
};

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const reviewBtn = document.querySelector("#reviewBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const narrationBtn = document.querySelector("#narrationBtn");
const parentModeBtn = document.querySelector("#parentModeBtn");

const stageButtonsEl = document.querySelector("#stageButtons");
const selectorHint = document.querySelector("#selectorHint");
const reviewSummary = document.querySelector("#reviewSummary");
const guideText = document.querySelector("#guideText");
const answerOptions = document.querySelector("#answerOptions");
const questionText = document.querySelector("#questionText");
const comboHint = document.querySelector("#comboHint");
const playerHpText = document.querySelector("#playerHpText");
const enemyHpText = document.querySelector("#enemyHpText");
const playerHpFill = document.querySelector("#playerHpFill");
const enemyHpFill = document.querySelector("#enemyHpFill");
const scoreValue = document.querySelector("#scoreValue");
const comboValue = document.querySelector("#comboValue");
const correctValue = document.querySelector("#correctValue");
const wrongValue = document.querySelector("#wrongValue");
const progressText = document.querySelector("#progressText");
const progressFill = document.querySelector("#progressFill");
const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

const stats = { plays: 0, wins: 0 };
const settingsState = { voiceOn: true, careMode: "standard", narrationLevel: "key" };
const CARE_MODES = ["standard", "soft", "quiet"];
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

let levelsData = FALLBACK_DATA;
let currentStageId = "";
let latestState = null;
let wrongQuestions = [];
let activeReviewQuestions = [];

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

function saveStats() {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function loadWrongQuestions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WRONG_QUESTIONS_KEY) || "[]");
    wrongQuestions = Array.isArray(parsed) ? parsed : [];
  } catch {
    wrongQuestions = [];
  }
}

function saveWrongQuestions() {
  localStorage.setItem(WRONG_QUESTIONS_KEY, JSON.stringify(wrongQuestions));
}

function addWrongQuestion(question, stageId, stageName) {
  if (!question) {
    return;
  }
  const exists = wrongQuestions.some((item) => item.text === question.text && item.answer === question.answer);
  if (exists) {
    return;
  }
  wrongQuestions = [
    ...wrongQuestions,
    {
      text: question.text,
      answer: question.answer,
      options: [...question.options],
      stageId,
      stageName,
    },
  ].slice(-20);
  saveWrongQuestions();
}

function clearReviewedQuestions(questions) {
  const texts = new Set((questions || []).map((item) => item.text));
  wrongQuestions = wrongQuestions.filter((item) => !texts.has(item.text));
  saveWrongQuestions();
}

function loadStats() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATS_KEY) || "{}");
    stats.plays = Number(parsed.plays || 0);
    stats.wins = Number(parsed.wins || 0);
  } catch {
    stats.plays = 0;
    stats.wins = 0;
  }
}

function loadSettings() {
  try {
    const globalParsed = JSON.parse(localStorage.getItem(GLOBAL_SETTINGS_KEY) || "{}");
    const localParsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const merged = { ...localParsed, ...globalParsed };
    settingsState.voiceOn = merged.voiceOn !== false;
    settingsState.careMode = CARE_MODES.includes(merged.careMode) ? merged.careMode : "standard";
    settingsState.narrationLevel = merged.narrationLevel === "detailed" ? "detailed" : "key";
  } catch {
    settingsState.voiceOn = true;
    settingsState.careMode = "standard";
    settingsState.narrationLevel = "key";
  }
}

function saveSettings() {
  const payload = {
    voiceOn: settingsState.voiceOn,
    careMode: settingsState.careMode,
    narrationLevel: settingsState.narrationLevel,
    parentMode: settingsState.careMode !== "standard",
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(payload));
}

function speak(text) {
  if (!settingsState.voiceOn || !window.speechSynthesis || settingsState.careMode === "quiet") {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = settingsState.careMode === "standard" ? 1 : 0.92;
  window.speechSynthesis.speak(utterance);
}

function applySettingsUi() {
  voiceBtn.textContent = `语音引导：${settingsState.voiceOn ? "开" : "关"}`;
  narrationBtn.textContent = `播报模式：${settingsState.narrationLevel === "detailed" ? "详细" : "关键"}`;
  parentModeBtn.textContent = `护眼模式：${careModeLabel(settingsState.careMode)}`;
}

function renderReviewSummary() {
  if (!reviewSummary) {
    return;
  }
  if (wrongQuestions.length === 0) {
    reviewSummary.textContent = "还没有错题，先去闯关吧。";
    reviewBtn.disabled = true;
    return;
  }
  const latest = wrongQuestions.slice(-3).map((item) => item.text).join(" | ");
  reviewSummary.textContent = `当前错题 ${wrongQuestions.length} 道。最近：${latest}`;
  reviewBtn.disabled = false;
}

function renderStageButtons() {
  stageButtonsEl.innerHTML = levelsData.stages.map((stage) => {
    const activeClass = stage.id === currentStageId ? "stage-btn is-active" : "stage-btn";
    return `<button class="${activeClass}" data-stage-id="${stage.id}">${stage.name}</button>`;
  }).join("");
}

function renderAnswers(state) {
  if (!state.question) {
    answerOptions.innerHTML = "";
    return;
  }
  answerOptions.innerHTML = state.question.options.map((option) => {
    return `<button class="answer-btn" data-option="${option}">${option}</button>`;
  }).join("");
}

function renderState(state) {
  latestState = state;
  scoreValue.textContent = String(state.score);
  comboValue.textContent = String(state.combo);
  correctValue.textContent = String(state.correctCount);
  wrongValue.textContent = String(state.wrongCount);
  questionText.textContent = state.question?.text || "点击开始冒险";
  comboHint.textContent = state.combo > 0 ? `当前连击 ${state.combo}，继续答对可触发技能` : "连续答对可以触发技能伤害";
  playerHpText.textContent = `生命 ${state.playerHp}/${state.playerMaxHp}`;
  enemyHpText.textContent = `生命 ${state.enemyHp}/${state.enemyMaxHp}`;
  playerHpFill.style.width = `${state.playerMaxHp > 0 ? (state.playerHp / state.playerMaxHp) * 100 : 0}%`;
  enemyHpFill.style.width = `${state.enemyMaxHp > 0 ? (state.enemyHp / state.enemyMaxHp) * 100 : 0}%`;
  progressText.textContent = `进度 ${Math.round((state.progress || 0) * 100)}%`;
  progressFill.style.width = `${Math.round((state.progress || 0) * 100)}%`;
  retryBtn.disabled = state.isRunning || !state.stageId;

  if (!state.isRunning) {
    guideText.textContent = "先选章节，再开始战斗。";
  } else if (state.reviewMode) {
    guideText.textContent = "这里是错题复习关，答对后会从错题本里移除。";
  } else if (state.lastResult === "correct") {
    guideText.textContent = "答对了，继续攻击怪物。";
  } else if (state.lastResult === "wrong") {
    guideText.textContent = "答错了，怪物反击了一下。";
  } else {
    guideText.textContent = "看题后点击正确答案。";
  }

  renderAnswers(state);
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = payload.reviewMode
    ? (payload.isWin ? "复习完成" : "继续复习")
    : (payload.isWin ? "闯关成功" : "继续练习");
  resultText.textContent = `章节：${payload.stageName} | 分数：${payload.score} | 答对：${payload.correctCount} | 答错：${payload.wrongCount} | 准确率：${payload.accuracy}% | 最佳连击：${payload.bestCombo}`;
  payload.isWin ? gameAudio.win() : gameAudio.lose();
  stats.plays += 1;
  if (payload.isWin) {
    stats.wins += 1;
  }
  saveStats();

  if (payload.reviewMode && payload.isWin) {
    clearReviewedQuestions(activeReviewQuestions);
  }
  activeReviewQuestions = [];
  renderReviewSummary();
}

function hashText(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function start(options = {}) {
  resultEl.hidden = true;
  const stageId = options.stageId || currentStageId;
  activeReviewQuestions = Array.isArray(options.reviewQuestions) ? options.reviewQuestions.map((item) => ({ ...item })) : [];
  game.start(stageId, {
    modeName: options.modeName || "普通冒险",
    seed: options.seed || `${Date.now()}|math`,
    reviewQuestions: options.reviewQuestions,
  });
}

function bindSoftTap(button, handler) {
  const run = () => {
    if (button.disabled) {
      return;
    }
    button.classList.add("tap-flash");
    setTimeout(() => {
      button.classList.remove("tap-flash");
      handler();
    }, 70);
  };

  button.addEventListener("pointerup", (event) => {
    event.preventDefault();
    run();
  });

  button.addEventListener("click", (event) => event.preventDefault());
}

const game = new MathGame({
  onStateChange: renderState,
  onResult: showResult,
  onToast: (text) => {
    selectorHint.textContent = text;
    if (settingsState.narrationLevel === "detailed") {
      speak(text);
    }
  },
});

bindUiTapSounds(document.body, gameAudio);

async function bootstrap() {
  try {
    const response = await fetch("../../configs/levels/math-adventure.levels.json");
    if (!response.ok) {
      throw new Error(`Failed to load levels: ${response.status}`);
    }
    levelsData = await response.json();
  } catch {
    levelsData = FALLBACK_DATA;
    selectorHint.textContent = "算术配置加载失败，已使用内置章节。";
  }

  levelsData.stages = Array.isArray(levelsData?.stages) && levelsData.stages.length > 0 ? levelsData.stages : FALLBACK_DATA.stages;
  currentStageId = levelsData.stages[0].id;
  loadStats();
  loadWrongQuestions();
  loadSettings();
  applySettingsUi();
  renderStageButtons();
  renderReviewSummary();
  game.init(levelsData.stages);
}

bindSoftTap(startBtn, () => start());
bindSoftTap(retryBtn, () => start());
bindSoftTap(dailyBtn, () => {
  const day = todayString();
  const hash = hashText(`${day}|math`);
  const stage = levelsData.stages[hash % levelsData.stages.length];
  currentStageId = stage.id;
  renderStageButtons();
  start({
    stageId: stage.id,
    modeName: `今日挑战 ${day}`,
    seed: `${day}|${stage.id}|math`,
  });
});
bindSoftTap(reviewBtn, () => {
  if (wrongQuestions.length === 0) {
    selectorHint.textContent = "当前没有错题可复习。";
    return;
  }
  const questionSet = wrongQuestions.slice(-5);
  const stageId = questionSet[0].stageId || currentStageId;
  currentStageId = stageId;
  renderStageButtons();
  start({
    stageId,
    modeName: "错题复习",
    seed: `${Date.now()}|math|review`,
    reviewQuestions: questionSet,
  });
});

bindSoftTap(voiceBtn, () => {
  settingsState.voiceOn = !settingsState.voiceOn;
  saveSettings();
  applySettingsUi();
});

bindSoftTap(narrationBtn, () => {
  settingsState.narrationLevel = settingsState.narrationLevel === "detailed" ? "key" : "detailed";
  saveSettings();
  applySettingsUi();
});

bindSoftTap(parentModeBtn, () => {
  settingsState.careMode = nextCareMode(settingsState.careMode);
  saveSettings();
  applySettingsUi();
});

stageButtonsEl.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-stage-id]");
  if (!button) {
    return;
  }
  event.preventDefault();
  currentStageId = button.dataset.stageId;
  renderStageButtons();
  selectorHint.textContent = `已选择章节：${button.textContent}`;
  speak(selectorHint.textContent);
});

answerOptions.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-option]");
  if (!button) {
    return;
  }
  event.preventDefault();
  const answerValue = Number(button.dataset.option);
  if (latestState?.question && answerValue !== latestState.question.answer) {
    gameAudio.wrong();
    addWrongQuestion(latestState.question, latestState.stageId, latestState.stageName);
    renderReviewSummary();
  } else {
    gameAudio.correct();
  }
  game.answer(answerValue);
});

bootstrap();
