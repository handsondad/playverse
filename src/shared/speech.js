export const SPEECH_PRESETS = {
  toddler: {
    rate: { standard: 0.96, soft: 0.88, quiet: 0.96 },
  },
  standard: {
    rate: { standard: 1, soft: 0.92, quiet: 0.92 },
  },
  phonics: {
    rate: { standard: 0.92, soft: 0.84, quiet: 0.84 },
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

function buildUtterance(text, settings, preset, autoLang = false) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = autoLang && /^[a-z]/i.test(text) ? "en-US" : "zh-CN";
  utterance.rate = preset.rate[settings.careMode] ?? 1;
  if (preset.volume) {
    utterance.volume = preset.volume[settings.careMode] ?? 1;
  }
  return utterance;
}

export function createSpeaker(settings, preset = SPEECH_PRESETS.standard) {
  let activeToken = 0;

  function canSpeak({ force = false, detailOnly = false } = {}) {
    if (!window.speechSynthesis || !settings.voiceOn) {
      return false;
    }
    if (settings.careMode === "quiet" && !force) {
      return false;
    }
    if (detailOnly && settings.narrationLevel !== "detailed") {
      return false;
    }
    if (detailOnly && preset.softSkipsDetail && settings.careMode === "soft") {
      return false;
    }
    return true;
  }

  function speak(text, options = {}) {
    if (!canSpeak(options)) {
      return;
    }
    activeToken += 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(buildUtterance(text, settings, preset));
  }

  speak.sequence = function speakSequence(parts, { preset: seqPreset = preset, force = false } = {}) {
    if (!canSpeak({ force })) {
      return;
    }
    const queue = parts.filter(Boolean);
    if (queue.length === 0) {
      return;
    }
    activeToken += 1;
    const token = activeToken;
    window.speechSynthesis.cancel();

    const run = (index) => {
      if (token !== activeToken || index >= queue.length) {
        return;
      }
      const utterance = buildUtterance(queue[index], settings, seqPreset, true);
      utterance.onend = () => run(index + 1);
      window.speechSynthesis.speak(utterance);
    };

    run(0);
  };

  return speak;
}
