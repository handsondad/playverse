import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
const gameDirs = fs.readdirSync(path.join(root, "src"))
  .filter((dir) => fs.existsSync(path.join(root, "src", dir, "index.html")));

test("manifest lists every game page exactly once, in a known group", () => {
  const manifest = readJson("configs/game-manifest.json");
  const cards = manifest.cards;
  const homeGroups = [...fs.readFileSync(path.join(root, "index.html"), "utf8").matchAll(/data-group="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.ok(homeGroups.length > 0);

  for (const card of cards) {
    assert.ok(homeGroups.includes(card.group), `${card.href}: unknown group "${card.group}"`);
    assert.ok(fs.existsSync(path.join(root, card.href.replace(/^\.\//, ""))), `${card.href}: page missing`);
    assert.ok(card.icon, `${card.href}: missing icon`);
    assert.ok(card.description && !card.description.includes("|"), `${card.href}: description should be a short blurb`);
  }
  const hrefs = cards.map((card) => card.href.replace(/^\.\//, "")).sort();
  assert.deepEqual(hrefs, gameDirs.map((dir) => `src/${dir}/index.html`).sort());
});

test("every config a game loads exists and has its required keys", () => {
  const calls = [];
  for (const dir of gameDirs) {
    const source = fs.readFileSync(path.join(root, "src", dir, "main.js"), "utf8");
    const patterns = [/loadGameConfig\(\s*"([^"]+)",\s*\[([^\]]*)\]/g, /configUrl:\s*"([^"]+)",\s*requiredKeys:\s*\[([^\]]*)\]/g];
    for (const match of patterns.flatMap((pattern) => [...source.matchAll(pattern)])) {
      const keys = [...match[2].matchAll(/"([^"]+)"/g)].map((key) => key[1]);
      calls.push({ dir, url: match[1], keys });
    }
  }
  assert.ok(calls.length >= 20, `expected config-driven games, found ${calls.length}`);

  for (const { dir, url, keys } of calls) {
    const file = path.relative(root, path.resolve(root, "src", dir, url));
    const data = readJson(file);
    for (const key of keys) {
      const value = data[key];
      assert.ok(value != null && !(Array.isArray(value) && value.length === 0), `${file}: "${key}" missing or empty`);
    }
  }
});

test("only shared/storage.js touches localStorage", () => {
  const offenders = fs.readdirSync(path.join(root, "src"), { recursive: true })
    .filter((file) => file.endsWith(".js") && path.normalize(file) !== path.join("shared", "storage.js"))
    .filter((file) => fs.readFileSync(path.join(root, "src", file), "utf8").includes("localStorage"));
  assert.deepEqual(offenders, []);
});
