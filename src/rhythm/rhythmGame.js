const STORAGE_KEY = "rhythm-best-score";

export class RhythmGame {
  constructor({ onStateChange, onResult }) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.state = this.createIdleState();
    this.rafId = null;
    this.startTs = 0;
  }

  createIdleState() {
    return {
      isRunning: false,
      song: null,
      bpm: 120,
      beatMs: 500,
      beatPulse: false,
      levelId: "easy",
      levelName: "慢慢拍",
      noteTravelMs: 2000,
      judgeWindowMs: { perfect: 100, good: 200 },
      timingOffsetMs: 45,
      lateToleranceMs: 35,
      holdReleaseGraceMs: 140,
      notes: [],
      lanePressed: [false, false, false, false],
      elapsedMs: 0,
      durationMs: 0,
      score: 0,
      combo: 0,
      bestCombo: 0,
      perfectCount: 0,
      goodCount: 0,
      missCount: 0,
      judgedCount: 0,
      progress: 0,
      lastJudge: "",
      lastLane: -1,
      bestScore: this.loadBestScore(),
      seed: "",
    };
  }

  loadBestScore() {
    try {
      return Number(localStorage.getItem(STORAGE_KEY) || 0);
    } catch {
      return 0;
    }
  }

  saveBestScore(score) {
    localStorage.setItem(STORAGE_KEY, String(score));
  }

  start(song, levelId, chart, options = {}) {
    this.stop();

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      song,
      bpm: song.bpm || 120,
      beatMs: Math.round(60000 / (song.bpm || 120)),
      levelId,
      levelName: chart.label || levelId,
      noteTravelMs: chart.travelMs,
      judgeWindowMs: chart.judgeWindowMs,
      timingOffsetMs: Number.isFinite(options.timingOffsetMs) ? options.timingOffsetMs : 45,
      lateToleranceMs: Number.isFinite(options.lateToleranceMs) ? options.lateToleranceMs : 35,
      holdReleaseGraceMs: Number.isFinite(options.holdReleaseGraceMs) ? options.holdReleaseGraceMs : 140,
      durationMs: chart.durationSec * 1000,
      notes: chart.notes.map((note, index) => ({
        id: `${song.id}-${levelId}-${index}`,
        lane: note.lane,
        type: note.type || "tap",
        hitTimeMs: Math.round(note.t * 1000),
        holdDurationMs: Math.round((note.hold || 0) * 1000),
        endTimeMs: Math.round(note.t * 1000) + Math.round((note.hold || 0) * 1000),
        started: false,
        canFinishWithoutHold: false,
        judged: false,
        result: "",
        startResult: "",
      })),
      seed: options.seed || `${song.id}|${levelId}`,
    };

    this.startTs = 0;
    this.emit();
    this.rafId = requestAnimationFrame((ts) => this.loop(ts));
  }

  loop(ts) {
    if (!this.state.isRunning) {
      return;
    }

    if (!this.startTs) {
      this.startTs = ts;
    }

    this.state.elapsedMs = ts - this.startTs;
    this.state.beatPulse = (this.state.elapsedMs % this.state.beatMs) < 120;
    this.autoJudgeNotes();
    this.state.progress = this.state.durationMs > 0
      ? Math.min(1, this.state.elapsedMs / this.state.durationMs)
      : 0;

    this.emit();

    const allJudged = this.state.notes.every((note) => note.judged);
    if (allJudged && this.state.elapsedMs >= this.state.durationMs) {
      this.finish();
      return;
    }

    this.rafId = requestAnimationFrame((nextTs) => this.loop(nextTs));
  }

  autoJudgeNotes() {
    const goodWindow = this.state.judgeWindowMs.good;
    const effectiveElapsed = this.state.elapsedMs + this.state.timingOffsetMs;

    this.state.notes.forEach((note) => {
      if (note.judged) {
        return;
      }

      if (note.type === "hold") {
        if (!note.started) {
          if (effectiveElapsed > note.hitTimeMs + goodWindow + this.state.lateToleranceMs) {
            this.applyJudge(note, "miss");
          }
          return;
        }

        if (!this.state.lanePressed[note.lane]
            && !note.canFinishWithoutHold
            && effectiveElapsed < note.endTimeMs - this.state.holdReleaseGraceMs) {
          this.applyJudge(note, "miss");
          return;
        }

        if (effectiveElapsed >= note.endTimeMs) {
          const finalResult = note.startResult === "perfect" ? "perfect" : "good";
          this.applyJudge(note, finalResult, { isHoldComplete: true });
        }
        return;
      }

      if (effectiveElapsed > note.hitTimeMs + goodWindow + this.state.lateToleranceMs) {
        this.applyJudge(note, "miss");
      }
    });
  }

  getRenderableNotes() {
    return this.state.notes.filter((note) => {
      if (note.judged) {
        return false;
      }
      if (note.type === "hold") {
        return this.state.elapsedMs <= note.endTimeMs + this.state.judgeWindowMs.good;
      }
      return this.state.elapsedMs <= note.hitTimeMs + this.state.judgeWindowMs.good;
    });
  }

  pressLane(lane) {
    if (!this.state.isRunning) {
      return "idle";
    }

    this.state.lanePressed[lane] = true;

    const effectiveElapsed = this.state.elapsedMs + this.state.timingOffsetMs;

    const candidates = this.state.notes
      .filter((note) => !note.judged && note.lane === lane && !note.started)
      .map((note) => ({ note, delta: Math.abs(effectiveElapsed - note.hitTimeMs) }))
      .sort((left, right) => left.delta - right.delta);

    const target = candidates[0];
    if (!target) {
      this.registerEmptyTap(lane);
      return "miss";
    }

    if (target.delta > this.state.judgeWindowMs.good) {
      this.registerEmptyTap(lane);
      return "miss";
    }

    if (target.note.type === "hold") {
      const startResult = target.delta <= this.state.judgeWindowMs.perfect ? "perfect" : "good";
      target.note.started = true;
      target.note.startResult = startResult;
      this.state.lastJudge = "hold";
      this.state.lastLane = lane;
      this.emit();
      return startResult;
    }

    if (target.delta <= this.state.judgeWindowMs.perfect) {
      this.applyJudge(target.note, "perfect");
      return "perfect";
    }

    this.applyJudge(target.note, "good");
    return "good";
  }

  releaseLane(lane) {
    this.state.lanePressed[lane] = false;

    const activeHold = this.state.notes.find((note) => !note.judged && note.type === "hold" && note.started && note.lane === lane);
    if (!activeHold) {
      return "idle";
    }

    const effectiveElapsed = this.state.elapsedMs + this.state.timingOffsetMs;

    if (effectiveElapsed + this.state.holdReleaseGraceMs < activeHold.endTimeMs) {
      this.applyJudge(activeHold, "miss");
      this.emit();
      return "miss";
    }

    activeHold.canFinishWithoutHold = true;
    this.emit();
    return "hold-release";
  }

  registerEmptyTap(lane) {
    this.state.combo = 0;
    this.state.lastJudge = "miss";
    this.state.lastLane = lane;
    this.emit();
  }

  applyJudge(note, result, options = {}) {
    note.judged = true;
    note.result = result;
    note.started = false;
    this.state.lastJudge = result;
    this.state.lastLane = note.lane;
    this.state.judgedCount += 1;

    if (result === "perfect") {
      this.state.perfectCount += 1;
      this.state.combo += 1;
      this.state.bestCombo = Math.max(this.state.bestCombo, this.state.combo);
      this.state.score += options.isHoldComplete ? 34 + Math.min(28, this.state.combo) : 18 + Math.min(24, this.state.combo);
    } else if (result === "good") {
      this.state.goodCount += 1;
      this.state.combo += 1;
      this.state.bestCombo = Math.max(this.state.bestCombo, this.state.combo);
      this.state.score += options.isHoldComplete ? 22 + Math.min(18, this.state.combo) : 10 + Math.min(14, this.state.combo);
    } else {
      this.state.missCount += 1;
      this.state.combo = 0;
      this.state.score = Math.max(0, this.state.score - 6);
    }
  }

  finish() {
    this.stop();
    this.state.isRunning = false;

    const finalScore = Math.max(0, Math.round(this.state.score));
    const totalNotes = this.state.notes.length || 1;
    const accuracy = Math.round(((this.state.perfectCount + (this.state.goodCount * 0.7)) / totalNotes) * 100);
    const bestScore = Math.max(this.state.bestScore, finalScore);
    this.state.score = finalScore;
    this.state.bestScore = bestScore;
    this.saveBestScore(bestScore);
    this.emit();

    this.onResult({
      isWin: accuracy >= 70,
      songId: this.state.song.id,
      songName: this.state.song.name,
      levelId: this.state.levelId,
      levelName: this.state.levelName,
      score: finalScore,
      bestScore,
      perfectCount: this.state.perfectCount,
      goodCount: this.state.goodCount,
      missCount: this.state.missCount,
      bestCombo: this.state.bestCombo,
      accuracy,
      seed: this.state.seed,
    });
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  emit() {
    this.onStateChange({
      ...this.state,
      lanePressed: [...this.state.lanePressed],
      notes: this.getRenderableNotes().map((note) => ({ ...note })),
    });
  }
}