import { SudokuGame } from "./sudokuGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";
import { loadSettings } from "../shared/settings.js";
import { mountSettingsButtons, speakSettingChanges } from "../shared/settingsButtons.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { bindDelegatedTap, createSoftTap } from "../shared/tap.js";
import { hashText, todayString } from "../shared/random.js";
import { readNumber, readNumbers, writeJson, writeValue } from "../shared/storage.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { setHtml, setText } from "../shared/dom.js";

const SETTINGS_KEY = "sudoku-settings";
const STATS_KEY = "sudoku-stats";
const BEST_KEY = "sudoku-best-score";

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const eraseBtn = document.querySelector("#eraseBtn");
const hintBtn = document.querySelector("#hintBtn");

const levelButtonsEl = document.querySelector("#levelButtons");
const themeButtonsEl = document.querySelector("#themeButtons");
const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");
const feedbackText = document.querySelector("#feedbackText");
const sudokuBoard = document.querySelector("#sudokuBoard");
const symbolPalette = document.querySelector("#symbolPalette");

const blanksValue = document.querySelector("#blanksValue");
const movesValue = document.querySelector("#movesValue");
const conflictsValue = document.querySelector("#conflictsValue");
const hintsValue = document.querySelector("#hintsValue");
const bestValue = document.querySelector("#bestValue");

const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

const settingsState = loadSettings(SETTINGS_KEY);
const speak = createSpeaker(settingsState, SPEECH_PRESETS.guide);
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });
const bindSoftTap = createSoftTap({ flashMs: 70 });
const stats = readNumbers(STATS_KEY, { plays: 0, wins: 0 });

let levelsData = null;
let currentLevelId = "easy";
let currentThemeId = "animals";
let latestState = null;

function getLevelById(id) {
  return levelsData.levels.find((item) => item.id === id) || levelsData.levels[0];
}

function getThemeById(id) {
  return levelsData.themes.find((item) => item.id === id) || levelsData.themes[0];
}

function renderSelectors() {
  setHtml(levelButtonsEl, levelsData.levels.map((level) => {
    const cls = level.id === currentLevelId ? "level-btn is-active" : "level-btn";
    return `<button type="button" class="${cls}" data-level-id="${level.id}">${level.name}</button>`;
  }).join(""));

  setHtml(themeButtonsEl, levelsData.themes.map((theme) => {
    const cls = theme.id === currentThemeId ? "theme-btn is-active" : "theme-btn";
    return `<button type="button" class="${cls}" data-theme-id="${theme.id}">${theme.emoji} ${theme.name}</button>`;
  }).join(""));
}

function renderBoard(state) {
  sudokuBoard.style.setProperty("--size", String(state.size || 4));
  if (!state.cells.length) {
    setHtml(sudokuBoard, "");
    setHtml(symbolPalette, "");
    return;
  }

  setHtml(sudokuBoard, state.cells.map((cell) => {
    const boxRow = Math.floor(cell.row / state.boxRows);
    const boxCol = Math.floor(cell.col / state.boxCols);
    const isAltBox = (boxRow + boxCol) % 2 === 1;
    const sym = cell.value >= 0 ? state.symbols[cell.value] : null;
    const classes = [
      "sudoku-cell",
      isAltBox ? "box-alt" : "",
      cell.fixed ? "is-fixed" : "is-editable",
      cell.index === state.selectedIndex ? "is-selected" : "",
      cell.conflict ? "has-conflict" : "",
    ].filter(Boolean).join(" ");
    const label = `第${cell.row + 1}行第${cell.col + 1}列，${sym ? sym.name : "空格"}`;
    return `<button type="button" class="${classes}" data-cell-index="${cell.index}" aria-label="${label}" ${cell.fixed || !state.isRunning ? "disabled" : ""}>${sym ? sym.icon : ""}</button>`;
  }).join(""));

  setHtml(symbolPalette, state.symbols.map((sym, idx) => `
    <button type="button" class="palette-btn" data-symbol-index="${idx}" style="background:${sym.color};" ${state.isRunning ? "" : "disabled"}>
      <span class="emoji">${sym.icon}</span>
      <span class="name">${sym.name}</span>
    </button>
  `).join(""));
}

function updateUi(state) {
  latestState = state;
  const blanks = state.cells.filter((c) => c.value < 0).length;
  blanksValue.textContent = String(blanks);
  movesValue.textContent = String(state.moves);
  conflictsValue.textContent = String(state.conflicts);
  hintsValue.textContent = String(state.hintsLeft);
  bestValue.textContent = String(state.bestScore);

  eraseBtn.disabled = !state.isRunning || state.selectedIndex < 0;
  hintBtn.disabled = !state.isRunning || state.hintsLeft <= 0;
  retryBtn.disabled = !state.levelId;

  setText(feedbackText, state.lastFeedback);
  setText(guideText, state.isRunning
    ? `当前：${state.levelName} · ${state.themeName}，还剩 ${blanks} 个空格。`
    : "让每一行、每一列和每个小宫格里的图案都不重复。");

  renderBoard(state);
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = "数独小侦探解开谜题 ⭐";
  resultText.textContent = `难度：${payload.levelName} | 主题：${payload.themeName} | 步数：${payload.moves} | 分数：${payload.score}`;
  gameAudio.win();

  stats.plays += 1;
  stats.wins += 1;
  writeJson(STATS_KEY, stats);

  if (payload.bestScore > readNumber(BEST_KEY)) {
    writeValue(BEST_KEY, payload.bestScore);
  }
  speak("太聪明啦，整张图形数独都被你推理出来啦！");
}

const game = new SudokuGame({
  onStateChange: updateUi,
  onResult: showResult,
});

function startGame(options = {}) {
  if (!levelsData) {
    return;
  }
  resultEl.hidden = true;
  const level = getLevelById(options.levelId || currentLevelId);
  const theme = getThemeById(options.themeId || currentThemeId);
  selectorHint.textContent = level.tip;
  game.start(level.id, {
    themeId: theme.id,
    modeName: options.modeName || "推理闯关",
    seed: options.seed,
  });
  speak("看看每行每列缺了谁，点空格再选图案填进去。");
}

bindUiTapSounds(document.body, gameAudio);

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(dailyBtn, () => {
  if (!levelsData) {
    return;
  }
  const day = todayString();
  const hash = hashText(`${day}|sudoku`);
  const level = levelsData.levels[hash % levelsData.levels.length];
  const theme = levelsData.themes[Math.floor(hash / 5) % levelsData.themes.length];
  currentLevelId = level.id;
  currentThemeId = theme.id;
  renderSelectors();
  startGame({
    levelId: level.id,
    themeId: theme.id,
    modeName: `今日数独 ${day}`,
    seed: `${day}|${level.id}|${theme.id}|sudoku`,
  });
});

bindSoftTap(eraseBtn, () => {
  if (game.clearSelected()) {
    gameAudio.place(320);
  }
});

bindSoftTap(hintBtn, () => {
  const text = game.useHint();
  if (text) {
    gameAudio.sparkle();
    speak(text);
  }
});

mountSettingsButtons({
  storageKey: SETTINGS_KEY,
  settings: settingsState,
  bindTap: bindSoftTap,
  announce: speakSettingChanges(speak, guideText),
});

bindDelegatedTap(levelButtonsEl, "[data-level-id]", (button) => {
  currentLevelId = button.dataset.levelId;
  renderSelectors();
  selectorHint.textContent = getLevelById(currentLevelId).tip;
});

bindDelegatedTap(themeButtonsEl, "[data-theme-id]", (button) => {
  currentThemeId = button.dataset.themeId;
  renderSelectors();
  selectorHint.textContent = `已切换图案：${getThemeById(currentThemeId).name}`;
});

bindDelegatedTap(sudokuBoard, "[data-cell-index]", (button) => {
  game.selectCell(Number(button.dataset.cellIndex));
});

bindDelegatedTap(symbolPalette, "[data-symbol-index]", (button) => {
  const outcome = game.placeSymbol(Number(button.dataset.symbolIndex));
  if (!outcome.ok) {
    return;
  }
  if (outcome.conflict) {
    gameAudio.wrong();
    speak(latestState.lastFeedback);
  } else if (!outcome.solved) {
    gameAudio.pickup(640);
  }
});

async function bootstrap() {
  try {
    levelsData = await loadGameConfig("../../configs/levels/mini-sudoku.levels.json", ["levels", "themes"]);
  } catch (error) {
    showConfigError(error);
    return;
  }
  currentLevelId = levelsData.levels[0].id;
  currentThemeId = levelsData.themes[0].id;
  renderSelectors();
  selectorHint.textContent = levelsData.levels[0].tip;
  game.init(levelsData, readNumber(BEST_KEY));
}

bootstrap();
