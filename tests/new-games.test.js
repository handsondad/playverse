import "./helpers/browser-stub.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { PatternGame } from "../src/pattern/patternGame.js";
import { ClockGame, formatDigital, formatSpokenTime } from "../src/clock/clockGame.js";
import { OddOneGame } from "../src/oddone/oddOneGame.js";
import { CupsGame } from "../src/cups/cupsGame.js";
import { SudokuGame } from "../src/sudoku/sudokuGame.js";
import { WeatherWearGame } from "../src/weatherwear/weatherWearGame.js";
import { BalanceGame } from "../src/balance/balanceGame.js";
import { MissingGame } from "../src/missing/missingGame.js";

const root = path.resolve(import.meta.dirname, "..");
const readConfig = (name) => JSON.parse(fs.readFileSync(path.join(root, "configs/levels", name), "utf8"));

test("PatternGame generates deterministic sequences and completes a round", () => {
  const data = readConfig("pattern-train.levels.json");
  let state = null;
  let result = null;
  const game = new PatternGame({
    onStateChange: (s) => { state = s; },
    onResult: (r) => { result = r; },
  });
  game.init(data, 0);
  game.start("easy", { themeId: "fruit", seed: "test|pattern" });

  assert.equal(state.isRunning, true);
  assert.equal(state.options.length, 4);
  assert.ok(state.options.some((o) => o.id === state.answerItem.id));

  const wrong = state.options.find((o) => o.id !== state.answerItem.id);
  assert.equal(game.choose(wrong.id).correct, false);

  for (let i = 0; i < data.levels[0].targetTrains; i += 1) {
    const out = game.choose(state.answerItem.id);
    assert.equal(out.correct, true);
    game.nextTrain();
  }
  assert.equal(result.isWin, true);
  assert.equal(result.trainsDone, data.levels[0].targetTrains);
});

test("ClockGame computes hand angles and validates spoken/digital options", () => {
  assert.equal(formatDigital(7, 5), "7:05");
  assert.equal(formatSpokenTime(7, 0), "7点整");
  assert.equal(formatSpokenTime(7, 30), "7点半");
  assert.equal(formatSpokenTime(7, 5), "7点零5分");

  const data = readConfig("clock-time.levels.json");
  let state = null;
  const game = new ClockGame({ onStateChange: (s) => { state = s; } });
  game.init(data, 0);
  game.start("hard", { seed: "test|clock" });

  assert.equal(state.options.length, 4);
  const { hour, minute, hourAngle, minuteAngle, digital } = state.question;
  assert.equal(minuteAngle, minute * 6);
  assert.equal(hourAngle, ((hour % 12) * 30) + (minute * 0.5));
  assert.ok(game.useHint().includes("提示"));
  assert.equal(game.answer(digital).correct, true);
});

test("OddOneGame supports both visual and category modes", () => {
  const data = readConfig("odd-one-out.levels.json");
  let state = null;
  const game = new OddOneGame({ onStateChange: (s) => { state = s; } });
  game.init(data, 0);

  game.start("easy", { modeId: "visual", seed: "test|oddone|v" });
  assert.equal(state.cards.length, 9);
  assert.equal(state.cards.filter((c) => c.isOdd).length, 1);
  const oddIdx = state.cards.find((c) => c.isOdd).index;
  assert.equal(game.tapCard(oddIdx).correct, true);

  game.start("normal", { modeId: "category", seed: "test|oddone|c" });
  assert.equal(state.cards.length, 5);
  assert.equal(state.cards.filter((c) => c.isOdd).length, 1);
  assert.equal(game.tapCard(state.cards.find((c) => c.isOdd).index).correct, true);
});

test("CupsGame swaps cup slots while preserving the hidden treasure cup", () => {
  const data = readConfig("magic-cups.levels.json");
  let state = null;
  const game = new CupsGame({ onStateChange: (s) => { state = s; } });
  game.init(data, 0);
  game.start("normal", { seed: "test|cups" });

  assert.equal(state.phase, "peek");
  const treasureCupId = state.cups.find((c) => c.hasTreasure).id;
  game.beginShuffle();
  while (!game.stepSwap().done) {
    // step through all swaps
  }
  assert.equal(state.phase, "guessing");
  const slots = state.cups.map((c) => c.slot).sort((a, b) => a - b);
  assert.deepEqual(slots, [0, 1, 2]);
  assert.equal(game.guess(treasureCupId).correct, true);
});

test("SudokuGame builds conflict-free 4x4 and 6x6 puzzles and detects conflicts", () => {
  const data = readConfig("mini-sudoku.levels.json");
  let state = null;
  let result = null;
  const game = new SudokuGame({
    onStateChange: (s) => { state = s; },
    onResult: (r) => { result = r; },
  });
  game.init(data, 0);
  game.start("hard", { themeId: "space", seed: "test|sudoku|6" });
  assert.equal(state.size, 6);
  assert.equal(state.conflicts, 0);

  game.start("easy", { themeId: "animals", seed: "test|sudoku|4" });
  const blanks = state.cells.filter((c) => !c.fixed);
  assert.equal(blanks.length, 5);

  for (const blank of blanks) {
    game.selectCell(blank.index);
    game.placeSymbol(blank.solution);
  }
  assert.equal(result.isWin, true);
});

test("WeatherWearGame checks outfit suitability against weather scenes", () => {
  const data = readConfig("weather-wear.levels.json");
  let state = null;
  const game = new WeatherWearGame({ onStateChange: (s) => { state = s; } });
  game.init(data, 0);
  game.start("normal", { seed: "test|weather" });

  const badItem = state.shelf.find((item) => !state.targetIds.includes(item.id));
  game.toggleItem(badItem.id);
  game.toggleItem(state.targetIds[0]);
  game.toggleItem(state.targetIds[1]);
  assert.equal(game.submitOutfit().correct, false);

  game.clearOutfit();
  for (const id of state.targetIds) {
    game.toggleItem(id);
  }
  assert.equal(game.submitOutfit().correct, true);
});

test("BalanceGame tilts accurately and detects exact balance", () => {
  const data = readConfig("balance-scale.levels.json");
  let state = null;
  const game = new BalanceGame({ onStateChange: (s) => { state = s; } });
  game.init(data, 0);
  game.start("hard", { seed: "test|balance" });

  assert.ok(state.leftTotal > state.rightTotal);
  assert.ok(state.tiltDeg < 0);

  let guard = 0;
  while (state.rightTotal < state.leftTotal && guard < 10) {
    guard += 1;
    const diff = state.leftTotal - state.rightTotal;
    const pick = [...state.weights].sort((a, b) => b.weight - a.weight).find((w) => w.weight <= diff);
    game.addWeight(pick.id);
  }
  assert.equal(state.balanced, true);
  assert.equal(state.tiltDeg, 0);
});

test("MissingGame hides one item behind the curtain and validates the guess", () => {
  const data = readConfig("whats-missing.levels.json");
  let state = null;
  const game = new MissingGame({ onStateChange: (s) => { state = s; } });
  game.init(data, 0);
  game.start("normal", { themeId: "snacks", seed: "test|missing" });

  assert.equal(state.phase, "memorize");
  assert.equal(state.tableItems.length, 5);
  game.closeCurtain();
  assert.equal(state.phase, "curtain");
  game.openCurtain();
  assert.equal(state.phase, "guessing");
  assert.equal(state.tableItems.filter((i) => i.isPlaceholder).length, 1);

  assert.equal(game.choose(state.missingItem.id).correct, true);
});
