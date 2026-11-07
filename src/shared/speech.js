export const SPEECH_PRESETS = {
  toddler: {
    rate: { standard: 0.96, soft: 0.88, quiet: 0.96 },
  },
  standard: {
    rate: { standard: 1, soft: 0.92, quiet: 0.92 },
  },
  guide: {
    rate: { standard: 1, soft: 0.92, quiet: 0.92 },
    volume: { standard: 0.95, soft: 0.72, quiet: 0.72 },
  },
  calmGuide: {
    rate: { standard: 1, soft: 0.92, quiet: 0.88 },
    volume: { standard: 0.95, soft: 0.72, quiet: 0.5 },
    softSkipsDetail: true,
  },
};

export function createSpeaker(settings, preset = SPEECH_PRESETS.standard) {
  return function speak(text, { force = false, detailOnly = false } = {}) {
    if (!window.speechSynthesis || !settings.voiceOn) {
      return;
    }
    if (settings.careMode === "quiet" && !force) {
      return;
    }
    if (detailOnly && settings.narrationLevel !== "detailed") {
      return;
    }
    if (detailOnly && preset.softSkipsDetail && settings.careMode === "soft") {
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = preset.rate[settings.careMode] ?? 1;
    if (preset.volume) {
      utterance.volume = preset.volume[settings.careMode] ?? 1;
    }
    window.speechSynthesis.speak(utterance);
  };
}
