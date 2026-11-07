import { createSeededRandom, todayString } from "./random.js";
import { clearGameInterval, setGameInterval } from "./timers.js";
import { createGameAudio } from "./audio.js";
import { loadSettings } from "./settings.js";
import { mountSettingsButtons } from "./settingsButtons.js";
import { SPEECH_PRESETS, createSpeaker } from "./speech.js";
import { bindDelegatedTap, bindSoftTap } from "./tap.js";
import { readNumber, writeValue } from "./storage.js";
import { loadGameConfig, showConfigError } from "./config.js";
import { setHtml, setText } from "./dom.js";

const QUEUE_SIZE = 5;

// Shared engine for the "match the item to its target" rush games
// (fruit, ocean, pet, forest, star, postman). The RNG call order in
// createItem/rotateWeather must stay fixed so daily seeds deal the same rounds.
//
// rules: {
//   seedTag, targetsKey, levelTargetIdsKey, levelGoalKey, defaultGoal,
//   timed: { type, chanceKey, limitKey, defaultLimitMs, timeBonusSec },
//   bonus: { type, chanceKey, extraCount, extraPoints },  // no extraPoints = double score
//   milestoneEvery,                                       // 0 = no time reward
//   weather: { idle, defaultPool },
//   text: { idle, start, timedExpired, timedToast, weatherEvent, weatherToast,
//           correctEvent, correctToast, typeText: { timed, bonus },
//           wrongEvent, wrongToast, lifeName },
// }
export class QueueGame {
  constructor(rules, { onStateChange, onResult, onToast }) {
    this.rules = rules;
    this.onStateChange = onStateChange;
    this.onResult = onResult;
    this.onToast = onToast;
    this.levels = [];
    this.targets = [];
    this.random = Math.random;
    this.timerId = 0;
    this.state = this.createIdleState();
  }

  createIdleState() {
    const { weather, timed, text } = this.rules;
    return {
      isRunning: false,
      isWin: false,
      levelId: "",
      levelName: "",
      timeLeft: 0,
      goal: 0,
      done: 0,
      lives: 0,
      score: 0,
      streak: 0,
      bestScore: 0,
      targetPool: [],
      active: null,
      activeAgeMs: 0,
      queue: [],
      spawnMs: 1300,
      weatherCycleMs: 8500,
      weatherRemainingMs: 0,
      weatherId: weather.idle.id,
      weatherName: weather.idle.name,
      weatherPool: [],
      timedChance: 0,
      bonusChance: 0,
      timedLimitMs: timed.defaultLimitMs,
      spawnCooldownMs: 0,
      lastEvent: text.idle,
    };
  }

  init(data, bestScore = 0) {
    this.levels = Array.isArray(data?.levels) ? data.levels : [];
    this.targets = Array.isArray(data?.[this.rules.targetsKey]) ? data[this.rules.targetsKey] : [];
    this.state = {
      ...this.createIdleState(),
      bestScore: Number(bestScore || 0),
    };
    this.emit();
  }

  stop() {
    if (this.timerId) {
      clearGameInterval(this.timerId);
      this.timerId = 0;
    }
  }

  start(levelId, options = {}) {
    const level = this.levels.find((item) => item.id === levelId) || this.levels[0];
    if (!level) {
      return;
    }
    const { rules } = this;

    this.stop();
    this.random = createSeededRandom(options.seed || `${Date.now()}|${level.id}|${rules.seedTag}`);

    const targetIds = Array.isArray(level[rules.levelTargetIdsKey]) ? level[rules.levelTargetIdsKey] : [];
    const targetPool = this.targets.filter((item) => targetIds.includes(item.id));
    const weatherPool = Array.isArray(options.weatherPool) && options.weatherPool.length > 0
      ? options.weatherPool
      : rules.weather.defaultPool;
    const firstWeather = weatherPool[0] || rules.weather.idle;
    const weatherCycleMs = Number(level.weatherCycleMs || options.weatherCycleMs || 8500);
    // The opening queue is dealt with the previous state's chances (none when idle);
    // daily seeds depend on it, so it must be built before the new state replaces it.
    const queue = this.createQueue(targetPool, QUEUE_SIZE);

    this.state = {
      ...this.createIdleState(),
      isRunning: true,
      levelId: level.id,
      levelName: level.name,
      timeLeft: Number(level.timeLimitSec || 80),
      goal: Number(level[rules.levelGoalKey] || rules.defaultGoal),
      lives: Number(level.lives || 3),
      spawnMs: Number(level.spawnMs || 1300),
      weatherCycleMs,
      weatherRemainingMs: weatherCycleMs,
      weatherId: firstWeather.id,
      weatherName: firstWeather.name,
      weatherPool,
      timedChance: Number(level[rules.timed.chanceKey] || 0),
      bonusChance: Number(level[rules.bonus.chanceKey] || 0),
      timedLimitMs: Number(level[rules.timed.limitKey] || rules.timed.defaultLimitMs),
      spawnCooldownMs: 200,
      bestScore: this.state.bestScore,
      targetPool,
      queue,
      lastEvent: rules.text.start,
    };

    this.emit();
    this.timerId = setGameInterval(() => this.tick(), 100);
  }

  createQueue(pool, count) {
    const list = [];
    for (let i = 0; i < count; i += 1) {
      list.push(this.createItem(pool));
    }
    return list;
  }

  createItem(pool = this.state.targetPool) {
    if (!Array.isArray(pool) || pool.length === 0) {
      return null;
    }
    const { timed, bonus } = this.rules;
    const index = Math.floor(this.random() * pool.length);
    const target = pool[index];
    const isBonus = this.random() < this.state.bonusChance;
    const isTimed = !isBonus && this.random() < this.state.timedChance;
    return {
      id: `${Date.now()}-${Math.floor(this.random() * 100000)}`,
      targetId: target.id,
      type: isBonus ? bonus.type : (isTimed ? timed.type : "normal"),
    };
  }

  tick() {
    if (!this.state.isRunning) {
      return;
    }
    const { state } = this;
    const { text } = this.rules;

    state.timeLeft = Math.max(0, state.timeLeft - 0.1);
    state.spawnCooldownMs -= 100;
    state.weatherRemainingMs -= 100;

    if (state.weatherRemainingMs <= 0) {
      this.rotateWeather();
    }

    if (!state.active && state.spawnCooldownMs <= 0) {
      state.active = state.queue.shift() || this.createItem();
      state.activeAgeMs = 0;
      state.queue.push(this.createItem());
      state.spawnCooldownMs = state.spawnMs;
    }

    if (state.active) {
      state.activeAgeMs += 100;
      if (state.active.type === this.rules.timed.type && state.activeAgeMs >= state.timedLimitMs) {
        state.lives -= 1;
        state.streak = 0;
        state.lastEvent = text.timedExpired;
        this.onToast?.(text.timedToast);
        state.active = null;
        state.activeAgeMs = 0;

        if (state.lives <= 0) {
          this.finish(false);
          return;
        }
      }
    }

    if (state.timeLeft <= 0) {
      this.finish(state.done >= state.goal);
      return;
    }

    this.emit();
  }

  rotateWeather() {
    const pool = Array.isArray(this.state.weatherPool) ? this.state.weatherPool : [];
    if (!pool.length) {
      return;
    }
    const { text } = this.rules;
    const next = pool[Math.floor(this.random() * pool.length)] || pool[0];
    this.state.weatherId = next.id;
    this.state.weatherName = next.name;
    this.state.weatherRemainingMs = this.state.weatherCycleMs;
    this.state.lastEvent = `${text.weatherEvent}：${next.name}`;
    this.onToast?.(`${text.weatherToast}：${next.name}`);
  }

  choose(targetId) {
    const { state } = this;
    if (!state.isRunning || !state.active) {
      return;
    }
    const { timed, bonus, milestoneEvery, text } = this.rules;

    if (targetId === state.active.targetId) {
      const type = state.active.type || "normal";
      const isTimed = type === timed.type;
      const isBonus = type === bonus.type;
      state.done += isBonus ? (bonus.extraCount || 1) : 1;
      state.streak += 1;
      let gained = 8 + Math.min(8, state.streak);
      if (isTimed) {
        gained += 6;
        state.timeLeft = Math.min(99, state.timeLeft + timed.timeBonusSec);
      }
      if (isBonus) {
        gained = bonus.extraPoints ? gained + bonus.extraPoints : gained * 2;
      }
      state.score += gained;
      state.bestScore = Math.max(state.bestScore, state.score);
      const typeText = isTimed ? text.typeText.timed : (isBonus ? text.typeText.bonus : "");
      state.lastEvent = `${text.correctEvent} +${gained} 分${typeText}`;
      this.onToast?.(text.correctToast);
      state.active = null;
      state.activeAgeMs = 0;

      if (milestoneEvery && state.done > 0 && state.done % milestoneEvery === 0) {
        state.timeLeft = Math.min(99, state.timeLeft + 1);
        state.lastEvent = `${state.lastEvent}，奖励 1 秒`;
      }

      if (state.done >= state.goal) {
        this.finish(true);
        return;
      }
    } else {
      const loseLife = state.active.type === bonus.type ? 2 : 1;
      state.lives -= loseLife;
      state.streak = 0;
      state.lastEvent = `${text.wrongEvent}，损失 ${loseLife} 点${text.lifeName}`;
      this.onToast?.(text.wrongToast);
      if (state.lives <= 0) {
        this.finish(false);
        return;
      }
    }

    this.emit();
  }

  finish(isWin) {
    this.stop();
    this.state.isRunning = false;
    this.state.isWin = isWin;
    this.emit();

    this.onResult?.({
      isWin,
      levelId: this.state.levelId,
      levelName: this.state.levelName,
      done: this.state.done,
      goal: this.state.goal,
      lives: this.state.lives,
      score: this.state.score,
      bestScore: this.state.bestScore,
      remainTime: Math.max(0, Math.ceil(this.state.timeLeft)),
    });
  }

  emit() {
    this.onStateChange?.({
      ...this.state,
      targetPool: this.state.targetPool.map((item) => ({ ...item })),
      queue: this.state.queue.filter(Boolean).map((item) => ({ ...item })),
      active: this.state.active ? { ...this.state.active } : null,
    });
  }
}

// ui: {
//   id, configUrl, requiredKeys, levelDefaults,
//   shellSelector, targetButtonsId, targetButtonClass, itemIdPrefix,
//   palette: { brand, bg, activeEnd }, weatherClasses, weatherLabel,
//   fallbackEmoji, waitingEmoji, queueTags: { timed, bonus },
//   guide: { running, won, idle }, hints: { timed, bonus, normal, waiting },
//   badges: { timed, bonus, normal, waiting }, waitingLabel,
//   result: { won, lost, doneLabel, lifeLabel, extra },
//   goalText(goal), welcome, playTone(audio, freq, durationMs), resultSound(audio, isWin),
// }
export function mountQueueGame(rules, ui) {
  const SETTINGS_KEY = `${ui.id}-settings`;
  const BEST_KEY = `${ui.id}-best-score`;
  const { timed, bonus } = rules;

  const $ = (selector) => document.querySelector(selector);
  const startBtn = $("#startBtn");
  const retryBtn = $("#retryBtn");
  const dailyBtn = $("#dailyBtn");

  const levelButtonsEl = $("#levelButtons");
  const themeButtonsEl = $("#themeButtons");
  const targetButtonsEl = $(`#${ui.targetButtonsId}`);
  const queueList = $("#queueList");

  const selectorHint = $("#selectorHint");
  const guideText = $("#guideText");
  const feedbackText = $("#feedbackText");
  const weatherText = $("#weatherText");
  const shellEl = $(ui.shellSelector);

  const progressValue = $("#progressValue");
  const timeValue = $("#timeValue");
  const livesValue = $("#livesValue");
  const scoreValue = $("#scoreValue");
  const streakValue = $("#streakValue");
  const bestValue = $("#bestValue");

  const itemLabel = $(`#${ui.itemIdPrefix}Label`);
  const itemEmoji = $(`#${ui.itemIdPrefix}Emoji`);
  const itemHint = $(`#${ui.itemIdPrefix}Hint`);
  const itemTypeBadge = $(`#${ui.itemIdPrefix}TypeBadge`);

  const resultEl = $("#result");
  const resultTitle = $("#resultTitle");
  const resultText = $("#resultText");

  const settingsState = loadSettings(SETTINGS_KEY);
  const speak = createSpeaker(settingsState, SPEECH_PRESETS.standard);
  const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

  let data = null;
  let currentLevelId = "";
  let currentThemeId = "";
  let latestState = null;

  function getLevelById(id) {
    return data.levels.find((item) => item.id === id) || data.levels[0];
  }

  function getTargetById(id) {
    return data[rules.targetsKey].find((item) => item.id === id) || null;
  }

  function getThemeById(id) {
    return data.themes.find((item) => item.id === id) || data.themes[0];
  }

  function selectionHint(started = false) {
    const level = getLevelById(currentLevelId);
    const theme = getThemeById(currentThemeId);
    const goal = ui.goalText(level[rules.levelGoalKey]);
    return started
      ? `已开始：${level.name}，主题 ${theme.name}，${goal}。`
      : `已选择：${level.name} + ${theme.name}，${goal}。`;
  }

  function renderLevelButtons() {
    levelButtonsEl.innerHTML = data.levels.map((level) => {
      const cls = level.id === currentLevelId ? "level-btn is-active" : "level-btn";
      return `<button class="${cls}" data-level-id="${level.id}" type="button">${level.name}</button>`;
    }).join("");
  }

  function applyThemePalette(theme) {
    if (!theme?.palette) {
      return;
    }
    document.documentElement.style.setProperty("--brand", theme.palette.brand || ui.palette.brand);
    document.documentElement.style.setProperty("--bg", theme.palette.bg || ui.palette.bg);
    document.documentElement.style.setProperty("--panel", theme.palette.panel || "rgba(255, 255, 255, 0.95)");
  }

  function renderThemeButtons() {
    if (!themeButtonsEl) {
      return;
    }
    themeButtonsEl.innerHTML = data.themes.map((theme) => {
      const cls = theme.id === currentThemeId ? "theme-btn is-active" : "theme-btn";
      const accent = theme.palette?.brand || ui.palette.brand;
      const style = theme.id === currentThemeId
        ? `background: linear-gradient(180deg, ${accent} 0%, ${ui.palette.activeEnd} 100%); color: #fff;`
        : `border: 2px solid ${accent};`;
      return `<button class="${cls}" data-theme-id="${theme.id}" style="${style}" type="button">${theme.name}</button>`;
    }).join("");
    applyThemePalette(getThemeById(currentThemeId));
  }

  function applyWeatherLook(weatherId) {
    if (!shellEl) {
      return;
    }
    shellEl.classList.remove(...ui.weatherClasses.map((id) => `weather-${id}`));
    shellEl.classList.add(`weather-${weatherId || rules.weather.idle.id}`);
  }

  function renderTargetButtons(state) {
    const pool = Array.isArray(state?.targetPool) ? state.targetPool : [];
    setHtml(targetButtonsEl, pool.map((target) => {
      const classes = [ui.targetButtonClass];
      if (state.active?.targetId === target.id) {
        classes.push("is-active");
      }
      const disabled = !state.isRunning || !state.active;
      return `<button class="${classes.join(" ")}" data-target-id="${target.id}" style="background:${target.color};" type="button" ${disabled ? "disabled" : ""}><span class="emoji">${target.emoji}</span><span class="name">${target.name}</span></button>`;
    }).join(""));
  }

  function renderQueue(state) {
    const queue = Array.isArray(state?.queue) ? state.queue.slice(0, QUEUE_SIZE) : [];
    while (queue.length < QUEUE_SIZE) {
      queue.push(null);
    }
    setHtml(queueList, queue.map((item) => {
      if (!item) {
        return "<div class=\"queue-item empty\">·</div>";
      }
      const target = getTargetById(item.targetId);
      const cls = ["queue-item"];
      if (item.type === timed.type) {
        cls.push(timed.type);
      }
      if (item.type === bonus.type) {
        cls.push(bonus.type);
      }
      const tag = item.type === timed.type ? ui.queueTags.timed : (item.type === bonus.type ? ui.queueTags.bonus : "");
      return `<div class="${cls.join(" ")}" title="${target?.name || item.targetId}">${target?.emoji || ui.fallbackEmoji}${tag}</div>`;
    }).join(""));
  }

  function setBadge(text, cls) {
    if (itemTypeBadge) {
      itemTypeBadge.textContent = text;
      itemTypeBadge.className = `badge ${cls}`;
    }
  }

  function updateUi(state) {
    latestState = state;
    progressValue.textContent = `${state.done} / ${state.goal}`;
    timeValue.textContent = `${Math.max(0, Math.ceil(state.timeLeft))} 秒`;
    livesValue.textContent = String(state.lives);
    scoreValue.textContent = String(state.score);
    streakValue.textContent = String(state.streak);
    bestValue.textContent = String(state.bestScore);

    setText(feedbackText, state.lastEvent);
    if (weatherText) {
      weatherText.textContent = `${ui.weatherLabel}：${state.weatherName || rules.weather.idle.name}`;
    }
    applyWeatherLook(state.weatherId);
    guideText.textContent = state.isRunning
      ? ui.guide.running
      : (state.isWin ? ui.guide.won : ui.guide.idle);

    retryBtn.disabled = !state.levelId;

    if (state.active) {
      const target = getTargetById(state.active.targetId);
      itemLabel.textContent = `目标：${target?.name || state.active.targetId}`;
      itemEmoji.textContent = target?.emoji || ui.fallbackEmoji;
      if (state.active.type === timed.type) {
        itemHint.textContent = ui.hints.timed;
        setBadge(ui.badges.timed, timed.type);
      } else if (state.active.type === bonus.type) {
        itemHint.textContent = ui.hints.bonus;
        setBadge(ui.badges.bonus, bonus.type);
      } else {
        itemHint.textContent = ui.hints.normal;
        setBadge(ui.badges.normal, "normal");
      }
    } else {
      itemLabel.textContent = ui.waitingLabel;
      itemEmoji.textContent = ui.waitingEmoji || ui.fallbackEmoji;
      itemHint.textContent = ui.hints.waiting;
      setBadge(ui.badges.waiting, "normal");
    }

    renderTargetButtons(state);
    renderQueue(state);
  }

  function showResult(payload) {
    resultEl.hidden = false;
    resultTitle.textContent = payload.isWin ? ui.result.won : ui.result.lost;
    resultText.textContent = `难度：${payload.levelName} | ${ui.result.doneLabel}：${payload.done}/${payload.goal} | 分数：${payload.score} | ${ui.result.lifeLabel}：${payload.lives} | ${ui.result.extra || ""}剩余时间：${payload.remainTime} 秒`;
    ui.resultSound?.(gameAudio, payload.isWin);
    if (payload.bestScore > readNumber(BEST_KEY)) {
      writeValue(BEST_KEY, payload.bestScore);
    }
  }

  const game = new QueueGame(rules, {
    onStateChange: updateUi,
    onResult: showResult,
    onToast: (text) => {
      setText(feedbackText, text);
      speak(text, { detailOnly: true });
    },
  });

  function startGame(seed = "") {
    resultEl.hidden = true;
    const level = getLevelById(currentLevelId);
    const theme = getThemeById(currentThemeId);
    selectorHint.textContent = selectionHint(true);
    game.start(level.id, {
      ...(seed ? { seed } : {}),
      weatherPool: theme.weatherPool,
    });
  }

  bindSoftTap(startBtn, () => startGame());
  bindSoftTap(retryBtn, () => startGame());
  bindSoftTap(dailyBtn, () => startGame(`${todayString()}|${currentLevelId}|${currentThemeId}|${rules.seedTag}`));

  mountSettingsButtons({ storageKey: SETTINGS_KEY, settings: settingsState, bindTap: bindSoftTap });

  bindDelegatedTap(levelButtonsEl, "[data-level-id]", (button) => {
    currentLevelId = button.dataset.levelId;
    renderLevelButtons();
    selectorHint.textContent = selectionHint();
  });

  bindDelegatedTap(themeButtonsEl, "[data-theme-id]", (button) => {
    currentThemeId = button.dataset.themeId;
    renderThemeButtons();
    selectorHint.textContent = selectionHint();
  });

  bindDelegatedTap(targetButtonsEl, "[data-target-id]", (button) => {
    if (!latestState?.isRunning || !latestState.active) {
      return;
    }
    const targetId = button.dataset.targetId;
    const target = getTargetById(targetId);
    ui.playTone(gameAudio, target?.freq || 560, 120);
    game.choose(targetId);
  });

  async function bootstrap() {
    try {
      data = await loadGameConfig(ui.configUrl, ui.requiredKeys);
    } catch (error) {
      showConfigError(error);
      return;
    }

    data.levels = data.levels.map((level) => ({ ...ui.levelDefaults, ...level }));

    currentLevelId = data.levels[0].id;
    currentThemeId = data.themes[0].id;
    renderLevelButtons();
    renderThemeButtons();
    game.init(data, readNumber(BEST_KEY));
    if (ui.welcome) {
      selectorHint.textContent = selectionHint();
      speak(ui.welcome, { detailOnly: true });
    }
  }

  bootstrap();
  return game;
}
