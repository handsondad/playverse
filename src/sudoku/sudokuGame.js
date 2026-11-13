import { createSeededRandom } from "../shared/random.js";

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildTransformedSolution(level, random) {
  const { size, boxRows, boxCols, baseGrid } = level;
  const symbolMap = shuffle(Array.from({ length: size }, (_, i) => i), random);

  const rowBands = shuffle(Array.from({ length: size / boxRows }, (_, b) => b), random);
  const rowOrder = rowBands.flatMap((band) => {
    const rowsInBand = Array.from({ length: boxRows }, (_, r) => band * boxRows + r);
    return shuffle(rowsInBand, random);
  });

  const colStacks = shuffle(Array.from({ length: size / boxCols }, (_, s) => s), random);
  const colOrder = colStacks.flatMap((stack) => {
    const colsInStack = Array.from({ length: boxCols }, (_, c) => stack * boxCols + c);
    return shuffle(colsInStack, random);
  });

  return rowOrder.map((r) => colOrder.map((c) => symbolMap[baseGrid[r][c]]));
}

export class SudokuGame {
  constructor({ onStateChange, onResult } = {}) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.levels = [];
    this.themes = [];
    this.bestScore = 0;
    this.random = Math.random;
    this.state = this.createIdleState();
  }

  createIdleState() {
    return {
      isRunning: false,
      isWin: false,
      levelId: "",
      levelName: "",
      themeId: "",
      themeName: "",
      modeName: "推理闯关",
      seed: "",
      size: 4,
      boxRows: 2,
      boxCols: 2,
      symbols: [],
      cells: [],
      selectedIndex: -1,
      moves: 0,
      conflicts: 0,
      hintsLeft: 0,
      score: 0,
      bestScore: this.bestScore || 0,
      lastFeedback: "选好宫格难度和图案主题，点开始挑战。",
    };
  }

  init(data, bestScore = 0) {
    this.levels = Array.isArray(data?.levels) ? data.levels : [];
    this.themes = Array.isArray(data?.themes) ? data.themes : [];
    this.bestScore = Number(bestScore || 0);
    this.state = this.createIdleState();
    this.emit();
  }

  start(levelId, options = {}) {
    const level = this.levels.find((item) => item.id === levelId) || this.levels[0];
    const theme = this.themes.find((item) => item.id === options.themeId) || this.themes[0];
    if (!level || !theme) {
      return;
    }

    const seed = options.seed || `${Date.now()}|sudoku|${level.id}|${theme.id}`;
    this.random = createSeededRandom(seed);
    const size = level.size;
    const solution = buildTransformedSolution(level, this.random);
    const symbols = theme.symbols.slice(0, size);

    const allIndices = Array.from({ length: size * size }, (_, idx) => idx);
    const blankSet = new Set(shuffle(allIndices, this.random).slice(0, level.blanks));

    const cells = allIndices.map((index) => {
      const row = Math.floor(index / size);
      const col = index % size;
      const box = Math.floor(row / level.boxRows) * (size / level.boxCols) + Math.floor(col / level.boxCols);
      const fixed = !blankSet.has(index);
      return {
        index,
        row,
        col,
        box,
        fixed,
        solution: solution[row][col],
        value: fixed ? solution[row][col] : -1,
        conflict: false,
      };
    });

    const firstBlank = cells.find((c) => !c.fixed)?.index ?? -1;

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      levelId: level.id,
      levelName: level.name,
      themeId: theme.id,
      themeName: theme.name,
      modeName: options.modeName || "推理闯关",
      seed,
      size,
      boxRows: level.boxRows,
      boxCols: level.boxCols,
      symbols,
      cells,
      selectedIndex: firstBlank,
      hintsLeft: Number(level.hints ?? 3),
      bestScore: this.bestScore,
      lastFeedback: "先点一个空格，再点下方的图案填进去。",
    };

    this.recomputeConflicts();
    this.emit();
  }

  selectCell(index) {
    if (!this.state.isRunning) {
      return false;
    }
    const cell = this.state.cells[index];
    if (!cell || cell.fixed) {
      return false;
    }
    this.state.selectedIndex = index;
    this.state.lastFeedback = `已选中第 ${cell.row + 1} 行第 ${cell.col + 1} 列，选一个不重复的图案吧。`;
    this.emit();
    return true;
  }

  recomputeConflicts() {
    const { cells } = this.state;
    let conflictCount = 0;
    for (const cell of cells) {
      if (cell.value < 0) {
        cell.conflict = false;
        continue;
      }
      const clash = cells.some((other) => (
        other.index !== cell.index
        && other.value === cell.value
        && (other.row === cell.row || other.col === cell.col || other.box === cell.box)
      ));
      cell.conflict = clash;
      if (clash) {
        conflictCount += 1;
      }
    }
    this.state.conflicts = conflictCount;
  }

  placeSymbol(symbolIndex) {
    if (!this.state.isRunning) {
      return { ok: false };
    }
    const cell = this.state.cells[this.state.selectedIndex];
    if (!cell || cell.fixed) {
      this.state.lastFeedback = "请先点棋盘上的一个空格子。";
      this.emit();
      return { ok: false };
    }
    const symbol = this.state.symbols[symbolIndex];
    if (!symbol) {
      return { ok: false };
    }

    cell.value = symbolIndex;
    this.state.moves += 1;
    this.recomputeConflicts();

    if (cell.conflict) {
      this.state.lastFeedback = `这一行、列或小宫格里已经有「${symbol.name}」啦，换一个试试看。`;
      this.emit();
      return { ok: true, conflict: true, solved: false };
    }

    const nextBlank = this.state.cells.find((c) => !c.fixed && (c.value < 0 || c.conflict));
    if (nextBlank) {
      this.state.selectedIndex = nextBlank.index;
      this.state.lastFeedback = `放好「${symbol.name}」啦，继续推理下一格吧！`;
      this.emit();
      return { ok: true, conflict: false, solved: false };
    }

    if (this.state.conflicts === 0 && this.state.cells.every((c) => c.value >= 0)) {
      this.finish();
      return { ok: true, conflict: false, solved: true };
    }

    this.emit();
    return { ok: true, conflict: false, solved: false };
  }

  clearSelected() {
    if (!this.state.isRunning) {
      return false;
    }
    const cell = this.state.cells[this.state.selectedIndex];
    if (!cell || cell.fixed || cell.value < 0) {
      return false;
    }
    cell.value = -1;
    this.recomputeConflicts();
    this.state.lastFeedback = "已清空这一格，重新想一想填谁吧。";
    this.emit();
    return true;
  }

  useHint() {
    if (!this.state.isRunning || this.state.hintsLeft <= 0) {
      return "";
    }
    let target = this.state.cells[this.state.selectedIndex];
    if (!target || target.fixed || target.value === target.solution) {
      target = this.state.cells.find((c) => !c.fixed && c.value !== c.solution);
    }
    if (!target) {
      return "";
    }

    this.state.hintsLeft -= 1;
    target.value = target.solution;
    target.fixed = true;
    this.recomputeConflicts();
    const sym = this.state.symbols[target.solution];
    const text = `提示：第 ${target.row + 1} 行第 ${target.col + 1} 列应该放「${sym.name}」。`;
    this.state.lastFeedback = text;

    const nextBlank = this.state.cells.find((c) => !c.fixed && c.value < 0);
    this.state.selectedIndex = nextBlank ? nextBlank.index : -1;

    if (this.state.conflicts === 0 && this.state.cells.every((c) => c.value >= 0)) {
      this.finish();
      return text;
    }

    this.emit();
    return text;
  }

  finish() {
    this.state.isRunning = false;
    this.state.isWin = true;
    const base = this.state.size === 6 ? 160 : 100;
    const hintBonus = this.state.hintsLeft * 12;
    this.state.score = base + hintBonus;
    if (this.state.score > this.bestScore) {
      this.bestScore = this.state.score;
      this.state.bestScore = this.bestScore;
    }
    this.state.lastFeedback = "整张数独棋盘全都填对啦，没有一处重复！";
    this.emit();
    this.onResult?.({
      isWin: true,
      levelName: this.state.levelName,
      themeName: this.state.themeName,
      modeName: this.state.modeName,
      moves: this.state.moves,
      hintsLeft: this.state.hintsLeft,
      score: this.state.score,
      bestScore: this.bestScore,
    });
  }

  emit() {
    this.onStateChange?.({
      ...this.state,
      symbols: this.state.symbols.map((s) => ({ ...s })),
      cells: this.state.cells.map((c) => ({ ...c })),
    });
  }
}
