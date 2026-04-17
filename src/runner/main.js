import { RunnerGame } from "./runnerGame.js";
import { createGameAudio } from "../shared/audio.js";

const PROGRESS_KEY = "runner-progress";
const STATS_KEY = "runner-stats";
const SETTINGS_KEY = "runner-settings";
const GLOBAL_SETTINGS_KEY = "kids-global-settings";

const FALLBACK_LEVELS_DATA = {
  levels: [
    { id: "easy", name: "慢慢来", durationSec: 45, speed: 180, spawnIntervalMs: 1480, jumpVelocity: 610 },
    { id: "normal", name: "刚刚好", durationSec: 55, speed: 240, spawnIntervalMs: 1220, jumpVelocity: 640 },
    { id: "hard", name: "挑战王", durationSec: 65, speed: 300, spawnIntervalMs: 980, jumpVelocity: 670 },
  ],
};

const startBtn = document.querySelector("#startBtn");
const jumpBtn = document.querySelector("#jumpBtn");
const shieldBtn = document.querySelector("#shieldBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const narrationBtn = document.querySelector("#narrationBtn");
const parentModeBtn = document.querySelector("#parentModeBtn");
const retryBtn = document.querySelector("#retryBtn");

const chapterEasyBtn = document.querySelector("#chapterEasyBtn");
const chapterNormalBtn = document.querySelector("#chapterNormalBtn");
const chapterHardBtn = document.querySelector("#chapterHardBtn");
const chapterHint = document.querySelector("#chapterHint");
const chapterButtons = [chapterEasyBtn, chapterNormalBtn, chapterHardBtn];

const timeValue = document.querySelector("#timeValue");
const scoreValue = document.querySelector("#scoreValue");
const distanceValue = document.querySelector("#distanceValue");
const coinsValue = document.querySelector("#coinsValue");
const jumpsValue = document.querySelector("#jumpsValue");
const collisionValue = document.querySelector("#collisionValue");
const bestValue = document.querySelector("#bestValue");
const guideText = document.querySelector("#guideText");
const playDurationHint = document.querySelector("#playDurationHint");

const metaPlays = document.querySelector("#metaPlays");
const metaWinRate = document.querySelector("#metaWinRate");
const metaAvgDistance = document.querySelector("#metaAvgDistance");
const metaAvgCoins = document.querySelector("#metaAvgCoins");
const metaAvgCollision = document.querySelector("#metaAvgCollision");
const metaBestStreak = document.querySelector("#metaBestStreak");

const trackEl = document.querySelector("#track");
const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

let levelsData = null;
let currentLevelId = "easy";
let latestState = null;
let prevState = null;
let pendingOptions = null;

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
  totalDistance: 0,
  totalCoins: 0,
  totalCollisions: 0,
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
    jump() {
      gameAudio.jump();
    },
    coin() {
      gameAudio.coin();
    },
    powerup() {
      gameAudio.powerup();
    },
    hitShield() {
      gameAudio.hitShield();
    },
    lose() {
      gameAudio.lose();
    },
    win() {
      gameAudio.win();
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
    stats.totalDistance = Number(parsed.totalDistance || 0);
    stats.totalCoins = Number(parsed.totalCoins || 0);
    stats.totalCollisions = Number(parsed.totalCollisions || 0);
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
  if (settingsState.careMode === "soft" && options.detailOnly) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = settingsState.careMode === "standard"
    ? 1
    : (settingsState.careMode === "soft" ? 0.92 : 0.88);
  utterance.volume = settingsState.careMode === "standard"
    ? 0.95
    : (settingsState.careMode === "soft" ? 0.72 : 0.5);
  window.speechSynthesis.speak(utterance);
}

function applySettingsUi() {
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
  playDurationHint.textContent = "标准模式：建议每次游玩 8-10 分钟，结束后休息眼睛。";
}

function renderMeta() {
  const winRate = stats.plays > 0 ? Math.round((stats.wins / stats.plays) * 100) : 0;
  const avgDistance = stats.plays > 0 ? Math.round(stats.totalDistance / stats.plays) : 0;
  const avgCoins = stats.plays > 0 ? (stats.totalCoins / stats.plays).toFixed(1) : "0.0";
  const avgCollision = stats.plays > 0 ? (stats.totalCollisions / stats.plays).toFixed(1) : "0.0";

  metaPlays.textContent = String(stats.plays);
  metaWinRate.textContent = `${winRate}%`;
  metaAvgDistance.textContent = String(avgDistance);
  metaAvgCoins.textContent = avgCoins;
  metaAvgCollision.textContent = avgCollision;
  metaBestStreak.textContent = String(stats.bestStreak);
}

function updateChapterUi() {
  chapterEasyBtn.disabled = false;
  chapterNormalBtn.disabled = false;
  chapterHardBtn.disabled = false;
  chapterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.levelId === currentLevelId);
  });
  chapterHint.textContent = "先点一个难度，再开始游戏。";
}

function updateGuide(state) {
  if (!state.level) {
    guideText.textContent = "先选难度，再开始，点击屏幕或按钮跳跃躲开障碍。";
    return;
  }
  if (!state.isRunning) {
    guideText.textContent = "本局结束，可以点击再来一局继续跑酷。";
    return;
  }
  if (state.mode === "daily") {
    guideText.textContent = "今日挑战进行中：今天的障碍节奏是固定的。";
    return;
  }
  if (state.shieldArmed) {
    guideText.textContent = "护盾已就绪：下一次碰撞会被保护。";
    return;
  }
  if (state.lowGravityTimer > 0.1) {
    guideText.textContent = "轻羽效果生效中：你会跳得更轻更高。";
    return;
  }
  if (state.timeLeft <= 8) {
    guideText.textContent = "最后冲刺，保持节奏就能过关。";
    return;
  }
  guideText.textContent = "人物会一直朝右跑，木桩会从右边过来，点击跳跃躲开。";
}

function renderTrack(state) {
  if (!state.level) {
    trackEl.innerHTML = "<p>请选择难度并开始游戏。</p>";
    return;
  }

  const playerBottom = state.groundY + state.playerY;
  const playerClass = state.shieldArmed ? "player shield" : "player";
  const lowGravityClass = state.lowGravityTimer > 0.1 ? "track is-low-gravity" : "track";

  const obstaclesMarkup = state.obstacles
    .map((item) => {
      const style = `left:${item.x}px;width:${item.width}px;height:${item.height}px;`;
      return `<div class="obstacle" style="${style}"></div>`;
    })
    .join("");

  const pickupsMarkup = (state.pickups || [])
    .map((item) => {
      const style = `left:${item.x}px;width:${item.width}px;height:${item.height}px;bottom:${state.groundY + item.y}px;`;
      const content = item.type === "wing" ? "🪽" : "🪙";
      const cls = item.type === "wing" ? "pickup wing" : "pickup coin";
      return `<div class="${cls}" style="${style}">${content}</div>`;
    })
    .join("");

  trackEl.className = lowGravityClass;
  trackEl.innerHTML = `
    <div class="track-ground-line"></div>
    <div class="track-flow">前进方向 → → →</div>
    <div class="${playerClass}" style="bottom:${playerBottom}px;">🏃</div>
    ${pickupsMarkup}
    ${obstaclesMarkup}
  `;
}

function renderState(state) {
  latestState = state;

  timeValue.textContent = String(Math.ceil(state.timeLeft));
  scoreValue.textContent = String(Math.max(0, Math.round(state.score)));
  distanceValue.textContent = String(state.distance);
  coinsValue.textContent = String(state.coins || 0);
  jumpsValue.textContent = String(state.jumps);
  collisionValue.textContent = String(state.collisions);
  bestValue.textContent = state.bestScore > 0 ? String(state.bestScore) : "--";

  shieldBtn.textContent = state.shieldArmed ? "护盾中" : `护盾（${state.shieldCount}）`;
  shieldBtn.disabled = !state.isRunning || state.shieldCount <= 0 || state.shieldArmed;
  jumpBtn.disabled = !state.isRunning;
  retryBtn.disabled = state.isRunning || !state.level;

  if (prevState) {
    if (state.shieldArmed && !prevState.shieldArmed) {
      soundFx.hitShield();
    }
    if (state.jumps > prevState.jumps) {
      soundFx.jump();
    }
    if ((state.coins || 0) > (prevState.coins || 0)) {
      soundFx.coin();
    }
    if ((state.powerups || 0) > (prevState.powerups || 0)) {
      soundFx.powerup();
    }
  }

  updateGuide(state);
  renderTrack(state);

  prevState = {
    shieldArmed: state.shieldArmed,
    jumps: state.jumps,
    coins: state.coins || 0,
    powerups: state.powerups || 0,
  };
}

function updateStats(payload) {
  stats.plays += 1;
  stats.totalDistance += payload.distance;
  stats.totalCoins += payload.coins || 0;
  stats.totalCollisions += payload.collisions;

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
  resultEl.classList.add("is-celebrating");
  setTimeout(() => resultEl.classList.remove("is-celebrating"), 900);

  resultTitle.textContent = payload.isWin ? "跑酷成功" : "撞到障碍啦";
  if (payload.isWin) {
    resultTitle.className = "win";
    soundFx.win();
  } else {
    resultTitle.className = "lose";
    soundFx.lose();
  }

  const dailySeedText = payload.mode === "daily" ? ` | 今日种子：${payload.seed.slice(0, 10)}` : "";
  resultText.textContent = `模式：${payload.modeName} | 难度：${payload.levelName} | 分数：${payload.score} | 距离：${payload.distance} | 金币：${payload.coins} | 轻羽：${payload.powerups} | 跳跃：${payload.jumps} | 碰撞：${payload.collisions} | 最好：${payload.bestScore}${dailySeedText}`;
  retryBtn.disabled = false;

  updateStats(payload);
  updateProgress(payload);
  updateChapterUi();
}

const game = new RunnerGame({
  onStateChange: renderState,
  onResult: showResult,
});

function getLevel() {
  return levelsData.levels.find((item) => item.id === currentLevelId);
}

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

  const hash = hashText(`${day}|runner`);
  const level = available[hash % available.length];

  return {
    day,
    level,
    seed: `${day}|${level.id}|runner`,
  };
}

function start(options = null) {
  soundFx.unlock();
  prevState = null;
  resultEl.hidden = true;
  retryBtn.disabled = true;

  const modeOptions = options || pendingOptions;
  pendingOptions = null;

  let level = getLevel();
  if (modeOptions?.forceLevelId) {
    currentLevelId = modeOptions.forceLevelId;
    level = getLevel();
    updateChapterUi();
  }

  if (!level) {
    const fallback = levelsData.levels?.[0];
    if (!fallback) {
      return;
    }
    currentLevelId = fallback.id;
    level = fallback;
    updateChapterUi();
  }

  game.start(level, {
    mode: modeOptions?.mode || "normal",
    modeName: modeOptions?.modeName || "普通模式",
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

async function bootstrap() {
  try {
    const response = await fetch("../../configs/levels/runner.levels.json");
    if (!response.ok) {
      throw new Error(`Failed to load levels: ${response.status}`);
    }
    levelsData = await response.json();
  } catch {
    levelsData = FALLBACK_LEVELS_DATA;
    guideText.textContent = "关卡配置加载失败，已使用内置难度。";
  }

  const safeLevels = Array.isArray(levelsData?.levels) && levelsData.levels.length > 0
    ? levelsData.levels
    : FALLBACK_LEVELS_DATA.levels;
  levelsData.levels = safeLevels;
  currentLevelId = safeLevels[0]?.id || "easy";

  loadProgress();
  loadStats();
  loadSettings();
  renderMeta();
  updateChapterUi();
  applySettingsUi();

  shieldBtn.disabled = true;
  jumpBtn.disabled = true;
  retryBtn.disabled = true;
  renderTrack({ level: null });

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
bindSoftTap(jumpBtn, () => game.jump());
bindSoftTap(shieldBtn, () => game.useShield());

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

bindSoftTap(dailyBtn, () => {
  const setup = pickDailySetup();
  pendingOptions = {
    forceLevelId: setup.level.id,
    mode: "daily",
    modeName: `每日挑战 ${setup.day}`,
    seed: setup.seed,
  };
  chapterHint.textContent = `今日挑战已锁定：${setup.level.name}（${setup.day}）`;
  start();
});

chapterButtons.forEach((button) => {
  bindSoftTap(button, () => {
    currentLevelId = button.dataset.levelId;
    updateChapterUi();
    guideText.textContent = `已选择${button.textContent}，点击开始游戏进入。`;
    speakGuide(guideText.textContent);
  });
});

function onTrackPress(event) {
  if (!latestState?.isRunning) {
    return;
  }

  const ignoredButton = event.target.closest("button");
  if (ignoredButton) {
    return;
  }

  event.preventDefault();
  game.jump();
}

trackEl.addEventListener("pointerup", onTrackPress);

bootstrap();
