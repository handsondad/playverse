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

  for (const group of homeGroups) {
    const groupCards = cards.filter((card) => card.group === group);
    groupCards.forEach((card, index) => {
      const nextCard = groupCards[(index + 1) % groupCards.length];
      const nextDir = nextCard.href.replace(/^\.\//, "").split("/")[1];
      const html = fs.readFileSync(path.join(root, card.href.replace(/^\.\//, "")), "utf8");
      assert.match(
        html,
        new RegExp(`返回首页</a>\\s*\\|\\s*<a href="\\.\\./${nextDir}/index\\.html">${nextCard.title}</a>`),
        `${card.href}: hero-links should chain to ${nextCard.href}`,
      );
    });
  }
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

test("every game announces feedback, but not its ticking stats panels", () => {
  for (const dir of gameDirs) {
    const html = fs.readFileSync(path.join(root, "src", dir, "index.html"), "utf8");
    assert.match(html, /role="status"|aria-live="polite"/, `${dir}: no live region for feedback`);
    for (const [tag] of html.matchAll(/<[^>]+aria-live="[^"]+"[^>]*>/g)) {
      assert.doesNotMatch(tag, /class="[^"]*\b(stats|stats-panel|meta-stats|status-bar|status-panel)\b/, `${dir}: ${tag}`);
    }
  }
});

test("only shared/storage.js touches localStorage", () => {
  const offenders = fs.readdirSync(path.join(root, "src"), { recursive: true })
    .filter((file) => file.endsWith(".js") && path.normalize(file) !== path.join("shared", "storage.js"))
    .filter((file) => fs.readFileSync(path.join(root, "src", file), "utf8").includes("localStorage"));
  assert.deepEqual(offenders, []);
});

test("shared modules own timers, speech synthesis, and Web Audio", () => {
  const jsFiles = fs.readdirSync(path.join(root, "src"), { recursive: true })
    .filter((file) => file.endsWith(".js"));
  const rules = [
    ["setInterval(", path.join("shared", "timers.js")],
    ["SpeechSynthesisUtterance", path.join("shared", "speech.js")],
    ["AudioContext", path.join("shared", "audio.js")],
  ];
  for (const [token, owner] of rules) {
    const offenders = jsFiles
      .filter((file) => path.normalize(file) !== owner)
      .filter((file) => fs.readFileSync(path.join(root, "src", file), "utf8").includes(token));
    assert.deepEqual(offenders, [], `${token} should only live in ${owner}`);
  }
});

test("every page loads base.css and pwa.js, labels buttons and game areas, and keeps focus rings", () => {
  const pages = ["index.html", ...gameDirs.map((dir) => path.join("src", dir, "index.html"))];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    assert.match(html, /shared\/base\.css/, `${page}: missing base.css`);
    assert.match(html, /shared\/pwa\.js/, `${page}: missing pwa.js`);
    for (const [tag, inner] of html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)) {
      assert.match(tag, /\btype=/, `${page}: button missing type attribute: ${tag}`);
      const hasLabel = /\baria-label="[^"]+"/.test(tag) || inner.replace(/<[^>]+>/g, "").trim().length > 0;
      assert.ok(hasLabel, `${page}: empty button missing aria-label: ${tag}`);
    }
  }
  for (const dir of gameDirs) {
    const html = fs.readFileSync(path.join(root, "src", dir, "index.html"), "utf8");
    assert.match(html, /\baria-label="[^"]+"/, `${dir}: missing aria-label on game area`);
  }
  const cssOffenders = fs.readdirSync(path.join(root, "src"), { recursive: true })
    .filter((file) => file.endsWith(".css"))
    .filter((file) => /outline:\s*(?:none|0\b)/.test(fs.readFileSync(path.join(root, "src", file), "utf8")));
  assert.deepEqual(cssOffenders, []);
});
