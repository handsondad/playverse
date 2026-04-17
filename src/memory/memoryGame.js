const STORAGE_KEY_PREFIX = "memory-match-best";

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let value = Math.imul(t ^ (t >>> 15), 1 | t);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function stringToSeed(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffle(list, randomFn = Math.random) {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function buildDeck(themeIcons, pairCount, randomFn) {
  const selected = themeIcons.slice(0, pairCount);
  const pairs = [...selected, ...selected].map((icon, index) => ({
    id: `${icon}-${index}`,
    icon,
    isOpen: false,
    isMatched: false,
  }));
  return shuffle(pairs, randomFn);
}

function scoreBonusByTime(remainingSec) {
  return Math.max(0, remainingSec * 2);
}

function calculateStars({ isWin, mistakes, totalPairs, timeLimit, remainingSec }) {
  if (!isWin) {
    return 0;
  }

  const mistakeLimitFor3Star = Math.max(2, Math.floor(totalPairs / 2));
  const hasEnoughTimeFor3Star = remainingSec >= Math.floor(timeLimit * 0.2);

  if (mistakes <= mistakeLimitFor3Star && hasEnoughTimeFor3Star) {
    return 3;
  }
  if (mistakes <= mistakeLimitFor3Star * 2) {
    return 2;
  }
  return 1;
}

export class MemoryGame {
  constructor({ onStateChange, onResult }) {
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.reset();
  }

  reset() {
    this.level = null;
    this.deck = [];
    this.firstOpenIndex = null;
    this.moves = 0;
    this.matchedPairs = 0;
    this.score = 0;
    this.mistakes = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.timer = null;
    this.remainingSec = 0;
    this.lockInput = false;
    this.isRunning = false;
    this.theme = "animals";
    this.hintCount = 1;
    this.shieldCount = 1;
    this.shieldArmed = false;
    this.mode = "normal";
    this.modeName = "普通模式";
    this.seed = null;
  }

  start(level, icons, themeName, options = {}) {
    this.reset();
    this.level = level;
    this.theme = themeName;
    this.mode = options.mode || "normal";
    this.modeName = options.modeName || "普通模式";
    this.seed = options.seed || null;

    const pairCount = (level.rows * level.cols) / 2;
    const randomFn = this.seed ? mulberry32(stringToSeed(String(this.seed))) : Math.random;
    this.deck = buildDeck(icons, pairCount, randomFn);
    this.remainingSec = level.timeLimit;
    this.isRunning = true;

    this.emit();
    this.timer = setInterval(() => {
      if (!this.isRunning) {
        return;
      }
      this.remainingSec -= 1;
      if (this.remainingSec <= 0) {
        this.remainingSec = 0;
        this.emit();
        this.finish(false);
        return;
      }
      this.emit();
    }, 1000);
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  useHint() {
    if (!this.isRunning || this.lockInput || this.hintCount <= 0) {
      return false;
    }

    const groups = new Map();
    this.deck.forEach((card, index) => {
      if (card.isMatched || card.isOpen) {
        return;
      }
      if (!groups.has(card.icon)) {
        groups.set(card.icon, []);
      }
      groups.get(card.icon).push(index);
    });

    let pair = null;
    for (const indexes of groups.values()) {
      if (indexes.length >= 2) {
        pair = indexes.slice(0, 2);
        break;
      }
    }

    if (!pair) {
      return false;
    }

    this.hintCount -= 1;
    this.lockInput = true;
    this.deck[pair[0]].isOpen = true;
    this.deck[pair[1]].isOpen = true;
    this.emit();

    setTimeout(() => {
      if (!this.deck[pair[0]].isMatched) {
        this.deck[pair[0]].isOpen = false;
      }
      if (!this.deck[pair[1]].isMatched) {
        this.deck[pair[1]].isOpen = false;
      }
      this.lockInput = false;
      this.emit();
    }, 900);

    return true;
  }

  useShield() {
    if (!this.isRunning || this.shieldCount <= 0 || this.shieldArmed) {
      return false;
    }
    this.shieldCount -= 1;
    this.shieldArmed = true;
    this.emit();
    return true;
  }

  previewAll(ms = 1000) {
    if (!this.isRunning || this.lockInput) {
      return;
    }
    this.lockInput = true;
    this.deck.forEach((card) => {
      if (!card.isMatched) {
        card.isOpen = true;
      }
    });
    this.emit();

    setTimeout(() => {
      this.deck.forEach((card) => {
        if (!card.isMatched) {
          card.isOpen = false;
        }
      });
      this.lockInput = false;
      this.emit();
    }, ms);
  }

  open(index) {
    if (!this.isRunning || this.lockInput) {
      return;
    }

    const target = this.deck[index];
    if (!target || target.isOpen || target.isMatched) {
      return;
    }

    target.isOpen = true;

    if (this.firstOpenIndex === null) {
      this.firstOpenIndex = index;
      this.emit();
      return;
    }

    this.moves += 1;
    const first = this.deck[this.firstOpenIndex];

    if (first.icon === target.icon) {
      first.isMatched = true;
      target.isMatched = true;
      this.matchedPairs += 1;
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.score += this.level.basePairScore;
      this.firstOpenIndex = null;
      this.emit();

      if (this.matchedPairs === this.deck.length / 2) {
        this.finish(true);
      }
      return;
    }

    if (this.shieldArmed) {
      first.isMatched = true;
      target.isMatched = true;
      this.matchedPairs += 1;
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.score += Math.floor(this.level.basePairScore * 0.7);
      this.shieldArmed = false;
      this.firstOpenIndex = null;
      this.emit();

      if (this.matchedPairs === this.deck.length / 2) {
        this.finish(true);
      }
      return;
    }

    this.mistakes += 1;
  this.combo = 0;

    this.lockInput = true;
    const currentFirstIndex = this.firstOpenIndex;
    this.firstOpenIndex = null;
    this.emit();

    setTimeout(() => {
      this.deck[currentFirstIndex].isOpen = false;
      target.isOpen = false;
      this.lockInput = false;
      this.emit();
    }, 700);
  }

  finish(isWin) {
    this.stopTimer();
    this.isRunning = false;

    const stars = calculateStars({
      isWin,
      mistakes: this.mistakes,
      totalPairs: this.deck.length / 2,
      timeLimit: this.level.timeLimit,
      remainingSec: this.remainingSec,
    });

    if (isWin) {
      this.score += scoreBonusByTime(this.remainingSec);
      this.saveBestScore();
    }

    this.emit();
    this.onResult({
      isWin,
      score: this.score,
      moves: this.moves,
      mistakes: this.mistakes,
      maxCombo: this.maxCombo,
      remainingSec: this.remainingSec,
      timeLimit: this.level.timeLimit,
      matchedPairs: this.matchedPairs,
      totalPairs: this.deck.length / 2,
      stars,
      mode: this.mode,
      levelName: this.level.name,
      levelId: this.level.id,
      modeName: this.modeName,
      bestScore: this.getBestScore(),
    });
  }

  saveBestScore() {
    const key = `${STORAGE_KEY_PREFIX}:${this.level.id}:${this.theme}`;
    const previous = Number(localStorage.getItem(key) || 0);
    if (this.score > previous) {
      localStorage.setItem(key, String(this.score));
    }
  }

  getBestScore() {
    if (!this.level) {
      return 0;
    }
    const key = `${STORAGE_KEY_PREFIX}:${this.level.id}:${this.theme}`;
    return Number(localStorage.getItem(key) || 0);
  }

  emit() {
    this.onStateChange({
      level: this.level,
      deck: this.deck,
      moves: this.moves,
      mistakes: this.mistakes,
      combo: this.combo,
      maxCombo: this.maxCombo,
      matchedPairs: this.matchedPairs,
      score: this.score,
      remainingSec: this.remainingSec,
      isRunning: this.isRunning,
      lockInput: this.lockInput,
      hintCount: this.hintCount,
      shieldCount: this.shieldCount,
      shieldArmed: this.shieldArmed,
      bestScore: this.getBestScore(),
    });
  }
}
