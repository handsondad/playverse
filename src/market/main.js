import { MarketGame } from "./marketGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";

const PROGRESS_KEY = "market-game-progress";
const SETTINGS_KEY = "market-game-settings";
const GLOBAL_SETTINGS_KEY = "kids-global-settings";

const game = new MarketGame();

const shoppingListEl = document.querySelector("#shoppingList");
const cartItemsEl = document.querySelector("#cartItems");
const cartCountEl = document.querySelector("#cartCount");
const shelfGrid = document.querySelector("#shelfGrid");
const scoreValue = document.querySelector("#scoreValue");
const ordersValue = document.querySelector("#ordersValue");
const streakValue = document.querySelector("#streakValue");
const feedbackEl = document.querySelector("#feedback");
const nextOrderBtn = document.querySelector("#nextOrderBtn");
const submitBtn = document.querySelector("#submitBtn");
const clearCartBtn = document.querySelector("#clearCartBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const resetBtn = document.querySelector("#resetBtn");
const parentModeBtn = document.querySelector("#parentModeBtn");

const settingsState = { voiceOn: true, careMode: "standard" };
const progressState = { bestScore: 0, bestOrders: 0 };
const CARE_MODES = ["standard", "soft", "quiet"];
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

function careModeLabel(mode) {
  if (mode === "soft") {
    return "柔和";
  }
  if (mode === "quiet") {
    return "安静";
  }
  return "标准";
}

function nextCareMode(current) {
  const index = CARE_MODES.indexOf(current);
  return index === -1 ? "standard" : CARE_MODES[(index + 1) % CARE_MODES.length];
}

function loadSettings() {
  try {
    const globalParsed = JSON.parse(localStorage.getItem(GLOBAL_SETTINGS_KEY) || "{}");
    const localParsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const merged = { ...localParsed, ...globalParsed };
    settingsState.voiceOn = merged.voiceOn !== false;
    settingsState.careMode = CARE_MODES.includes(merged.careMode) ? merged.careMode : "standard";
  } catch {
    settingsState.voiceOn = true;
    settingsState.careMode = "standard";
  }
}

function saveSettings() {
  const payload = {
    voiceOn: settingsState.voiceOn,
    careMode: settingsState.careMode,
    parentMode: settingsState.careMode !== "standard",
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(payload));
}

function loadProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    progressState.bestScore = Number(parsed.bestScore || 0);
    progressState.bestOrders = Number(parsed.bestOrders || 0);
  } catch {
    progressState.bestScore = 0;
    progressState.bestOrders = 0;
  }
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressState));
}

function speak(text, force = false) {
  if (!window.speechSynthesis || !settingsState.voiceOn) {
    return;
  }
  if (settingsState.careMode === "quiet" && !force) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = settingsState.careMode === "soft" ? 0.88 : 0.96;
  window.speechSynthesis.speak(utterance);
}

function renderSettingsUi() {
  voiceBtn.textContent = `语音引导：${settingsState.voiceOn ? "开" : "关"}`;
  parentModeBtn.textContent = `护眼模式：${careModeLabel(settingsState.careMode)}`;
}

function renderShoppingList(snapshot) {
  const cartSet = new Set(snapshot.cart);
  shoppingListEl.innerHTML = snapshot.shoppingList.map((id) => {
    const item = snapshot.items.find((i) => i.id === id);
    if (!item) {
      return "";
    }
    const checked = cartSet.has(id);
    return `
      <li class="list-item ${checked ? "is-checked" : ""}">
        <span class="list-item-icon">${item.icon}</span>
        <span>${item.name}</span>
        <span class="list-item-check">${checked ? "✅" : ""}</span>
      </li>
    `;
  }).join("");
}

function renderCart(snapshot) {
  cartCountEl.textContent = String(snapshot.cart.length);

  if (!snapshot.cart.length) {
    cartItemsEl.innerHTML = "<span class=\"cart-empty\">购物车是空的</span>";
    return;
  }

  cartItemsEl.innerHTML = snapshot.cart.map((id) => {
    const item = snapshot.items.find((i) => i.id === id);
    return item ? `<span class="cart-item" title="${item.name}">${item.icon}</span>` : "";
  }).join("");
}

function renderShelf(snapshot) {
  const cartSet = new Set(snapshot.cart);
  const listSet = new Set(snapshot.shoppingList);

  shelfGrid.innerHTML = snapshot.items.map((item) => {
    const inCart = cartSet.has(item.id);
    const isNeeded = listSet.has(item.id);
    const extraClass = [
      inCart ? "in-cart" : "",
      isNeeded && !snapshot.submitted ? "is-needed" : "",
    ].filter(Boolean).join(" ");

    return `
      <button class="shelf-item ${extraClass}" type="button" data-item-id="${item.id}" ${snapshot.submitted ? "disabled" : ""}>
        <span class="shelf-item-icon">${item.icon}</span>
        <span class="shelf-item-name">${item.name}</span>
        ${inCart ? "<span class=\"shelf-item-badge\">已选</span>" : ""}
      </button>
    `;
  }).join("");
}

function render(snapshot) {
  scoreValue.textContent = String(snapshot.score);
  ordersValue.textContent = String(snapshot.ordersCompleted);
  streakValue.textContent = String(snapshot.streak);

  renderShoppingList(snapshot);
  renderCart(snapshot);
  renderShelf(snapshot);

  feedbackEl.textContent = snapshot.feedback;
  feedbackEl.className = snapshot.submitted
    ? (snapshot.lastResult ? "is-correct" : "is-wrong")
    : "";

  nextOrderBtn.hidden = !snapshot.submitted;
  submitBtn.disabled = snapshot.submitted;
  clearCartBtn.disabled = snapshot.submitted;
}

shelfGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-item-id]");
  if (!button || button.disabled) {
    return;
  }
  const snapshot = game.toggleCart(button.dataset.itemId);
  render(snapshot);
  const item = snapshot.items.find((i) => i.id === button.dataset.itemId);
  const inCart = snapshot.cart.includes(button.dataset.itemId);
  if (item) {
    gameAudio.pickup();
    speak(inCart ? `${item.name}放进购物车` : `${item.name}取出`);
  }
});

submitBtn.addEventListener("click", () => {
  const snapshot = game.submit();
  progressState.bestScore = Math.max(progressState.bestScore, snapshot.score);
  progressState.bestOrders = Math.max(progressState.bestOrders, snapshot.ordersCompleted);
  saveProgress();
  render(snapshot);

  if (snapshot.correct) {
    gameAudio.win();
    speak(snapshot.feedback);
  } else {
    gameAudio.wrong();
    speak(snapshot.feedback);
  }
});

clearCartBtn.addEventListener("click", () => {
  const snapshot = game.getSnapshot();
  if (snapshot.submitted) {
    return;
  }
  snapshot.cart.forEach((id) => game.toggleCart(id));
  render(game.getSnapshot());
  gameAudio.uiTap();
});

nextOrderBtn.addEventListener("click", () => {
  const snapshot = game.nextOrder();
  render(snapshot);
  const listNames = snapshot.shoppingList
    .map((id) => snapshot.items.find((i) => i.id === id)?.name)
    .filter(Boolean)
    .join("、");
  speak(`新的购物清单：${listNames}。`);
  gameAudio.uiTap();
});

resetBtn.addEventListener("click", () => {
  game.reset();
  render(game.getSnapshot());
  speak("重新开始购物！", true);
  gameAudio.uiTap();
});

voiceBtn.addEventListener("click", () => {
  settingsState.voiceOn = !settingsState.voiceOn;
  saveSettings();
  renderSettingsUi();
});

parentModeBtn.addEventListener("click", () => {
  settingsState.careMode = nextCareMode(settingsState.careMode);
  saveSettings();
  renderSettingsUi();
});

loadSettings();
loadProgress();
renderSettingsUi();
bindUiTapSounds(document.body, gameAudio);
render(game.getSnapshot());

const initialSnapshot = game.getSnapshot();
const listNames = initialSnapshot.shoppingList
  .map((id) => initialSnapshot.items.find((i) => i.id === id)?.name)
  .filter(Boolean)
  .join("、");
speak(`购物清单：${listNames}，找到后放进购物车。`, true);
