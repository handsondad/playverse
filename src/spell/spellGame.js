function shuffle(list, random = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createSeededRandom(seedText) {
  let seed = 0;
  for (let i = 0; i < seedText.length; i += 1) {
    seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0;
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

export class SpellGame {
  constructor({ onStateChange, onResult, onToast, onQuestionSolved }) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.onToast = onToast;
    this.onQuestionSolved = onQuestionSolved;
    this.themes = [];
    this.random = Math.random;
    this.state = this.createIdleState();
  }

  createIdleState() {
    return {
      isRunning: false,
      themeId: "",
      themeName: "",
      questionIndex: 0,
      questions: [],
      currentQuestion: null,
      slots: [],
      pool: [],
      hintsLeft: 2,
      score: 0,
      solvedCount: 0,
      wrongCount: 0,
      progress: 0,
      dailySeed: "",
      modeName: "普通练习",
    };
  }

  init(themes) {
    this.themes = Array.isArray(themes) ? themes : [];
    this.state = this.createIdleState();
    this.emit();
  }

  start(themeId, options = {}) {
    const theme = this.themes.find((item) => item.id === themeId) || this.themes[0];
    if (!theme) {
      return;
    }

    const seed = options.seed || `${Date.now()}|spell|${theme.id}`;
    this.random = createSeededRandom(seed);

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      themeId: theme.id,
      themeName: theme.name,
      questions: theme.questions.map((item) => ({ ...item })),
      hintsLeft: 2,
      modeName: options.modeName || "普通练习",
      dailySeed: seed,
    };

    this.loadQuestion(0);
  }

  loadQuestion(index) {
    const question = this.state.questions[index];
    if (!question) {
      this.finish();
      return;
    }

    const answerLetters = question.answer.map((letter) => String(letter).toLowerCase());
    const alphabetDecoys = ["a", "e", "i", "o", "u", "b", "d", "m", "r", "s", "t", "l"];
    const pinyinDecoys = ["ao", "ou", "an", "en", "ing", "ie", "iu", "ui", "g", "m", "n", "h"];
    const baseDecoys = Array.isArray(question.decoys) && question.decoys.length > 0
      ? question.decoys.map((item) => String(item).toLowerCase())
      : (question.mode === "pinyin" ? pinyinDecoys : alphabetDecoys);
    const extra = baseDecoys.filter((item) => !answerLetters.includes(item)).slice(0, Math.min(3, answerLetters.length));
    const pool = shuffle([...answerLetters, ...extra], this.random).map((letter, index2) => ({
      id: `${question.id}-p-${index2}`,
      letter,
      used: false,
    }));

    this.state.questionIndex = index;
    this.state.currentQuestion = question;
    this.state.slots = Array.from({ length: answerLetters.length }, (_, slotIndex) => ({
      index: slotIndex,
      letter: "",
      fromPoolId: "",
      fixed: false,
    }));
    this.state.pool = pool;
    this.state.progress = this.state.questions.length > 0 ? index / this.state.questions.length : 0;
    this.emit();
  }

  getCurrentAnswer() {
    return (this.state.currentQuestion?.answer || []).map((letter) => String(letter).toLowerCase());
  }

  placeLetter(poolId) {
    if (!this.state.isRunning) {
      return;
    }
    const token = this.state.pool.find((item) => item.id === poolId);
    if (!token || token.used) {
      return;
    }

    const slot = this.state.slots.find((item) => !item.letter);
    if (!slot) {
      this.onToast?.("格子已满，可以点格子撤回");
      return;
    }

    token.used = true;
    slot.letter = token.letter;
    slot.fromPoolId = token.id;

    this.tryAutoJudge();
    this.emit();
  }

  removeLetter(slotIndex) {
    const slot = this.state.slots.find((item) => item.index === slotIndex);
    if (!slot || !slot.letter || slot.fixed) {
      return;
    }

    const token = this.state.pool.find((item) => item.id === slot.fromPoolId);
    if (token) {
      token.used = false;
    }

    slot.letter = "";
    slot.fromPoolId = "";
    this.emit();
  }

  useHint() {
    if (!this.state.isRunning || this.state.hintsLeft <= 0) {
      return false;
    }

    const answer = this.getCurrentAnswer();
    const target = this.state.slots.find((slot, index) => !slot.fixed && slot.letter !== answer[index]);
    if (!target) {
      return false;
    }

    if (target.letter && target.fromPoolId) {
      const prevToken = this.state.pool.find((item) => item.id === target.fromPoolId);
      if (prevToken) {
        prevToken.used = false;
      }
    }

    const matchToken = this.state.pool.find((item) => !item.used && item.letter === answer[target.index]);
    if (!matchToken) {
      return false;
    }

    matchToken.used = true;
    target.letter = matchToken.letter;
    target.fromPoolId = matchToken.id;
    target.fixed = true;
    this.state.hintsLeft -= 1;

    this.tryAutoJudge();
    this.emit();
    return true;
  }

  tryAutoJudge() {
    if (this.state.slots.some((slot) => !slot.letter)) {
      return;
    }

    const answer = this.getCurrentAnswer();
    const picked = this.state.slots.map((slot) => slot.letter);
    const correct = picked.every((letter, index) => letter === answer[index]);

    if (!correct) {
      this.state.wrongCount += 1;
      this.state.score = Math.max(0, this.state.score - 4);
      this.onToast?.("再看看顺序，点格子可以撤回");
      return;
    }

    this.state.solvedCount += 1;
    this.state.score += 24 + (this.state.hintsLeft * 3);
    this.onToast?.("拼对啦，继续下一题");
    this.onQuestionSolved?.({
      ...this.state.currentQuestion,
      solvedIndex: this.state.questionIndex,
    });

    const nextIndex = this.state.questionIndex + 1;
    if (nextIndex >= this.state.questions.length) {
      this.finish();
      return;
    }

    this.loadQuestion(nextIndex);
  }

  finish() {
    this.state.isRunning = false;
    this.state.progress = 1;
    this.emit();

    const total = this.state.questions.length || 1;
    const accuracy = Math.round((this.state.solvedCount / total) * 100);
    this.onResult?.({
      themeId: this.state.themeId,
      themeName: this.state.themeName,
      modeName: this.state.modeName,
      score: this.state.score,
      solvedCount: this.state.solvedCount,
      wrongCount: this.state.wrongCount,
      accuracy,
      seed: this.state.dailySeed,
    });
  }

  emit() {
    this.onStateChange({
      ...this.state,
      slots: this.state.slots.map((item) => ({ ...item })),
      pool: this.state.pool.map((item) => ({ ...item })),
      currentQuestion: this.state.currentQuestion ? { ...this.state.currentQuestion } : null,
    });
  }
}
