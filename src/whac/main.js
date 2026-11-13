import { WhacGame } from "./whacGame.js";
import { createGameAudio } from "../shared/audio.js";
import { loadSettings } from "../shared/settings.js";
import { mountSettingsButtons, speakSettingChanges } from "../shared/settingsButtons.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { createSoftTap } from "../shared/tap.js";
import { hashText, todayString } from "../shared/random.js";
import { readNumbers, readUnlocks, writeJson } from "../shared/storage.js";
import { mountRestReminder } from "../shared/restReminder.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { setHtml, setText } from "../shared/dom.js";

const bindSoftTap = createSoftTap({ flashMs: 80, onTap: () => soundFx.tap() });

const PROGRESS_KEY = "whac-progress";
const STATS_KEY = "whac-stats";
const SETTINGS_KEY = "whac-settings";

const DURATION_HINTS = {
  standard: "标准模式：建议每次游玩 8-10 分钟，结束后做眼保健活动。",
  soft: "柔和模式：降低动画和音量，建议每次游玩 6-8 分钟。",
  quiet: "安静模式：关闭音效并尽量减少播报，建议每次游玩 5-6 分钟。",
};

const startBtn = document.querySelector("#startBtn");
const freezeBtn = document.querySelector("#freezeBtn");
const doubleBtn = document.querySelector("#doubleBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const retryBtn = document.querySelector("#retryBtn");

const chapterEasyBtn = document.querySelector("#chapterEasyBtn");
const chapterNormalBtn = document.querySelector("#chapterNormalBtn");
const chapterHardBtn = document.querySelector("#chapterHardBtn");
const chapterHint = document.querySelector("#chapterHint");

const timeValue = document.querySelector("#timeValue");
const scoreValue = document.querySelector("#scoreValue");
const comboValue = document.querySelector("#comboValue");
const hitValue = document.querySelector("#hitValue");
const missValue = document.querySelector("#missValue");
const bestValue = document.querySelector("#bestValue");
const guideText = document.querySelector("#guideText");
const playDurationHint = document.querySelector("#playDurationHint");

const metaPlays = document.querySelector("#metaPlays");
const metaWinRate = document.querySelector("#metaWinRate");
const metaAvgHits = document.querySelector("#metaAvgHits");
const metaAvgMisses = document.querySelector("#metaAvgMisses");
const metaBestCombo = document.querySelector("#metaBestCombo");

const arenaEl = document.querySelector("#arena");
const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

const chapterButtons = [chapterEasyBtn, chapterNormalBtn, chapterHardBtn];

let levelsData = null;
let latestState = null;
let prevState = null;
let pendingOptions = null;
let currentLevelId = "easy";

const progress = readUnlocks(PROGRESS_KEY);

const stats = readNumbers(STATS_KEY, {
  plays: 0,
  wins: 0,
  totalHits: 0,
  totalMisses: 0,
  bestCombo: 0,
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
    hit() {
      gameAudio.hit();
    },
    miss() {
      gameAudio.wrong();
    },
    win() {
      gameAudio.win();
    },
  };
})();

function starsToText(stars) {
  return "★".repeat(stars) + "☆".repeat(3 - stars);
}

function pulseCombo() {
  comboValue.classList.remove("combo-pop");
  void comboValue.offsetWidth;
  comboValue.classList.add("combo-pop");
}

function saveProgress() {
  writeJson(PROGRESS_KEY, progress);
}

function saveStats() {
  writeJson(STATS_KEY, stats);
}

function renderMeta() {
  const winRate = stats.plays > 0 ? Math.round((stats.wins / stats.plays) * 100) : 0;
  const avgHits = stats.plays > 0 ? (stats.totalHits / stats.plays).toFixed(1) : "0.0";
  const avgMisses = stats.plays > 0 ? (stats.totalMisses / stats.plays).toFixed(1) : "0.0";

  metaPlays.textContent = String(stats.plays);
  metaWinRate.textContent = `${winRate}%`;
  metaAvgHits.textContent = avgHits;
  metaAvgMisses.textContent = avgMisses;
  metaBestCombo.textContent = String(stats.bestCombo);
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
  if (!state.config) {
    setText(guideText, "点击开始游戏，优先点小动物，避开干扰项。");
    return;
  }
  if (!state.isRunning) {
    setText(guideText, "本局结束，可点击再来一局继续挑战。");
    return;
  }
  if (state.mode === "daily") {
    setText(guideText, "今日挑战进行中：今天的刷怪序列是固定的。");
    return;
  }
  if (state.isFrozen) {
    setText(guideText, "冻结生效中：生成节奏暂停 3 秒。");
    return;
  }
  if (state.isDouble) {
    setText(guideText, "双倍分生效中：命中得分翻倍。");
    return;
  }
  if (state.combo >= 3) {
    setText(guideText, `连击 ${state.combo}，当前倍率 x${state.comboMultiplier.toFixed(1)}。`);
    return;
  }
  if (state.misses >= 3) {
    setText(guideText, "误点有点多，先看清再点会更稳。");
    return;
  }
  setText(guideText, "干扰项会扣分，优先点绿色边框的小动物。");
}

function renderArena(state) {
  const holes = Array.from({ length: 9 }, (_, index) => index);

  setHtml(arenaEl, holes
    .map((holeIndex) => {
      const entity = state.entities.find((item) => item.holeIndex === holeIndex);
      if (!entity) {
        return `<div class="hole" data-hole-index="${holeIndex}"></div>`;
      }
      return `
        <div class="hole" data-hole-index="${holeIndex}">
          <button type="button" class="entity-btn ${entity.isTarget ? "target" : "decoy"}"
            data-entity-id="${entity.id}"
            aria-label="${entity.isTarget ? "目标" : "干扰"}"
          >${entity.icon}</button>
        </div>
      `;
    })
    .join(""));
}

function renderState(state) {
  latestState = state;

  timeValue.textContent = String(state.timeLeft);
  scoreValue.textContent = String(state.score);
  comboValue.textContent = String(state.combo);
  hitValue.textContent = String(state.hits);
  missValue.textContent = String(state.misses);
  bestValue.textContent = state.bestScore > 0 ? String(state.bestScore) : "--";

  freezeBtn.textContent = state.isFrozen ? "冻结中" : `冻结（${state.freezeCount}）`;
  doubleBtn.textContent = state.isDouble ? "双倍中" : `双倍分（${state.doubleCount}）`;

  freezeBtn.disabled = !state.isRunning || state.freezeCount <= 0 || state.isFrozen;
  doubleBtn.disabled = !state.isRunning || state.doubleCount <= 0 || state.isDouble;

  if (prevState) {
    if (state.hits > prevState.hits) {
      soundFx.hit();
      if (state.combo >= 2) {
        pulseCombo();
      }
    }
    if (state.misses > prevState.misses) {
      soundFx.miss();
    }
  }

  updateGuide(state);
  renderArena(state);

  prevState = {
    hits: state.hits,
    misses: state.misses,
  };
}

function updateStats(payload) {
  stats.plays += 1;
  if (payload.isWin) {
    stats.wins += 1;
  }
  stats.totalHits += payload.hits;
  stats.totalMisses += payload.misses;
  stats.bestCombo = Math.max(stats.bestCombo, payload.bestCombo);
  saveStats();
  renderMeta();
}

function unlockNextChapter(payload) {
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
  updateChapterUi();
}

function showResult(payload) {
  resultEl.hidden = false;
  resultEl.classList.add("is-celebrating");
  setTimeout(() => resultEl.classList.remove("is-celebrating"), 900);

  soundFx.win();
  resultTitle.textContent = payload.isWin ? "挑战成功" : "继续努力";
  resultText.textContent = `模式：${payload.modeName} | 难度：${payload.levelName} | 星级：${starsToText(payload.stars)} | 分数：${payload.score} | 命中：${payload.hits} | 误点：${payload.misses} | 最高连击：${payload.bestCombo} | 最高倍率：x${payload.maxComboMultiplier.toFixed(1)} | 最好：${payload.bestScore}`;

  updateStats(payload);
  unlockNextChapter(payload);
}

const game = new WhacGame({
  onStateChange: renderState,
  onResult: showResult,
});

function getLevel() {
  return levelsData.levels.find((item) => item.id === currentLevelId);
}

function pickDailySetup() {
  const day = todayString();
  const available = levelsData.levels.filter((item) => {
    if (item.id === "easy") {
      return true;
    }
    if (item.id === "normal") {
      return progress.unlocked.normal;
    }
    if (item.id === "hard") {
      return progress.unlocked.hard;
    }
    return false;
  });
  const hash = hashText(day);
  const level = available[hash % available.length];
  return {
    day,
    level,
    seed: `${day}|${level.id}|whac`,
  };
}

function start(options = null) {
  if (!levelsData) {
    return;
  }
  soundFx.unlock();
  prevState = null;
  resultEl.hidden = true;

  const modeOptions = options || pendingOptions;
  pendingOptions = null;

  let config = getLevel();
  if (modeOptions?.forceLevelId) {
    currentLevelId = modeOptions.forceLevelId;
    config = getLevel();
    updateChapterUi();
  }

  if (!config) {
    const fallback = levelsData.levels?.[0];
    if (!fallback) {
      return;
    }
    currentLevelId = fallback.id;
    config = fallback;
    updateChapterUi();
    setText(guideText, "难度自动回退到可用项。");
  }

  game.start(config, {
    targetIcons: levelsData.targetIcons,
    decoyIcons: levelsData.decoyIcons,
  }, {
    mode: modeOptions?.mode || "normal",
    modeName: modeOptions?.modeName || "普通模式",
    seed: modeOptions?.seed || null,
  });
}

async function bootstrap() {
  try {
    levelsData = await loadGameConfig("../../configs/levels/whac-a-mole.levels.json", ["levels", "targetIcons", "decoyIcons"]);
  } catch (error) {
    showConfigError(error);
    return;
  }

  const safeLevels = levelsData.levels;
  currentLevelId = safeLevels[0]?.id || "easy";

  renderMeta();
  updateChapterUi();

  freezeBtn.disabled = true;
  doubleBtn.disabled = true;
  renderArena({ entities: [] });
  mountRestReminder({
    settings: settingsState,
    isPlaying: () => Boolean(latestState?.isRunning),
    speak: speakGuide,
    bindTap: bindSoftTap,
  });
}

bindSoftTap(startBtn, () => start());
bindSoftTap(retryBtn, () => start());
bindSoftTap(freezeBtn, () => {
  game.useFreeze();
  speakGuide("冻结已使用", { detailOnly: true });
});
bindSoftTap(doubleBtn, () => {
  game.useDouble();
  speakGuide("双倍分已开启", { detailOnly: true });
});
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
  pendingOptions = {
    forceLevelId: setup.level.id,
    mode: "daily",
    modeName: `每日挑战 ${setup.day}`,
    seed: setup.seed,
  };
  start();
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

function handleArenaPress(event) {
  const entityButton = event.target.closest(".entity-btn");
  if (!latestState?.isRunning) {
    return;
  }
  event.preventDefault();
  if (!entityButton) {
    game.tapEmpty();
    return;
  }
  game.tap(entityButton.dataset.entityId);
}

arenaEl.addEventListener("pointerup", handleArenaPress);
arenaEl.addEventListener("click", (event) => {
  if (event.detail > 0 || !latestState?.isRunning) {
    return;
  }
  const entityButton = event.target.closest(".entity-btn");
  if (entityButton) {
    event.preventDefault();
    game.tap(entityButton.dataset.entityId);
  }
});

bootstrap();
