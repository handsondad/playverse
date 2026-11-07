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

export function writeValue(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}
