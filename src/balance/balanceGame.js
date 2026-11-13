import { createSeededRandom } from "../shared/random.js";

export class BalanceGame {
  constructor({ onStateChange, onResult } = {}) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.levels = [];
    this.leftLoads = [];
    this.bestScore = 0;
    this.random = Math.random;
    this.nextPieceId = 1;
    this.state = this.createIdleState();
  }

  createIdleState() {
    return {
      isRunning: false,
      levelId: "",
      levelName: "",
      modeName: "平衡挑战",
      seed: "",
      roundIndex: 0,
      targetRounds: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      adjustCount: 0,
      hintsLeft: 0,
      bestScore: this.bestScore || 0,
      leftItems: [],
      rightItems: [],
      leftTotal: 0,
      rightTotal: 0,
      maxPanItems: 6,
      weights: [],
      tiltDeg: 0,
      balanced: false,
      lastFeedback: "选好难度，点开始往天平上放砝码吧。",
    };
  }

  init(data, bestScore = 0) {
    this.levels = Array.isArray(data?.levels) ? data.levels : [];
    this.leftLoads = Array.isArray(data?.leftLoads) ? data.leftLoads : [];
    this.bestScore = Number(bestScore || 0);
    this.state = this.createIdleState();
    this.emit();
  }

  start(levelId, options = {}) {
    const level = this.levels.find((item) => item.id === levelId) || this.levels[0];
    if (!level) {
      return;
    }

    const seed = options.seed || `${Date.now()}|balance|${level.id}`;
    this.random = createSeededRandom(seed);
    this.currentLevel = level;
    this.lastTarget = -1;

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      levelId: level.id,
      levelName: level.name,
      modeName: options.modeName || "平衡挑战",
      seed,
      targetRounds: level.targetRounds,
      maxPanItems: level.maxPanItems,
      weights: level.weights.map((w) => ({ ...w })),
      hintsLeft: Number(level.hints ?? 3),
      bestScore: this.bestScore,
    };

    this.buildRound();
  }

  buildRound() {
    const lv = this.currentLevel;
    let target = lv.minTarget;
    for (let tries = 0; tries < 10; tries += 1) {
      target = lv.minTarget + Math.floor(this.random() * (lv.maxTarget - lv.minTarget + 1));
      if (target !== this.lastTarget) {
        break;
      }
    }
    this.lastTarget = target;

    let leftItems;
    if (lv.id === "easy") {
      leftItems = Array.from({ length: target }, (_, i) => ({
        uid: `L-${i}`,
        icon: "🍎",
        label: "1",
        weight: 1,
      }));
    } else {
      const load = this.leftLoads[Math.floor(this.random() * this.leftLoads.length)]
        || { icon: "🎁", name: "礼盒" };
      if (target >= 8 && this.random() < 0.5) {
        const partA = Math.floor(target / 2);
        const partB = target - partA;
        leftItems = [
          { uid: "L-1", icon: load.icon, label: `${partA}`, weight: partA },
          { uid: "L-2", icon: "🍉", label: `${partB}`, weight: partB },
        ];
      } else {
        leftItems = [{ uid: "L-1", icon: load.icon, label: `${target}`, weight: target }];
      }
    }

    const rightItems = [];
    if (lv.preRightMax > 0) {
      const preWeight = 1 + Math.floor(this.random() * Math.min(lv.preRightMax, target - 2));
      rightItems.push({
        uid: "R-fixed",
        icon: "🧱",
        name: `${preWeight}克底座`,
        weight: preWeight,
        fixed: true,
      });
    }

    this.state.leftItems = leftItems;
    this.state.rightItems = rightItems;
    this.state.balanced = false;
    this.recomputeScale();
    const need = this.state.leftTotal - this.state.rightTotal;
    this.state.lastFeedback = rightItems.length > 0
      ? `左盘总重 ${this.state.leftTotal}，右盘已有 ${this.state.rightTotal}，还要加多少才平衡呢？`
      : `左盘总重 ${need}，点下方砝码放进右盘，让天平变平吧！`;
    this.emit();
  }

  recomputeScale() {
    const leftTotal = this.state.leftItems.reduce((sum, item) => sum + item.weight, 0);
    const rightTotal = this.state.rightItems.reduce((sum, item) => sum + item.weight, 0);
    this.state.leftTotal = leftTotal;
    this.state.rightTotal = rightTotal;
    const diff = rightTotal - leftTotal;
    if (diff === 0) {
      this.state.tiltDeg = 0;
    } else {
      const mag = Math.min(12, 4 + Math.abs(diff) * 1.4);
      this.state.tiltDeg = diff > 0 ? mag : -mag;
    }
  }

  addWeight(weightId) {
    if (!this.state.isRunning || this.state.balanced) {
      return { ok: false };
    }
    const weightObj = this.state.weights.find((item) => item.id === weightId);
    if (!weightObj) {
      return { ok: false };
    }
    if (this.state.rightItems.length >= this.state.maxPanItems) {
      this.state.lastFeedback = "右盘放得满满啦，点右盘上的砝码可以拿下来换大号砝码哦。";
      this.emit();
      return { ok: false, full: true };
    }

    this.nextPieceId += 1;
    this.state.rightItems = [
      ...this.state.rightItems,
      {
        uid: `R-${this.nextPieceId}`,
        icon: weightObj.icon,
        name: weightObj.name,
        weight: weightObj.weight,
        fixed: false,
      },
    ];
    this.state.adjustCount += 1;
    this.recomputeScale();

    return this.evaluateAfterChange();
  }

  removeRightItem(uid) {
    if (!this.state.isRunning || this.state.balanced) {
      return { ok: false };
    }
    const target = this.state.rightItems.find((item) => item.uid === uid);
    if (!target || target.fixed) {
      return { ok: false };
    }
    this.state.rightItems = this.state.rightItems.filter((item) => item.uid !== uid);
    this.recomputeScale();
    return this.evaluateAfterChange();
  }

  clearRightPan() {
    if (!this.state.isRunning || this.state.balanced) {
      return false;
    }
    this.state.rightItems = this.state.rightItems.filter((item) => item.fixed);
    this.recomputeScale();
    this.state.lastFeedback = "已拿掉活动砝码，重新搭配试试吧。";
    this.emit();
    return true;
  }

  evaluateAfterChange() {
    const diff = this.state.rightTotal - this.state.leftTotal;
    if (diff < 0) {
      this.state.lastFeedback = `左边是 ${this.state.leftTotal}，右边现在是 ${this.state.rightTotal}，右边再加一点！`;
      this.emit();
      return { ok: true, balanced: false, over: false };
    }

    if (diff > 0) {
      this.state.streak = 0;
      this.state.lastFeedback = `右边变成 ${this.state.rightTotal} 太重沉下去啦！点右盘里的砝码拿掉一点吧。`;
      this.emit();
      return { ok: true, balanced: false, over: true };
    }

    this.state.balanced = true;
    this.state.streak += 1;
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak);
    this.state.score += 18 + Math.min(12, this.state.streak * 2);
    this.state.roundIndex += 1;
    this.state.lastFeedback = `刚刚好！左右两边都是 ${this.state.leftTotal}，天平稳稳平衡啦！`;

    if (this.state.score > this.bestScore) {
      this.bestScore = this.state.score;
      this.state.bestScore = this.bestScore;
    }

    this.emit();
    return {
      ok: true,
      balanced: true,
      finished: this.state.roundIndex >= this.state.targetRounds,
    };
  }

  useHint() {
    if (!this.state.isRunning || this.state.balanced || this.state.hintsLeft <= 0) {
      return "";
    }
    this.state.hintsLeft -= 1;
    const diff = this.state.leftTotal - this.state.rightTotal;
    let text;
    if (diff > 0) {
      const bestFit = [...this.state.weights]
        .sort((a, b) => b.weight - a.weight)
        .find((w) => w.weight <= diff) || this.state.weights[0];
      text = `提示：右边还差 ${diff}，可以先放一个「${bestFit.name}（+${bestFit.weight}）」试试！`;
    } else {
      text = `提示：右边多了 ${Math.abs(diff)}，点右盘拿掉 ${Math.abs(diff)} 就平衡啦！`;
    }
    this.state.lastFeedback = text;
    this.emit();
    return text;
  }

  nextRound() {
    if (!this.state.isRunning) {
      return;
    }
    if (this.state.roundIndex >= this.state.targetRounds) {
      this.finish();
      return;
    }
    this.buildRound();
  }

  finish() {
    this.state.isRunning = false;
    this.emit();
    this.onResult?.({
      isWin: true,
      levelName: this.state.levelName,
      modeName: this.state.modeName,
      roundsDone: this.state.roundIndex,
      targetRounds: this.state.targetRounds,
      score: this.state.score,
      bestScore: this.bestScore,
      bestStreak: this.state.bestStreak,
    });
  }

  emit() {
    this.onStateChange?.({
      ...this.state,
      leftItems: this.state.leftItems.map((i) => ({ ...i })),
      rightItems: this.state.rightItems.map((i) => ({ ...i })),
      weights: this.state.weights.map((w) => ({ ...w })),
    });
  }
}
