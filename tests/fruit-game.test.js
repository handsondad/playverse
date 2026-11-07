import "./helpers/browser-stub.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FruitGame } from "../src/fruit/fruitGame.js";

const data = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../configs/levels/fruit-sorter.levels.json"), "utf8"));

function play(seed) {
  let state = null;
  let result = null;
  const game = new FruitGame({ onStateChange: (next) => { state = next; }, onResult: (next) => { result = next; } });
  game.init(data);
  game.start(data.levels[0].id, { seed });
  return { game, getState: () => state, getResult: () => result };
}

const fruitSequence = (state) => state.queue.map((fruit) => `${fruit.basketId}:${fruit.type}`);

test("the same daily seed deals the same fruit", () => {
  const first = play("2026-11-07|easy|sunrise|fruit");
  const second = play("2026-11-07|easy|sunrise|fruit");
  const other = play("2026-11-08|easy|sunrise|fruit");
  assert.deepEqual(fruitSequence(first.getState()), fruitSequence(second.getState()));
  assert.notDeepEqual(fruitSequence(first.getState()), fruitSequence(other.getState()));
  [first, second, other].forEach(({ game }) => game.stop());
});

test("sorting into the right basket scores, the wrong one costs a life", () => {
  const { game, getState } = play("rules");
  for (let i = 0; i < 5 && !getState().activeFruit; i += 1) {
    game.tick();
  }
  const fruit = getState().activeFruit;
  assert.ok(fruit, "a fruit arrives after the spawn cooldown");

  game.sort(fruit.basketId);
  assert.equal(getState().delivered, 1);
  assert.ok(getState().score > 0);

  while (!getState().activeFruit) {
    game.tick();
  }
  const next = getState().activeFruit;
  const wrongBasket = getState().basketPool.find((basket) => basket.id !== next.basketId);
  const livesBefore = getState().lives;
  game.sort(wrongBasket.id);
  assert.ok(getState().lives < livesBefore);
  game.stop();
});

test("the round ends when time runs out", () => {
  const { game, getState, getResult } = play("timeout");
  const ticks = Math.ceil(getState().timeLeft * 10) + 1;
  for (let i = 0; i < ticks && getState().isRunning; i += 1) {
    game.tick();
  }
  assert.equal(getState().isRunning, false);
  assert.ok(getResult());
  assert.equal(getResult().isWin, false);
});
