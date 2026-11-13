// Pointer-generated clicks (detail >= 1) were already handled on pointerup.
// Keyboard activation and element.click() report detail 0 and must still work,
// unless they land right after a pointerup on the same element.
const SYNTHETIC_CLICK_WINDOW_MS = 350;

function isDuplicateClick(event, lastPointerUpAt) {
  return event.detail > 0 || Date.now() - lastPointerUpAt < SYNTHETIC_CLICK_WINDOW_MS;
}

export function createSoftTap({ flashMs = 0, waitForFlash = true, onTap } = {}) {
  return function bindSoftTap(button, handler) {
    if (!button) {
      return;
    }
    let lastPointerUpAt = 0;

    const run = () => {
      if (button.disabled) {
        return;
      }
      if (!flashMs) {
        onTap?.();
        handler();
        return;
      }
      button.classList.add("tap-flash");
      if (!waitForFlash) {
        onTap?.();
        handler();
      }
      window.setTimeout(() => {
        button.classList.remove("tap-flash");
        if (waitForFlash) {
          onTap?.();
          handler();
        }
      }, flashMs);
    };

    button.addEventListener("pointerup", (event) => {
      event.preventDefault();
      lastPointerUpAt = Date.now();
      run();
    });

    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (isDuplicateClick(event, lastPointerUpAt)) {
        return;
      }
      run();
    });
  };
}

export const bindSoftTap = createSoftTap();

export function bindDelegatedTap(container, selector, handler) {
  if (!container) {
    return;
  }
  let lastPointerUpAt = 0;

  container.addEventListener("pointerup", (event) => {
    const button = event.target.closest(selector);
    if (!button || button.disabled) {
      return;
    }
    event.preventDefault();
    lastPointerUpAt = Date.now();
    handler(button);
  });

  container.addEventListener("click", (event) => {
    const button = event.target.closest(selector);
    if (!button || button.disabled) {
      return;
    }
    event.preventDefault();
    if (isDuplicateClick(event, lastPointerUpAt)) {
      return;
    }
    handler(button);
  });
}
