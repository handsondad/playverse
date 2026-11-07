// Minimal browser globals so src/ modules can be imported under node:test.
// Intervals are recorded, never fired: tests drive game ticks by hand.
const storage = new Map();
export const localStorageStub = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

export const activeIntervals = new Map();
let nextIntervalId = 1;

const documentListeners = new Map();
export const documentStub = {
  visibilityState: "visible",
  addEventListener(type, listener) {
    if (!documentListeners.has(type)) {
      documentListeners.set(type, []);
    }
    documentListeners.get(type).push(listener);
  },
  dispatch(type) {
    (documentListeners.get(type) || []).forEach((listener) => listener({ type }));
  },
};

export function setVisibility(state) {
  documentStub.visibilityState = state;
  documentStub.dispatch("visibilitychange");
}

globalThis.window = globalThis;
globalThis.document = documentStub;
globalThis.localStorage = localStorageStub;
globalThis.setInterval = (callback, ms) => {
  const id = nextIntervalId;
  nextIntervalId += 1;
  activeIntervals.set(id, { callback, ms });
  return id;
};
globalThis.clearInterval = (id) => {
  activeIntervals.delete(id);
};
