import { BalanceGame } from "./balanceGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";
import { loadSettings } from "../shared/settings.js";
import { mountSettingsButtons, speakSettingChanges } from "../shared/settingsButtons.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { bindDelegatedTap, createSoftTap } from "../shared/tap.js";
import { hashText, todayString } from "../shared/random.js";
import { readNumber, readNumbers, writeJson, writeValue } from "../shared/storage.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { setHtml, setText } from "../shared/dom.js";

const SETTINGS_KEY = "balance-settings";
const STATS_KEY = "balance-stats";
const BEST_KEY = "balance-best-score";

const startBtn = document.querySelector("#startBtn");
const retryBtn = document.querySelector("#retryBtn");
const dailyBtn = document.querySelector("#dailyBtn");
const clearPanBtn = document.querySelector("#clearPanBtn");
const hintBtn = document.querySelector("#hintBtn");

const levelButtonsEl = document.querySelector("#levelButtons");
const selectorHint = document.querySelector("#selectorHint");
const guideText = document.querySelector("#guideText");
const stateBadge = document.querySelector("#stateBadge");
const feedbackText = document.querySelector("#feedbackText");
const scaleBeam = document.querySelector("#scaleBeam");
const leftPanItems = document.querySelector("#leftPanItems");
const rightPanItems = document.querySelector("#rightPanItems");
const weightButtons = document.querySelector("#weightButtons");

const roundsValue = document.querySelector("#roundsValue");
const leftTotalValue = document.querySelector("#leftTotalValue");
const rightTotalValue = document.querySelector("#rightTotalValue");
const scoreValue = document.querySelector("#scoreValue");
const bestValue = document.querySelector("#bestValue");

const resultEl = document.querySelector("#result");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");

const settingsState = loadSettings(SETTINGS_KEY);
const speak = createSpeaker(settingsState, SPEECH_PRESETS.guide);
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });
const bindSoftTap = createSoftTap({ flashMs: 70 });
const stats = readNumbers(STATS_KEY, { plays: 0, wins: 0, balancedRounds: 0, bestStreak: 0 });

let levelsData = null;
let currentLevelId = "easy";
let latestState = null;
let nextTimer = 0;

function getLevelById(id) {
  return levelsData.levels.find((item) => item.id === id) || levelsData.levels[0];
}

function renderLevelButtons() {
  setHtml(levelButtonsEl, levelsData.levels.map((level) => {
    const cls = level.id === currentLevelId ? "level-btn is-active" : "level-btn";
    return `<button type="button" class="${cls}" data-level-id="${level.id}">${level.name}</button>`;
  }).join(""));
}

function updateUi(state) {
  latestState = state;
  roundsValue.textContent = `${state.roundIndex} / ${state.targetRounds}`;
  leftTotalValue.textContent = String(state.leftTotal);
  rightTotalValue.textContent = String(state.rightTotal);
  scoreValue.textContent = String(state.score);
  bestValue.textContent = String(state.bestScore);

  hintBtn.textContent = `称重提示（${state.hintsLeft}）`;
  hintBtn.disabled = !state.isRunning || state.balanced || state.hintsLeft <= 0;
  clearPanBtn.disabled = !state.isRunning || state.balanced || !state.rightItems.some((i) => !i.fixed);
  retryBtn.disabled = !state.levelId;

  if (!state.isRunning && !state.leftItems.length) {
    stateBadge.textContent = "⚖️ 小小实验室";
    stateBadge.classList.remove("is-balanced");
  } else if (state.balanced) {
    stateBadge.textContent = "⚖️ 两边稳稳平衡啦！";
    stateBadge.classList.add("is-balanced");
  } else if (state.rightTotal < state.leftTotal) {
    stateBadge.textContent = "⬅️ 左边比较重";
    stateBadge.classList.remove("is-balanced");
  } else {
    stateBadge.textContent = "➡️ 右边太重啦";
    stateBadge.classList.remove("is-balanced");
  }

  scaleBeam.style.setProperty("--tilt", `${state.tiltDeg}deg`);
  scaleBeam.classList.toggle("is-balanced", state.balanced);

  setText(feedbackText, state.lastFeedback);
  setText(guideText, state.isRunning
    ? `当前：${state.levelName}，让左右两边重量相等即可过关。`
    : "看看左边有多重，往右边托盘放上砝码，让小天平稳稳变平。");

  setHtml(leftPanItems, state.leftItems.map((item) => (
    item.weight === 1
      ? `<span class="left-load"><span class="emoji">${item.icon}</span></span>`
      : `<span class="left-load"><span class="emoji">${item.icon}</span><span>${item.weight}</span></span>`
  )).join(""));

  setHtml(rightPanItems, state.rightItems.map((item) => {
    const cls = item.fixed ? "pan-chip is-fixed" : "pan-chip";
    return `
      <button type="button" class="${cls}" data-remove-uid="${item.uid}" aria-label="${item.name}，重${item.weight}" ${item.fixed || !state.isRunning || state.balanced ? "disabled" : ""}>
        <span class="emoji">${item.icon}</span>
        <span>+${item.weight}</span>
      </button>
    `;
  }).join(""));

  const disabled = !state.isRunning || state.balanced;
  setHtml(weightButtons, state.weights.map((w) => `
    <button type="button" class="weight-btn" data-weight-id="${w.id}" style="background:${w.color};" ${disabled ? "disabled" : ""}>
      <span class="emoji">${w.icon}</span>
      <span class="name">${w.name} (+${w.weight})</span>
    </button>
  `).join(""));
}

function showResult(payload) {
  resultEl.hidden = false;
  resultTitle.textContent = "平衡小科学家通关 ⭐";
  resultText.textContent = `难度：${payload.levelName} | 调平：${payload.roundsDone}/${payload.targetRounds} 次 | 分数：${payload.score} | 最高连对：${payload.bestStreak}`;
  gameAudio.win();

  stats.plays += 1;
  stats.wins += 1;
  stats.balancedRounds += payload.roundsDone;
  stats.bestStreak = Math.max(stats.bestStreak, payload.bestStreak);
  writeJson(STATS_KEY, stats);

  if (payload.bestScore > readNumber(BEST_KEY)) {
    writeValue(BEST_KEY, payload.bestScore);
  }
  speak("太棒啦，每一次天平都被你调得稳稳当当！");
}

const game = new BalanceGame({
  onStateChange: updateUi,
  onResult: showResult,
});

function startGame(options = {}) {
  if (!levelsData) {
    return;
  }
  window.clearTimeout(nextTimer);
  resultEl.hidden = true;
  const level = getLevelById(options.levelId || currentLevelId);
  selectorHint.textContent = level.tip;
  game.start(level.id, {
    modeName: options.modeName || "平衡挑战",
    seed: options.seed,
  });
  speak(latestState.lastFeedback);
}

function handleScaleOutcome(outcome) {
  if (!outcome.ok) {
    return;
  }
  if (outcome.balanced) {
    gameAudio.success(880);
    speak(latestState.lastFeedback);
    window.clearTimeout(nextTimer);
    nextTimer = window.setTimeout(() => {
      game.nextRound();
    }, 950);
  } else if (outcome.over) {
    gameAudio.wrong();
    speak(latestState.lastFeedback, { detailOnly: true });
  } else {
    gameAudio.pickup(620);
  }
}

bindUiTapSounds(document.body, gameAudio);

bindSoftTap(startBtn, () => startGame());
bindSoftTap(retryBtn, () => startGame());
bindSoftTap(dailyBtn, () => {
  if (!levelsData) {
    return;
  }
  const day = todayString();
  const hash = hashText(`${day}|balance`);
  const level = levelsData.levels[hash % levelsData.levels.length];
  currentLevelId = level.id;
  renderLevelButtons();
  startGame({
    levelId: level.id,
    modeName: `今日天平 ${day}`,
    seed: `${day}|${level.id}|balance`,
  });
});

bindSoftTap(clearPanBtn, () => {
  if (game.clearRightPan()) {
    gameAudio.place(340);
  }
});

bindSoftTap(hintBtn, () => {
  const text = game.useHint();
  if (text) {
    gameAudio.sparkle();
    speak(text);
  }
});

mountSettingsButtons({
  storageKey: SETTINGS_KEY,
  settings: settingsState,
  bindTap: bindSoftTap,
  announce: speakSettingChanges(speak, guideText),
});

bindDelegatedTap(levelButtonsEl, "[data-level-id]", (button) => {
  currentLevelId = button.dataset.levelId;
  renderLevelButtons();
  selectorHint.textContent = getLevelById(currentLevelId).tip;
});

bindDelegatedTap(weightButtons, "[data-weight-id]", (button) => {
  handleScaleOutcome(game.addWeight(button.dataset.weightId));
});

bindDelegatedTap(rightPanItems, "[data-remove-uid]", (button) => {
  const outcome = game.removeRightItem(button.dataset.removeUid);
  if (outcome.ok) {
    gameAudio.place(380);
    if (outcome.balanced) {
      handleScaleOutcome(outcome);
    }
  }
});

async function bootstrap() {
  try {
    levelsData = await loadGameConfig("../../configs/levels/balance-scale.levels.json", ["levels", "leftLoads"]);
  } catch (error) {
    showConfigError(error);
    return;
  }
  currentLevelId = levelsData.levels[0].id;
  renderLevelButtons();
  selectorHint.textContent = levelsData.levels[0].tip;
  game.init(levelsData, readNumber(BEST_KEY));
}

bootstrap();
