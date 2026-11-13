import { activeIntervals, localStorageStub, setVisibility } from "./helpers/browser-stub.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSeededRandom, hashSeed, hashText } from "../src/shared/random.js";
import { GLOBAL_SETTINGS_KEY, loadSettings, nextCareMode, saveSettings } from "../src/shared/settings.js";
import { mountSettingsButtons } from "../src/shared/settingsButtons.js";
import { readNumbers, readUnlocks } from "../src/shared/storage.js";
import { setHtml, syncKeyed } from "../src/shared/dom.js";
import { bindDelegatedTap } from "../src/shared/tap.js";
import { clearGameInterval, setGameInterval } from "../src/shared/timers.js";
import { FindGame } from "../src/shared/findGame.js";

test("seeded random keeps daily challenges stable", () => {
  // Pinned values: changing them silently changes every saved daily challenge.
  assert.equal(hashSeed("playverse"), 1098000720);
  const random = createSeededRandom("2026-11-07|easy|fruit");
  assert.deepEqual([random(), random(), random()].map((value) => value.toFixed(12)), [
    "0.804252531379",
    "0.263571865391",
    "0.270876755938",
  ]);
  const a = createSeededRandom("same-seed");
  const b = createSeededRandom("same-seed");
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  // hashText picks which level/song/theme is today's challenge.
  assert.equal(hashText("2026-11-07|runner"), 1681315261);
  assert.equal(hashText("2026-11-07"), 1162589257);
  assert.equal(hashText("2026-01-31|farm"), 1650067213);
});

test("storage records: numbers with defaults, easy always unlocked", () => {
  localStorageStub.clear();
  localStorageStub.setItem("demo-stats", JSON.stringify({ plays: "3", wins: 1, stray: 9 }));
  assert.deepEqual(readNumbers("demo-stats", { plays: 0, wins: 0, topLevel: 1 }), { plays: 3, wins: 1, topLevel: 1 });
  assert.deepEqual(readNumbers("missing", { plays: 0 }), { plays: 0 });

  localStorageStub.setItem("demo-progress", JSON.stringify({ unlocked: { easy: false, normal: 1 } }));
  assert.deepEqual(readUnlocks("demo-progress"), { unlocked: { easy: true, normal: true, hard: false } });
  assert.deepEqual(readUnlocks("missing"), { unlocked: { easy: true, normal: false, hard: false } });
});

test("settings buttons: tap toggles, saves, relabels and follows other tabs", () => {
  localStorageStub.clear();
  const buttons = { "#voiceBtn": {}, "#parentModeBtn": {} };
  const taps = new Map();
  let onStorage = null;
  globalThis.document.querySelector = (selector) => buttons[selector] || null;
  globalThis.addEventListener = (type, listener) => {
    if (type === "storage") {
      onStorage = listener;
    }
  };
  const settings = loadSettings("demo-settings");
  const announced = [];
  let changes = 0;
  try {
    mountSettingsButtons({
      storageKey: "demo-settings",
      settings,
      bindTap: (button, handler) => taps.set(button, handler),
      onChange: () => { changes += 1; },
      announce: (kind) => announced.push(kind),
    });
    assert.equal(buttons["#voiceBtn"].textContent, "语音引导：开");
    assert.equal(taps.size, 2, "no narration button on this page");

    taps.get(buttons["#voiceBtn"])();
    taps.get(buttons["#parentModeBtn"])();
    assert.equal(buttons["#voiceBtn"].textContent, "语音引导：关");
    assert.equal(buttons["#parentModeBtn"].textContent, "护眼模式：柔和");
    assert.deepEqual(JSON.parse(localStorageStub.getItem(GLOBAL_SETTINGS_KEY)).careMode, "soft");
    assert.deepEqual(announced, ["voice", "careMode"]);

    localStorageStub.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify({ voiceOn: true, careMode: "quiet" }));
    onStorage({ key: GLOBAL_SETTINGS_KEY });
    assert.equal(buttons["#parentModeBtn"].textContent, "护眼模式：安静");
    assert.equal(changes, 4);
    assert.equal(announced.length, 2, "changes from another tab are not announced");
  } finally {
    delete globalThis.document.querySelector;
    delete globalThis.addEventListener;
  }
});

test("settings: global key wins and legacy parentMode maps to soft", () => {
  localStorageStub.clear();
  localStorageStub.setItem("demo-settings", JSON.stringify({ voiceOn: false, narrationLevel: "detailed" }));
  assert.deepEqual(loadSettings("demo-settings"), { voiceOn: false, careMode: "standard", narrationLevel: "detailed" });

  localStorageStub.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify({ voiceOn: true, parentMode: true }));
  assert.deepEqual(loadSettings("demo-settings"), { voiceOn: true, careMode: "soft", narrationLevel: "detailed" });

  const target = { untouched: 1 };
  loadSettings("demo-settings", target);
  assert.equal(target.untouched, 1);
  assert.equal(target.careMode, "soft");
});

test("settings: saving merges into the global key instead of overwriting it", () => {
  localStorageStub.clear();
  localStorageStub.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify({ extra: "keep-me" }));
  saveSettings("demo-settings", { voiceOn: false, careMode: "quiet", narrationLevel: "key" });
  const global = JSON.parse(localStorageStub.getItem(GLOBAL_SETTINGS_KEY));
  assert.equal(global.extra, "keep-me");
  assert.equal(global.careMode, "quiet");
  assert.equal(global.parentMode, true);
  assert.equal(nextCareMode("quiet"), "standard");
  assert.equal(nextCareMode("bogus"), "standard");
});

test("setHtml skips identical markup", () => {
  let writes = 0;
  const el = {
    set innerHTML(value) {
      writes += 1;
      this.value = value;
    },
  };
  assert.equal(setHtml(el, "<b>1</b>"), true);
  assert.equal(setHtml(el, "<b>1</b>"), false);
  assert.equal(setHtml(el, "<b>2</b>"), true);
  assert.equal(writes, 2);
  assert.equal(el.value, "<b>2</b>");
});

test("syncKeyed reuses one element per id and removes the ones that left", () => {
  const container = {
    children: [],
    appendChild(el) {
      el.remove = () => { container.children = container.children.filter((child) => child !== el); };
      container.children.push(el);
    },
  };
  let created = 0;
  const render = (items) => syncKeyed(container, items, {
    create: () => { created += 1; return { x: null }; },
    update: (el, item) => { el.x = item.x; },
  });

  render([{ id: "a", x: 1 }, { id: "b", x: 2 }]);
  const [a] = container.children;
  render([{ id: "a", x: 5 }, { id: "c", x: 3 }]);
  assert.equal(created, 3);
  assert.equal(container.children[0], a, "a is moved in place, not rebuilt");
  assert.deepEqual(container.children.map((el) => el.x), [5, 3]);
  render([]);
  assert.equal(container.children.length, 0);
});

test("bindDelegatedTap handles pointerup and keyboard click without double-firing or hitting disabled buttons", () => {
  const listeners = {};
  const container = {
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
  };
  const tapped = [];
  bindDelegatedTap(container, "[data-id]", (btn) => tapped.push(btn.id));

  const makeBtn = (id, disabled = false) => ({
    id,
    disabled,
    closest: () => makeBtn.last,
  });

  // 1. Keyboard Enter/Space fires click with detail === 0.
  const keyBtn = makeBtn("key");
  makeBtn.last = keyBtn;
  listeners.click({ target: keyBtn, detail: 0, preventDefault() {} });
  assert.deepEqual(tapped, ["key"]);

  // 2. Pointer tap fires pointerup, followed immediately by synthetic click (detail === 1).
  const ptrBtn = makeBtn("ptr");
  makeBtn.last = ptrBtn;
  listeners.pointerup({ target: ptrBtn, preventDefault() {} });
  listeners.click({ target: ptrBtn, detail: 1, preventDefault() {} });
  listeners.click({ target: ptrBtn, detail: 0, preventDefault() {} });
  assert.deepEqual(tapped, ["key", "ptr"]);

  // 3. Disabled buttons are ignored on both pointerup and click.
  const disabledBtn = makeBtn("off", true);
  makeBtn.last = disabledBtn;
  listeners.pointerup({ target: disabledBtn, preventDefault() {} });
  listeners.click({ target: disabledBtn, detail: 0, preventDefault() {} });
  assert.deepEqual(tapped, ["key", "ptr"]);
});

test("game intervals pause while the page is hidden", () => {
  activeIntervals.clear();
  const tick = () => {};
  const id = setGameInterval(tick, 100);
  assert.equal(activeIntervals.size, 1);

  setVisibility("hidden");
  assert.equal(activeIntervals.size, 0);
  const hiddenId = setGameInterval(tick, 100);
  assert.equal(activeIntervals.size, 0, "a timer created while hidden waits for visibility");

  setVisibility("visible");
  assert.equal(activeIntervals.size, 2);

  clearGameInterval(id);
  clearGameInterval(hiddenId);
  assert.equal(activeIntervals.size, 0);
});

test("FindGame counts hits and misses and never repeats the target", () => {
  const items = [
    { id: "a", name: "甲", icon: "A", accent: "#000" },
    { id: "b", name: "乙", icon: "B", accent: "#111" },
    { id: "c", name: "丙", icon: "C", accent: "#222" },
  ];
  const game = new FindGame({ items, introText: "开始", successText: (item) => `找到${item.name}` });
  assert.equal(game.getSnapshot().feedback, "开始");

  for (let round = 0; round < 20; round += 1) {
    const { target } = game.getSnapshot();
    const wrong = items.find((item) => item.id !== target.id);
    const miss = game.tap(wrong.id);
    assert.equal(miss.success, false);
    assert.equal(miss.feedback, `这是${wrong.name}，再找${target.name}。`);

    const hit = game.tap(target.id);
    assert.equal(hit.success, true);
    assert.equal(hit.feedback, `找到${target.name}`);
    assert.notEqual(hit.target.id, target.id);
  }
  assert.equal(game.found, 20);
  assert.equal(game.totalTaps, 40);
  assert.equal(game.tap("missing").totalTaps, 40);

  game.reset();
  assert.equal(game.found, 0);
  assert.equal(game.totalTaps, 0);
});
