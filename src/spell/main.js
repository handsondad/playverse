import { SpellGame } from "./spellGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";

const GLOBAL_SETTINGS_KEY = "kids-global-settings";
const SETTINGS_KEY = "spell-settings";
const STATS_KEY = "spell-stats";

const FALLBACK_DATA = {
  themes: [
    {
      id: "animal",
      name: "动物",
      questions: [
        { id: "a-1", prompt: "猫 cat", icon: "🐱", answer: ["c", "a", "t"] },
        { id: "a-2", prompt: "狗 dog", icon: "🐶", answer: ["d", "o", "g"] },
      ],
    },
  ],
};

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const hintBtn = document.querySelector("#hintBtn");
const listenBtn = document.querySelector("#listenBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const narrationBtn = document.querySelector("#narrationBtn");
const parentModeBtn = document.querySelector("#parentModeBtn");

const themeButtonsEl = document.querySelector("#themeButtons");
const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");

const scoreValue = document.querySelector("#scoreValue");
const solvedValue = document.querySelector("#solvedValue");
const wrongValue = document.querySelector("#wrongValue");
const hintValue = document.querySelector("#hintValue");

const questionIcon = document.querySelector("#questionIcon");
const questionPrompt = document.querySelector("#questionPrompt");
const phonicsText = document.querySelector("#phonicsText");
const answerSlots = document.querySelector("#answerSlots");
const letterPool = document.querySelector("#letterPool");
const progressText = document.querySelector("#progressText");
const progressFill = document.querySelector("#progressFill");

const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

const stats = {
  plays: 0,
  solvedTotal: 0,
};

const settingsState = {
  voiceOn: true,
  careMode: "standard",
  narrationLevel: "key",
};

const CARE_MODES = ["standard", "soft", "quiet"];
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });
let levelsData = FALLBACK_DATA;
let currentThemeId = "";
let latestState = null;
let speechQueueToken = 0;

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
  if (index === -1) {
    return "standard";
  }
  return CARE_MODES[(index + 1) % CARE_MODES.length];
}

function saveStats() {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function loadStats() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATS_KEY) || "{}");
    stats.plays = Number(parsed.plays || 0);
    stats.solvedTotal = Number(parsed.solvedTotal || 0);
  } catch {
    stats.plays = 0;
    stats.solvedTotal = 0;
  }
}

function loadSettings() {
  try {
    const globalParsed = JSON.parse(localStorage.getItem(GLOBAL_SETTINGS_KEY) || "{}");
    const localParsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const merged = {
      ...localParsed,
      ...globalParsed,
    };
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
  if (!settingsState.voiceOn || !window.speechSynthesis) {
    return;
  }
  if (settingsState.careMode === "quiet") {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = settingsState.careMode === "standard" ? 1 : 0.92;
  window.speechSynthesis.speak(utterance);
}

function speakSequence(parts) {
  if (!settingsState.voiceOn || !window.speechSynthesis || settingsState.careMode === "quiet") {
    return;
  }

  const queue = parts.filter(Boolean);
  if (queue.length === 0) {
    return;
  }

  speechQueueToken += 1;
  const token = speechQueueToken;
  window.speechSynthesis.cancel();

  const run = (index) => {
    if (token !== speechQueueToken || index >= queue.length) {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(queue[index]);
    utterance.lang = /^[a-z]/i.test(queue[index]) ? "en-US" : "zh-CN";
    utterance.rate = settingsState.careMode === "standard" ? 0.92 : 0.84;
    utterance.onend = () => run(index + 1);
    window.speechSynthesis.speak(utterance);
  };

  run(0);
}

function getQuestionSpeechParts(question) {
  if (!question) {
    return [];
  }
  const phonics = Array.isArray(question.phonics) ? question.phonics : [];
  return [...phonics, question.speakText || question.prompt || ""];
}

function applySettingsUi() {
  voiceBtn.textContent = `语音引导：${settingsState.voiceOn ? "开" : "关"}`;
  narrationBtn.textContent = `播报模式：${settingsState.narrationLevel === "detailed" ? "详细" : "关键"}`;
  parentModeBtn.textContent = `护眼模式：${careModeLabel(settingsState.careMode)}`;
}

function renderThemeButtons() {
  themeButtonsEl.innerHTML = (levelsData.themes || []).map((theme) => {
    const activeClass = theme.id === currentThemeId ? "theme-btn is-active" : "theme-btn";
    return `<button class="${activeClass}" data-theme-id="${theme.id}">${theme.name}</button>`;
  }).join("");
}

function renderSlots(state) {
  const modeClass = state.currentQuestion?.mode === "pinyin" ? " mode-pinyin" : "";
  answerSlots.innerHTML = state.slots.map((slot) => {
    const filledClass = slot.letter ? " filled" : "";
    const fixedClass = slot.fixed ? " fixed" : "";
    return `<button class="answer-slot${modeClass}${filledClass}${fixedClass}" data-slot-index="${slot.index}">${slot.letter || "_"}</button>`;
  }).join("");
}

function renderPool(state) {
  const modeClass = state.currentQuestion?.mode === "pinyin" ? " mode-pinyin" : "";
  letterPool.innerHTML = state.pool.map((token) => {
    return `<button class="letter-btn${modeClass}" data-pool-id="${token.id}" ${token.used ? "disabled" : ""}>${token.letter}</button>`;
  }).join("");
}

function renderState(state) {
  latestState = state;
  scoreValue.textContent = String(state.score);
  solvedValue.textContent = String(state.solvedCount);
  wrongValue.textContent = String(state.wrongCount);
  hintValue.textContent = String(state.hintsLeft);

  questionIcon.textContent = state.currentQuestion?.icon || "📘";
  questionPrompt.textContent = state.currentQuestion?.prompt || "点击开始练习";
  phonicsText.textContent = state.currentQuestion?.phonics?.length
    ? `发音提示：${state.currentQuestion.phonics.join(" · ")}`
    : "发音提示会显示在这里";
  progressText.textContent = `进度 ${Math.round((state.progress || 0) * 100)}%`;
  progressFill.style.width = `${Math.round((state.progress || 0) * 100)}%`;

  renderSlots(state);
  renderPool(state);

  hintBtn.disabled = !state.isRunning || state.hintsLeft <= 0;
  listenBtn.disabled = !state.currentQuestion;
  retryBtn.disabled = state.isRunning || !state.themeId;

  if (!state.isRunning) {
    guideText.textContent = "先选主题，再开始拼读。";
  } else if (state.currentQuestion?.mode === "pinyin") {
    guideText.textContent = "点拼音卡片填入格子，先拼声母，再拼韵母。";
  } else {
    guideText.textContent = "点字母卡片填入格子，填错可点格子撤回。";
  }
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = "练习完成";
  resultText.textContent = `主题：${payload.themeName} | 分数：${payload.score} | 正确：${payload.solvedCount} | 错误：${payload.wrongCount} | 准确率：${payload.accuracy}%`;
  gameAudio.win();

  stats.plays += 1;
  stats.solvedTotal += payload.solvedCount;
  saveStats();
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
  const themeId = options.themeId || currentThemeId;
  const modeName = options.modeName || "普通练习";
  const seed = options.seed || `${Date.now()}|spell`;
  game.start(themeId, { modeName, seed });
}

function bindSoftTap(button, handler) {
  const run = () => {
    if (button.disabled) {
      return;
    }
    button.classList.add("tap-flash");
    handler();
    setTimeout(() => {
      button.classList.remove("tap-flash");
    }, 70);
  };

  button.addEventListener("pointerup", (event) => {
    event.preventDefault();
    run();
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
  });
}

const game = new SpellGame({
  onStateChange: renderState,
  onResult: showResult,
  onToast: (text) => {
    selectorHint.textContent = text;
    if (settingsState.narrationLevel === "detailed") {
      speak(text);
    }
  },
  onQuestionSolved: (question) => {
    gameAudio.success();
    speakSequence(getQuestionSpeechParts(question));
  },
});

bindUiTapSounds(document.body, gameAudio);

async function bootstrap() {
  try {
    const response = await fetch("../../configs/levels/literacy-spell.levels.json");
    if (!response.ok) {
      throw new Error(`Failed to load levels: ${response.status}`);
    }
    levelsData = await response.json();
  } catch {
    levelsData = FALLBACK_DATA;
    selectorHint.textContent = "题库加载失败，已使用内置题目。";
  }

  levelsData.themes = Array.isArray(levelsData?.themes) && levelsData.themes.length > 0
    ? levelsData.themes
    : FALLBACK_DATA.themes;

  currentThemeId = levelsData.themes[0].id;
  loadStats();
  loadSettings();
  applySettingsUi();
  renderThemeButtons();
  game.init(levelsData.themes);
}

bindSoftTap(startBtn, () => start());
bindSoftTap(retryBtn, () => start());
bindSoftTap(dailyBtn, () => {
  const day = todayString();
  const hash = hashText(`${day}|spell`);
  const theme = levelsData.themes[hash % levelsData.themes.length];
  currentThemeId = theme.id;
  renderThemeButtons();
  start({
    themeId: theme.id,
    modeName: `每日练习 ${day}`,
    seed: `${day}|${theme.id}|spell`,
  });
});
bindSoftTap(hintBtn, () => {
  if (!game.useHint()) {
    selectorHint.textContent = "提示次数已用完或当前无需提示。";
  }
});
bindSoftTap(listenBtn, () => {
  speakSequence(getQuestionSpeechParts(latestState?.currentQuestion));
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

themeButtonsEl.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-theme-id]");
  if (!button) {
    return;
  }
  event.preventDefault();
  currentThemeId = button.dataset.themeId;
  renderThemeButtons();
  selectorHint.textContent = `已选择主题：${button.textContent}`;
  speak(selectorHint.textContent);
});

answerSlots.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-slot-index]");
  if (!button) {
    return;
  }
  event.preventDefault();
  gameAudio.place(360);
  game.removeLetter(Number(button.dataset.slotIndex));
});

letterPool.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-pool-id]");
  if (!button) {
    return;
  }
  event.preventDefault();
  const token = latestState?.pool.find((item) => item.id === button.dataset.poolId);
  if (token) {
    speak(token.letter);
  }
  gameAudio.pickup(660);
  game.placeLetter(button.dataset.poolId);
});

bootstrap();
