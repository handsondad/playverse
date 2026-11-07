import { mountFindGame } from "../shared/findGame.js";

mountFindGame({
  progressKey: "color-tap-progress",
  settingsKey: "color-tap-settings",
  bestField: "bestStars",
  scoreId: "starsValue",
  introText: "点点颜色吧。",
  successText: (item) => `点到${item.name}啦。`,
  celebrationIcons: ["⭐", "⭐"],
  celebrationText: "点对啦",
  tintTarget: true,
  items: [
    { id: "red", name: "红色", accent: "#ff6b63", icon: "●" },
    { id: "yellow", name: "黄色", accent: "#f4c23a", icon: "●" },
    { id: "blue", name: "蓝色", accent: "#5b9dff", icon: "●" },
    { id: "green", name: "绿色", accent: "#64be73", icon: "●" },
    { id: "orange", name: "橙色", accent: "#f59a49", icon: "●" },
    { id: "purple", name: "紫色", accent: "#8d74f4", icon: "●" },
    { id: "pink", name: "粉色", accent: "#f37eb3", icon: "●" },
    { id: "brown", name: "棕色", accent: "#b37a4c", icon: "●" },
  ],
});
