const VEHICLES = [
  { id: "firetruck", icon: "🚒", name: "消防车", accent: "#ff845c" },
  { id: "excavator", icon: "🚜", name: "挖挖车", accent: "#f3b13f" },
  { id: "car", icon: "🚗", name: "小汽车", accent: "#56a6ff" },
  { id: "police", icon: "🚓", name: "警车", accent: "#6f87ff" },
  { id: "bus", icon: "🚌", name: "大巴车", accent: "#59bf78" },
  { id: "ambulance", icon: "🚑", name: "救护车", accent: "#ff7f8e" },
  { id: "taxi", icon: "🚕", name: "出租车", accent: "#f1bf49" },
  { id: "truck", icon: "🚚", name: "货车", accent: "#67b5f0" },
  { id: "tractor", icon: "🚜", name: "农场车", accent: "#72c36e" },
  { id: "motorbike", icon: "🏍️", name: "摩托车", accent: "#8d88f6" },
  { id: "train", icon: "🚂", name: "小火车", accent: "#e28b62" },
  { id: "airplane", icon: "✈️", name: "小飞机", accent: "#6ea9ff" },
  { id: "ship", icon: "🚢", name: "大轮船", accent: "#4fb4b0" },
];

function pickRandomDifferent(items, currentId) {
  const pool = items.filter((item) => item.id !== currentId);
  const nextPool = pool.length ? pool : items;
  return nextPool[Math.floor(Math.random() * nextPool.length)];
}

export class CarGame {
  constructor() {
    this.reset();
  }

  reset() {
    this.stickers = 0;
    this.totalTaps = 0;
    this.lastTappedId = "";
    this.feedback = "点点小车吧。";
    this.target = pickRandomDifferent(VEHICLES, "");
  }

  nextTarget() {
    this.target = pickRandomDifferent(VEHICLES, this.target?.id || "");
    this.lastTappedId = "";
    this.feedback = `找${this.target.name}。`;
  }

  tapVehicle(vehicleId) {
    const vehicle = VEHICLES.find((item) => item.id === vehicleId);
    if (!vehicle) {
      return this.getSnapshot();
    }

    this.totalTaps += 1;
    this.lastTappedId = vehicleId;

    if (vehicleId === this.target.id) {
      this.stickers += 1;
      this.feedback = `找到${vehicle.name}啦。`;
      this.target = pickRandomDifferent(VEHICLES, this.target.id);
      return { ...this.getSnapshot(), success: true, tapped: vehicle };
    }

    this.feedback = `这是${vehicle.name}，再找${this.target.name}。`;
    return { ...this.getSnapshot(), success: false, tapped: vehicle };
  }

  getSnapshot() {
    return {
      cards: VEHICLES,
      stickers: this.stickers,
      totalTaps: this.totalTaps,
      target: this.target,
      lastTappedId: this.lastTappedId,
      feedback: this.feedback,
    };
  }
}