import { RunnerGame } from "./runnerGame.js";
import { createGameAudio } from "../shared/audio.js";
import { loadSettings } from "../shared/settings.js";
import { mountSettingsButtons, speakSettingChanges } from "../shared/settingsButtons.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { createSoftTap } from "../shared/tap.js";
import { hashText, todayString } from "../shared/random.js";
import { readNumbers, readUnlocks, writeJson } from "../shared/storage.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { setClass, setStyle, setText, syncKeyed } from "../shared/dom.js";

const bindSoftTap = createSoftTap({ flashMs: 80, onTap: () => soundFx.tap() });

const PROGRESS_KEY = "runner-progress";
const STATS_KEY = "runner-stats";
const SETTINGS_KEY = "runner-settings";

const DURATION_HINTS = {
  standard: "标准模式：建议每次游玩 8-10 分钟，结束后休息眼睛。",
  soft: "柔和模式：降低动画和音量，建议每次游玩 6-8 分钟。",
  quiet: "安静模式：关闭音效并尽量减少播报，建议每次游玩 5-6 分钟。",
};

const startBtn = document.querySelector("#startBtn");
const jumpBtn = document.querySelector("#jumpBtn");
const shieldBtn = document.querySelector("#shieldBtn");
const dailyBtn = document.querySelector("#dailyBtn");
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

const progress = readUnlocks(PROGRESS_KEY);

const stats = readNumbers(STATS_KEY, {
  plays: 0,
  wins: 0,
  totalDistance: 0,
  totalCoins: 0,
  totalCollisions: 0,
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

function saveProgress() {
  writeJson(PROGRESS_KEY, progress);
}

function saveStats() {
  writeJson(STATS_KEY, stats);
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
    setText(guideText, "先选难度，再开始，点击屏幕或按钮跳跃躲开障碍。");
    return;
  }
  if (!state.isRunning) {
    setText(guideText, "本局结束，可以点击再来一局继续跑酷。");
    return;
  }
  if (state.mode === "daily") {
    setText(guideText, "今日挑战进行中：今天的障碍节奏是固定的。");
    return;
  }
  if (state.shieldArmed) {
    setText(guideText, "护盾已就绪：下一次碰撞会被保护。");
    return;
  }
  if (state.lowGravityTimer > 0.1) {
    setText(guideText, "轻羽效果生效中：你会跳得更轻更高。");
    return;
  }
  if (state.timeLeft <= 8) {
    setText(guideText, "最后冲刺，保持节奏就能过关。");
    return;
  }
  setText(guideText, "人物会一直朝右跑，木桩会从右边过来，点击跳跃躲开。");
}

let trackLayers = null;

function getTrackLayers() {
  if (!trackLayers) {
    trackEl.innerHTML = `
      <div class="track-ground-line"></div>
      <div class="track-flow">前进方向 → → →</div>
      <div class="player">🏃</div>
      <div class="track-layer" data-layer="pickups"></div>
      <div class="track-layer" data-layer="obstacles"></div>
    `;
    trackLayers = {
      player: trackEl.querySelector(".player"),
      pickups: trackEl.querySelector("[data-layer='pickups']"),
      obstacles: trackEl.querySelector("[data-layer='obstacles']"),
    };
  }
  return trackLayers;
}

function renderTrack(state) {
  if (!state.level) {
    trackLayers = null;
    trackEl.innerHTML = "<p>请选择难度并开始游戏。</p>";
    return;
  }

  const layers = getTrackLayers();
  trackEl.className = state.lowGravityTimer > 0.1 ? "track is-low-gravity" : "track";
  setClass(layers.player, state.shieldArmed ? "player shield" : "player");
  setStyle(layers.player, `bottom:${state.groundY + state.playerY}px;`);

  syncKeyed(layers.pickups, state.pickups || [], {
    create: () => document.createElement("div"),
    update: (el, item) => {
      setClass(el, item.type === "wing" ? "pickup wing" : "pickup coin");
      setText(el, item.type === "wing" ? "🪽" : "🪙");
      setStyle(el, `left:${item.x}px;width:${item.width}px;height:${item.height}px;bottom:${state.groundY + item.y}px;`);
    },
  });

  syncKeyed(layers.obstacles, state.obstacles, {
    create: () => {
      const el = document.createElement("div");
      el.className = "obstacle";
      return el;
    },
    update: (el, item) => {
      setStyle(el, `left:${item.x}px;width:${item.width}px;height:${item.height}px;`);
    },
  });
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

async function bootstrap() {
  try {
    levelsData = await loadGameConfig("../../configs/levels/runner.levels.json", ["levels"]);
  } catch (error) {
    showConfigError(error);
    return;
  }

  const safeLevels = levelsData.levels;
  currentLevelId = safeLevels[0]?.id || "easy";

  renderMeta();
  updateChapterUi();

  shieldBtn.disabled = true;
  jumpBtn.disabled = true;
  retryBtn.disabled = true;
  renderTrack({ level: null });
}

bindSoftTap(startBtn, () => start());
bindSoftTap(retryBtn, () => start());
bindSoftTap(jumpBtn, () => game.jump());
bindSoftTap(shieldBtn, () => game.useShield());

mountSettingsButtons({
  storageKey: SETTINGS_KEY,
  settings: settingsState,
  bindTap: bindSoftTap,
  onChange: () => {
    playDurationHint.textContent = DURATION_HINTS[settingsState.careMode];
  },
  announce: speakSettingChanges(speakGuide, guideText),
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
    setText(guideText, `已选择${button.textContent}，点击开始游戏进入。`);
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
