const COLORS = [
  { id: "red", name: "红色", accent: "#ff6b63", icon: "●" },
  { id: "yellow", name: "黄色", accent: "#f4c23a", icon: "●" },
  { id: "blue", name: "蓝色", accent: "#5b9dff", icon: "●" },
  { id: "green", name: "绿色", accent: "#64be73", icon: "●" },
  { id: "orange", name: "橙色", accent: "#f59a49", icon: "●" },
  { id: "purple", name: "紫色", accent: "#8d74f4", icon: "●" },
  { id: "pink", name: "粉色", accent: "#f37eb3", icon: "●" },
  { id: "brown", name: "棕色", accent: "#b37a4c", icon: "●" },
];

function pickRandomDifferent(items, currentId) {
  const pool = items.filter((item) => item.id !== currentId);
  const nextPool = pool.length ? pool : items;
  return nextPool[Math.floor(Math.random() * nextPool.length)];
}

export class ColorTapGame {
  constructor() {
    this.reset();
  }

  reset() {
    this.stars = 0;
    this.totalTaps = 0;
    this.lastTappedId = "";
    this.feedback = "点点颜色吧。";
    this.target = pickRandomDifferent(COLORS, "");
  }

  nextTarget() {
    this.target = pickRandomDifferent(COLORS, this.target?.id || "");
    this.lastTappedId = "";
    this.feedback = `找${this.target.name}。`;
  }

  tapColor(colorId) {
    const color = COLORS.find((item) => item.id === colorId);
    if (!color) {
      return this.getSnapshot();
    }

    this.totalTaps += 1;
    this.lastTappedId = colorId;

    if (colorId === this.target.id) {
      this.stars += 1;
      this.feedback = `点到${color.name}啦。`;
      this.target = pickRandomDifferent(COLORS, this.target.id);
      return { ...this.getSnapshot(), success: true, tapped: color };
    }

    this.feedback = `这是${color.name}，再找${this.target.name}。`;
    return { ...this.getSnapshot(), success: false, tapped: color };
  }

  getSnapshot() {
    return {
      cards: COLORS,
      stars: this.stars,
      totalTaps: this.totalTaps,
      target: this.target,
      lastTappedId: this.lastTappedId,
      feedback: this.feedback,
    };
  }
}