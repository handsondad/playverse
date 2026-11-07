import { mountQueueGame } from "../shared/queueGame.js";
import { FRUIT_RULES } from "./rules.js";

mountQueueGame(FRUIT_RULES, {
  id: "fruit",
  configUrl: "../../configs/levels/fruit-sorter.levels.json",
  requiredKeys: ["levels", "baskets", "themes"],
  levelDefaults: { weatherCycleMs: 8500, perishableChance: 0.12, goldenChance: 0.08, spoilLimitMs: 2400 },
  shellSelector: ".fruit-shell",
  targetButtonsId: "basketButtons",
  targetButtonClass: "basket-btn",
  itemIdPrefix: "fruit",
  palette: { brand: "#d47b48", bg: "#fff4e6", activeEnd: "#8d5d48" },
  weatherClasses: ["sunny", "cloudy", "rainy", "windy", "aurora"],
  weatherLabel: "天气",
  fallbackEmoji: "🍎",
  queueTags: { timed: "⏱", bonus: "✨" },
  guide: {
    running: "看水果颜色，快速点同色果篮完成分拣。",
    won: "分拣完成，今天的果园任务很顺利。",
    idle: "看清水果颜色，把它放进同色果篮。",
  },
  hints: {
    timed: "易坏果：要尽快分拣，放太久会扣生命。",
    bonus: "双倍果：分拣正确分数翻倍，分错惩罚更重。",
    normal: "请选择对应颜色的果篮。",
    waiting: "下一颗水果即将到达。",
  },
  badges: { timed: "易坏果", bonus: "双倍果", normal: "普通果", waiting: "待分拣" },
  waitingLabel: "等待水果...",
  result: { won: "分拣成功 ⭐", lost: "分拣结束，再试一次", doneLabel: "分拣", lifeLabel: "生命" },
  goalText: (goal) => `目标分拣 ${goal} 篮水果`,
  welcome: "欢迎来到果园分拣员，准备开始。",
  playTone: (audio, freq, durationMs) => {
    audio.note(freq, { style: "pluck", durationMs, gain: 0.038 });
  },
});
