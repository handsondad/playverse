import { bindUiTapSounds, createGameAudio } from "./audio.js";
import { loadSettings } from "./settings.js";
import { mountSettingsButtons } from "./settingsButtons.js";
import { SPEECH_PRESETS, createSpeaker } from "./speech.js";
import { readJson, writeJson } from "./storage.js";

function pickRandomDifferent(items, currentId) {
  const pool = items.filter((item) => item.id !== currentId);
  const nextPool = pool.length ? pool : items;
  return nextPool[Math.floor(Math.random() * nextPool.length)];
}

// "Find the card" loop shared by the toddler games. Items: { id, name, icon, accent, label? };
// name is what gets spoken, label (default name) is printed under the icon.
export class FindGame {
  constructor({ items, introText, successText }) {
    this.items = items;
    this.introText = introText;
    this.successText = successText;
    this.reset();
  }

  reset() {
    this.found = 0;
    this.totalTaps = 0;
    this.lastTappedId = "";
    this.feedback = this.introText;
    this.target = pickRandomDifferent(this.items, "");
  }

  nextTarget() {
    this.target = pickRandomDifferent(this.items, this.target?.id || "");
    this.lastTappedId = "";
    this.feedback = `找${this.target.name}。`;
  }

  tap(itemId) {
    const item = this.items.find((entry) => entry.id === itemId);
    if (!item) {
      return this.getSnapshot();
    }

    this.totalTaps += 1;
    this.lastTappedId = itemId;

    if (itemId === this.target.id) {
      this.found += 1;
      this.feedback = this.successText(item);
      this.target = pickRandomDifferent(this.items, this.target.id);
      return { ...this.getSnapshot(), success: true, tapped: item };
    }

    this.feedback = `这是${item.name}，再找${this.target.name}。`;
    return { ...this.getSnapshot(), success: false, tapped: item };
  }

  getSnapshot() {
    return {
      cards: this.items,
      found: this.found,
      totalTaps: this.totalTaps,
      target: this.target,
      lastTappedId: this.lastTappedId,
      feedback: this.feedback,
    };
  }
}

export function mountFindGame(config) {
  const {
    progressKey,
    settingsKey,
    bestField,
    scoreId,
    celebrationIcons,
    celebrationText,
    guideText: formatGuide = (target) => `点 ${target.name}`,
    resetVerb = "点",
    iconClass = "icon",
    tintTarget = false,
    targetLabelClass = "",
    popOnSuccess = false,
  } = config;

  const game = new FindGame(config);

  const targetBadge = document.querySelector("#targetBadge");
  const guideText = document.querySelector("#guideText");
  const scoreValue = document.querySelector(`#${scoreId}`);
  const tapsValue = document.querySelector("#tapsValue");
  const bestValue = document.querySelector("#bestValue");
  const feedback = document.querySelector("#feedback");
  const celebration = document.querySelector("#celebration");
  const board = document.querySelector("#board");
  const nextBtn = document.querySelector("#nextBtn");
  const resetBtn = document.querySelector("#resetBtn");
  const statsToggleBtn = document.querySelector("#statsToggleBtn");

  const settingsState = loadSettings(settingsKey);
  const speak = createSpeaker(settingsState, SPEECH_PRESETS.toddler);
  const progressState = { [bestField]: Number(readJson(progressKey)[bestField] || 0) };
  const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });
  const uiState = { statsOpen: false };
  let celebrationTimer = 0;

  function renderStatsToggle() {
    if (statsToggleBtn) {
      statsToggleBtn.textContent = uiState.statsOpen ? "收起数据" : "家长查看";
    }
  }

  function showCelebration(text) {
    if (!celebration) {
      return;
    }
    window.clearTimeout(celebrationTimer);
    celebration.innerHTML = `<span class="celebration-icon">${celebrationIcons[0]}</span><span>${text}</span><span class="celebration-icon">${celebrationIcons[1]}</span>`;
    celebration.classList.add("is-visible");
    targetBadge.classList.add("is-celebrating");
    celebrationTimer = window.setTimeout(() => {
      celebration.classList.remove("is-visible");
      targetBadge.classList.remove("is-celebrating");
    }, 1200);
  }

  function renderCards(snapshot) {
    board.innerHTML = snapshot.cards.map((card) => `
    <button class="card ${snapshot.lastTappedId === card.id ? "is-active" : ""}" type="button" data-card-id="${card.id}" style="--accent:${card.accent}">
      <span class="card-${iconClass}">${card.icon}</span>
      <span class="card-label">${card.label ?? card.name}</span>
    </button>
  `).join("");
  }

  function render(snapshot) {
    const { target } = snapshot;
    const tint = tintTarget ? ` style="color:${target.accent}"` : "";
    const labelClass = targetLabelClass ? ` class="${targetLabelClass}"` : "";
    targetBadge.innerHTML = `<span class="target-${iconClass}"${tint}>${target.icon}</span><span${labelClass}>${target.label ?? target.name}</span>`;
    guideText.textContent = formatGuide(target);
    scoreValue.textContent = String(snapshot.found);
    tapsValue.textContent = String(snapshot.totalTaps);
    bestValue.textContent = String(progressState[bestField]);
    feedback.textContent = snapshot.feedback;
    feedback.className = `feedback ${snapshot.lastTappedId && snapshot.lastTappedId === target.id ? "is-good" : ""}`;
    renderCards(snapshot);
    document.body.classList.toggle("stats-open", uiState.statsOpen);
  }

  function refresh() {
    render(game.getSnapshot());
  }

  board.addEventListener("click", (event) => {
    const button = event.target.closest("[data-card-id]");
    if (!button) {
      return;
    }
    const snapshot = game.tap(button.dataset.cardId);
    progressState[bestField] = Math.max(progressState[bestField], snapshot.found);
    writeJson(progressKey, progressState);
    render(snapshot);
    if (snapshot.success) {
      if (popOnSuccess) {
        gameAudio.pop();
        gameAudio.success(880);
      } else {
        gameAudio.success();
      }
      showCelebration(typeof celebrationText === "function" ? celebrationText(snapshot.tapped) : celebrationText);
      const newSnapshot = game.getSnapshot();
      setTimeout(() => {
        speak(`现在找${newSnapshot.target.name}。`);
      }, 1000);
    }
    speak(snapshot.feedback);
  });

  nextBtn.addEventListener("click", () => {
    game.nextTarget();
    refresh();
    speak(game.getSnapshot().feedback);
  });

  resetBtn.addEventListener("click", () => {
    game.reset();
    refresh();
    speak(`重新来，${resetVerb}${game.getSnapshot().target.name}。`, { force: true });
  });

  statsToggleBtn?.addEventListener("click", () => {
    uiState.statsOpen = !uiState.statsOpen;
    renderStatsToggle();
    document.body.classList.toggle("stats-open", uiState.statsOpen);
  });

  mountSettingsButtons({
    storageKey: settingsKey,
    settings: settingsState,
    announce: (kind) => {
      if (kind === "voice" && settingsState.voiceOn) {
        speak(game.getSnapshot().feedback, { force: true });
      }
    },
  });

  renderStatsToggle();
  bindUiTapSounds(document.body, gameAudio);
  refresh();
  speak(`找${game.getSnapshot().target.name}。`, { force: true });
}
