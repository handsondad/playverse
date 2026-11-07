const timers = new Map();
let nextTimerId = 1;

function isHidden() {
  return document.visibilityState === "hidden";
}

export function setGameInterval(callback, intervalMs) {
  const id = nextTimerId;
  nextTimerId += 1;
  timers.set(id, {
    callback,
    intervalMs,
    nativeId: isHidden() ? 0 : window.setInterval(callback, intervalMs),
  });
  return id;
}

export function clearGameInterval(id) {
  const timer = timers.get(id);
  if (!timer) {
    return;
  }
  window.clearInterval(timer.nativeId);
  timers.delete(id);
}

document.addEventListener("visibilitychange", () => {
  timers.forEach((timer) => {
    if (isHidden()) {
      window.clearInterval(timer.nativeId);
      timer.nativeId = 0;
    } else if (!timer.nativeId) {
      timer.nativeId = window.setInterval(timer.callback, timer.intervalMs);
    }
  });
});
