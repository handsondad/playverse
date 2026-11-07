import { mountFindGame } from "../shared/findGame.js";

mountFindGame({
  progressKey: "animal-game-progress",
  settingsKey: "animal-game-settings",
  bestField: "bestFound",
  scoreId: "foundValue",
  introText: "点点小动物吧。",
  successText: (item) => `找到${item.name}啦，${item.sound}。`,
  celebrationIcons: ["🌟", "🌟"],
  celebrationText: "找到了",
  items: [
    { id: "dog", icon: "🐶", name: "小狗", sound: "汪汪", accent: "#ff9d6c" },
    { id: "cat", icon: "🐱", name: "小猫", sound: "喵喵", accent: "#f2b547" },
    { id: "duck", icon: "🐤", name: "小鸭", sound: "嘎嘎", accent: "#6ebf69" },
    { id: "bear", icon: "🐻", name: "小熊", sound: "嗷呜", accent: "#8e77ff" },
    { id: "cow", icon: "🐮", name: "小牛", sound: "哞哞", accent: "#7cb6ff" },
    { id: "sheep", icon: "🐑", name: "小羊", sound: "咩咩", accent: "#9fcf6c" },
    { id: "pig", icon: "🐷", name: "小猪", sound: "哼哼", accent: "#ff8eb8" },
    { id: "frog", icon: "🐸", name: "小青蛙", sound: "呱呱", accent: "#69bf80" },
    { id: "rabbit", icon: "🐰", name: "小兔子", sound: "蹦蹦", accent: "#c797ff" },
    { id: "monkey", icon: "🐵", name: "小猴子", sound: "吱吱", accent: "#f1a95f" },
    { id: "lion", icon: "🦁", name: "小狮子", sound: "嗷呜", accent: "#f3b64c" },
    { id: "elephant", icon: "🐘", name: "小象", sound: "嘟嘟", accent: "#76a8ea" },
  ],
});
