import { createSeededRandom } from "../shared/random.js";

export function formatDigital(hour, minute) {
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

export function formatSpokenTime(hour, minute) {
  if (minute === 0) {
    return `${hour}点整`;
  }
  if (minute === 30) {
    return `${hour}点半`;
  }
  if (minute < 10) {
    return `${hour}点零${minute}分`;
  }
  return `${hour}点${minute}分`;
}

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export class ClockGame {
  constructor({ onStateChange, onResult } = {}) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.levels = [];
    this.routines = [];
    this.bestScore = 0;
    this.random = Math.random;
    this.state = this.createIdleState();
  }

  createIdleState() {
    return {
      isRunning: false,
      levelId: "",
      levelName: "",
      modeName: "日常作息",
      seed: "",
      questionIndex: 0,
      targetQuestions: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      wrongCount: 0,
      hintsLeft: 0,
      bestScore: this.bestScore || 0,
      showMinuteGuide: false,
      question: null,
      options: [],
      answered: false,
      lastFeedback: "选好难度，点开始认时钟吧。",
    };
  }

  init(data, bestScore = 0) {
    this.levels = Array.isArray(data?.levels) ? data.levels : [];
    this.routines = Array.isArray(data?.routines) ? data.routines : [];
    this.bestScore = Number(bestScore || 0);
    this.state = this.createIdleState();
    this.emit();
  }

  start(levelId, options = {}) {
    const level = this.levels.find((item) => item.id === levelId) || this.levels[0];
    if (!level) {
      return;
    }

    const seed = options.seed || `${Date.now()}|clock|${level.id}`;
    this.random = createSeededRandom(seed);
    this.currentLevel = level;
    this.lastKey = "";

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      levelId: level.id,
      levelName: level.name,
      modeName: options.modeName || "日常作息",
      seed,
      targetQuestions: level.targetQuestions,
      hintsLeft: Number(level.hints ?? 2),
      bestScore: this.bestScore,
      lastFeedback: "先看橙色短时针，再看蓝色长分针，选出正确时间。",
    };

    this.buildQuestion();
  }

  findRoutine(hour) {
    return this.routines.find((item) => item.hours.includes(hour))
      || { icon: "🕒", title: "快乐时光", period: "今天" };
  }

  buildQuestion() {
    const minutesPool = this.currentLevel.minutesPool;
    let hour = 7;
    let minute = 0;
    for (let tries = 0; tries < 12; tries += 1) {
      hour = 1 + Math.floor(this.random() * 12);
      minute = minutesPool[Math.floor(this.random() * minutesPool.length)];
      if (`${hour}:${minute}` !== this.lastKey) {
        break;
      }
    }
    this.lastKey = `${hour}:${minute}`;

    const routine = this.findRoutine(hour);
    const answerKey = formatDigital(hour, minute);
    const seen = new Set([answerKey]);
    const optionItems = [{
      key: answerKey,
      hour,
      minute,
      digital: answerKey,
      spoken: formatSpokenTime(hour, minute),
    }];

    const candidatePairs = [
      [((hour % 12) + 1), minute],
      [((hour + 10) % 12) + 1, minute],
      [hour, minutesPool[(minutesPool.indexOf(minute) + 1) % minutesPool.length]],
      [minute === 0 ? 12 : Math.max(1, Math.round(minute / 5)), (hour % 12) * 5],
    ];

    for (const [h, m] of candidatePairs) {
      if (optionItems.length >= 4) {
        break;
      }
      const validMin = minutesPool.includes(m) ? m : minutesPool[0];
      const key = formatDigital(h, validMin);
      if (!seen.has(key)) {
        seen.add(key);
        optionItems.push({
          key,
          hour: h,
          minute: validMin,
          digital: key,
          spoken: formatSpokenTime(h, validMin),
        });
      }
    }

    let guard = 0;
    while (optionItems.length < 4 && guard < 40) {
      guard += 1;
      const h = 1 + Math.floor(this.random() * 12);
      const m = minutesPool[Math.floor(this.random() * minutesPool.length)];
      const key = formatDigital(h, m);
      if (!seen.has(key)) {
        seen.add(key);
        optionItems.push({
          key,
          hour: h,
          minute: m,
          digital: key,
          spoken: formatSpokenTime(h, m),
        });
      }
    }

    this.state.question = {
      hour,
      minute,
      digital: answerKey,
      spoken: formatSpokenTime(hour, minute),
      hourAngle: ((hour % 12) * 30) + (minute * 0.5),
      minuteAngle: minute * 6,
      routine,
    };
    this.state.options = shuffle(optionItems, this.random);
    this.state.showMinuteGuide = false;
    this.state.answered = false;
    this.emit();
  }

  useHint() {
    if (!this.state.isRunning || this.state.hintsLeft <= 0 || !this.state.question) {
      return "";
    }
    this.state.hintsLeft -= 1;
    this.state.showMinuteGuide = true;
    const { hour, minute } = this.state.question;
    const minuteDesc = minute === 0
      ? "长分针指在 12（00 分）"
      : `长分针指在 ${minute} 分的位置`;
    const text = `提示：短时针刚走过 ${hour}，${minuteDesc}。`;
    this.state.lastFeedback = text;
    this.emit();
    return text;
  }

  answer(choiceKey) {
    if (!this.state.isRunning || this.state.answered || !this.state.question) {
      return { ok: false };
    }

    const picked = this.state.options.find((item) => item.key === choiceKey);
    if (!picked) {
      return { ok: false };
    }

    if (picked.key !== this.state.question.digital) {
      this.state.wrongCount += 1;
      this.state.streak = 0;
      this.state.score = Math.max(0, this.state.score - 3);
      this.state.showMinuteGuide = true;
      this.state.lastFeedback = `你选的是 ${picked.spoken}，再看看橙色短时针指着哪个数。`;
      this.emit();
      return { ok: false, correct: false, picked };
    }

    this.state.answered = true;
    this.state.streak += 1;
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak);
    this.state.score += 16 + Math.min(10, this.state.streak * 2);
    this.state.questionIndex += 1;
    const q = this.state.question;
    this.state.lastFeedback = `认对啦！现在是${q.routine.period}${q.spoken}，${q.routine.title}时间！`;

    if (this.state.score > this.bestScore) {
      this.bestScore = this.state.score;
      this.state.bestScore = this.bestScore;
    }

    this.emit();
    return {
      ok: true,
      correct: true,
      finished: this.state.questionIndex >= this.state.targetQuestions,
    };
  }

  nextQuestion() {
    if (!this.state.isRunning) {
      return;
    }
    if (this.state.questionIndex >= this.state.targetQuestions) {
      this.finish();
      return;
    }
    this.state.lastFeedback = "指针转到新时间啦，看看现在是几点？";
    this.buildQuestion();
  }

  finish() {
    this.state.isRunning = false;
    this.emit();
    const attempts = this.state.questionIndex + this.state.wrongCount;
    const accuracy = attempts > 0 ? Math.round((this.state.questionIndex / attempts) * 100) : 100;
    this.onResult?.({
      isWin: true,
      levelId: this.state.levelId,
      levelName: this.state.levelName,
      modeName: this.state.modeName,
      solved: this.state.questionIndex,
      targetQuestions: this.state.targetQuestions,
      score: this.state.score,
      bestScore: this.bestScore,
      bestStreak: this.state.bestStreak,
      accuracy,
    });
  }

  emit() {
    this.onStateChange?.({
      ...this.state,
      question: this.state.question ? { ...this.state.question } : null,
      options: this.state.options.map((item) => ({ ...item })),
    });
  }
}
