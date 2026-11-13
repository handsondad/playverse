import { mountFindGame } from "../shared/findGame.js";

mountFindGame({
  progressKey: "emotion-game-progress",
  settingsKey: "emotion-game-settings",
  bestField: "bestSmiles",
  scoreId: "smilesValue",
  introText: "看看小脸是什么心情吧。",
  successText: (item) => `找到${item.name}啦，${item.comfort}。`,
  celebrationIcons: ["💛", "✨"],
  celebrationText: (item) => `${item.name}小贴纸`,
  items: [
    { id: "happy", icon: "😄", name: "开心", comfort: "笑眯眯真温暖", accent: "#f59d56" },
    { id: "sad", icon: "😢", name: "难过", comfort: "抱一抱就不难过啦", accent: "#6da4e8" },
    { id: "surprised", icon: "😮", name: "惊讶", comfort: "哇，发现了新奇的事", accent: "#f0b64d" },
    { id: "sleepy", icon: "😴", name: "犯困", comfort: "打个哈欠休息一下", accent: "#8c87e8" },
    { id: "shy", icon: "😊", name: "害羞", comfort: "小脸红扑扑真可爱", accent: "#f28aa8" },
    { id: "angry", icon: "😠", name: "生气", comfort: "深呼吸慢慢平静下来", accent: "#ea7568" },
    { id: "proud", icon: "🤩", name: "得意", comfort: "你做得真棒呀", accent: "#e89a48" },
    { id: "curious", icon: "🤔", name: "好奇", comfort: "小脑袋在认真想问题", accent: "#5eb8a6" },
    { id: "calm", icon: "😌", name: "平静", comfort: "安安静静真舒服", accent: "#70ba7e" },
    { id: "loving", icon: "🥰", name: "喜欢", comfort: "心里暖洋洋的", accent: "#eb7f99" },
  ],
});
