const ANIMALS = [
  { id: "dog", icon: "🐶", name: "小狗", sound: "汪汪", accent: "#ff9d6c" },
  { id: "cat", icon: "🐱", name: "小猫", sound: "喵喵", accent: "#f2b547" },
  { id: "duck", icon: "🐤", name: "小鸭", sound: "嘎嘎", accent: "#6ebf69" },
  { id: "bear", icon: "🐻", name: "小熊", sound: "嗷呜", accent: "#8e77ff" },
  { id: "cow", icon: "🐮", name: "小牛", sound: "哞哞", accent: "#7cb6ff" },
  { id: "sheep", icon: "🐑", name: "小羊", sound: "咩咩", accent: "#9fcf6c" },
  { id: "pig", icon: "🐷", name: "小猪", sound: "哼哼", accent: "#ff8eb8" },
  { id: "frog", icon: "🐸", name: "小青蛙", sound: "呱呱", accent: "#69bf80" },
  { id: "rabbit", icon: "🐰", name: "小兔子", sound: "蹦蹦", accent: "#c797ff" },
  { id: "monkey", icon: "🐵", name: "小猴子", sound: "吱吱", accent: "#f1a95f" },
  { id: "lion", icon: "🦁", name: "小狮子", sound: "嗷呜", accent: "#f3b64c" },
  { id: "elephant", icon: "🐘", name: "小象", sound: "嘟嘟", accent: "#76a8ea" },
];

function pickRandomDifferent(items, currentId) {
  const pool = items.filter((item) => item.id !== currentId);
  const nextPool = pool.length ? pool : items;
  return nextPool[Math.floor(Math.random() * nextPool.length)];
}

export class AnimalGame {
  constructor() {
    this.reset();
  }

  reset() {
    this.found = 0;
    this.totalTaps = 0;
    this.lastTappedId = "";
    this.feedback = "点点小动物吧。";
    this.target = pickRandomDifferent(ANIMALS, "");
  }

  nextTarget() {
    this.target = pickRandomDifferent(ANIMALS, this.target?.id || "");
    this.lastTappedId = "";
    this.feedback = `找${this.target.name}。`;
  }

  tapAnimal(animalId) {
    const animal = ANIMALS.find((item) => item.id === animalId);
    if (!animal) {
      return this.getSnapshot();
    }

    this.totalTaps += 1;
    this.lastTappedId = animalId;

    if (animalId === this.target.id) {
      this.found += 1;
      this.feedback = `找到${animal.name}啦，${animal.sound}。`;
      this.target = pickRandomDifferent(ANIMALS, this.target.id);
      return { ...this.getSnapshot(), success: true, tapped: animal };
    }

    this.feedback = `这是${animal.name}，再找${this.target.name}。`;
    return { ...this.getSnapshot(), success: false, tapped: animal };
  }

  getSnapshot() {
    return {
      cards: ANIMALS,
      found: this.found,
      totalTaps: this.totalTaps,
      target: this.target,
      lastTappedId: this.lastTappedId,
      feedback: this.feedback,
    };
  }
}