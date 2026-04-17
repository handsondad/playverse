const SHAPES = [
  { id: "circle", name: "圆形", symbol: "●", accent: "#ff8d70" },
  { id: "square", name: "方形", symbol: "■", accent: "#6f92ff" },
  { id: "triangle", name: "三角形", symbol: "▲", accent: "#65bf7a" },
  { id: "diamond", name: "菱形", symbol: "◆", accent: "#f0ba45" },
  { id: "star", name: "星形", symbol: "★", accent: "#f5a54f" },
  { id: "heart", name: "心形", symbol: "❤", accent: "#f27ba9" },
  { id: "oval", name: "椭圆形", symbol: "⬭", accent: "#6bb7c3" },
  { id: "rectangle", name: "长方形", symbol: "▭", accent: "#8a86ef" },
];

function pickRandomDifferent(items, currentId) {
  const pool = items.filter((item) => item.id !== currentId);
  const nextPool = pool.length ? pool : items;
  return nextPool[Math.floor(Math.random() * nextPool.length)];
}

export class ShapeGame {
  constructor() {
    this.reset();
  }

  reset() {
    this.wins = 0;
    this.totalTaps = 0;
    this.lastTappedId = "";
    this.feedback = "点点形状吧。";
    this.target = pickRandomDifferent(SHAPES, "");
  }

  nextTarget() {
    this.target = pickRandomDifferent(SHAPES, this.target?.id || "");
    this.lastTappedId = "";
    this.feedback = `找${this.target.name}。`;
  }

  tapShape(shapeId) {
    const shape = SHAPES.find((item) => item.id === shapeId);
    if (!shape) {
      return this.getSnapshot();
    }

    this.totalTaps += 1;
    this.lastTappedId = shapeId;

    if (shapeId === this.target.id) {
      this.wins += 1;
      this.feedback = `点到${shape.name}啦。`;
      this.target = pickRandomDifferent(SHAPES, this.target.id);
      return { ...this.getSnapshot(), success: true, tapped: shape };
    }

    this.feedback = `这是${shape.name}，再找${this.target.name}。`;
    return { ...this.getSnapshot(), success: false, tapped: shape };
  }

  getSnapshot() {
    return {
      cards: SHAPES,
      wins: this.wins,
      totalTaps: this.totalTaps,
      target: this.target,
      lastTappedId: this.lastTappedId,
      feedback: this.feedback,
    };
  }
}