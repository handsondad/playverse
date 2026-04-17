function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getAudioContext() {
  return window.AudioContext || window.webkitAudioContext || null;
}

export function createGameAudio({ getCareMode = () => "standard" } = {}) {
  let audioContext = null;
  let noiseBuffer = null;

  function careMode() {
    return getCareMode?.() || "standard";
  }

  function isEnabled() {
    return careMode() !== "quiet";
  }

  function gainMultiplier() {
    return careMode() === "soft" ? 0.58 : 1;
  }

  function getCtx() {
    if (audioContext) {
      return audioContext;
    }
    const AudioCtx = getAudioContext();
    if (!AudioCtx) {
      return null;
    }
    audioContext = new AudioCtx();
    return audioContext;
  }

  function ensureNoiseBuffer(ctx) {
    if (!ctx) {
      return null;
    }
    if (noiseBuffer) {
      return noiseBuffer;
    }
    const length = Math.max(1, Math.floor(ctx.sampleRate * 0.4));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2) - 1;
    }
    noiseBuffer = buffer;
    return noiseBuffer;
  }

  function resumeCtx() {
    const ctx = getCtx();
    if (!ctx) {
      return null;
    }
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function scheduleTone({
    time,
    frequency = 440,
    endFrequency,
    duration = 0.1,
    type = "sine",
    gain = 0.035,
    attack = 0.004,
    release = 0.08,
    detune = 0,
  }) {
    if (!isEnabled()) {
      return;
    }
    const ctx = resumeCtx();
    if (!ctx) {
      return;
    }
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const start = typeof time === "number" ? time : ctx.currentTime + 0.001;
    const end = start + duration;
    const peak = clamp(gain * gainMultiplier(), 0, 0.12);

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (typeof endFrequency === "number") {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFrequency), end);
    }
    if (detune) {
      osc.detune.setValueAtTime(detune, start);
    }

    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), start + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, end + release);

    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(end + release + 0.01);
  }

  function scheduleNoise({
    time,
    duration = 0.05,
    gain = 0.02,
    attack = 0.002,
    release = 0.06,
    filterFrequency = 1800,
    playbackRate = 1,
  }) {
    if (!isEnabled()) {
      return;
    }
    const ctx = resumeCtx();
    if (!ctx) {
      return;
    }
    const buffer = ensureNoiseBuffer(ctx);
    if (!buffer) {
      return;
    }

    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    const start = typeof time === "number" ? time : ctx.currentTime + 0.001;
    const end = start + duration;
    const peak = clamp(gain * gainMultiplier(), 0, 0.08);

    source.buffer = buffer;
    source.playbackRate.setValueAtTime(playbackRate, start);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterFrequency, start);

    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), start + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, end + release);

    source.connect(filter);
    filter.connect(amp);
    amp.connect(ctx.destination);
    source.start(start);
    source.stop(end + release + 0.01);
  }

  function playPluck(frequency = 520, options = {}) {
    const ctx = resumeCtx();
    if (!ctx) {
      return;
    }
    const start = ctx.currentTime + ((options.delayMs || 0) / 1000);
    scheduleTone({
      time: start,
      frequency,
      endFrequency: Math.max(90, frequency * 0.72),
      duration: (options.durationMs || 110) / 1000,
      type: options.type || "triangle",
      gain: options.gain || 0.034,
      attack: 0.003,
      release: 0.08,
    });
    scheduleTone({
      time: start,
      frequency: frequency * 2,
      endFrequency: Math.max(140, frequency * 1.55),
      duration: Math.max(0.04, ((options.durationMs || 110) / 1000) * 0.7),
      type: "sine",
      gain: (options.gain || 0.034) * 0.42,
      attack: 0.002,
      release: 0.05,
    });
    if (options.withNoise !== false) {
      scheduleNoise({
        time: start,
        duration: 0.025,
        gain: 0.008,
        filterFrequency: 2600,
        playbackRate: 1.3,
      });
    }
  }

  function playBell(frequency = 720, options = {}) {
    const ctx = resumeCtx();
    if (!ctx) {
      return;
    }
    const start = ctx.currentTime + ((options.delayMs || 0) / 1000);
    const durationSec = (options.durationMs || 180) / 1000;
    scheduleTone({
      time: start,
      frequency,
      duration: durationSec,
      type: options.type || "sine",
      gain: options.gain || 0.028,
      attack: 0.004,
      release: 0.16,
    });
    scheduleTone({
      time: start,
      frequency: frequency * 2.01,
      duration: durationSec * 0.72,
      type: "triangle",
      gain: (options.gain || 0.028) * 0.48,
      attack: 0.003,
      release: 0.12,
      detune: 6,
    });
  }

  function playPop(frequency = 820, options = {}) {
    const ctx = resumeCtx();
    if (!ctx) {
      return;
    }
    const start = ctx.currentTime + ((options.delayMs || 0) / 1000);
    scheduleNoise({
      time: start,
      duration: 0.035,
      gain: 0.018,
      filterFrequency: 2200,
      playbackRate: 1.7,
    });
    scheduleTone({
      time: start,
      frequency,
      endFrequency: Math.max(180, frequency * 0.58),
      duration: (options.durationMs || 90) / 1000,
      type: "sine",
      gain: options.gain || 0.03,
      attack: 0.002,
      release: 0.05,
    });
  }

  function playThunk(frequency = 240, options = {}) {
    const ctx = resumeCtx();
    if (!ctx) {
      return;
    }
    const start = ctx.currentTime + ((options.delayMs || 0) / 1000);
    scheduleNoise({
      time: start,
      duration: 0.04,
      gain: 0.014,
      filterFrequency: 900,
      playbackRate: 0.9,
    });
    scheduleTone({
      time: start,
      frequency,
      endFrequency: Math.max(70, frequency * 0.62),
      duration: (options.durationMs || 150) / 1000,
      type: options.type || "sawtooth",
      gain: options.gain || 0.028,
      attack: 0.002,
      release: 0.08,
    });
  }

  function note(frequency = 520, { style = "bell", durationMs = 180, gain = 0.04, delayMs = 0, wave = "triangle" } = {}) {
    if (style === "pluck") {
      playPluck(frequency, { durationMs, gain, delayMs, type: wave });
      return;
    }
    if (style === "pop") {
      playPop(frequency, { durationMs, gain, delayMs });
      return;
    }
    if (style === "thunk") {
      playThunk(frequency, { durationMs, gain, delayMs, type: wave });
      return;
    }
    playBell(frequency, { durationMs, gain, delayMs, type: wave });
  }

  return {
    unlock() {
      if (!isEnabled()) {
        return;
      }
      resumeCtx();
    },
    note,
    uiTap() {
      playPluck(420, { durationMs: 70, gain: 0.024 });
    },
    pickup(frequency = 520) {
      playPluck(frequency, { durationMs: 110, gain: 0.034 });
    },
    place(frequency = 360) {
      playPluck(frequency, { durationMs: 90, gain: 0.028, type: "sine", withNoise: true });
    },
    pop(frequency = 820) {
      playPop(frequency, { durationMs: 90, gain: 0.03 });
    },
    sparkle(frequency = 900) {
      playBell(frequency, { durationMs: 140, gain: 0.028 });
    },
    correct(frequency = 720) {
      playPluck(frequency, { durationMs: 90, gain: 0.032 });
      playBell(frequency * 1.26, { delayMs: 48, durationMs: 130, gain: 0.026 });
    },
    success(frequency = 760) {
      playBell(frequency, { durationMs: 150, gain: 0.028 });
      playBell(frequency * 1.26, { delayMs: 60, durationMs: 160, gain: 0.026 });
      playBell(frequency * 1.52, { delayMs: 132, durationMs: 180, gain: 0.024 });
    },
    wrong() {
      playThunk(280, { durationMs: 120, gain: 0.028 });
      playThunk(190, { delayMs: 70, durationMs: 140, gain: 0.022, type: "square" });
    },
    miss() {
      playThunk(230, { durationMs: 120, gain: 0.026 });
    },
    hit() {
      playPluck(620, { durationMs: 85, gain: 0.03 });
      playPop(930, { delayMs: 34, durationMs: 70, gain: 0.02 });
    },
    win() {
      playBell(620, { durationMs: 150, gain: 0.026 });
      playBell(820, { delayMs: 82, durationMs: 170, gain: 0.025 });
      playBell(1040, { delayMs: 168, durationMs: 210, gain: 0.024 });
    },
    lose() {
      playThunk(260, { durationMs: 150, gain: 0.03 });
      playThunk(180, { delayMs: 70, durationMs: 170, gain: 0.024, type: "square" });
      playThunk(130, { delayMs: 150, durationMs: 190, gain: 0.018, type: "square" });
    },
    countdown() {
      playPluck(480, { durationMs: 70, gain: 0.022, type: "square", withNoise: false });
    },
    jump() {
      playPluck(560, { durationMs: 90, gain: 0.028 });
      playBell(820, { delayMs: 38, durationMs: 100, gain: 0.022 });
    },
    coin() {
      playBell(980, { durationMs: 90, gain: 0.025 });
      playBell(1260, { delayMs: 28, durationMs: 110, gain: 0.022 });
    },
    powerup() {
      playBell(540, { durationMs: 120, gain: 0.024 });
      playBell(760, { delayMs: 56, durationMs: 140, gain: 0.024 });
      playBell(980, { delayMs: 118, durationMs: 170, gain: 0.024 });
    },
    hitShield() {
      playThunk(410, { durationMs: 90, gain: 0.023, type: "triangle" });
      playBell(710, { delayMs: 45, durationMs: 110, gain: 0.018 });
    },
    good(lane = 0) {
      this.correct(560 + (lane * 58));
    },
    perfect(lane = 0) {
      this.success(620 + (lane * 66));
    },
    plant() {
      playPluck(420, { durationMs: 90, gain: 0.026 });
      playThunk(180, { delayMs: 18, durationMs: 90, gain: 0.012, type: "sine" });
    },
    harvest() {
      this.success(720);
    },
    order() {
      playBell(640, { durationMs: 120, gain: 0.024 });
      playBell(880, { delayMs: 70, durationMs: 140, gain: 0.022 });
    },
    craft() {
      playPluck(520, { durationMs: 90, gain: 0.026 });
      playBell(760, { delayMs: 58, durationMs: 120, gain: 0.02 });
    },
    listen() {
      playBell(700, { durationMs: 120, gain: 0.02 });
    },
    swipe() {
      const ctx = resumeCtx();
      if (!ctx) {
        return;
      }
      const start = ctx.currentTime + 0.001;
      scheduleNoise({ time: start, duration: 0.04, gain: 0.012, filterFrequency: 1600, playbackRate: 1.4 });
      scheduleTone({ time: start, frequency: 380, endFrequency: 620, duration: 0.06, type: "sine", gain: 0.015, attack: 0.002, release: 0.04 });
    },
  };
}

export function bindUiTapSounds(root, audio, selector = 'button, [role="button"]') {
  if (!root || !audio) {
    return;
  }
  let lastPointerUpAt = 0;

  function shouldPlay(target) {
    const button = target?.closest?.(selector);
    if (!button) {
      return false;
    }
    if (button.disabled || button.getAttribute("aria-disabled") === "true") {
      return false;
    }
    return true;
  }

  root.addEventListener("pointerup", (event) => {
    if (!shouldPlay(event.target)) {
      return;
    }
    lastPointerUpAt = Date.now();
    audio.unlock();
    audio.uiTap();
  });

  root.addEventListener("click", (event) => {
    if (!shouldPlay(event.target)) {
      return;
    }
    if (Date.now() - lastPointerUpAt < 320) {
      return;
    }
    audio.unlock();
    audio.uiTap();
  });
}