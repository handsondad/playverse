import { MemoryGame } from "./memoryGame.js";
import { createGameAudio } from "../shared/audio.js";
import { loadSettings } from "../shared/settings.js";
import { mountSettingsButtons, speakSettingChanges } from "../shared/settingsButtons.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { bindDelegatedTap, createSoftTap } from "../shared/tap.js";
import { hashText, todayString } from "../shared/random.js";
import { readJson, readNumbers, readUnlocks, writeJson } from "../shared/storage.js";
import { mountRestReminder } from "../shared/restReminder.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { setText } from "../shared/dom.js";

const bindSoftTap = createSoftTap({ flashMs: 80, onTap: () => soundFx.tap() });

const STORAGE_PROGRESS_KEY = "memory-match-progress";
const STORAGE_STATS_KEY = "memory-match-stats";
const DAILY_BOARD_KEY_PREFIX = "memory-match-daily-board";
const SETTINGS_KEY = "memory-match-settings";

const DURATION_HINTS = {
  standard: "标准模式：建议每次游玩 8-10 分钟，注意休息眼睛。",
  soft: "柔和模式：降低动画和音量，建议每次游玩 6-8 分钟。",
  quiet: "安静模式：关闭音效并尽量减少播报，建议每次游玩 5-6 分钟。",
};

const THEME_DISPLAY_NAMES = {
  animals: "小动物乐园",
  fruits: "水果派对",
  transport: "交通探险",
};

const startBtn = document.querySelector("#startBtn");
const previewBtn = document.querySelector("#previewBtn");
const hintBtn = document.querySelector("#hintBtn");
const shieldBtn = document.querySelector("#shieldBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const retryBtn = document.querySelector("#retryBtn");

const chapterEasyBtn = document.querySelector("#chapterEasyBtn");
const chapterNormalBtn = document.querySelector("#chapterNormalBtn");
const chapterHardBtn = document.querySelector("#chapterHardBtn");
const chapterHint = document.querySelector("#chapterHint");

const themeAnimalsBtn = document.querySelector("#themeAnimalsBtn");
const themeFruitsBtn = document.querySelector("#themeFruitsBtn");
const themeTransportBtn = document.querySelector("#themeTransportBtn");
const themeButtons = [themeAnimalsBtn, themeFruitsBtn, themeTransportBtn];

const timeValue = document.querySelector("#timeValue");
const movesValue = document.querySelector("#movesValue");
const matchedValue = document.querySelector("#matchedValue");
const mistakesValue = document.querySelector("#mistakesValue");
const comboValue = document.querySelector("#comboValue");
const scoreValue = document.querySelector("#scoreValue");
const bestValue = document.querySelector("#bestValue");
const guideText = document.querySelector("#guideText");
const playDurationHint = document.querySelector("#playDurationHint");

const statsPlays = document.querySelector("#statsPlays");
const statsWinRate = document.querySelector("#statsWinRate");
const statsAvgTime = document.querySelector("#statsAvgTime");
const statsAvgMistakes = document.querySelector("#statsAvgMistakes");
const statsBestStreak = document.querySelector("#statsBestStreak");

const dailyBoardTitle = document.querySelector("#dailyBoardTitle");
const dailyBoardList = document.querySelector("#dailyBoardList");

const boardEl = document.querySelector("#board");
const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

const chapterButtons = [chapterEasyBtn, chapterNormalBtn, chapterHardBtn];

let levelsData = null;
let latestState = null;
let previousState = null;
let lastCountdownSound = null;
let pendingStartOptions = null;
let currentDailyDay = null;
let currentLevelId = "easy";
let currentThemeKey = "animals";

const progressState = readUnlocks(STORAGE_PROGRESS_KEY);

const statsState = readNumbers(STORAGE_STATS_KEY, {
  plays: 0,
  wins: 0,
  totalUsedSec: 0,
  totalMistakes: 0,
  currentStreak: 0,
  bestStreak: 0,
});

const settingsState = loadSettings(SETTINGS_KEY);
const speakGuide = createSpeaker(settingsState, SPEECH_PRESETS.calmGuide);

const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

const soundFx = (() => {
  return {
    unlock() {
      gameAudio.unlock();
    },
    tap() {
      gameAudio.uiTap();
    },
    success() {
      gameAudio.success();
    },
    error() {
      gameAudio.wrong();
    },
    win() {
      gameAudio.win();
    },
    lose() {
      gameAudio.lose();
    },
    countdown() {
      gameAudio.countdown();
    },
  };
})();

function starsToText(stars) {
  if (stars <= 0) {
    return "-";
  }
  return "★".repeat(stars) + "☆".repeat(3 - stars);
}

function saveProgress() {
  writeJson(STORAGE_PROGRESS_KEY, progressState);
}

function saveStats() {
  writeJson(STORAGE_STATS_KEY, statsState);
}

function loadDailyBoard(day) {
  const key = `${DAILY_BOARD_KEY_PREFIX}:${day}`;
  return readJson(key, []);
}

function saveDailyBoard(day, records) {
  const key = `${DAILY_BOARD_KEY_PREFIX}:${day}`;
  writeJson(key, records);
}

function updateDailyBoard(day, payload) {
  const records = loadDailyBoard(day);
  records.push({
    score: payload.score,
    stars: payload.stars,
    mistakes: payload.mistakes,
    usedSec: Math.max(0, payload.timeLimit - payload.remainingSec),
    mode: payload.mode,
    ts: Date.now(),
  });

  records.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.usedSec - b.usedSec;
  });

  saveDailyBoard(day, records.slice(0, 5));
}

function renderDailyBoard(day) {
  const records = loadDailyBoard(day);
  dailyBoardTitle.textContent = `${day} 排行（本地前5）`;

  if (!records.length) {
    dailyBoardList.innerHTML = "<li>暂无记录，快来挑战第一名</li>";
    return;
  }

  dailyBoardList.innerHTML = records
    .map((item, index) => {
      return `<li>第${index + 1}名 分数${item.score} 星级${starsToText(item.stars)} 用时${item.usedSec}秒 错误${item.mistakes}</li>`;
    })
    .join("");
}

function renderStats() {
  const winRate = statsState.plays > 0
    ? Math.round((statsState.wins / statsState.plays) * 100)
    : 0;
  const avgTime = statsState.plays > 0
    ? Math.round(statsState.totalUsedSec / statsState.plays)
    : 0;
  const avgMistakes = statsState.plays > 0
    ? (statsState.totalMistakes / statsState.plays).toFixed(1)
    : "0.0";

  statsPlays.textContent = String(statsState.plays);
  statsWinRate.textContent = `${winRate}%`;
  statsAvgTime.textContent = `${avgTime}秒`;
  statsAvgMistakes.textContent = avgMistakes;
  statsBestStreak.textContent = String(statsState.bestStreak);
}

function updateProgressAfterWin(levelId) {
  if (levelId === "easy") {
    progressState.unlocked.normal = true;
  }
  if (levelId === "normal") {
    progressState.unlocked.hard = true;
  }
  saveProgress();
}

function applyThemeUnlocks() {
  themeButtons.forEach((button) => {
    const key = button.dataset.themeKey;
    const baseText = THEME_DISPLAY_NAMES[key] || key;
    button.disabled = false;
    button.textContent = baseText;
    button.classList.toggle("is-active", key === currentThemeKey);
  });
}

function updateChapterUi() {
  chapterEasyBtn.disabled = false;
  chapterNormalBtn.disabled = false;
  chapterHardBtn.disabled = false;
  chapterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.levelId === currentLevelId);
  });
  chapterHint.textContent = "先选一个难度，再点开始游戏。";
}

function updateGuide(state) {
  if (!state.level) {
    setText(guideText, "点击开始游戏，翻开两张卡片试试吧。");
    return;
  }
  if (!state.isRunning) {
    setText(guideText, "可点击再来一局，或用今日挑战进入固定牌面。");
    return;
  }
  if (state.mode === "daily") {
    setText(guideText, "今日挑战进行中：今天的牌面对所有人都相同。");
    return;
  }
  if (state.shieldArmed) {
    setText(guideText, "保险已生效：下一次翻错会自动配对。");
    return;
  }
  if (state.combo >= 2) {
    setText(guideText, `连击 ${state.combo}，继续保持可以冲更高分。`);
    return;
  }
  if (state.moves === 0) {
    setText(guideText, "先翻任意两张卡片，记住它们的位置。");
    return;
  }
  if (state.mistakes >= 3 && state.hintCount > 0) {
    setText(guideText, "遇到困难时可以使用提示道具。");
    return;
  }
  setText(guideText, "观察翻开的图案，再找它的另一半。");
}

function renderBoard(state) {
  if (!state.level) {
    boardEl.innerHTML = "<p>请选择难度并开始游戏。</p>";
    return;
  }

  boardEl.style.gridTemplateColumns = `repeat(${state.level.cols}, minmax(0, 1fr))`;
  const cardsMarkup = state.deck
    .map((card, index) => {
      const classes = ["card"];
      if (card.isOpen) {
        classes.push("is-open");
      }
      if (card.isMatched) {
        classes.push("is-matched");
      }

      return `
        <button type="button" class="${classes.join(" ")}" data-index="${index}" aria-label="卡片 ${index + 1}">
          <span class="card-face card-back">翻开</span>
          <span class="card-face card-front">${card.icon}</span>
        </button>
      `;
    })
    .join("");

  boardEl.innerHTML = cardsMarkup;
}

function pulseCombo() {
  comboValue.classList.remove("combo-pop");
  void comboValue.offsetWidth;
  comboValue.classList.add("combo-pop");
}

function renderState(state) {
  latestState = state;

  timeValue.textContent = String(state.remainingSec);
  movesValue.textContent = String(state.moves);
  matchedValue.textContent = `${state.matchedPairs}/${state.deck.length / 2}`;
  mistakesValue.textContent = String(state.mistakes);
  comboValue.textContent = String(state.combo || 0);
  scoreValue.textContent = String(state.score);
  bestValue.textContent = state.bestScore > 0 ? String(state.bestScore) : "--";
  hintBtn.textContent = `提示（${state.hintCount}）`;
  shieldBtn.textContent = state.shieldArmed
    ? "保险已就绪"
    : `保险（${state.shieldCount}）`;
  hintBtn.disabled = !state.isRunning || state.hintCount <= 0 || state.lockInput;
  shieldBtn.disabled = !state.isRunning || state.shieldCount <= 0 || state.shieldArmed;

  if (previousState) {
    if (state.matchedPairs > previousState.matchedPairs) {
      soundFx.success();
      if ((state.combo || 0) >= 2) {
        pulseCombo();
      }
    }
    if (state.mistakes > previousState.mistakes) {
      soundFx.error();
    }
    if (state.remainingSec <= 5 && state.isRunning && state.remainingSec !== lastCountdownSound) {
      soundFx.countdown();
      lastCountdownSound = state.remainingSec;
    }
  }

  updateGuide(state);
  renderBoard(state);
  previousState = {
    matchedPairs: state.matchedPairs,
    mistakes: state.mistakes,
    remainingSec: state.remainingSec,
  };
}

function updateStatsFromResult(payload) {
  statsState.plays += 1;
  statsState.totalMistakes += payload.mistakes;
  statsState.totalUsedSec += Math.max(0, payload.timeLimit - payload.remainingSec);
  if (payload.isWin) {
    statsState.wins += 1;
    statsState.currentStreak += 1;
    statsState.bestStreak = Math.max(statsState.bestStreak, statsState.currentStreak);
  } else {
    statsState.currentStreak = 0;
  }

  saveStats();
  renderStats();
}

function showResult(payload) {
  resultEl.hidden = false;
  resultEl.classList.remove("is-celebrating");

  if (payload.isWin) {
    resultTitle.textContent = "通关成功";
    resultTitle.className = "win";
    soundFx.win();
    resultEl.classList.add("is-celebrating");
    setTimeout(() => resultEl.classList.remove("is-celebrating"), 950);

    updateProgressAfterWin(payload.levelId);
    saveProgress();
    applyThemeUnlocks();
    updateChapterUi();
  } else {
    resultTitle.textContent = "时间到啦";
    resultTitle.className = "lose";
    soundFx.lose();
  }

  updateStatsFromResult(payload);

  if (payload.mode === "daily" && currentDailyDay) {
    updateDailyBoard(currentDailyDay, payload);
    renderDailyBoard(currentDailyDay);
  }

  resultText.textContent = `模式：${payload.modeName} | 关卡：${payload.levelName} | 星级：${starsToText(payload.stars)} | 得分：${payload.score} | 步数：${payload.moves} | 错误：${payload.mistakes} | 最高连击：${payload.maxCombo} | 配对：${payload.matchedPairs}/${payload.totalPairs} | 最佳：${payload.bestScore}`;
}

const game = new MemoryGame({
  onStateChange: renderState,
  onResult: showResult,
});

function getSelectedLevel() {
  const id = currentLevelId;
  return levelsData.levels.find((item) => item.id === id);
}

function getThemeIcons() {
  const key = currentThemeKey;
  return levelsData.themes[key] || levelsData.themes.animals;
}

function pickDailySetup() {
  const day = todayString();
  const themeKeys = Object.keys(levelsData.themes);
  const hash = hashText(day);
  const themeKey = themeKeys[hash % themeKeys.length];
  const levelId = progressState.unlocked.normal ? "normal" : "easy";
  const level = levelsData.levels.find((item) => item.id === levelId);

  return {
    day,
    themeKey,
    level,
    seed: `${day}|${levelId}|${themeKey}`,
  };
}

function startGame(customOptions = null) {
  if (!levelsData) {
    return;
  }
  soundFx.unlock();
  previousState = null;
  lastCountdownSound = null;
  resultEl.hidden = true;

  const options = customOptions || pendingStartOptions;
  pendingStartOptions = null;

  let selected = getSelectedLevel();
  let themeName = currentThemeKey;

  if (options?.forceLevelId) {
    currentLevelId = options.forceLevelId;
    selected = getSelectedLevel();
    updateChapterUi();
  }

  if (!selected) {
    const fallback = levelsData.levels?.[0];
    if (!fallback) {
      return;
    }
    currentLevelId = fallback.id;
    selected = fallback;
    updateChapterUi();
    setText(guideText, "难度自动回退到可用项。");
  }
  if (options?.forceTheme) {
    currentThemeKey = options.forceTheme;
    themeName = options.forceTheme;
    applyThemeUnlocks();
  }

  const icons = levelsData.themes[themeName] || getThemeIcons();
  game.start(selected, icons, themeName, {
    mode: options?.mode || "normal",
    modeName: options?.modeName || "普通模式",
    seed: options?.seed || null,
  });
}

async function bootstrap() {
  try {
    levelsData = await loadGameConfig("../../configs/levels/memory-match.levels.json", ["levels", "themes"]);
  } catch (error) {
    showConfigError(error);
    return;
  }

  const safeLevels = levelsData.levels;
  currentLevelId = safeLevels[0]?.id || "easy";

  renderStats();
  applyThemeUnlocks();
  updateChapterUi();

  currentDailyDay = todayString();
  renderDailyBoard(currentDailyDay);

  hintBtn.disabled = true;
  shieldBtn.disabled = true;
  renderBoard({ level: null });
  mountRestReminder({
    settings: settingsState,
    isPlaying: () => Boolean(latestState?.isRunning),
    speak: speakGuide,
    bindTap: bindSoftTap,
  });
}

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(previewBtn, () => game.previewAll(1000));
mountSettingsButtons({
  storageKey: SETTINGS_KEY,
  settings: settingsState,
  bindTap: bindSoftTap,
  onChange: () => {
    document.body.classList.toggle("mode-soft", settingsState.careMode === "soft");
    document.body.classList.toggle("mode-quiet", settingsState.careMode === "quiet");
    playDurationHint.textContent = DURATION_HINTS[settingsState.careMode];
  },
  announce: speakSettingChanges(speakGuide, guideText),
});

bindSoftTap(dailyBtn, () => {
  if (!levelsData) {
    return;
  }
  const setup = pickDailySetup();
  currentDailyDay = setup.day;
  pendingStartOptions = {
    forceLevelId: setup.level.id,
    forceTheme: setup.themeKey,
    mode: "daily",
    modeName: `每日挑战 ${setup.day}`,
    seed: setup.seed,
  };
  startGame();
});

bindSoftTap(hintBtn, () => {
  const used = game.useHint();
  if (!used) {
    return;
  }
  soundFx.unlock();
  speakGuide("提示已使用", { detailOnly: true });
});

bindSoftTap(shieldBtn, () => {
  const used = game.useShield();
  if (!used) {
    return;
  }
  soundFx.unlock();
  speakGuide("保险已就绪", { detailOnly: true });
});

themeButtons.forEach((button) => {
  bindSoftTap(button, () => {
    currentThemeKey = button.dataset.themeKey;
    applyThemeUnlocks();
    setText(guideText, `已选择${button.textContent}主题，点击开始游戏进入。`);
    speakGuide(guideText.textContent);
  });
});

chapterButtons.forEach((button) => {
  bindSoftTap(button, () => {
    if (button.disabled) {
      return;
    }
    currentLevelId = button.dataset.levelId;
    updateChapterUi();
    setText(guideText, `已选择${button.textContent}，点击开始游戏进入。`);
    speakGuide(guideText.textContent);
  });
});

bindDelegatedTap(boardEl, ".card", (button) => {
  if (!latestState?.isRunning) {
    return;
  }
  game.open(Number(button.dataset.index));
});

bootstrap();
