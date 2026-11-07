import { mountQueueGame } from "../shared/queueGame.js";
import { FOREST_RULES } from "./rules.js";

mountQueueGame(FOREST_RULES, {
  id: "forest",
  configUrl: "../../configs/levels/forest-ranger.levels.json",
  requiredKeys: ["levels", "themes", "stations"],
  levelDefaults: { weatherCycleMs: 8500, urgentChance: 0.12, rareChance: 0.08, urgentLimitMs: 2400 },
  shellSelector: ".forest-shell",
  targetButtonsId: "stationButtons",
  targetButtonClass: "station-btn",
  itemIdPrefix: "clue",
  palette: { brand: "#6b9d56", bg: "#eef7e8", activeEnd: "#3d6130" },
  weatherClasses: ["sunny", "cloudy", "rainy", "windy", "mist"],
  weatherLabel: "天气",
  fallbackEmoji: "🐾",
  queueTags: { timed: "⚡", bonus: "⭐" },
  guide: {
    running: "看森林线索，快速点对应观察站完成登记。",
    won: "巡护完成，今天的森林记录很完整。",
    idle: "看清森林线索，把它送到对应观察站。",
  },
  hints: {
    timed: "紧急线索：要优先处理，拖太久会扣体力。",
    bonus: "稀有线索：识别正确双倍分，分错惩罚更重。",
    normal: "请选择对应线索的观察站。",
    waiting: "下一条线索即将出现。",
  },
  badges: { timed: "紧急", bonus: "稀有", normal: "普通", waiting: "待识别" },
  waitingLabel: "等待线索...",
  result: { won: "巡护成功 ⭐", lost: "巡护结束，再试一次", doneLabel: "识别", lifeLabel: "体力" },
  goalText: (goal) => `目标识别 ${goal} 条线索`,
  welcome: "欢迎来到森林巡护员，准备开始。",
  playTone: (audio, freq, durationMs) => {
    audio.note(freq, { style: "pluck", durationMs, gain: 0.038 });
  },
});
