import { mountQueueGame } from "../shared/queueGame.js";
import { POSTMAN_RULES } from "./rules.js";

mountQueueGame(POSTMAN_RULES, {
  id: "postman",
  configUrl: "../../configs/levels/postman-delivery.levels.json",
  requiredKeys: ["levels", "mailboxes", "themes"],
  levelDefaults: { expressChance: 0.15, registeredChance: 0.1, expressLimitMs: 2300, weatherCycleMs: 8500 },
  shellSelector: ".postman-shell",
  targetButtonsId: "mailboxButtons",
  targetButtonClass: "mailbox-btn",
  itemIdPrefix: "mail",
  palette: { brand: "#d5754f", bg: "#fff3e2", activeEnd: "#7b5b91" },
  weatherClasses: ["sunny", "cloudy", "rainy", "windy", "aurora"],
  weatherLabel: "天气",
  fallbackEmoji: "✉️",
  queueTags: { timed: "⚡", bonus: "🔒" },
  guide: {
    running: "看信件颜色，快速点同色信箱完成投递。",
    won: "投递完成，今天任务很顺利。",
    idle: "看清信封颜色，把信件投进同色信箱。",
  },
  hints: {
    timed: "加急件：请尽快投递，超时会扣生命。",
    bonus: "挂号件：投递正确奖励更高，投错惩罚更重。",
    normal: "请选择对应颜色的信箱。",
    waiting: "下一封信即将到达。",
  },
  badges: { timed: "加急件", bonus: "挂号件", normal: "普通件", waiting: "待分拣" },
  waitingLabel: "等待信件...",
  result: { won: "投递成功 ⭐", lost: "送信结束，再试一次", doneLabel: "投递", lifeLabel: "生命", extra: "特殊信件：已启用 | " },
  goalText: (goal) => `目标投递 ${goal} 封信`,
  playTone: (audio, freq, durationMs) => {
    audio.note(freq * 0.92, { style: "bell", durationMs: Math.max(90, durationMs - 20), gain: 0.024 });
    audio.note(freq * 1.28, { style: "bell", durationMs: 130, gain: 0.022, delayMs: 86 });
  },
  resultSound: (audio, isWin) => {
    if (isWin) {
      audio.note(640, { style: "bell", durationMs: 120, gain: 0.022 });
      audio.note(860, { style: "bell", durationMs: 140, gain: 0.022, delayMs: 88 });
      audio.note(1080, { style: "bell", durationMs: 160, gain: 0.02, delayMs: 186 });
    } else {
      audio.lose();
    }
  },
});
