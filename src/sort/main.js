import { SortGame } from "./sortGame.js";
import { createGameAudio } from "../shared/audio.js";

const PROGRESS_KEY = "sort-progress";
const STATS_KEY = "sort-stats";
const SETTINGS_KEY = "sort-settings";
const GLOBAL_SETTINGS_KEY = "kids-global-settings";

const FALLBACK_LEVELS_DATA = {
  levels: [
    { id: "easy", name: "慢慢分", itemCount: 8, timeLimitSec: 80, targetScore: 80 },
    { id: "normal", name: "刚刚好", itemCount: 12, timeLimitSec: 75, targetScore: 130 },
    { id: "hard", name: "小专家", itemCount: 16, timeLimitSec: 70, targetScore: 190 },
  ],
  modes: [
    { id: "color", name: "颜色分类" },
    { id: "shape", name: "形状分类" },
    { id: "mixed", name: "混合分类" },
  ],
};

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const hintBtn = document.querySelector("#hintBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const narrationBtn = document.querySelector("#narrationBtn");
const parentModeBtn = document.querySelector("#parentModeBtn");

const modeColorBtn = document.querySelector("#modeColorBtn");
const modeShapeBtn = document.querySelector("#modeShapeBtn");
const modeMixedBtn = document.querySelector("#modeMixedBtn");
const modeButtons = [modeColorBtn, modeShapeBtn, modeMixedBtn];

const levelEasyBtn = document.querySelector("#levelEasyBtn");
const levelNormalBtn = document.querySelector("#levelNormalBtn");
const levelHardBtn = document.querySelector("#levelHardBtn");
const levelButtons = [levelEasyBtn, levelNormalBtn, levelHardBtn];

const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");
const playDurationHint = document.querySelector("#playDurationHint");

const timeValue = document.querySelector("#timeValue");
const scoreValue = document.querySelector("#scoreValue");
const correctValue = document.querySelector("#correctValue");
const wrongValue = document.querySelector("#wrongValue");
const remainingValue = document.querySelector("#remainingValue");
const bestValue = document.querySelector("#bestValue");

const metaPlays = document.querySelector("#metaPlays");
const metaWinRate = document.querySelector("#metaWinRate");
const metaAvgCorrect = document.querySelector("#metaAvgCorrect");
const metaAvgWrong = document.querySelector("#metaAvgWrong");
const metaBestStreak = document.querySelector("#metaBestStreak");

const boardEl = document.querySelector("#board");
const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

let levelsData = null;
let currentModeId = "color";
let currentLevelId = "easy";
let latestState = null;
let pendingOptions = null;
let dragState = null;

const progress = {
  unlocked: {
    easy: true,
    normal: false,
    hard: false,
  },
};

const stats = {
  plays: 0,
  wins: 0,
  totalCorrect: 0,
  totalWrong: 0,
  currentStreak: 0,
  bestStreak: 0,
};

const settingsState = {
  voiceOn: true,
  careMode: "standard",
  narrationLevel: "key",
};

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
  if (index === -1) {
    return "standard";
  }
  return CARE_MODES[(index + 1) % CARE_MODES.length];
}

function isSoundEnabled() {
  return settingsState.careMode !== "quiet";
}

function getSoundGainMultiplier() {
  return settingsState.careMode === "soft" ? 0.6 : 1;
}

const soundFx = (() => {
  return {
    unlock() {
      gameAudio.unlock();
    },
    tap() {
      gameAudio.uiTap();
    },
    correct() {
      gameAudio.correct();
    },
    wrong() {
      gameAudio.wrong();
    },
    win() {
      gameAudio.win();
    },
    lose() {
      gameAudio.lose();
    },
  };
})();

function loadProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    if (parsed.unlocked) {
      progress.unlocked.easy = true;
      progress.unlocked.normal = Boolean(parsed.unlocked.normal);
      progress.unlocked.hard = Boolean(parsed.unlocked.hard);
    }
  } catch {
    progress.unlocked.easy = true;
  }
  progress.unlocked.easy = true;
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function loadStats() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATS_KEY) || "{}");
    stats.plays = Number(parsed.plays || 0);
    stats.wins = Number(parsed.wins || 0);
    stats.totalCorrect = Number(parsed.totalCorrect || 0);
    stats.totalWrong = Number(parsed.totalWrong || 0);
    stats.currentStreak = Number(parsed.currentStreak || 0);
    stats.bestStreak = Number(parsed.bestStreak || 0);
  } catch {
    stats.plays = 0;
  }
}

function saveStats() {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
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
    if (CARE_MODES.includes(merged.careMode)) {
      settingsState.careMode = merged.careMode;
    } else {
      settingsState.careMode = merged.parentMode ? "soft" : "standard";
    }
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
    parentMode: settingsState.careMode !== "standard",
    narrationLevel: settingsState.narrationLevel,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(payload));
}

function speakGuide(text, options = {}) {
  if (!settingsState.voiceOn || !window.speechSynthesis) {
    return;
  }
  if (settingsState.careMode === "quiet" && !options.force) {
    return;
  }
  if (options.detailOnly && settingsState.narrationLevel !== "detailed") {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = settingsState.careMode === "standard" ? 1 : 0.92;
  utterance.volume = settingsState.careMode === "standard" ? 0.95 : 0.72;
  window.speechSynthesis.speak(utterance);
}

function applySettingsUi() {
  voiceBtn.textContent = `语音引导：${settingsState.voiceOn ? "开" : "关"}`;
  narrationBtn.textContent = `播报模式：${settingsState.narrationLevel === "detailed" ? "详细" : "关键"}`;
  parentModeBtn.textContent = `护眼模式：${careModeLabel(settingsState.careMode)}`;

  if (settingsState.careMode === "quiet") {
    playDurationHint.textContent = "安静模式：关闭音效并减少播报，建议每次游玩 5-6 分钟。";
    return;
  }
  if (settingsState.careMode === "soft") {
    playDurationHint.textContent = "柔和模式：降低动画与音量，建议每次游玩 6-8 分钟。";
    return;
  }
  playDurationHint.textContent = "标准模式：建议每次游玩 6-8 分钟，结束后休息眼睛。";
}

function renderMeta() {
  const winRate = stats.plays > 0 ? Math.round((stats.wins / stats.plays) * 100) : 0;
  const avgCorrect = stats.plays > 0 ? (stats.totalCorrect / stats.plays).toFixed(1) : "0.0";
  const avgWrong = stats.plays > 0 ? (stats.totalWrong / stats.plays).toFixed(1) : "0.0";

  metaPlays.textContent = String(stats.plays);
  metaWinRate.textContent = `${winRate}%`;
  metaAvgCorrect.textContent = avgCorrect;
  metaAvgWrong.textContent = avgWrong;
  metaBestStreak.textContent = String(stats.bestStreak);
}

function updateSelectorsUi() {
  modeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.modeId === currentModeId);
  });

  levelButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.levelId === currentLevelId);
  });

  selectorHint.textContent = "先点模式和难度，再开始游戏。";
}

function getLevel() {
  return levelsData.levels.find((item) => item.id === currentLevelId);
}

function getMode() {
  return levelsData.modes.find((item) => item.id === currentModeId);
}

function renderBoard(state) {
  if (!state.level) {
    boardEl.classList.remove("is-dragging");
    boardEl.innerHTML = "<p class=\"empty-note\">请选择模式和难度并开始游戏。</p>";
    return;
  }

  const promptClass = state.lastJudge === "correct"
    ? "prompt correct"
    : (state.lastJudge === "wrong" ? "prompt wrong" : "prompt");

  const itemsMarkup = state.items.length > 0
    ? state.items.map((item) => {
      const selectedClass = item.id === state.selectedItemId ? "item-chip is-selected" : "item-chip";
      return `
        <button class="${selectedClass}" data-item-id="${item.id}" style="background:${item.colorHex};">
          <span class="symbol symbol-${item.shapeId}">${item.symbol}</span>
          <span>${item.label}</span>
        </button>
      `;
    }).join("")
    : "<p class=\"empty-note\">这一局已全部分类完成。</p>";

  const binsMarkup = state.bins.map((bin) => {
    const highlightedClass = bin.key === state.highlightedBinKey ? "bin-chip is-highlighted" : "bin-chip";
    return `
      <button class="${highlightedClass}" data-bin-key="${bin.key}" style="background:${bin.colorHex};">${bin.label}</button>
    `;
  }).join("");

  boardEl.innerHTML = `
    <p class="${promptClass}">${state.selectedPrompt}</p>
    <section class="board-section items-section" aria-label="待分类物品区">
      <div class="section-head">
        <strong><span class="step-icon" aria-hidden="true">👆</span><span>第 1 步：先选上面的物品</span></strong>
        <span>可以点一下，也可以直接拖动</span>
      </div>
      <div class="items-grid">${itemsMarkup}</div>
    </section>
    <div class="board-divider" aria-hidden="true">
      <span>往下放到正确分类盒</span>
    </div>
    <section class="board-section bins-section" aria-label="分类盒区域">
      <div class="section-head">
        <strong><span class="step-icon" aria-hidden="true">📥</span><span>第 2 步：放到下面的分类盒</span></strong>
        <span>颜色相同、形状相同，或按混合规则放置</span>
      </div>
      <div class="bins-grid">${binsMarkup}</div>
    </section>
  `;
}

function renderState(state) {
  latestState = state;

  timeValue.textContent = String(Math.ceil(state.timeLeft));
  scoreValue.textContent = String(state.score);
  correctValue.textContent = String(state.correctCount);
  wrongValue.textContent = String(state.wrongCount);
  remainingValue.textContent = String(state.items.length);
  bestValue.textContent = state.bestScore > 0 ? String(state.bestScore) : "--";

  retryBtn.disabled = state.isRunning || !state.level;
  hintBtn.disabled = !state.isRunning;

  guideText.textContent = state.isRunning
    ? `${state.modeName}进行中：上面选物品，下面选分类盒，也可以直接往下拖。`
    : "先选模式和难度，再开始。上面是物品，下面是分类盒。";

  renderBoard(state);
}

function clearDragGhost() {
  if (dragState?.ghostEl?.parentNode) {
    dragState.ghostEl.parentNode.removeChild(dragState.ghostEl);
  }
  boardEl.classList.remove("is-dragging");
  document.body.classList.remove("sort-no-select");
}

function findBinAtPoint(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  return element?.closest?.("[data-bin-key]") || null;
}

function setHoveredBin(binKey) {
  boardEl.querySelectorAll("[data-bin-key]").forEach((button) => {
    button.classList.toggle("is-hovered", button.dataset.binKey === binKey);
  });
}

function startDrag(itemButton, pointerEvent) {
  if (!latestState?.isRunning) {
    return;
  }

  const itemId = itemButton.dataset.itemId;
  const item = latestState.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  const rect = itemButton.getBoundingClientRect();
  const ghostEl = document.createElement("div");
  ghostEl.className = "drag-ghost";
  ghostEl.style.width = `${rect.width}px`;
  ghostEl.style.height = `${rect.height}px`;
  ghostEl.style.left = `${rect.left}px`;
  ghostEl.style.top = `${rect.top}px`;
  ghostEl.style.background = item.colorHex;
  ghostEl.innerHTML = `<span class="symbol symbol-${item.shapeId}">${item.symbol}</span><span>${item.label}</span>`;
  document.body.appendChild(ghostEl);

  dragState = {
    pointerId: pointerEvent.pointerId,
    itemId,
    startX: pointerEvent.clientX,
    startY: pointerEvent.clientY,
    offsetX: pointerEvent.clientX - rect.left,
    offsetY: pointerEvent.clientY - rect.top,
    ghostEl,
    didMove: false,
    hoveredBinKey: "",
  };

  document.body.classList.add("sort-no-select");
}

function moveDrag(pointerEvent) {
  if (!dragState || dragState.pointerId !== pointerEvent.pointerId) {
    return;
  }

  const moveX = pointerEvent.clientX - dragState.startX;
  const moveY = pointerEvent.clientY - dragState.startY;
  if (!dragState.didMove && Math.hypot(moveX, moveY) < 10) {
    return;
  }

  if (!dragState.didMove) {
    dragState.didMove = true;
    boardEl.classList.add("is-dragging");
    game.selectItem(dragState.itemId);
  }

  dragState.ghostEl.style.left = `${pointerEvent.clientX - dragState.offsetX}px`;
  dragState.ghostEl.style.top = `${pointerEvent.clientY - dragState.offsetY}px`;

  const hoveredBin = findBinAtPoint(pointerEvent.clientX, pointerEvent.clientY);
  dragState.hoveredBinKey = hoveredBin?.dataset?.binKey || "";
  setHoveredBin(dragState.hoveredBinKey);
}

function endDrag(pointerEvent) {
  if (!dragState || dragState.pointerId !== pointerEvent.pointerId) {
    return;
  }

  const currentDrag = dragState;
  const hoveredBin = findBinAtPoint(pointerEvent.clientX, pointerEvent.clientY);
  clearDragGhost();
  setHoveredBin("");
  dragState = null;

  if (!currentDrag.didMove) {
    game.selectItem(currentDrag.itemId);
    return;
  }

  game.selectItem(currentDrag.itemId);
  if (hoveredBin?.dataset?.binKey) {
    game.classify(hoveredBin.dataset.binKey);
    if (latestState?.lastJudge === "correct") {
      soundFx.correct();
    }
    if (latestState?.lastJudge === "wrong") {
      soundFx.wrong();
    }
  }
}

function updateStats(payload) {
  stats.plays += 1;
  stats.totalCorrect += payload.correctCount;
  stats.totalWrong += payload.wrongCount;

  if (payload.isWin) {
    stats.wins += 1;
    stats.currentStreak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  } else {
    stats.currentStreak = 0;
  }

  saveStats();
  renderMeta();
}

function updateProgress(payload) {
  if (!payload.isWin) {
    return;
  }
  if (payload.levelId === "easy") {
    progress.unlocked.normal = true;
  }
  if (payload.levelId === "normal") {
    progress.unlocked.hard = true;
  }
  saveProgress();
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = payload.isWin ? "分类成功" : "时间到啦";
  resultTitle.className = payload.isWin ? "win" : "lose";
  resultText.textContent = `模式：${payload.modeName} | 难度：${payload.levelName} | 分数：${payload.score} | 正确：${payload.correctCount} | 错误：${payload.wrongCount} | 最好：${payload.bestScore}`;

  if (payload.isWin) {
    soundFx.win();
  } else {
    soundFx.lose();
  }

  retryBtn.disabled = false;
  updateStats(payload);
  updateProgress(payload);
  updateSelectorsUi();
}

const game = new SortGame({
  onStateChange: renderState,
  onResult: showResult,
});

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hashText(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickDailySetup() {
  const day = todayString();
  const hash = hashText(`${day}|sort`);
  const mode = levelsData.modes[hash % levelsData.modes.length];
  const level = levelsData.levels[(Math.floor(hash / 7)) % levelsData.levels.length];
  return {
    day,
    mode,
    level,
    seed: `${day}|${mode.id}|${level.id}|sort`,
  };
}

function start(options = null) {
  soundFx.unlock();
  resultEl.hidden = true;
  retryBtn.disabled = true;

  const modeOptions = options || pendingOptions;
  pendingOptions = null;

  let mode = getMode();
  let level = getLevel();

  if (modeOptions?.forceModeId) {
    currentModeId = modeOptions.forceModeId;
    mode = getMode();
  }

  if (modeOptions?.forceLevelId) {
    currentLevelId = modeOptions.forceLevelId;
    level = getLevel();
  }

  if (!mode || !level) {
    mode = levelsData.modes[0];
    level = levelsData.levels[0];
    currentModeId = mode.id;
    currentLevelId = level.id;
  }

  updateSelectorsUi();

  game.start(level, mode, {
    seed: modeOptions?.seed,
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
      soundFx.tap();
      handler();
    }, 80);
  };

  button.addEventListener("pointerup", (event) => {
    event.preventDefault();
    run();
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
  });
}

function bindBoardPointer() {
  boardEl.addEventListener("pointerdown", (event) => {
    const itemBtn = event.target.closest("[data-item-id]");
    if (!itemBtn || !latestState?.isRunning) {
      return;
    }

    event.preventDefault();
    startDrag(itemBtn, event);
  });

  window.addEventListener("pointermove", (event) => {
    moveDrag(event);
  });

  window.addEventListener("pointerup", (event) => {
    endDrag(event);
  });

  window.addEventListener("pointercancel", (event) => {
    endDrag(event);
  });

  boardEl.addEventListener("pointerup", (event) => {
    if (dragState?.didMove) {
      event.preventDefault();
      return;
    }

    const itemBtn = event.target.closest("[data-item-id]");
    if (itemBtn) {
      event.preventDefault();
      game.selectItem(itemBtn.dataset.itemId);
      return;
    }

    const binBtn = event.target.closest("[data-bin-key]");
    if (binBtn) {
      event.preventDefault();
      game.classify(binBtn.dataset.binKey);
      if (latestState?.lastJudge === "correct") {
        soundFx.correct();
      }
      if (latestState?.lastJudge === "wrong") {
        soundFx.wrong();
      }
    }
  });
}

async function bootstrap() {
  try {
    const response = await fetch("../../configs/levels/sort.levels.json");
    if (!response.ok) {
      throw new Error(`Failed to load levels: ${response.status}`);
    }
    levelsData = await response.json();
  } catch {
    levelsData = FALLBACK_LEVELS_DATA;
    guideText.textContent = "配置加载失败，已使用内置难度。";
  }

  levelsData.levels = Array.isArray(levelsData?.levels) && levelsData.levels.length > 0
    ? levelsData.levels
    : FALLBACK_LEVELS_DATA.levels;
  levelsData.modes = Array.isArray(levelsData?.modes) && levelsData.modes.length > 0
    ? levelsData.modes
    : FALLBACK_LEVELS_DATA.modes;

  currentLevelId = levelsData.levels[0].id;
  currentModeId = levelsData.modes[0].id;

  loadProgress();
  loadStats();
  loadSettings();
  renderMeta();
  updateSelectorsUi();
  applySettingsUi();

  retryBtn.disabled = true;
  hintBtn.disabled = true;
  renderBoard({ level: null });

  window.addEventListener("storage", (event) => {
    if (event.key !== GLOBAL_SETTINGS_KEY) {
      return;
    }
    loadSettings();
    applySettingsUi();
  });
}

bindSoftTap(startBtn, () => start());
bindSoftTap(retryBtn, () => start());
bindSoftTap(hintBtn, () => {
  if (!latestState?.isRunning) {
    return;
  }

  if (latestState.selectedItemId) {
    const item = latestState.items.find((entry) => entry.id === latestState.selectedItemId);
    if (item) {
      const target = latestState.bins.find((entry) => entry.key === item.targetKey);
      if (target) {
        latestState.selectedPrompt = `提示：把它放到“${target.label}”。`;
        renderBoard(latestState);
        speakGuide(latestState.selectedPrompt);
      }
    }
    return;
  }

  latestState.selectedPrompt = "先点一个物品，我再告诉你该放哪里。";
  renderBoard(latestState);
  speakGuide(latestState.selectedPrompt);
});

bindSoftTap(dailyBtn, () => {
  const setup = pickDailySetup();
  pendingOptions = {
    forceModeId: setup.mode.id,
    forceLevelId: setup.level.id,
    seed: setup.seed,
  };
  selectorHint.textContent = `今日挑战已锁定：${setup.mode.name} | ${setup.level.name}`;
  start();
});

bindSoftTap(voiceBtn, () => {
  settingsState.voiceOn = !settingsState.voiceOn;
  saveSettings();
  applySettingsUi();
  if (settingsState.voiceOn) {
    speakGuide(guideText.textContent);
  }
});

bindSoftTap(narrationBtn, () => {
  settingsState.narrationLevel = settingsState.narrationLevel === "detailed" ? "key" : "detailed";
  saveSettings();
  applySettingsUi();
  speakGuide(`已切换到${settingsState.narrationLevel === "detailed" ? "详细" : "关键"}播报`);
});

bindSoftTap(parentModeBtn, () => {
  settingsState.careMode = nextCareMode(settingsState.careMode);
  saveSettings();
  applySettingsUi();
  speakGuide(`已切换到${careModeLabel(settingsState.careMode)}模式`, { force: true });
});

modeButtons.forEach((button) => {
  bindSoftTap(button, () => {
    currentModeId = button.dataset.modeId;
    updateSelectorsUi();
    guideText.textContent = `已切换到${button.textContent}。`;
    speakGuide(guideText.textContent);
  });
});

levelButtons.forEach((button) => {
  bindSoftTap(button, () => {
    currentLevelId = button.dataset.levelId;
    updateSelectorsUi();
    guideText.textContent = `已切换到${button.textContent}。`;
    speakGuide(guideText.textContent);
  });
});

bindBoardPointer();
bootstrap();
