const BALLOONS = [
  { id: "red", name: "红气球", colorName: "红色", icon: "🎈", accent: "#ff7166" },
  { id: "yellow", name: "黄气球", colorName: "黄色", icon: "🎈", accent: "#f1c23d" },
  { id: "blue", name: "蓝气球", colorName: "蓝色", icon: "🎈", accent: "#67a2ff" },
  { id: "green", name: "绿气球", colorName: "绿色", icon: "🎈", accent: "#62be7c" },
  { id: "orange", name: "橙气球", colorName: "橙色", icon: "🎈", accent: "#f59a49" },
  { id: "purple", name: "紫气球", colorName: "紫色", icon: "🎈", accent: "#8d74f4" },
  { id: "pink", name: "粉气球", colorName: "粉色", icon: "🎈", accent: "#f37eb3" },
  { id: "brown", name: "棕气球", colorName: "棕色", icon: "🎈", accent: "#b37a4c" },
];

function pickRandomDifferent(items, currentId) {
  const pool = items.filter((item) => item.id !== currentId);
  const nextPool = pool.length ? pool : items;
  return nextPool[Math.floor(Math.random() * nextPool.length)];
}

export class BalloonGame {
  constructor() {
    this.reset();
  }

  reset() {
    this.pops = 0;
    this.totalTaps = 0;
    this.lastTappedId = "";
    this.feedback = "点点气球吧。";
    this.target = pickRandomDifferent(BALLOONS, "");
  }

  nextTarget() {
    this.target = pickRandomDifferent(BALLOONS, this.target?.id || "");
    this.lastTappedId = "";
    this.feedback = `找${this.target.colorName}气球。`;
  }

  tapBalloon(balloonId) {
    const balloon = BALLOONS.find((item) => item.id === balloonId);
    if (!balloon) {
      return this.getSnapshot();
    }

    this.totalTaps += 1;
    this.lastTappedId = balloonId;

    if (balloonId === this.target.id) {
      this.pops += 1;
      this.feedback = `点到${balloon.colorName}气球啦。`;
      this.target = pickRandomDifferent(BALLOONS, this.target.id);
      return { ...this.getSnapshot(), success: true, tapped: balloon };
    }

    this.feedback = `这是${balloon.colorName}气球，再找${this.target.colorName}气球。`;
    return { ...this.getSnapshot(), success: false, tapped: balloon };
  }

  getSnapshot() {
    return {
      cards: BALLOONS,
      pops: this.pops,
      totalTaps: this.totalTaps,
      target: this.target,
      lastTappedId: this.lastTappedId,
      feedback: this.feedback,
    };
  }
}