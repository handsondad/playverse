import { RhythmGame } from "./rhythmGame.js";
import { createGameAudio } from "../shared/audio.js";
import { loadSettings } from "../shared/settings.js";
import { mountSettingsButtons, speakSettingChanges } from "../shared/settingsButtons.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { bindDelegatedTap, createSoftTap } from "../shared/tap.js";
import { hashText, todayString } from "../shared/random.js";
import { readJson, readNumbers, writeJson } from "../shared/storage.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { clearGameInterval, setGameInterval } from "../shared/timers.js";
import { setClass, setStyle, setText, syncKeyed } from "../shared/dom.js";

const bindSoftTap = createSoftTap({ flashMs: 70, onTap: () => soundFx.tap() });

const STATS_KEY = "rhythm-stats";
const SETTINGS_KEY = "rhythm-settings";

const DURATION_HINTS = {
  standard: "标准模式：建议每次游玩 5-8 分钟，跟着节奏轻松点击。",
  soft: "柔和模式：降低音量与闪动强度，建议轻松拍一两首。",
  quiet: "安静模式：关闭音效并减少播报，建议每次游玩 5 分钟左右。",
};
const CALIBRATION_KEY = "rhythm-calibration";

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const calibrateBtn = document.querySelector("#calibrateBtn");
const calibrateTapBtn = document.querySelector("#calibrateTapBtn");
const calibrateCloseBtn = document.querySelector("#calibrateCloseBtn");
const calibrationPanel = document.querySelector("#calibrationPanel");
const calibrationInfo = document.querySelector("#calibrationInfo");
const calibrationBeat = document.querySelector("#calibrationBeat");

const songButtonsEl = document.querySelector("#songButtons");
const levelEasyBtn = document.querySelector("#levelEasyBtn");
const levelNormalBtn = document.querySelector("#levelNormalBtn");
const levelHardBtn = document.querySelector("#levelHardBtn");
const levelButtons = [levelEasyBtn, levelNormalBtn, levelHardBtn];

const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");
const playDurationHint = document.querySelector("#playDurationHint");

const scoreValue = document.querySelector("#scoreValue");
const comboValue = document.querySelector("#comboValue");
const perfectValue = document.querySelector("#perfectValue");
const goodValue = document.querySelector("#goodValue");
const missValue = document.querySelector("#missValue");
const bestValue = document.querySelector("#bestValue");

const songTitle = document.querySelector("#songTitle");
const songSubTitle = document.querySelector("#songSubTitle");
const progressFill = document.querySelector("#progressFill");
const beatHelper = document.querySelector("#beatHelper");
const rhythmBoardEl = document.querySelector(".rhythm-board");
const lanesEl = document.querySelector("#lanes");
const laneHitsEl = document.querySelector("#laneHits");

const metaPlays = document.querySelector("#metaPlays");
const metaWinRate = document.querySelector("#metaWinRate");
const metaAvgScore = document.querySelector("#metaAvgScore");
const metaAvgHitRate = document.querySelector("#metaAvgHitRate");
const metaBestCombo = document.querySelector("#metaBestCombo");

const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

let levelsData = null;
let currentSongId = "";
let currentLevelId = "easy";
let latestState = null;
let pendingOptions = null;
const pressedKeys = new Set();
let calibrationSession = null;
let calibrationTimerId = null;

const calibrationState = {
  offsetAdjustMs: 0,
};

const stats = readNumbers(STATS_KEY, {
  plays: 0,
  wins: 0,
  totalScore: 0,
  totalAccuracy: 0,
  bestCombo: 0,
});

const settingsState = loadSettings(SETTINGS_KEY);
const speakGuide = createSpeaker(settingsState, SPEECH_PRESETS.guide);

const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });
const LANE_COLORS = ["lane-1", "lane-2", "lane-3", "lane-4"];

const soundFx = (() => {
  return {
    unlock() {
      gameAudio.unlock();
    },
    tap() {
      gameAudio.uiTap();
    },
    perfect(lane) {
      gameAudio.perfect(lane);
    },
    good(lane) {
      gameAudio.good(lane);
    },
    miss() {
      gameAudio.miss();
    },
    win() {
      gameAudio.win();
    },
    lose() {
      gameAudio.lose();
    },
  };
})();

function saveStats() {
  writeJson(STATS_KEY, stats);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function loadCalibration() {
  const parsed = readJson(CALIBRATION_KEY);
  calibrationState.offsetAdjustMs = clamp(Number(parsed.offsetAdjustMs || 0), -70, 120);
}

function saveCalibration() {
  writeJson(CALIBRATION_KEY, {
    offsetAdjustMs: calibrationState.offsetAdjustMs,
  });
}

function stopCalibrationSession() {
  if (calibrationTimerId) {
    clearGameInterval(calibrationTimerId);
    calibrationTimerId = null;
  }
  calibrationSession = null;
  calibrationBeat?.classList.remove("is-beat");
}

function finishCalibrationSession(manual = false) {
  if (!calibrationSession) {
    return;
  }

  const deltas = calibrationSession.deltas;
  if (deltas.length > 0) {
    const avg = Math.round(deltas.reduce((sum, item) => sum + item, 0) / deltas.length);
    calibrationState.offsetAdjustMs = clamp(avg, -70, 120);
    saveCalibration();
    calibrationInfo.textContent = `校准完成：平均偏移 ${avg}ms，已应用。`;
    selectorHint.textContent = `延迟校准已更新：${avg >= 0 ? "+" : ""}${avg}ms`;
  } else {
    calibrationInfo.textContent = manual
      ? "已取消校准，保留原设置。"
      : "没有采集到点击，保留原设置。";
  }

  stopCalibrationSession();
}

function startCalibrationSession() {
  stopCalibrationSession();
  calibrationPanel.hidden = false;

  const beatMs = 620;
  const countIn = 2;
  const targetTaps = 4;
  const startAt = performance.now();
  calibrationSession = {
    startAt,
    beatMs,
    countIn,
    targetTaps,
    expected: Array.from({ length: targetTaps }, (_, index) => {
      return startAt + ((countIn + index + 1) * beatMs);
    }),
    tapIndex: 0,
    deltas: [],
    beatIndex: 0,
  };

  calibrationInfo.textContent = "准备中：先听两拍，再跟拍 4 次。";

  calibrationTimerId = setGameInterval(() => {
    if (!calibrationSession) {
      return;
    }

    const now = performance.now();
    const elapsed = now - calibrationSession.startAt;
    const currentBeat = Math.floor(elapsed / beatMs) + 1;

    if (currentBeat > calibrationSession.beatIndex) {
      calibrationSession.beatIndex = currentBeat;
      calibrationBeat.classList.add("is-beat");
      setTimeout(() => calibrationBeat?.classList.remove("is-beat"), 120);
      soundFx.tap();
    }

    const doneCount = calibrationSession.deltas.length;
    if (doneCount >= targetTaps) {
      finishCalibrationSession();
      return;
    }

    if (currentBeat <= countIn) {
      calibrationInfo.textContent = `准备中：第 ${currentBeat}/${countIn} 拍`;
    } else {
      calibrationInfo.textContent = `请跟拍：已完成 ${doneCount}/${targetTaps}`;
    }

    if (elapsed > ((countIn + targetTaps + 2) * beatMs)) {
      finishCalibrationSession();
    }
  }, 40);
}

function tapCalibration() {
  if (!calibrationSession) {
    return;
  }

  const tapIndex = calibrationSession.tapIndex;
  if (tapIndex >= calibrationSession.targetTaps) {
    return;
  }

  const now = performance.now();
  const expected = calibrationSession.expected[tapIndex];
  if (now < expected - 260) {
    return;
  }

  calibrationSession.deltas.push(Math.round(now - expected));
  calibrationSession.tapIndex += 1;
  soundFx.good(1);

  if (calibrationSession.tapIndex >= calibrationSession.targetTaps) {
    finishCalibrationSession();
  }
}

function renderMeta() {
  const winRate = stats.plays > 0 ? Math.round((stats.wins / stats.plays) * 100) : 0;
  const avgScore = stats.plays > 0 ? Math.round(stats.totalScore / stats.plays) : 0;
  const avgHitRate = stats.plays > 0 ? Math.round(stats.totalAccuracy / stats.plays) : 0;

  metaPlays.textContent = String(stats.plays);
  metaWinRate.textContent = `${winRate}%`;
  metaAvgScore.textContent = String(avgScore);
  metaAvgHitRate.textContent = `${avgHitRate}%`;
  metaBestCombo.textContent = String(stats.bestCombo);
}

function renderSongButtons() {
  if (!levelsData) {
    return;
  }
  songButtonsEl.innerHTML = levelsData.songs.map((song) => {
    const activeClass = song.id === currentSongId ? "song-button is-active" : "song-button";
    return `<button class="${activeClass}" data-song-id="${song.id}"><span>${song.name}</span><small>${song.theme}</small></button>`;
  }).join("");
}

function updateSelectorsUi() {
  renderSongButtons();
  levelButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.levelId === currentLevelId);
  });
  selectorHint.textContent = "先选歌曲和难度，再开始游戏。";
}

function getSong() {
  return levelsData.songs.find((song) => song.id === currentSongId);
}

function getChart(song, levelId) {
  return song?.charts?.[levelId] || null;
}

let laneEls = null;

function getLaneEls() {
  if (!laneEls) {
    lanesEl.innerHTML = [0, 1, 2, 3].map(() => `
      <div class="lane">
        <div class="judge-line"></div>
        <div class="lane-notes"></div>
      </div>
    `).join("");
    laneEls = [...lanesEl.querySelectorAll(".lane")].map((lane) => ({ lane, notes: lane.querySelector(".lane-notes") }));
  }
  return laneEls;
}

function createNoteEl(note) {
  const el = document.createElement("div");
  if (note.type === "hold") {
    el.innerHTML = '<div class="hold-head"></div>';
  }
  return el;
}

function noteLook(note, state) {
  const color = LANE_COLORS[note.lane];
  if (note.type === "hold") {
    const headProgress = (note.hitTimeMs - state.elapsedMs) / state.noteTravelMs;
    const tailProgress = (note.endTimeMs - state.elapsedMs) / state.noteTravelMs;
    const headTop = Math.max(0, Math.min(100, (1 - headProgress) * 100));
    const tailTop = Math.max(0, Math.min(100, (1 - tailProgress) * 100));
    const topPercent = Math.min(headTop, tailTop);
    const heightPercent = Math.max(8, Math.abs(headTop - tailTop));
    return {
      className: `hold-note ${color}${note.started ? " hold-active" : ""}`,
      style: `top:${topPercent}%;height:${heightPercent}%;`,
    };
  }
  const progress = (note.hitTimeMs - state.elapsedMs) / state.noteTravelMs;
  const topPercent = Math.max(0, Math.min(100, (1 - progress) * 100));
  return { className: `note ${color}`, style: `top:${topPercent}%;` };
}

function renderLanes(state) {
  if (!state.song) {
    rhythmBoardEl.classList.remove("is-beat");
    laneEls = null;
    lanesEl.innerHTML = '<p class="empty-note">开始后这里会出现下落音符。</p>';
    return;
  }

  rhythmBoardEl.classList.toggle("is-beat", Boolean(state.beatPulse));

  getLaneEls().forEach(({ lane, notes }, laneIndex) => {
    const laneNotes = state.notes.filter((note) => note.lane === laneIndex);
    const laneHasActiveHold = laneNotes.some((note) => note.type === "hold" && note.started);
    const flashClass = state.lastLane === laneIndex ? `lane is-${state.lastJudge}` : "lane";
    const pressedClass = state.lanePressed?.[laneIndex] ? " is-pressed" : "";
    const holdClass = laneHasActiveHold ? " is-hold" : "";
    setClass(lane, `${flashClass}${pressedClass}${holdClass}`);

    syncKeyed(notes, laneNotes, {
      create: createNoteEl,
      update: (el, note) => {
        const look = noteLook(note, state);
        setClass(el, look.className);
        setStyle(el, look.style);
      },
    });
  });
}

function renderState(state) {
  latestState = state;

  scoreValue.textContent = String(state.score);
  comboValue.textContent = String(state.combo);
  perfectValue.textContent = String(state.perfectCount);
  goodValue.textContent = String(state.goodCount);
  missValue.textContent = String(state.missCount);
  bestValue.textContent = state.bestScore > 0 ? String(state.bestScore) : "--";

  retryBtn.disabled = state.isRunning || !state.song;
  progressFill.style.width = `${Math.round(state.progress * 100)}%`;
  beatHelper.textContent = state.song
    ? `拍点提示：${state.beatPulse ? "现在更适合跟拍" : "等下一次发光再拍也可以"}`
    : "拍点提示：看到发光时更容易跟节奏";

  if (!state.song) {
    songTitle.textContent = "请先开始游戏";
    songSubTitle.textContent = "4 条轨道，等音符下落到判定线再点。";
    setText(guideText, "先选歌曲和难度，再开始。等音符掉到判定线时点击对应颜色按钮。");
  } else {
    songTitle.textContent = `${state.song.name} · ${state.levelName}`;
    songSubTitle.textContent = `主题：${state.song.theme} | 长按条要按住到尾巴结束。`;
    setText(guideText, state.isRunning
      ? "点击普通音符，遇到长条音符要按住不放，直到尾巴结束。"
      : "可以再来一局，也可以换一首歌继续拍。");
  }

  renderLanes(state);
}

function updateStats(payload) {
  stats.plays += 1;
  stats.totalScore += payload.score;
  stats.totalAccuracy += payload.accuracy;
  stats.bestCombo = Math.max(stats.bestCombo, payload.bestCombo);
  if (payload.isWin) {
    stats.wins += 1;
  }
  saveStats();
  renderMeta();
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = payload.isWin ? "节奏完成" : "再试一首";
  resultTitle.className = payload.isWin ? "win" : "lose";
  resultText.textContent = `歌曲：${payload.songName} | 难度：${payload.levelName} | 分数：${payload.score} | 命中率：${payload.accuracy}% | Perfect：${payload.perfectCount} | Good：${payload.goodCount} | Miss：${payload.missCount} | 最佳连击：${payload.bestCombo}`;

  if (payload.isWin) {
    soundFx.win();
  } else {
    soundFx.lose();
  }

  retryBtn.disabled = false;
  updateStats(payload);
}

function pickDailySetup() {
  const day = todayString();
  const hash = hashText(`${day}|rhythm`);
  const song = levelsData.songs[hash % levelsData.songs.length];
  const levelIds = Object.keys(song.charts);
  const levelId = levelIds[(Math.floor(hash / 11)) % levelIds.length];
  return {
    day,
    song,
    levelId,
    seed: `${day}|${song.id}|${levelId}|rhythm`,
  };
}

function start(options = null) {
  if (!levelsData) {
    return;
  }
  soundFx.unlock();
  resultEl.hidden = true;
  retryBtn.disabled = true;

  const modeOptions = options || pendingOptions;
  pendingOptions = null;

  if (modeOptions?.forceSongId) {
    currentSongId = modeOptions.forceSongId;
  }
  if (modeOptions?.forceLevelId) {
    currentLevelId = modeOptions.forceLevelId;
  }

  let song = getSong();
  if (!song) {
    song = levelsData.songs[0];
    currentSongId = song.id;
  }

  let chart = getChart(song, currentLevelId);
  if (!chart) {
    currentLevelId = Object.keys(song.charts)[0];
    chart = getChart(song, currentLevelId);
  }

  updateSelectorsUi();
  const timingProfile = settingsState.careMode === "quiet"
    ? { timingOffsetMs: 60, lateToleranceMs: 45, holdReleaseGraceMs: 180 }
    : settingsState.careMode === "soft"
      ? { timingOffsetMs: 52, lateToleranceMs: 40, holdReleaseGraceMs: 165 }
      : { timingOffsetMs: 45, lateToleranceMs: 35, holdReleaseGraceMs: 140 };

  const calibratedProfile = {
    timingOffsetMs: clamp(timingProfile.timingOffsetMs + calibrationState.offsetAdjustMs, -20, 200),
    lateToleranceMs: clamp(timingProfile.lateToleranceMs + Math.round(Math.abs(calibrationState.offsetAdjustMs) * 0.2), 28, 75),
    holdReleaseGraceMs: clamp(timingProfile.holdReleaseGraceMs + Math.round(Math.max(0, calibrationState.offsetAdjustMs) * 0.35), 120, 240),
  };

  game.start(song, currentLevelId, chart, {
    seed: modeOptions?.seed,
    ...calibratedProfile,
  });
}

function applyLaneFx(lane, result) {
  const laneButton = laneHitsEl.querySelector(`[data-lane="${lane}"]`);
  laneButton?.classList.add("is-hit");
  setTimeout(() => laneButton?.classList.remove("is-hit"), 120);

  if (result === "perfect") {
    soundFx.perfect(lane);
  } else if (result === "good") {
    soundFx.good(lane);
  } else if (result === "miss") {
    soundFx.miss();
  }
}

function triggerLanePress(lane) {
  const result = game.pressLane(lane);
  applyLaneFx(lane, result);
}

function triggerLaneRelease(lane) {
  const result = game.releaseLane(lane);
  if (result === "miss") {
    applyLaneFx(lane, result);
  }
}

function releaseAllPressedLanes() {
  if (!latestState?.lanePressed) {
    return;
  }
  latestState.lanePressed.forEach((pressed, lane) => {
    if (pressed) {
      triggerLaneRelease(lane);
    }
  });
}

const game = new RhythmGame({
  onStateChange: renderState,
  onResult: showResult,
});

async function bootstrap() {
  try {
    levelsData = await loadGameConfig("../../configs/levels/rhythm-tap.levels.json", ["songs"]);
  } catch (error) {
    showConfigError(error);
    return;
  }

  currentSongId = levelsData.songs[0].id;
  loadCalibration();
  renderMeta();
  updateSelectorsUi();
  selectorHint.textContent = `先选歌曲和难度，再开始游戏。当前校准偏移 ${calibrationState.offsetAdjustMs >= 0 ? "+" : ""}${calibrationState.offsetAdjustMs}ms`;
  retryBtn.disabled = true;
  renderLanes({ song: null });
}

bindSoftTap(startBtn, () => start());
bindSoftTap(retryBtn, () => start());
bindSoftTap(dailyBtn, () => {
  if (!levelsData) {
    return;
  }
  const setup = pickDailySetup();
  pendingOptions = {
    forceSongId: setup.song.id,
    forceLevelId: setup.levelId,
    seed: setup.seed,
  };
  selectorHint.textContent = `今日挑战已锁定：${setup.song.name} | ${getChart(setup.song, setup.levelId).label}`;
  start();
});

mountSettingsButtons({
  storageKey: SETTINGS_KEY,
  settings: settingsState,
  bindTap: bindSoftTap,
  onChange: () => {
    playDurationHint.textContent = DURATION_HINTS[settingsState.careMode];
  },
  announce: speakSettingChanges(speakGuide, guideText),
});

bindSoftTap(calibrateBtn, () => {
  startCalibrationSession();
});

bindSoftTap(calibrateTapBtn, () => {
  tapCalibration();
});

bindSoftTap(calibrateCloseBtn, () => {
  finishCalibrationSession(true);
  calibrationPanel.hidden = true;
});

bindDelegatedTap(songButtonsEl, "[data-song-id]", (button) => {
  currentSongId = button.dataset.songId;
  updateSelectorsUi();
  setText(guideText, `已选择${button.textContent.trim()}。`);
  speakGuide(guideText.textContent);
});

levelButtons.forEach((button) => {
  bindSoftTap(button, () => {
    currentLevelId = button.dataset.levelId;
    updateSelectorsUi();
    setText(guideText, `已切换到${button.textContent}。`);
    speakGuide(guideText.textContent);
  });
});

laneHitsEl.addEventListener("pointerdown", (event) => {
  const button = event.target.closest("[data-lane]");
  if (!button) {
    return;
  }
  event.preventDefault();
  triggerLanePress(Number(button.dataset.lane));
});

laneHitsEl.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-lane]");
  if (!button) {
    return;
  }
  event.preventDefault();
  triggerLaneRelease(Number(button.dataset.lane));
});

laneHitsEl.addEventListener("pointercancel", (event) => {
  const button = event.target.closest("[data-lane]");
  if (!button) {
    return;
  }
  event.preventDefault();
  triggerLaneRelease(Number(button.dataset.lane));
});

window.addEventListener("pointerup", () => {
  releaseAllPressedLanes();
});

window.addEventListener("blur", () => {
  releaseAllPressedLanes();
  pressedKeys.clear();
});

laneHitsEl.addEventListener("click", (event) => event.preventDefault());

window.addEventListener("keydown", (event) => {
  const mapping = {
    a: 0,
    s: 1,
    d: 2,
    f: 3,
    ArrowLeft: 0,
    ArrowUp: 1,
    ArrowDown: 2,
    ArrowRight: 3,
  };
  if (!(event.key in mapping)) {
    return;
  }
  if (pressedKeys.has(event.key)) {
    return;
  }
  pressedKeys.add(event.key);
  event.preventDefault();
  triggerLanePress(mapping[event.key]);
});

window.addEventListener("keyup", (event) => {
  const mapping = {
    a: 0,
    s: 1,
    d: 2,
    f: 3,
    ArrowLeft: 0,
    ArrowUp: 1,
    ArrowDown: 2,
    ArrowRight: 3,
  };
  if (!(event.key in mapping)) {
    return;
  }
  pressedKeys.delete(event.key);
  event.preventDefault();
  triggerLaneRelease(mapping[event.key]);
});

bootstrap();