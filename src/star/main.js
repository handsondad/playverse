import { mountQueueGame } from "../shared/queueGame.js";
import { STAR_RULES } from "./rules.js";

mountQueueGame(STAR_RULES, {
  id: "star",
  configUrl: "../../configs/levels/star-observer.levels.json",
  requiredKeys: ["levels", "themes", "stations"],
  levelDefaults: { weatherCycleMs: 8500, urgentChance: 0.12, rareChance: 0.08, urgentLimitMs: 2400 },
  shellSelector: ".star-shell",
  targetButtonsId: "stationButtons",
  targetButtonClass: "station-btn",
  itemIdPrefix: "signal",
  palette: { brand: "#6978d8", bg: "#eef0ff", activeEnd: "#4856b5" },
  weatherClasses: ["clear", "cloudy", "mist", "aurora", "meteor-shower"],
  weatherLabel: "天空",
  fallbackEmoji: "🪐",
  waitingEmoji: "✨",
  queueTags: { timed: "⚡", bonus: "⭐" },
  guide: {
    running: "看星图线索，快速点对应观测台完成记录。",
    won: "观测完成，今晚的星图记录很完整。",
    idle: "看清星图线索，把它送到对应观测台。",
  },
  hints: {
    timed: "限时信号：要优先记录，拖太久会扣精力。",
    bonus: "稀有天象：记录正确双倍分，点错惩罚更重。",
    normal: "请选择对应线索的观测台。",
    waiting: "下一条星图线索即将出现。",
  },
  badges: { timed: "限时", bonus: "稀有", normal: "普通", waiting: "待记录" },
  waitingLabel: "等待信号...",
  result: { won: "观测成功 ⭐", lost: "观测结束，再试一次", doneLabel: "记录", lifeLabel: "精力" },
  goalText: (goal) => `目标记录 ${goal} 条线索`,
  welcome: "欢迎来到星空观测员，准备开始。",
  playTone: (audio, freq, durationMs) => {
    audio.note(freq * 1.08, { style: "bell", durationMs: Math.max(110, durationMs), gain: 0.022 });
    audio.note(freq * 1.62, { style: "bell", durationMs: 180, gain: 0.018, delayMs: 48 });
  },
  resultSound: (audio, isWin) => {
    if (isWin) {
      audio.note(720, { style: "bell", durationMs: 140, gain: 0.02 });
      audio.note(980, { style: "bell", durationMs: 170, gain: 0.019, delayMs: 76 });
      audio.note(1240, { style: "bell", durationMs: 210, gain: 0.018, delayMs: 168 });
    } else {
      audio.lose();
    }
  },
});
