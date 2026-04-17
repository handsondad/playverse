import { MazeGame } from "./mazeGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";

const GLOBAL_SETTINGS_KEY = "kids-global-settings";
const SETTINGS_KEY = "maze-settings";
const STATS_KEY = "maze-stats";

const FALLBACK_DATA = {
  levels: [
    {
      id: "mz-1",
      name: "森林小径",
      stepGoal: 18,
      timeLimit: 75,
      tip: "先学会绕开墙壁，再去拿钥匙。",
      grid: [
        "#########",
        "#S..#...#",
        "#.##.#K.#",
        "#....#..#",
        "#.##.##.#",
        "#..T....#",
        "#.####..#",
        "#...D.E.#",
        "#########",
      ],
    },
  ],
};

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const moveUpBtn = document.querySelector("#moveUpBtn");
const moveLeftBtn = document.querySelector("#moveLeftBtn");
const moveDownBtn = document.querySelector("#moveDownBtn");
const moveRightBtn = document.querySelector("#moveRightBtn");
const hintBtn = document.querySelector("#hintBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const narrationBtn = document.querySelector("#narrationBtn");
const parentModeBtn = document.querySelector("#parentModeBtn");

const levelButtonsEl = document.querySelector("#levelButtons");
const selectorHint = document.querySelector("#selectorHint");
const levelMeta = document.querySelector("#levelMeta");
const guideText = document.querySelector("#guideText");
const hintText = document.querySelector("#hintText");
const mazeBoard = document.querySelector("#mazeBoard");

const stepsValue = document.querySelector("#stepsValue");
const timeValue = document.querySelector("#timeValue");
const keysValue = document.querySelector("#keysValue");
const trapValue = document.querySelector("#trapValue");

const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

const stats = { plays: 0, wins: 0 };
const settingsState = { voiceOn: true, careMode: "standard", narrationLevel: "key" };
const CARE_MODES = ["standard", "soft", "quiet"];
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

let levelsData = FALLBACK_DATA;
let currentLevelId = "";
let latestState = null;
let timerId = 0;
let runStart = 0;

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

function renderLevelButtons() {
  levelButtonsEl.innerHTML = levelsData.levels.map((level) => {
    const activeClass = level.id === currentLevelId ? "level-btn is-active" : "level-btn";
    return `<button class="${activeClass}" data-level-id="${level.id}">${level.name}</button>`;
  }).join("");
}

function getLevelById(levelId) {
  return levelsData.levels.find((item) => item.id === levelId) || levelsData.levels[0];
}

function renderLevelMeta() {
  const level = getLevelById(currentLevelId);
  if (!level) {
    levelMeta.textContent = "步数、时间和提示会显示在这里。";
    return;
  }
  levelMeta.textContent = `目标步数 ${level.stepGoal} 步 | 建议时间 ${level.timeLimit} 秒 | 提示：${level.tip}`;
}

function renderBoard(state) {
  if (!state.tiles?.length) {
    mazeBoard.innerHTML = "";
    return;
  }

  mazeBoard.style.gridTemplateColumns = `repeat(${state.width}, minmax(0, 1fr))`;
  mazeBoard.innerHTML = state.tiles.map((row, y) => {
    return row.map((cell, x) => {
      const classes = ["cell"];
      if (cell === "#") {
        classes.push("wall");
      } else if (cell === "K") {
        classes.push("key");
      } else if (cell === "D") {
        classes.push("door");
      } else if (cell === "T") {
        classes.push("trap");
      } else if (cell === "E") {
        classes.push("exit");
      } else if (cell === "P") {
        classes.push("switch");
      } else if (cell === "B") {
        classes.push("bridge");
      } else if (cell === "W") {
        classes.push("portal");
      } else {
        classes.push("path");
      }
      if (state.player.x === x && state.player.y === y) {
        classes.push("player");
      }
      const dx = x - state.player.x;
      const dy = y - state.player.y;
      const isAdjacent = Math.abs(dx) + Math.abs(dy) === 1;
      if (state.isRunning && isAdjacent) {
        if (isPathBlocked(cell, state.keysHeld)) {
          classes.push("tap-neighbor-blocked");
        } else {
          classes.push("tap-neighbor");
        }
      }
      const text = state.player.x === x && state.player.y === y
        ? "🙂"
        : (cell === "K" ? "🔑" : cell === "D" ? "🚪" : cell === "T" ? "⚠" : cell === "E" ? "⭐" : cell === "P" ? "🟡" : cell === "B" ? "🪵" : cell === "W" ? "🌀" : "");
      return `<div class="${classes.join(" ")}" data-x="${x}" data-y="${y}">${text}</div>`;
    }).join("");
  }).join("");
}

function isPathBlocked(tile, keysHeld) {
  if (tile === "#" || tile === "X") {
    return true;
  }
  if (tile === "D" && keysHeld <= 0) {
    return true;
  }
  return false;
}

function getBlockedReason(tile, keysHeld) {
  if (tile === "#") {
    return "这里是墙，不能通过。";
  }
  if (tile === "X") {
    return "这条路还没打开，先去找机关。";
  }
  if (tile === "D" && keysHeld <= 0) {
    return "这扇门还锁着，需要先拿钥匙。";
  }
  return "这个位置现在不可达，请点可走的路径格。";
}

function updateTimer(force = false) {
  if (!latestState?.isRunning && !force) {
    return;
  }
  const seconds = Math.max(0, Math.floor((Date.now() - runStart) / 1000));
  game.updateElapsed(seconds);
}

function stopTimer() {
  if (timerId) {
    window.clearInterval(timerId);
    timerId = 0;
  }
}

function startTimer() {
  stopTimer();
  runStart = Date.now();
  timerId = window.setInterval(() => {
    updateTimer();
  }, 1000);
}

function renderState(state) {
  latestState = state;
  stepsValue.textContent = String(state.steps);
  timeValue.textContent = `${state.elapsedSeconds} 秒`;
  keysValue.textContent = `${state.keysCollected} / ${state.keysTotal}`;
  trapValue.textContent = String(state.trapsTriggered);
  retryBtn.disabled = state.isRunning || !state.levelId;
  hintBtn.disabled = !state.isRunning;

  if (!state.isRunning) {
    guideText.textContent = state.isWin
      ? "通关成功，可以挑战更少步数。"
      : "先选关卡，再开始出发。收集钥匙后就能打开门。";
  } else if (state.lastEvent === "踩到陷阱") {
    guideText.textContent = "踩到陷阱了，记住这个位置，下次绕开它。";
  } else if (state.lastEvent === "拿到钥匙") {
    guideText.textContent = "拿到钥匙后，可以去找上锁的门。";
  } else if (state.lastEvent === "机关启动") {
    guideText.textContent = "机关已经启动，原来堵住的路现在可以通过了。";
  } else if (state.lastEvent === "传送成功") {
    guideText.textContent = "传送点会把你送到另一端，先看看周围的新路线。";
  } else if (state.lastEvent === "走上独木桥") {
    guideText.textContent = "独木桥只能过一次，离开后就会塌掉。";
  } else {
    guideText.textContent = "高亮格可点移动，也可用方向键 / WASD。";
  }

  if (!state.isRunning) {
    hintText.textContent = "卡住时可以点一下，系统会告诉你下一步更适合往哪走。";
  }

  renderBoard(state);
}

function showResult(payload) {
  stopTimer();
  resultEl.hidden = false;
  resultTitle.textContent = `通关成功 ${"⭐".repeat(payload.stars)}`;
  resultText.textContent = `关卡：${payload.levelName} | 步数：${payload.steps} | 时间：${payload.elapsedSeconds} 秒 | 钥匙：${payload.keysCollected}/${payload.keysTotal} | 陷阱：${payload.trapsTriggered} | 机关：${payload.gatesOpened} | 桥塌：${payload.bridgeBroken}`;
  stats.plays += 1;
  stats.wins += 1;
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

function start(levelId = currentLevelId) {
  resultEl.hidden = true;
  game.start(levelId);
  startTimer();
  updateTimer(true);
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

function movePlayer(dx, dy) {
  gameAudio.swipe();
  game.move(dx, dy);
}

function requestHint() {
  const text = game.getHint();
  hintText.textContent = text;
  selectorHint.textContent = text;
  if (settingsState.narrationLevel === "detailed") {
    speak(text);
  }
}

const game = new MazeGame({
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
    const response = await fetch("../../configs/levels/maze-puzzle.levels.json");
    if (!response.ok) {
      throw new Error(`Failed to load levels: ${response.status}`);
    }
    levelsData = await response.json();
  } catch {
    levelsData = FALLBACK_DATA;
    selectorHint.textContent = "迷宫配置加载失败，已使用内置关卡。";
  }

  levelsData.levels = Array.isArray(levelsData?.levels) && levelsData.levels.length > 0 ? levelsData.levels : FALLBACK_DATA.levels;
  currentLevelId = levelsData.levels[0].id;
  loadStats();
  loadSettings();
  applySettingsUi();
  renderLevelButtons();
  renderLevelMeta();
  game.init(levelsData.levels);
}

bindSoftTap(startBtn, () => start());
bindSoftTap(retryBtn, () => start());
bindSoftTap(dailyBtn, () => {
  const day = todayString();
  const hash = hashText(`${day}|maze`);
  const level = levelsData.levels[hash % levelsData.levels.length];
  currentLevelId = level.id;
  renderLevelButtons();
  renderLevelMeta();
  start(level.id);
});

bindSoftTap(moveUpBtn, () => movePlayer(0, -1));
bindSoftTap(moveLeftBtn, () => movePlayer(-1, 0));
bindSoftTap(moveDownBtn, () => movePlayer(0, 1));
bindSoftTap(moveRightBtn, () => movePlayer(1, 0));
bindSoftTap(hintBtn, () => requestHint());

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

levelButtonsEl.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-level-id]");
  if (!button) {
    return;
  }
  event.preventDefault();
  currentLevelId = button.dataset.levelId;
  renderLevelButtons();
  renderLevelMeta();
  selectorHint.textContent = `已选择关卡：${button.textContent}`;
  speak(selectorHint.textContent);
});

mazeBoard.addEventListener("pointerup", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell || !latestState?.isRunning) {
    return;
  }
  event.preventDefault();

  const x = Number(cell.dataset.x);
  const y = Number(cell.dataset.y);
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return;
  }
  if (x === latestState.player.x && y === latestState.player.y) {
    return;
  }

  const dx = x - latestState.player.x;
  const dy = y - latestState.player.y;
  const isAdjacent = Math.abs(dx) + Math.abs(dy) === 1;
  if (!isAdjacent) {
    selectorHint.textContent = "一次只能走一格，请点击角色旁边的高亮格。";
    return;
  }

  const tile = latestState.tiles?.[y]?.[x];
  if (isPathBlocked(tile, latestState.keysHeld)) {
    selectorHint.textContent = getBlockedReason(tile, latestState.keysHeld);
    return;
  }

  game.move(dx, dy);
});

window.addEventListener("keydown", (event) => {
  if (!latestState?.isRunning) {
    return;
  }
  if (["ArrowUp", "w", "W"].includes(event.key)) {
    event.preventDefault();
    movePlayer(0, -1);
  } else if (["ArrowLeft", "a", "A"].includes(event.key)) {
    event.preventDefault();
    movePlayer(-1, 0);
  } else if (["ArrowDown", "s", "S"].includes(event.key)) {
    event.preventDefault();
    movePlayer(0, 1);
  } else if (["ArrowRight", "d", "D"].includes(event.key)) {
    event.preventDefault();
    movePlayer(1, 0);
  }
});

window.addEventListener("beforeunload", () => stopTimer());

bootstrap();