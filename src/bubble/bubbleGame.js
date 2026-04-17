const COLOR_IDS = ["red", "blue", "green", "yellow", "purple", "cyan"];
const SPECIAL_NONE = "none";
const SPECIAL_BOMB = "bomb";
const SPECIAL_RAINBOW = "rainbow";
const SPECIAL_FREEZE = "freeze";

function createCell(color, special = SPECIAL_NONE) {
  return { color, special };
}

function cloneCell(cell) {
  if (typeof cell === "string") {
    return createCell(cell);
  }
  return createCell(cell?.color || "", cell?.special || SPECIAL_NONE);
}

function hashSeed(seedText) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedText) {
  let state = hashSeed(seedText || "bubble-default-seed") || 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function keyOf(x, y) {
  return `${x},${y}`;
}

export class BubbleGame {
  constructor({ onStateChange, onResult, onToast }) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.onToast = onToast;
    this.levels = [];
    this.timerId = 0;
    this.effectId = 0;
    this.random = Math.random;
    this.state = this.createIdleState();
  }

  createIdleState() {
    return {
      isRunning: false,
      isWin: false,
      levelId: "",
      levelName: "",
      seed: "",
      width: 0,
      height: 0,
      colorCount: 4,
      score: 0,
      targetScore: 0,
      timeLeft: 0,
      combo: 0,
      bestCombo: 0,
      bestScore: 0,
      clearedCount: 0,
      grid: [],
      activePath: [],
      hintCells: [],
      clearEffect: null,
      lastEvent: "",
    };
  }

  init(levels, bestScore = 0) {
    this.levels = Array.isArray(levels) ? levels : [];
    this.state = {
      ...this.createIdleState(),
      bestScore: Number(bestScore || 0),
    };
    this.emit();
  }

  stopTimer() {
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = 0;
    }
  }

  start(levelId, options = {}) {
    const level = this.levels.find((item) => item.id === levelId) || this.levels[0];
    if (!level) {
      return;
    }

    this.stopTimer();
    const seed = options.seed || `${Date.now()}|${level.id}`;
    this.random = createSeededRandom(seed);

    const width = Number(level.width || 7);
    const height = Number(level.height || 7);
    const colorCount = Math.max(3, Math.min(COLOR_IDS.length, Number(level.colorCount || 4)));
    const grid = this.makeGrid(width, height, colorCount);

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      levelId: level.id,
      levelName: level.name || level.id,
      seed,
      width,
      height,
      colorCount,
      targetScore: Number(level.targetScore || 200),
      timeLeft: Number(level.timeLimitSec || 90),
      bestScore: this.state.bestScore,
      grid,
      lastEvent: "准备连线",
    };

    this.emit();
    this.timerId = window.setInterval(() => this.tick(), 100);
  }

  tick() {
    if (!this.state.isRunning) {
      return;
    }

    this.state.timeLeft = Math.max(0, this.state.timeLeft - 0.1);
    if (this.state.timeLeft <= 0) {
      this.finish(false);
      return;
    }
    this.emit();
  }

  isInside(x, y) {
    return x >= 0 && x < this.state.width && y >= 0 && y < this.state.height;
  }

  getCell(x, y) {
    if (!this.isInside(x, y)) {
      return createCell("");
    }
    return cloneCell(this.state.grid[y][x]);
  }

  getColor(x, y) {
    return this.getCell(x, y).color;
  }

  getSpecial(x, y) {
    return this.getCell(x, y).special;
  }

  makeGrid(width, height, colorCount) {
    const grid = [];
    for (let y = 0; y < height; y += 1) {
      const row = [];
      for (let x = 0; x < width; x += 1) {
        row.push(this.makeRandomCell(colorCount));
      }
      grid.push(row);
    }
    return grid;
  }

  makeRandomCell(colorCount) {
    const palette = COLOR_IDS.slice(0, colorCount);
    const color = palette[Math.floor(this.random() * palette.length)];
    const roll = this.random();
    if (roll < 0.035) {
      return createCell(color, SPECIAL_RAINBOW);
    }
    if (roll < 0.085) {
      return createCell(color, SPECIAL_BOMB);
    }
    if (roll < 0.135) {
      return createCell(color, SPECIAL_FREEZE);
    }
    return createCell(color, SPECIAL_NONE);
  }

  getPathColor(path) {
    for (const point of path) {
      const cell = this.getCell(point.x, point.y);
      if (cell.special !== SPECIAL_RAINBOW && cell.color) {
        return cell.color;
      }
    }
    return "";
  }

  canMatchCell(cell, requiredColor) {
    if (!cell.color) {
      return false;
    }
    if (!requiredColor) {
      return true;
    }
    return cell.special === SPECIAL_RAINBOW || cell.color === requiredColor;
  }

  cellsCanLink(cellA, cellB) {
    if (!cellA.color || !cellB.color) {
      return false;
    }
    return cellA.special === SPECIAL_RAINBOW || cellB.special === SPECIAL_RAINBOW || cellA.color === cellB.color;
  }

  clearPath() {
    this.state.activePath = [];
  }

  beginPath(x, y) {
    if (!this.state.isRunning || !this.isInside(x, y)) {
      return;
    }
    const color = this.getColor(x, y);
    if (!color) {
      return;
    }

    this.state.activePath = [{ x, y }];
    this.state.hintCells = [];
    this.state.lastEvent = "开始连线";
    this.emit();
  }

  extendPath(x, y) {
    if (!this.state.isRunning || !this.isInside(x, y) || this.state.activePath.length === 0) {
      return;
    }

    const cell = this.getCell(x, y);
    const path = this.state.activePath;
    const head = path[path.length - 1];
    const requiredColor = this.getPathColor(path);

    if (!this.canMatchCell(cell, requiredColor)) {
      return;
    }

    const existsIndex = path.findIndex((point) => point.x === x && point.y === y);
    if (existsIndex !== -1) {
      if (path.length >= 2) {
        const secondLast = path[path.length - 2];
        if (secondLast.x === x && secondLast.y === y) {
          path.pop();
          this.emit();
        }
      }
      return;
    }

    const isAdjacent = Math.abs(head.x - x) + Math.abs(head.y - y) === 1;
    if (!isAdjacent) {
      return;
    }

    path.push({ x, y });
    this.emit();
  }

  releasePath() {
    if (!this.state.isRunning) {
      return;
    }

    const path = this.state.activePath;
    if (path.length < 2) {
      this.clearPath();
      this.state.combo = 0;
      this.state.lastEvent = "至少连两个";
      this.emit();
      return;
    }

    const selected = new Set(path.map((point) => keyOf(point.x, point.y)));
    const pathColor = this.getPathColor(path);
    let bonusScore = 0;
    let bonusTime = 0;
    const specials = [];

    for (const point of path) {
      const cell = this.getCell(point.x, point.y);
      if (cell.special === SPECIAL_BOMB) {
        specials.push("炸弹");
        bonusScore += 10;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = point.x + dx;
            const ny = point.y + dy;
            if (this.isInside(nx, ny)) {
              selected.add(keyOf(nx, ny));
            }
          }
        }
      } else if (cell.special === SPECIAL_FREEZE) {
        specials.push("冻结");
        bonusScore += 6;
        bonusTime += 6;
      } else if (cell.special === SPECIAL_RAINBOW && pathColor) {
        specials.push("彩虹");
        bonusScore += 12;
        for (let y = 0; y < this.state.height; y += 1) {
          for (let x = 0; x < this.state.width; x += 1) {
            if (this.getColor(x, y) === pathColor) {
              selected.add(keyOf(x, y));
            }
          }
        }
      }
    }

    for (const key of selected) {
      const [xText, yText] = key.split(",");
      const x = Number(xText);
      const y = Number(yText);
      this.state.grid[y][x] = createCell("");
    }

    this.collapseGrid();

    const cleared = selected.size;
    const uniqueSpecials = Array.from(new Set(specials));
    this.state.clearedCount += cleared;
    this.state.combo += 1;
    this.state.bestCombo = Math.max(this.state.bestCombo, this.state.combo);
    this.state.score += cleared * cleared + this.state.combo * 3 + bonusScore;
    this.state.timeLeft += bonusTime;
    this.state.lastEvent = specials.length > 0 ? `触发${uniqueSpecials.join("+")}，消除 ${cleared} 个` : `消除 ${cleared} 个`;
    this.state.clearEffect = {
      id: ++this.effectId,
      cells: Array.from(selected).map((key) => {
        const [xText, yText] = key.split(",");
        return { x: Number(xText), y: Number(yText) };
      }),
      label: `${specials.length > 0 ? `${uniqueSpecials.join("+")} ` : ""}+${cleared * cleared + this.state.combo * 3 + bonusScore}`,
    };
    this.clearPath();
    this.state.hintCells = [];

    if (specials.length > 0) {
      this.onToast?.(this.state.lastEvent + (bonusTime > 0 ? `，额外加时 ${bonusTime} 秒。` : "。"));
    }

    if (!this.hasPossiblePair()) {
      this.reshuffle();
      this.onToast?.("没有可连泡泡了，已自动重排棋盘。");
    }

    if (this.state.score >= this.state.targetScore) {
      this.finish(true);
      return;
    }

    this.emit();
  }

  collapseGrid() {
    for (let x = 0; x < this.state.width; x += 1) {
      const stack = [];
      for (let y = this.state.height - 1; y >= 0; y -= 1) {
        const cell = cloneCell(this.state.grid[y][x]);
        if (cell.color) {
          stack.push(cell);
        }
      }
      for (let y = this.state.height - 1; y >= 0; y -= 1) {
        if (stack.length > 0) {
          this.state.grid[y][x] = stack.shift();
        } else {
          this.state.grid[y][x] = this.makeRandomCell(this.state.colorCount);
        }
      }
    }
  }

  hasPossiblePair() {
    for (let y = 0; y < this.state.height; y += 1) {
      for (let x = 0; x < this.state.width; x += 1) {
        const cell = this.getCell(x, y);
        if (!cell.color) {
          continue;
        }
        if (x + 1 < this.state.width && this.cellsCanLink(cell, this.getCell(x + 1, y))) {
          return true;
        }
        if (y + 1 < this.state.height && this.cellsCanLink(cell, this.getCell(x, y + 1))) {
          return true;
        }
      }
    }
    return false;
  }

  reshuffle() {
    this.state.grid = this.makeGrid(this.state.width, this.state.height, this.state.colorCount);
    this.state.combo = 0;
    this.state.hintCells = [];
    this.clearPath();
  }

  requestHint() {
    if (!this.state.isRunning) {
      return [];
    }

    for (let y = 0; y < this.state.height; y += 1) {
      for (let x = 0; x < this.state.width; x += 1) {
        const cell = this.getCell(x, y);
        if (!cell.color) {
          continue;
        }
        if (x + 1 < this.state.width && this.cellsCanLink(cell, this.getCell(x + 1, y))) {
          this.state.hintCells = [{ x, y }, { x: x + 1, y }];
          this.emit();
          return this.state.hintCells;
        }
        if (y + 1 < this.state.height && this.cellsCanLink(cell, this.getCell(x, y + 1))) {
          this.state.hintCells = [{ x, y }, { x, y: y + 1 }];
          this.emit();
          return this.state.hintCells;
        }
      }
    }

    this.state.hintCells = [];
    this.emit();
    return [];
  }

  finish(isWin) {
    this.stopTimer();
    this.state.isRunning = false;
    this.state.isWin = isWin;
    this.clearPath();

    const finalScore = Math.max(0, Math.round(this.state.score));
    this.state.score = finalScore;
    this.state.bestScore = Math.max(this.state.bestScore, finalScore);

    this.emit();

    this.onResult?.({
      isWin,
      levelId: this.state.levelId,
      levelName: this.state.levelName,
      score: finalScore,
      targetScore: this.state.targetScore,
      timeUsed: Math.max(0, Math.round((this.levels.find((item) => item.id === this.state.levelId)?.timeLimitSec || 0) - this.state.timeLeft)),
      bestCombo: this.state.bestCombo,
      clearedCount: this.state.clearedCount,
      seed: this.state.seed,
    });
  }

  emit() {
    this.onStateChange?.({
      ...this.state,
      grid: this.state.grid.map((row) => row.map((cell) => cloneCell(cell))),
      activePath: this.state.activePath.map((item) => ({ ...item })),
      hintCells: this.state.hintCells.map((item) => ({ ...item })),
    });
  }
}
