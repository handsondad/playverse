import { readJson, writeJson } from "./storage.js";

export const GLOBAL_SETTINGS_KEY = "kids-global-settings";
export const CARE_MODES = ["standard", "soft", "quiet"];

export function careModeLabel(mode) {
  if (mode === "soft") {
    return "柔和";
  }
  if (mode === "quiet") {
    return "安静";
  }
  return "标准";
}

export function nextCareMode(current) {
  const index = CARE_MODES.indexOf(current);
  return index === -1 ? "standard" : CARE_MODES[(index + 1) % CARE_MODES.length];
}

export function loadSettings(localKey, target = {}) {
  const merged = { ...readJson(localKey), ...readJson(GLOBAL_SETTINGS_KEY) };
  let careMode = "standard";
  if (CARE_MODES.includes(merged.careMode)) {
    careMode = merged.careMode;
  } else if (merged.parentMode) {
    careMode = "soft";
  }
  return Object.assign(target, {
    voiceOn: merged.voiceOn !== false,
    careMode,
    narrationLevel: merged.narrationLevel === "detailed" ? "detailed" : "key",
  });
}

export function saveSettings(localKey, settings) {
  const payload = {
    voiceOn: settings.voiceOn,
    careMode: settings.careMode,
    narrationLevel: settings.narrationLevel,
    parentMode: settings.careMode !== "standard",
  };
  writeJson(localKey, payload);
  writeJson(GLOBAL_SETTINGS_KEY, { ...readJson(GLOBAL_SETTINGS_KEY), ...payload });
}
