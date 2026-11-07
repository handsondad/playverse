import { readJson, writeJson } from "./storage.js";
import { setGameInterval } from "./timers.js";

// Shared by every page that has the #restReminder panel, so play time adds up across games.
export const PLAYTIME_KEY = "kids-playtime-tracker";
const TICK_MS = 15000;
const BREAK_GAP_MS = 5 * 60 * 1000;
const GRACE_MS = 5 * 60 * 1000;
const REST_SNOOZE_MS = 10 * 60 * 1000;

function thresholdMs(careMode) {
  if (careMode === "quiet") {
    return 6 * 60 * 1000;
  }
  if (careMode === "soft") {
    return 8 * 60 * 1000;
  }
  return 10 * 60 * 1000;
}

function loadPlaytime() {
  const parsed = readJson(PLAYTIME_KEY);
  return {
    continuousMs: Number(parsed.continuousMs || 0),
    lastTick: Number(parsed.lastTick || Date.now()),
    snoozeUntil: Number(parsed.snoozeUntil || 0),
    remindStage: Number(parsed.remindStage || 0),
  };
}

// isPlaying(): only time spent in a running round counts.
export function mountRestReminder({ settings, isPlaying, speak, bindTap }) {
  const panel = document.querySelector("#restReminder");
  const textEl = document.querySelector("#restReminderText");

  function hide() {
    panel.hidden = true;
  }

  function show(message) {
    textEl.textContent = message;
    panel.hidden = false;
  }

  function remind(now, state) {
    if (document.hidden) {
      return;
    }
    if (!isPlaying()) {
      hide();
      return;
    }
    const limitMs = thresholdMs(settings.careMode);
    if (now < state.snoozeUntil) {
      return;
    }
    if (state.continuousMs >= limitMs + GRACE_MS && state.remindStage < 2) {
      show("已经连续玩较久啦，建议现在休息和看看远处。需要我先暂停一会吗？");
      speak("建议现在休息一下眼睛", { force: true });
      state.remindStage = 2;
      return;
    }
    if (state.continuousMs >= limitMs && state.remindStage < 1) {
      show("连续游玩时间达到建议阈值，休息 2-3 分钟会更舒服。");
      speak("到休息时间啦", { force: true });
      state.remindStage = 1;
    }
  }

  function tick() {
    const now = Date.now();
    const state = loadPlaytime();
    const gap = now - state.lastTick;
    if (gap > BREAK_GAP_MS) {
      state.continuousMs = 0;
      state.remindStage = 0;
    }
    if (!document.hidden && isPlaying()) {
      state.continuousMs += Math.max(0, Math.min(gap, TICK_MS * 2));
    }
    state.lastTick = now;
    remind(now, state);
    writeJson(PLAYTIME_KEY, state);
  }

  bindTap(document.querySelector("#restNowBtn"), () => {
    hide();
    const state = loadPlaytime();
    state.continuousMs = 0;
    state.snoozeUntil = Date.now() + REST_SNOOZE_MS;
    state.remindStage = 0;
    state.lastTick = Date.now();
    writeJson(PLAYTIME_KEY, state);
    speak("好的，我们先休息一会儿", { force: true });
  });

  bindTap(document.querySelector("#restContinueBtn"), () => {
    hide();
    const state = loadPlaytime();
    state.snoozeUntil = Date.now() + GRACE_MS;
    state.lastTick = Date.now();
    writeJson(PLAYTIME_KEY, state);
    speak("再玩五分钟后我会继续提醒你", { force: true });
  });

  window.addEventListener("storage", (event) => {
    if (event.key === PLAYTIME_KEY && Date.now() < loadPlaytime().snoozeUntil) {
      hide();
    }
  });

  hide();
  tick();
  setGameInterval(tick, TICK_MS);
}
