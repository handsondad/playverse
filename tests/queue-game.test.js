import "./helpers/browser-stub.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { QueueGame } from "../src/shared/queueGame.js";
import { FRUIT_RULES } from "../src/fruit/rules.js";
import { OCEAN_RULES } from "../src/ocean/rules.js";
import { PET_RULES } from "../src/pet/rules.js";
import { FOREST_RULES } from "../src/forest/rules.js";
import { STAR_RULES } from "../src/star/rules.js";
import { POSTMAN_RULES } from "../src/postman/rules.js";

const loadLevels = (name) => JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../configs/levels/${name}.levels.json`), "utf8"));

const GAMES = [
  [FRUIT_RULES, "fruit-sorter"],
  [OCEAN_RULES, "ocean-cleanup"],
  [PET_RULES, "pet-clinic"],
  [FOREST_RULES, "forest-ranger"],
  [STAR_RULES, "star-observer"],
  [POSTMAN_RULES, "postman-delivery"],
];

function play(rules, data, seed, levelOverrides = {}) {
  let state = null;
  let result = null;
  const levels = data.levels.map((level) => ({ ...level, ...levelOverrides }));
  const game = new QueueGame(rules, { onStateChange: (next) => { state = next; }, onResult: (next) => { result = next; } });
  game.init({ ...data, levels });
  game.start(levels[0].id, { seed });
  game.stop();
  return { game, getState: () => state, getResult: () => result };
}

function waitForItem(game, getState) {
  for (let i = 0; i < 50 && !getState().active; i += 1) {
    game.tick();
  }
  return getState().active;
}

const fruitData = loadLevels("fruit-sorter");
const sequence = (state) => state.queue.map((item) => `${item.targetId}:${item.type}`);

test("every queue game's rules match its level config", () => {
  GAMES.forEach(([rules, file]) => {
    const data = loadLevels(file);
    const targetIds = new Set(data[rules.targetsKey].map((item) => item.id));
    assert.ok(targetIds.size > 0, `${file} has ${rules.targetsKey}`);
    data.levels.forEach((level) => {
      assert.ok(Array.isArray(level[rules.levelTargetIdsKey]), `${file}/${level.id} has ${rules.levelTargetIdsKey}`);
      level[rules.levelTargetIdsKey].forEach((id) => assert.ok(targetIds.has(id), `${file}/${level.id} target ${id}`));
      assert.ok(Number(level[rules.levelGoalKey]) > 0, `${file}/${level.id} has ${rules.levelGoalKey}`);
    });
  });
});

test("the same daily seed deals the same queue", () => {
  const first = play(FRUIT_RULES, fruitData, "2026-11-07|easy|sunrise|fruit");
  const second = play(FRUIT_RULES, fruitData, "2026-11-07|easy|sunrise|fruit");
  const other = play(FRUIT_RULES, fruitData, "2026-11-08|easy|sunrise|fruit");
  assert.deepEqual(sequence(first.getState()), sequence(second.getState()));
  assert.notDeepEqual(sequence(first.getState()), sequence(other.getState()));
});

test("the right target scores, the wrong one costs a life", () => {
  const { game, getState } = play(FRUIT_RULES, fruitData, "rules");
  const item = waitForItem(game, getState);
  assert.ok(item, "an item arrives after the spawn cooldown");

  game.choose(item.targetId);
  assert.equal(getState().done, 1);
  assert.ok(getState().score > 0);

  const next = waitForItem(game, getState);
  const wrong = getState().targetPool.find((target) => target.id !== next.targetId);
  const livesBefore = getState().lives;
  game.choose(wrong.id);
  assert.ok(getState().lives < livesBefore);
});

function chooseFirstBonus(rules, data) {
  const { game, getState } = play(rules, data, "bonus", { [rules.bonus.chanceKey]: 1, timeLimitSec: 99 });
  for (let i = 0; i < 20; i += 1) {
    const item = waitForItem(game, getState);
    const before = getState();
    game.choose(item.targetId);
    if (item.type === rules.bonus.type) {
      return { streak: before.streak + 1, gained: getState().score - before.score, counted: getState().done - before.done };
    }
  }
  throw new Error("no bonus item was dealt");
}

test("bonus items double the score unless the rules add flat points", () => {
  const fruit = chooseFirstBonus(FRUIT_RULES, fruitData);
  assert.equal(fruit.counted, 1);
  assert.equal(fruit.gained, (8 + Math.min(8, fruit.streak)) * 2);

  const postman = chooseFirstBonus(POSTMAN_RULES, loadLevels("postman-delivery"));
  assert.equal(postman.counted, 2);
  assert.equal(postman.gained, 8 + Math.min(8, postman.streak) + 10);
});

test("the round ends when time runs out", () => {
  const { game, getState, getResult } = play(FRUIT_RULES, fruitData, "timeout");
  for (let i = 0; i < 2000 && getState().isRunning; i += 1) {
    game.tick();
  }
  assert.equal(getState().isRunning, false);
  assert.ok(getResult());
  assert.equal(getResult().isWin, false);
});
