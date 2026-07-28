const NUMBERS = [
  { id: "1", display: "1", name: "数字一", chineseNum: "一", accent: "#ff7166" },
  { id: "2", display: "2", name: "数字二", chineseNum: "二", accent: "#f1c23d" },
  { id: "3", display: "3", name: "数字三", chineseNum: "三", accent: "#6abf73" },
  { id: "4", display: "4", name: "数字四", chineseNum: "四", accent: "#67a2ff" },
  { id: "5", display: "5", name: "数字五", chineseNum: "五", accent: "#f59a49" },
  { id: "6", display: "6", name: "数字六", chineseNum: "六", accent: "#8d74f4" },
  { id: "7", display: "7", name: "数字七", chineseNum: "七", accent: "#f37eb3" },
  { id: "8", display: "8", name: "数字八", chineseNum: "八", accent: "#4db5ba" },
  { id: "9", display: "9", name: "数字九", chineseNum: "九", accent: "#e87240" },
  { id: "10", display: "10", name: "数字十", chineseNum: "十", accent: "#a86ad1" },
];

function pickRandomDifferent(items, currentId) {
  const pool = items.filter((item) => item.id !== currentId);
  const nextPool = pool.length ? pool : items;
  return nextPool[Math.floor(Math.random() * nextPool.length)];
}

export class NumberTapGame {
  constructor() {
    this.reset();
  }

  reset() {
    this.found = 0;
    this.totalTaps = 0;
    this.lastTappedId = "";
    this.feedback = "找一找这个数字吧。";
    this.target = pickRandomDifferent(NUMBERS, "");
  }

  nextTarget() {
    this.target = pickRandomDifferent(NUMBERS, this.target?.id || "");
    this.lastTappedId = "";
    this.feedback = `找${this.target.name}。`;
  }

  tapNumber(numberId) {
    const num = NUMBERS.find((item) => item.id === numberId);
    if (!num) {
      return this.getSnapshot();
    }

    this.totalTaps += 1;
    this.lastTappedId = numberId;

    if (numberId === this.target.id) {
      this.found += 1;
      this.feedback = `找到${num.name}啦！`;
      this.target = pickRandomDifferent(NUMBERS, this.target.id);
      return { ...this.getSnapshot(), success: true, tapped: num };
    }

    this.feedback = `这是${num.name}，再找${this.target.name}。`;
    return { ...this.getSnapshot(), success: false, tapped: num };
  }

  getSnapshot() {
    return {
      cards: NUMBERS,
      found: this.found,
      totalTaps: this.totalTaps,
      target: this.target,
      lastTappedId: this.lastTappedId,
      feedback: this.feedback,
    };
  }
}
