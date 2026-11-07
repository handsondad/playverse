import { mountQueueGame } from "../shared/queueGame.js";
import { OCEAN_RULES } from "./rules.js";

mountQueueGame(OCEAN_RULES, {
  id: "ocean",
  configUrl: "../../configs/levels/ocean-cleanup.levels.json",
  requiredKeys: ["levels", "themes", "nets"],
  levelDefaults: { weatherCycleMs: 8500, hazardChance: 0.12, treasureChance: 0.08, hazardLimitMs: 2400 },
  shellSelector: ".ocean-shell",
  targetButtonsId: "netButtons",
  targetButtonClass: "net-btn",
  itemIdPrefix: "trash",
  palette: { brand: "#3f8fce", bg: "#e7f4ff", activeEnd: "#4769a3" },
  weatherClasses: ["sunny", "cloudy", "rainy", "windy", "aurora"],
  weatherLabel: "海况",
  fallbackEmoji: "🧴",
  queueTags: { timed: "☣", bonus: "✨" },
  guide: {
    running: "看漂浮物类型，快速点对应回收网完成清理。",
    won: "清理完成，海域恢复清澈。",
    idle: "看清漂浮物类型，把它放进对应回收网。",
  },
  hints: {
    timed: "危险品：要优先清理，扩散会扣生命。",
    bonus: "宝藏件：清理成功分数翻倍，分错惩罚更重。",
    normal: "请选择对应类型的回收网。",
    waiting: "下一批漂浮物即将到达。",
  },
  badges: { timed: "危险品", bonus: "宝藏件", normal: "普通件", waiting: "待处理" },
  waitingLabel: "等待漂浮物...",
  result: { won: "清理成功 ⭐", lost: "清理结束，再试一次", doneLabel: "清理", lifeLabel: "生命" },
  goalText: (goal) => `目标清理 ${goal} 份漂浮物`,
  welcome: "欢迎加入海底清洁队，准备开始。",
  playTone: (audio, freq, durationMs) => {
    audio.pop(Math.min(980, freq * 1.4));
    audio.note(freq * 0.82, { style: "pluck", durationMs: Math.max(80, durationMs - 18), gain: 0.028 });
    audio.note(freq * 1.1, { style: "bell", durationMs: 110, gain: 0.016, delayMs: 42 });
  },
  resultSound: (audio, isWin) => {
    if (isWin) {
      audio.pop(760);
      audio.success(760);
      audio.sparkle(920);
    } else {
      audio.lose();
    }
  },
});
