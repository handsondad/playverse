import { mountFindGame } from "../shared/findGame.js";

mountFindGame({
  progressKey: "shape-game-progress",
  settingsKey: "shape-game-settings",
  bestField: "bestWins",
  scoreId: "winsValue",
  introText: "点点形状吧。",
  successText: (item) => `点到${item.name}啦。`,
  celebrationIcons: ["💫", "💫"],
  celebrationText: "点到啦",
  tintTarget: true,
  items: [
    { id: "circle", name: "圆形", icon: "●", accent: "#ff8d70" },
    { id: "square", name: "方形", icon: "■", accent: "#6f92ff" },
    { id: "triangle", name: "三角形", icon: "▲", accent: "#65bf7a" },
    { id: "diamond", name: "菱形", icon: "◆", accent: "#f0ba45" },
    { id: "star", name: "星形", icon: "★", accent: "#f5a54f" },
    { id: "heart", name: "心形", icon: "❤", accent: "#f27ba9" },
    { id: "oval", name: "椭圆形", icon: "⬭", accent: "#6bb7c3" },
    { id: "rectangle", name: "长方形", icon: "▭", accent: "#8a86ef" },
  ],
});
