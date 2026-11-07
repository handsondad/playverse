import { GLOBAL_SETTINGS_KEY, careModeLabel, loadSettings, nextCareMode, saveSettings } from "./settings.js";

function bindClick(button, handler) {
  button.addEventListener("click", handler);
}

// The 语音引导 / 播报模式 / 护眼模式 buttons (#voiceBtn, #narrationBtn, #parentModeBtn).
// Pages without a narration button just skip it.
// onChange runs after every relabel, including when another tab changes the settings;
// announce(kind) runs only after the player taps a button here.
export function mountSettingsButtons({ storageKey, settings, bindTap = bindClick, onChange, announce }) {
  const voiceBtn = document.querySelector("#voiceBtn");
  const narrationBtn = document.querySelector("#narrationBtn");
  const careModeBtn = document.querySelector("#parentModeBtn");

  function render() {
    voiceBtn.textContent = `语音引导：${settings.voiceOn ? "开" : "关"}`;
    if (narrationBtn) {
      narrationBtn.textContent = `播报模式：${settings.narrationLevel === "detailed" ? "详细" : "关键"}`;
    }
    careModeBtn.textContent = `护眼模式：${careModeLabel(settings.careMode)}`;
    onChange?.(settings);
  }

  function bindToggle(button, kind, change) {
    if (!button) {
      return;
    }
    bindTap(button, () => {
      change();
      saveSettings(storageKey, settings);
      render();
      announce?.(kind, settings);
    });
  }

  bindToggle(voiceBtn, "voice", () => {
    settings.voiceOn = !settings.voiceOn;
  });
  bindToggle(narrationBtn, "narration", () => {
    settings.narrationLevel = settings.narrationLevel === "detailed" ? "key" : "detailed";
  });
  bindToggle(careModeBtn, "careMode", () => {
    settings.careMode = nextCareMode(settings.careMode);
  });

  window.addEventListener("storage", (event) => {
    if (event.key === GLOBAL_SETTINGS_KEY) {
      loadSettings(storageKey, settings);
      render();
    }
  });

  render();
}

// The guide-voice games: re-read the guide when voice comes back on and confirm
// the other two changes out loud.
export function speakSettingChanges(speak, guideEl) {
  return (kind, settings) => {
    if (kind === "voice") {
      if (settings.voiceOn) {
        speak(guideEl.textContent);
      }
      return;
    }
    if (kind === "narration") {
      speak(`已切换到${settings.narrationLevel === "detailed" ? "详细" : "关键"}播报`);
      return;
    }
    speak(`已切换到${careModeLabel(settings.careMode)}模式`, { force: true });
  };
}
