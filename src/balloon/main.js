import { mountFindGame } from "../shared/findGame.js";

mountFindGame({
  progressKey: "balloon-game-progress",
  settingsKey: "balloon-game-settings",
  bestField: "bestPops",
  scoreId: "popsValue",
  introText: "点点气球吧。",
  successText: (item) => `点到${item.name}啦。`,
  celebrationIcons: ["🎉", "🎉"],
  celebrationText: "点中气球啦",
  tintTarget: true,
  popOnSuccess: true,
  items: [
    { id: "red", name: "红色气球", label: "红色", icon: "🎈", accent: "#ff7166" },
    { id: "yellow", name: "黄色气球", label: "黄色", icon: "🎈", accent: "#f1c23d" },
    { id: "blue", name: "蓝色气球", label: "蓝色", icon: "🎈", accent: "#67a2ff" },
    { id: "green", name: "绿色气球", label: "绿色", icon: "🎈", accent: "#62be7c" },
    { id: "orange", name: "橙色气球", label: "橙色", icon: "🎈", accent: "#f59a49" },
    { id: "purple", name: "紫色气球", label: "紫色", icon: "🎈", accent: "#8d74f4" },
    { id: "pink", name: "粉色气球", label: "粉色", icon: "🎈", accent: "#f37eb3" },
    { id: "brown", name: "棕色气球", label: "棕色", icon: "🎈", accent: "#b37a4c" },
  ],
});
