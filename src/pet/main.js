import { mountQueueGame } from "../shared/queueGame.js";
import { PET_RULES } from "./rules.js";

mountQueueGame(PET_RULES, {
  id: "pet",
  configUrl: "../../configs/levels/pet-clinic.levels.json",
  requiredKeys: ["levels", "themes", "rooms"],
  levelDefaults: { weatherCycleMs: 8500, emergencyChance: 0.12, vipChance: 0.08, emergencyLimitMs: 2400 },
  shellSelector: ".pet-shell",
  targetButtonsId: "roomButtons",
  targetButtonClass: "room-btn",
  itemIdPrefix: "case",
  palette: { brand: "#d26b8f", bg: "#fff2f5", activeEnd: "#7f5ea5" },
  weatherClasses: ["sunny", "cloudy", "rainy", "windy", "aurora"],
  weatherLabel: "天气",
  fallbackEmoji: "🤧",
  queueTags: { timed: "⚡", bonus: "⭐" },
  guide: {
    running: "看宠物症状，快速点对应诊室完成分诊。",
    won: "接诊完成，今天的诊所很顺利。",
    idle: "看清宠物症状，把它安排到对应诊室。",
  },
  hints: {
    timed: "急诊：要优先安排，等待过久会扣耐心。",
    bonus: "VIP：分诊正确分数翻倍，分错惩罚更重。",
    normal: "请选择对应症状的诊室。",
    waiting: "下一位宠物即将到达。",
  },
  badges: { timed: "急诊", bonus: "VIP", normal: "普通", waiting: "待分诊" },
  waitingLabel: "等待病例...",
  result: { won: "接诊成功 ⭐", lost: "接诊结束，再试一次", doneLabel: "接诊", lifeLabel: "耐心" },
  goalText: (goal) => `目标接诊 ${goal} 位宠物`,
  welcome: "欢迎来到小小宠物诊所，准备开始。",
  playTone: (audio, freq, durationMs) => {
    audio.note(freq, { style: "pluck", durationMs, gain: 0.036 });
  },
});
