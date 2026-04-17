function createSeededRandom(seedText) {
  let seed = 0;
  for (let i = 0; i < seedText.length; i += 1) {
    seed = (seed * 33 + seedText.charCodeAt(i)) >>> 0;
  }
  if (seed === 0) {
    seed = 1;
  }
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 10000) / 10000;
  };
}

export class MathGame {
  constructor({ onStateChange, onResult, onToast }) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.onToast = onToast;
    this.stages = [];
    this.random = Math.random;
    this.state = this.createIdleState();
  }

  createIdleState() {
    return {
      isRunning: false,
      stageId: "",
      stageName: "",
      reviewMode: false,
      questionIndex: 0,
      questionCount: 0,
      combo: 0,
      bestCombo: 0,
      correctCount: 0,
      wrongCount: 0,
      enemyHp: 0,
      enemyMaxHp: 0,
      playerHp: 0,
      playerMaxHp: 0,
      score: 0,
      progress: 0,
      question: null,
      questionQueue: [],
      lastResult: "",
      modeName: "普通冒险",
      seed: "",
    };
  }

  init(stages) {
    this.stages = Array.isArray(stages) ? stages : [];
    this.state = this.createIdleState();
    this.emit();
  }

  start(stageId, options = {}) {
    const stage = this.stages.find((item) => item.id === stageId) || this.stages[0];
    if (!stage) {
      return;
    }

    const seed = options.seed || `${Date.now()}|math|${stage.id}`;
    this.random = createSeededRandom(seed);
    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      stageId: stage.id,
      stageName: stage.name,
      reviewMode: Array.isArray(options.reviewQuestions) && options.reviewQuestions.length > 0,
      questionCount: Array.isArray(options.reviewQuestions) && options.reviewQuestions.length > 0
        ? options.reviewQuestions.length
        : stage.questionCount,
      enemyHp: stage.enemyHp,
      enemyMaxHp: stage.enemyHp,
      playerHp: stage.playerHp,
      playerMaxHp: stage.playerHp,
      modeName: options.modeName || "普通冒险",
      seed,
      questionQueue: Array.isArray(options.reviewQuestions)
        ? options.reviewQuestions.map((item) => ({ ...item }))
        : [],
    };
    this.currentStage = stage;
    this.nextQuestion();
  }

  randomInt(min, max) {
    return min + Math.floor(this.random() * ((max - min) + 1));
  }

  buildQuestion() {
    const stage = this.currentStage;
    const operator = stage.operators[Math.floor(this.random() * stage.operators.length)];
    const min = stage.range[0];
    const max = stage.range[1];
    let left = this.randomInt(min, max);
    let right = this.randomInt(min, max);
    let answer = 0;

    if (operator === "+") {
      answer = left + right;
    } else if (operator === "-") {
      if (right > left) {
        [left, right] = [right, left];
      }
      answer = left - right;
    } else {
      left = this.randomInt(1, Math.min(max, 9));
      right = this.randomInt(1, Math.min(max, 9));
      answer = left * right;
    }

    const options = new Set([answer]);
    while (options.size < 4) {
      const drift = this.randomInt(-8, 8) || 2;
      const option = Math.max(0, answer + drift);
      options.add(option);
    }

    const shuffled = [...options].sort(() => this.random() - 0.5);
    return {
      text: `${left} ${operator} ${right} = ?`,
      answer,
      options: shuffled,
    };
  }

  nextQuestion() {
    if (this.state.questionIndex >= this.state.questionCount || this.state.enemyHp <= 0 || this.state.playerHp <= 0) {
      this.finish();
      return;
    }

    this.state.question = this.state.reviewMode
      ? { ...this.state.questionQueue[this.state.questionIndex] }
      : this.buildQuestion();
    this.state.progress = this.state.questionCount > 0 ? this.state.questionIndex / this.state.questionCount : 0;
    this.emit();
  }

  answer(option) {
    if (!this.state.isRunning || !this.state.question) {
      return;
    }

    const stage = this.currentStage;
    const correct = Number(option) === this.state.question.answer;
    this.state.questionIndex += 1;

    if (correct) {
      this.state.correctCount += 1;
      this.state.combo += 1;
      this.state.bestCombo = Math.max(this.state.bestCombo, this.state.combo);
      let damage = stage.damage;
      if (this.state.combo > 0 && this.state.combo % stage.skillCombo === 0) {
        damage += 10;
        this.onToast?.("连击技能触发，额外造成伤害");
      }
      this.state.enemyHp = Math.max(0, this.state.enemyHp - damage);
      this.state.score += 18 + (this.state.combo * 2);
      this.state.lastResult = "correct";
    } else {
      this.state.wrongCount += 1;
      this.state.combo = 0;
      this.state.playerHp = Math.max(0, this.state.playerHp - stage.wrongDamage);
      this.state.score = Math.max(0, this.state.score - 4);
      this.state.lastResult = "wrong";
      this.onToast?.("这题会加入错题复习");
    }

    this.nextQuestion();
  }

  finish() {
    this.state.isRunning = false;
    this.state.progress = 1;
    this.emit();

    const accuracy = this.state.questionCount > 0
      ? Math.round((this.state.correctCount / this.state.questionCount) * 100)
      : 0;

    this.onResult?.({
      isWin: this.state.enemyHp <= 0 && this.state.playerHp > 0,
      stageId: this.state.stageId,
      stageName: this.state.stageName,
      reviewMode: this.state.reviewMode,
      score: this.state.score,
      correctCount: this.state.correctCount,
      wrongCount: this.state.wrongCount,
      bestCombo: this.state.bestCombo,
      accuracy,
      seed: this.state.seed,
    });
  }

  emit() {
    this.onStateChange({
      ...this.state,
      question: this.state.question ? { ...this.state.question } : null,
    });
  }
}
