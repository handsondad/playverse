import { WhacGame } from "./whacGame.js";
import { createGameAudio } from "../shared/audio.js";
import { GLOBAL_SETTINGS_KEY, careModeLabel, loadSettings, nextCareMode, saveSettings } from "../shared/settings.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { createSoftTap } from "../shared/tap.js";
import { todayString } from "../shared/random.js";
import { readJson, writeJson } from "../shared/storage.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { setGameInterval } from "../shared/timers.js";
import { setHtml } from "../shared/dom.js";

const bindSoftTap = createSoftTap({ flashMs: 80, onTap: () => soundFx.tap() });

const PROGRESS_KEY = "whac-progress";
const STATS_KEY = "whac-stats";
const SETTINGS_KEY = "whac-settings";
const PLAYTIME_KEY = "kids-playtime-tracker";
const PLAYTIME_TICK_MS = 15000;
const PLAYTIME_BREAK_GAP_MS = 5 * 60 * 1000;
const PLAYTIME_GRACE_MS = 5 * 60 * 1000;

const startBtn = document.querySelector("#startBtn");
const freezeBtn = document.querySelector("#freezeBtn");
const doubleBtn = document.querySelector("#doubleBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const narrationBtn = document.querySelector("#narrationBtn");
const parentModeBtn = document.querySelector("#parentModeBtn");
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
const restReminder = document.querySelector("#restReminder");
const restReminderText = document.querySelector("#restReminderText");
const restNowBtn = document.querySelector("#restNowBtn");
const restContinueBtn = document.querySelector("#restContinueBtn");

const chapterButtons = [chapterEasyBtn, chapterNormalBtn, chapterHardBtn];

let levelsData = null;
let latestState = null;
let prevState = null;
let pendingOptions = null;
let playtimeTimer = null;
let currentLevelId = "easy";

function getThresholdMs() {
  if (settingsState.careMode === "quiet") {
    return 6 * 60 * 1000;
  }
  if (settingsState.careMode === "soft") {
    return 8 * 60 * 1000;
  }
  return 10 * 60 * 1000;
}

function loadPlaytime() {
  const parsed = readJson(PLAYTIME_KEY);
  return {
    continuousMs: Number(parsed.continuousMs || 0),
    lastTick: Number(parsed.lastTick || Date.now()),
    snoozeUntil: Number(parsed.snoozeUntil || 0),
    remindStage: Number(parsed.remindStage || 0),
  };
}

function savePlaytime(state) {
  writeJson(PLAYTIME_KEY, state);
}

function hideRestReminder() {
  restReminder.hidden = true;
}

function showRestReminder(message) {
  restReminderText.textContent = message;
  restReminder.hidden = false;
}

function checkPlaytimeReminder(now, state) {
  if (document.hidden) {
    return state;
  }
  if (!latestState?.isRunning) {
    hideRestReminder();
    return state;
  }
  const thresholdMs = getThresholdMs();
  if (now < state.snoozeUntil) {
    return state;
  }
  if (state.continuousMs >= thresholdMs + PLAYTIME_GRACE_MS && state.remindStage < 2) {
    showRestReminder("已经连续玩较久啦，建议现在休息和看看远处。需要我先暂停一会吗？");
    speakGuide("建议现在休息一下眼睛", { force: true });
    state.remindStage = 2;
    return state;
  }
  if (state.continuousMs >= thresholdMs && state.remindStage < 1) {
    showRestReminder("连续游玩时间达到建议阈值，休息 2-3 分钟会更舒服。");
    speakGuide("到休息时间啦", { force: true });
    state.remindStage = 1;
  }
  return state;
}

function tickPlaytime() {
  const now = Date.now();
  const state = loadPlaytime();
  const gap = now - state.lastTick;

  if (gap > PLAYTIME_BREAK_GAP_MS) {
    state.continuousMs = 0;
    state.remindStage = 0;
  }

  if (!document.hidden) {
    if (latestState?.isRunning) {
      const addMs = Math.max(0, Math.min(gap, PLAYTIME_TICK_MS * 2));
      state.continuousMs += addMs;
    }
  }

  state.lastTick = now;
  const updated = checkPlaytimeReminder(now, state);
  savePlaytime(updated);
}

function startPlaytimeTracker() {
  if (playtimeTimer) {
    return;
  }
  tickPlaytime();
  playtimeTimer = setGameInterval(tickPlaytime, PLAYTIME_TICK_MS);
}

function wireRestReminderActions() {
  bindSoftTap(restNowBtn, () => {
    hideRestReminder();
    const state = loadPlaytime();
    state.continuousMs = 0;
    state.snoozeUntil = Date.now() + 10 * 60 * 1000;
    state.remindStage = 0;
    state.lastTick = Date.now();
    savePlaytime(state);
    speakGuide("好的，我们先休息一会儿", { force: true });
  });

  bindSoftTap(restContinueBtn, () => {
    hideRestReminder();
    const state = loadPlaytime();
    state.snoozeUntil = Date.now() + PLAYTIME_GRACE_MS;
    state.lastTick = Date.now();
    savePlaytime(state);
    speakGuide("再玩五分钟后我会继续提醒你", { force: true });
  });
}

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
  totalHits: 0,
  totalMisses: 0,
  bestCombo: 0,
};

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

function applySettingsUi() {
  document.body.classList.toggle("mode-soft", settingsState.careMode === "soft");
  document.body.classList.toggle("mode-quiet", settingsState.careMode === "quiet");
  voiceBtn.textContent = `语音引导：${settingsState.voiceOn ? "开" : "关"}`;
  narrationBtn.textContent = `播报模式：${settingsState.narrationLevel === "detailed" ? "详细" : "关键"}`;
  parentModeBtn.textContent = `护眼模式：${careModeLabel(settingsState.careMode)}`;
  if (settingsState.careMode === "quiet") {
    playDurationHint.textContent = "安静模式：关闭音效并尽量减少播报，建议每次游玩 5-6 分钟。";
    return;
  }
  if (settingsState.careMode === "soft") {
    playDurationHint.textContent = "柔和模式：降低动画和音量，建议每次游玩 6-8 分钟。";
    return;
  }
  playDurationHint.textContent = "标准模式：建议每次游玩 8-10 分钟，结束后做眼保健活动。";
}

function starsToText(stars) {
  return "★".repeat(stars) + "☆".repeat(3 - stars);
}

function pulseCombo() {
  comboValue.classList.remove("combo-pop");
  void comboValue.offsetWidth;
  comboValue.classList.add("combo-pop");
}

function hashText(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function loadProgress() {
  const parsed = readJson(PROGRESS_KEY);
  if (parsed.unlocked) {
    progress.unlocked.easy = true;
    progress.unlocked.normal = Boolean(parsed.unlocked.normal);
    progress.unlocked.hard = Boolean(parsed.unlocked.hard);
  }

  progress.unlocked.easy = true;
}

function saveProgress() {
  writeJson(PROGRESS_KEY, progress);
}

function loadStats() {
  const parsed = readJson(STATS_KEY);
  stats.plays = Number(parsed.plays || 0);
  stats.wins = Number(parsed.wins || 0);
  stats.totalHits = Number(parsed.totalHits || 0);
  stats.totalMisses = Number(parsed.totalMisses || 0);
  stats.bestCombo = Number(parsed.bestCombo || 0);
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
    guideText.textContent = "点击开始游戏，优先点小动物，避开干扰项。";
    return;
  }
  if (!state.isRunning) {
    guideText.textContent = "本局结束，可点击再来一局继续挑战。";
    return;
  }
  if (state.mode === "daily") {
    guideText.textContent = "今日挑战进行中：今天的刷怪序列是固定的。";
    return;
  }
  if (state.isFrozen) {
    guideText.textContent = "冻结生效中：生成节奏暂停 3 秒。";
    return;
  }
  if (state.isDouble) {
    guideText.textContent = "双倍分生效中：命中得分翻倍。";
    return;
  }
  if (state.combo >= 3) {
    guideText.textContent = `连击 ${state.combo}，当前倍率 x${state.comboMultiplier.toFixed(1)}。`;
    return;
  }
  if (state.misses >= 3) {
    guideText.textContent = "误点有点多，先看清再点会更稳。";
    return;
  }
  guideText.textContent = "干扰项会扣分，优先点绿色边框的小动物。";
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
          <button
            class="entity-btn ${entity.isTarget ? "target" : "decoy"}"
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
    guideText.textContent = "难度自动回退到可用项。";
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

  loadProgress();
  loadStats();
  renderMeta();
  updateChapterUi();
  applySettingsUi();

  freezeBtn.disabled = true;
  doubleBtn.disabled = true;
  renderArena({ entities: [] });
  hideRestReminder();
  wireRestReminderActions();
  startPlaytimeTracker();

  window.addEventListener("storage", (event) => {
    if (event.key !== GLOBAL_SETTINGS_KEY) {
      return;
    }
    loadSettings(SETTINGS_KEY, settingsState);
    applySettingsUi();
  });

  window.addEventListener("storage", (event) => {
    if (event.key === PLAYTIME_KEY) {
      const state = loadPlaytime();
      if (Date.now() < state.snoozeUntil) {
        hideRestReminder();
      }
    }
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
bindSoftTap(voiceBtn, () => {
  settingsState.voiceOn = !settingsState.voiceOn;
  saveSettings(SETTINGS_KEY, settingsState);
  applySettingsUi();
  if (settingsState.voiceOn) {
    speakGuide(guideText.textContent);
  }
});
bindSoftTap(narrationBtn, () => {
  settingsState.narrationLevel = settingsState.narrationLevel === "detailed" ? "key" : "detailed";
  saveSettings(SETTINGS_KEY, settingsState);
  applySettingsUi();
  speakGuide(`已切换到${settingsState.narrationLevel === "detailed" ? "详细" : "关键"}播报`);
});
bindSoftTap(parentModeBtn, () => {
  settingsState.careMode = nextCareMode(settingsState.careMode);
  saveSettings(SETTINGS_KEY, settingsState);
  applySettingsUi();
  speakGuide(`已切换到${careModeLabel(settingsState.careMode)}模式`, { force: true });
});
bindSoftTap(dailyBtn, () => {
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
    guideText.textContent = `已选择${button.textContent}，点击开始游戏进入。`;
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

bootstrap();
