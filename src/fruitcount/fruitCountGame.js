const FRUITS = [
  { id: "apple", name: "苹果", icon: "🍎" },
  { id: "banana", name: "香蕉", icon: "🍌" },
  { id: "grape", name: "葡萄", icon: "🍇" },
  { id: "orange", name: "橙子", icon: "🍊" },
  { id: "strawberry", name: "草莓", icon: "🍓" },
  { id: "watermelon", name: "西瓜", icon: "🍉" },
  { id: "cherry", name: "樱桃", icon: "🍒" },
  { id: "peach", name: "桃子", icon: "🍑" },
  { id: "lemon", name: "柠檬", icon: "🍋" },
  { id: "pineapple", name: "菠萝", icon: "🍍" },
];

function getRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function generateChoices(count, max) {
  const choices = new Set([count]);
  let tries = 0;
  while (choices.size < 4 && tries < 40) {
    tries += 1;
    const offset = Math.floor(Math.random() * 5) - 2;
    const candidate = count + offset;
    if (candidate > 0 && candidate <= max + 2 && candidate !== count) {
      choices.add(candidate);
    }
  }
  while (choices.size < 4) {
    const candidate = choices.size + 1;
    if (!choices.has(candidate)) {
      choices.add(candidate);
    }
  }
  return [...choices].sort(() => Math.random() - 0.5);
}

function generateQuestion(maxCount) {
  const fruit = getRandom(FRUITS);
  const count = Math.floor(Math.random() * maxCount) + 1;
  const choices = generateChoices(count, maxCount);
  return { fruit, count, choices };
}

export class FruitCountGame {
  constructor() {
    this.score = 0;
    this.totalAnswered = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.currentLevel = 1;
    this.feedback = "数一数有几个水果，点出正确的数字。";
    this.question = generateQuestion(this.getMaxCount());
    this.answered = false;
    this.lastCorrect = false;
    this.lastChosen = null;
  }

  getMaxCount() {
    return Math.min(2 + this.currentLevel * 2, 10);
  }

  reset() {
    this.score = 0;
    this.totalAnswered = 0;
    this.streak = 0;
    this.currentLevel = 1;
    this.feedback = "数一数有几个水果，点出正确的数字。";
    this.question = generateQuestion(this.getMaxCount());
    this.answered = false;
    this.lastCorrect = false;
    this.lastChosen = null;
  }

  answer(choice) {
    if (this.answered) {
      return this.getSnapshot();
    }
    this.answered = true;
    this.lastChosen = choice;
    this.totalAnswered += 1;
    const correct = choice === this.question.count;
    this.lastCorrect = correct;

    if (correct) {
      this.score += 10 + this.streak * 2;
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      if (this.streak > 0 && this.streak % 3 === 0) {
        this.currentLevel = Math.min(this.currentLevel + 1, 4);
      }
      this.feedback = `答对啦！有 ${this.question.count} 个${this.question.fruit.name}。`;
    } else {
      this.streak = 0;
      this.feedback = `不对哦，是 ${this.question.count} 个${this.question.fruit.name}，再来一次！`;
    }

    return { ...this.getSnapshot(), correct, chosen: choice };
  }

  nextQuestion() {
    this.question = generateQuestion(this.getMaxCount());
    this.answered = false;
    this.lastCorrect = false;
    this.lastChosen = null;
    this.feedback = "数一数有几个水果。";
    return this.getSnapshot();
  }

  getSnapshot() {
    return {
      question: this.question,
      score: this.score,
      totalAnswered: this.totalAnswered,
      streak: this.streak,
      bestStreak: this.bestStreak,
      currentLevel: this.currentLevel,
      feedback: this.feedback,
      answered: this.answered,
      lastCorrect: this.lastCorrect,
      lastChosen: this.lastChosen,
    };
  }
}
