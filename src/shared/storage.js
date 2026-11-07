export function readJson(key, fallback = {}) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) ?? fallback : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readNumber(key, fallback = 0) {
  try {
    const value = Number(localStorage.getItem(key) || fallback);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

// A stats/best-score record: every field of `defaults`, read back as a number.
export function readNumbers(key, defaults) {
  const parsed = readJson(key);
  return Object.fromEntries(
    Object.entries(defaults).map(([field, fallback]) => [field, Number(parsed[field] || fallback)]),
  );
}

// Difficulty unlocks. Easy stays open so the selector is never empty.
export function readUnlocks(key) {
  const unlocked = readJson(key).unlocked || {};
  return { unlocked: { easy: true, normal: Boolean(unlocked.normal), hard: Boolean(unlocked.hard) } };
}

export function writeValue(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}
