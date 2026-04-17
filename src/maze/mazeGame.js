function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

function findPoint(grid, symbol) {
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      if (grid[y][x] === symbol) {
        return { x, y };
      }
    }
  }
  return { x: 0, y: 0 };
}

function collectPoints(grid, symbol) {
  const points = [];
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      if (grid[y][x] === symbol) {
        points.push({ x, y });
      }
    }
  }
  return points;
}

export class MazeGame {
  constructor({ onStateChange, onResult, onToast }) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.onToast = onToast;
    this.levels = [];
    this.state = this.createIdleState();
  }

  createIdleState() {
    return {
      isRunning: false,
      isWin: false,
      levelId: "",
      levelName: "",
      stepGoal: 0,
      timeLimit: 0,
      tip: "",
      tiles: [],
      width: 0,
      height: 0,
      player: { x: 0, y: 0 },
      exit: { x: 0, y: 0 },
      steps: 0,
      elapsedSeconds: 0,
      keysHeld: 0,
      keysCollected: 0,
      keysTotal: 0,
      trapsTriggered: 0,
      gatesOpened: 0,
      hintsUsed: 0,
      switchActive: false,
      portals: [],
      bridgeTiles: [],
      bridgeBroken: 0,
      standingOnBridge: false,
      lastEvent: "",
    };
  }

  init(levels) {
    this.levels = Array.isArray(levels) ? levels : [];
    this.state = this.createIdleState();
    this.emit();
  }

  start(levelId) {
    const level = this.levels.find((item) => item.id === levelId) || this.levels[0];
    if (!level) {
      return;
    }

    const tiles = cloneGrid(level.grid || []);
    const start = findPoint(tiles, "S");
    const exit = findPoint(tiles, "E");
    const keysTotal = tiles.flat().filter((cell) => cell === "K").length;
    const portals = collectPoints(tiles, "W");
    const bridgeTiles = collectPoints(tiles, "B");

    tiles[start.y][start.x] = ".";

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      levelId: level.id,
      levelName: level.name,
      stepGoal: Number(level.stepGoal || 0),
      timeLimit: Number(level.timeLimit || 0),
      tip: level.tip || "",
      tiles,
      width: tiles[0]?.length || 0,
      height: tiles.length,
      player: start,
      exit,
      keysTotal,
      portals,
      bridgeTiles,
      lastEvent: "准备出发",
    };
    this.emit();
  }

  updateElapsed(seconds) {
    if (!this.state.isRunning) {
      return;
    }
    this.state.elapsedSeconds = Math.max(0, Number(seconds || 0));
    this.emit();
  }

  isInside(x, y) {
    return y >= 0 && y < this.state.height && x >= 0 && x < this.state.width;
  }

  isBlockedTile(tile) {
    return tile === "#" || tile === "X";
  }

  breakBridgeIfNeeded(fromX, fromY) {
    if (!this.state.standingOnBridge) {
      return;
    }
    if (this.state.tiles[fromY]?.[fromX] !== "B") {
      return;
    }
    this.state.tiles[fromY][fromX] = "#";
    this.state.bridgeBroken += 1;
    this.state.standingOnBridge = false;
  }

  activateSwitch() {
    let opened = 0;
    for (let y = 0; y < this.state.tiles.length; y += 1) {
      for (let x = 0; x < this.state.tiles[y].length; x += 1) {
        if (this.state.tiles[y][x] === "X") {
          this.state.tiles[y][x] = ".";
          opened += 1;
        }
      }
    }
    this.state.switchActive = true;
    this.state.gatesOpened += opened;
    this.state.lastEvent = "机关启动";
    this.onToast?.("机关启动了，隐藏通路已经打开。");
  }

  getPortalTarget(x, y) {
    if (this.state.portals.length < 2) {
      return null;
    }
    return this.state.portals.find((point) => point.x !== x || point.y !== y) || null;
  }

  getHint() {
    const player = this.state.player;
    const tiles = this.state.tiles;
    const deltas = [
      { dx: 0, dy: -1, label: "向上" },
      { dx: -1, dy: 0, label: "向左" },
      { dx: 0, dy: 1, label: "向下" },
      { dx: 1, dy: 0, label: "向右" },
    ];
    const keyTarget = collectPoints(tiles, "K")[0];
    const switchTarget = !this.state.switchActive ? collectPoints(tiles, "P")[0] : null;
    const doorTarget = collectPoints(tiles, "D")[0];
    let target = this.state.exit;

    if (keyTarget && this.state.keysHeld <= 0 && doorTarget) {
      target = keyTarget;
    } else if (switchTarget) {
      target = switchTarget;
    }

    let best = null;
    for (const delta of deltas) {
      const nextX = player.x + delta.dx;
      const nextY = player.y + delta.dy;
      if (!this.isInside(nextX, nextY)) {
        continue;
      }
      const tile = tiles[nextY][nextX];
      if (this.isBlockedTile(tile)) {
        continue;
      }
      if (tile === "D" && this.state.keysHeld <= 0) {
        continue;
      }
      const distance = Math.abs(target.x - nextX) + Math.abs(target.y - nextY);
      if (!best || distance < best.distance) {
        best = { ...delta, distance };
      }
    }

    this.state.hintsUsed += 1;
    if (!best) {
      return "周围都被挡住了，先试着退一步再找新路。";
    }

    if (target === keyTarget) {
      return `提示：先${best.label}，去拿最近的钥匙。`;
    }
    if (target === switchTarget) {
      return `提示：先${best.label}，去踩亮机关。`;
    }
    return `提示：先${best.label}，继续朝出口方向探索。`;
  }

  move(dx, dy) {
    if (!this.state.isRunning) {
      return;
    }

    const nextX = this.state.player.x + dx;
    const nextY = this.state.player.y + dy;
    if (!this.isInside(nextX, nextY)) {
      return;
    }

    const tile = this.state.tiles[nextY][nextX];
    if (this.isBlockedTile(tile)) {
      this.onToast?.("前面是墙，需要换一条路。");
      return;
    }

    if (tile === "D") {
      if (this.state.keysHeld <= 0) {
        this.onToast?.("这扇门还锁着，先去找钥匙。");
        return;
      }
      this.state.keysHeld -= 1;
      this.state.tiles[nextY][nextX] = ".";
      this.state.lastEvent = "开门成功";
      this.onToast?.("门打开了，继续前进。");
    }

    const previous = { ...this.state.player };
    this.breakBridgeIfNeeded(previous.x, previous.y);
    this.state.player = { x: nextX, y: nextY };
    this.state.steps += 1;
    this.state.standingOnBridge = tile === "B";

    const currentTile = this.state.tiles[nextY][nextX];
    if (currentTile === "K") {
      this.state.keysHeld += 1;
      this.state.keysCollected += 1;
      this.state.tiles[nextY][nextX] = ".";
      this.state.lastEvent = "拿到钥匙";
      this.onToast?.("拿到钥匙啦，可以打开一扇门。");
    } else if (currentTile === "T") {
      this.state.trapsTriggered += 1;
      this.state.lastEvent = "踩到陷阱";
      this.onToast?.("踩到陷阱了，慢一点更安全。");
    } else if (currentTile === "P") {
      if (!this.state.switchActive) {
        this.activateSwitch();
      }
    } else if (currentTile === "W") {
      const target = this.getPortalTarget(nextX, nextY);
      if (target) {
        this.state.player = { ...target };
        this.state.lastEvent = "传送成功";
        this.onToast?.("传送点启动了，位置发生了变化。");
      }
    } else if (currentTile === "B") {
      this.state.lastEvent = "走上独木桥";
      this.onToast?.("这座桥只能走一次，回头就会塌掉。");
    } else {
      this.state.lastEvent = "继续探索";
    }

    if (this.state.player.x === this.state.exit.x && this.state.player.y === this.state.exit.y) {
      this.finish();
      return;
    }

    this.emit();
  }

  finish() {
    this.state.isRunning = false;
    this.state.isWin = true;
    this.state.lastEvent = "找到出口";
    this.emit();
    this.onResult?.({
      levelId: this.state.levelId,
      levelName: this.state.levelName,
      steps: this.state.steps,
      elapsedSeconds: this.state.elapsedSeconds,
      stepGoal: this.state.stepGoal,
      timeLimit: this.state.timeLimit,
      keysCollected: this.state.keysCollected,
      keysTotal: this.state.keysTotal,
      trapsTriggered: this.state.trapsTriggered,
      gatesOpened: this.state.gatesOpened,
      bridgeBroken: this.state.bridgeBroken,
      hintsUsed: this.state.hintsUsed,
      stars: this.getStars(),
    });
  }

  getStars() {
    let stars = 1;
    if (this.state.steps <= this.state.stepGoal && this.state.stepGoal > 0) {
      stars += 1;
    }
    if (this.state.elapsedSeconds <= this.state.timeLimit && this.state.timeLimit > 0) {
      stars += 1;
    }
    return stars;
  }

  emit() {
    this.onStateChange?.({
      ...this.state,
      player: { ...this.state.player },
      exit: { ...this.state.exit },
      tiles: this.state.tiles.map((row) => [...row]),
    });
  }
}