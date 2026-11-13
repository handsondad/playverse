// Opens every page in headless Chrome/Edge and fails on uncaught errors, console.error,
// failed requests or the config-error overlay. Game pages also get their voice button
// toggled and their start button tapped, so errors in the first seconds of play show up.
// Usage: npm run smoke   (CHROME_PATH overrides the browser lookup)
import http from "node:http";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(import.meta.dirname, "..");
const SETTLE_MS = 800;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

function findBrowser() {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }
  const candidates = {
    win32: [
      join(process.env["ProgramFiles(x86)"] || "", "Microsoft/Edge/Application/msedge.exe"),
      join(process.env.ProgramFiles || "", "Google/Chrome/Application/chrome.exe"),
      join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
    ],
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ],
  }[process.platform] || ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"];
  const found = candidates.find((file) => existsSync(file));
  if (!found) {
    throw new Error("No Chrome or Edge found; set CHROME_PATH.");
  }
  return found;
}

function startServer() {
  const server = http.createServer((req, res) => {
    let file = join(ROOT, decodeURIComponent(new URL(req.url, "http://localhost").pathname));
    if (file.startsWith(ROOT + sep) && existsSync(file) && statSync(file).isDirectory()) {
      file = join(file, "index.html");
    }
    if (!file.startsWith(ROOT + sep) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
  server.keepAliveTimeout = 60000;
  return new Promise((ready) => server.listen(0, "127.0.0.1", () => ready(server)));
}

async function launchBrowser(profile) {
  const args = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--mute-audio"];
  if (process.env.CI && process.platform === "linux") {
    // GitHub's Ubuntu runners block the user namespaces Chrome's sandbox needs.
    args.push("--no-sandbox");
  }
  const browser = spawn(findBrowser(), [...args, "about:blank"], { stdio: "ignore" });
  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 150; i += 1) {
    const lines = existsSync(portFile) ? readFileSync(portFile, "utf8").split("\n") : [];
    if (lines.length >= 2 && lines[1].trim()) {
      return { browser, endpoint: `ws://127.0.0.1:${lines[0].trim()}${lines[1].trim()}` };
    }
    await sleep(100);
  }
  browser.kill();
  throw new Error("Browser did not open a DevTools port.");
}

async function connect(endpoint) {
  const ws = new WebSocket(endpoint);
  await new Promise((open, fail) => {
    ws.onopen = open;
    ws.onerror = () => fail(new Error(`Cannot connect to ${endpoint}`));
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id) {
      pending.get(msg.id)?.(msg);
      pending.delete(msg.id);
      return;
    }
    listeners.forEach((listener) => listener(msg));
  };
  const send = (method, params = {}, sessionId = undefined) => new Promise((done, fail) => {
    const id = nextId++;
    pending.set(id, (msg) => (msg.error ? fail(new Error(`${method}: ${msg.error.message}`)) : done(msg.result)));
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  return { ws, send, listeners };
}

function listPages() {
  const games = readdirSync(join(ROOT, "src"))
    .filter((dir) => existsSync(join(ROOT, "src", dir, "index.html")))
    .map((dir) => `src/${dir}/index.html`);
  return ["index.html", ...games];
}

const CARD_COUNT = JSON.parse(readFileSync(join(ROOT, "configs/game-manifest.json"), "utf8")).cards.length;

const PROBE = `(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const problems = [];
  if (document.querySelector(".config-error")) {
    problems.push("config error overlay is showing");
  }
  if (location.pathname.endsWith("/index.html") && !location.pathname.includes("/src/")) {
    if (navigator.serviceWorker) {
      await Promise.race([navigator.serviceWorker.ready, wait(5000)]);
    }
    const cards = document.querySelectorAll(".game-card").length;
    if (cards !== ${CARD_COUNT}) {
      problems.push(\`home shows \${cards} cards, manifest has ${CARD_COUNT}\`);
    }
    return problems;
  }
  const voice = document.querySelector("#voiceBtn");
  if (!voice) {
    problems.push("no #voiceBtn");
  } else {
    const before = voice.textContent;
    voice.click();
    await wait(300);
    if (voice.textContent === before) {
      problems.push("voice button label did not change");
    }
    voice.click();
    await wait(300);
  }
  const start = document.querySelector("#startBtn");
  if (start && !start.disabled) {
    start.click();
    await wait(1500);
  }
  return problems;
})()`;

async function main() {
  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = mkdtempSync(join(tmpdir(), "playverse-smoke-"));
  const { browser, endpoint } = await launchBrowser(profile);
  const cdp = await connect(endpoint);
  let failures = 0;
  try {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const page = (method, params) => cdp.send(method, params, sessionId);
    let errors = [];
    cdp.listeners.add((msg) => {
      if (msg.sessionId !== sessionId) {
        return;
      }
      if (msg.method === "Runtime.exceptionThrown") {
        const details = msg.params.exceptionDetails;
        errors.push(`uncaught: ${details.exception?.description?.split("\n")[0] || details.text}`);
      } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        errors.push(`console.error: ${msg.params.args.map((arg) => arg.value ?? arg.description).join(" ")}`);
      } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
        errors.push(`${msg.params.entry.text} ${msg.params.entry.url || ""}`.trim());
      }
    });
    await page("Page.enable");
    await page("Runtime.enable");
    await page("Log.enable");

    for (const path of listPages()) {
      errors = [];
      const loaded = new Promise((done) => {
        const onLoad = (msg) => {
          if (msg.sessionId === sessionId && msg.method === "Page.loadEventFired") {
            cdp.listeners.delete(onLoad);
            done();
          }
        };
        cdp.listeners.add(onLoad);
      });
      await page("Page.navigate", { url: `${origin}/${path}` });
      await Promise.race([loaded, sleep(10000)]);
      await sleep(SETTLE_MS);
      const { result, exceptionDetails } = await page("Runtime.evaluate", { expression: PROBE, awaitPromise: true, returnByValue: true });
      const problems = [...errors, ...(exceptionDetails ? [`probe failed: ${exceptionDetails.text}`] : result.value)];
      if (problems.length) {
        failures += 1;
        console.log(`FAIL ${path}\n${problems.map((line) => `  - ${line}`).join("\n")}`);
      } else {
        console.log(`ok   ${path}`);
      }
    }
  } finally {
    await cdp.send("Browser.close").catch(() => {});
    cdp.ws.close();
    const exited = new Promise((done) => browser.once("exit", done));
    browser.kill();
    server.closeAllConnections();
    server.close();
    await Promise.race([exited, sleep(3000)]);
    await sleep(300);
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
    } catch {
      // Ignore lingering Windows Crashpad lock on temp profile dir.
    }
  }
  console.log(failures ? `\n${failures} page(s) failed.` : "\nAll pages passed.");
  process.exitCode = failures ? 1 : 0;
}

await main();
