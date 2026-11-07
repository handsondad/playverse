const renderedHtml = new WeakMap();

// Game loops re-render every tick; rebuilding identical markup would drop
// :active/hover state and transient classes on the buttons under the child's finger.
// Every write to a container passed here must go through setHtml, or the cache goes stale.
export function setHtml(el, html) {
  if (renderedHtml.get(el) === html) {
    return false;
  }
  renderedHtml.set(el, html);
  el.innerHTML = html;
  return true;
}

export function setClass(el, className) {
  if (el.className !== className) {
    el.className = className;
  }
}

const lastStyle = new WeakMap();

export function setStyle(el, cssText) {
  if (lastStyle.get(el) !== cssText) {
    lastStyle.set(el, cssText);
    el.style.cssText = cssText;
  }
}

const keyedChildren = new WeakMap();

// Per-frame renderers: keeps one element per item.id inside `container` and only
// updates it, instead of re-parsing the whole markup 60 times a second.
// New items are appended, so their stacking follows arrival order.
export function syncKeyed(container, items, { create, update }) {
  let nodes = keyedChildren.get(container);
  if (!nodes) {
    nodes = new Map();
    keyedChildren.set(container, nodes);
  }
  const seen = new Set();
  for (const item of items) {
    seen.add(item.id);
    let el = nodes.get(item.id);
    if (!el) {
      el = create(item);
      nodes.set(item.id, el);
      container.appendChild(el);
    }
    update(el, item);
  }
  nodes.forEach((el, id) => {
    if (!seen.has(id)) {
      el.remove();
      nodes.delete(id);
    }
  });
}

// For live regions (role="status"): rewriting identical text still replaces the
// text node, and screen readers announce it again on every game tick.
export function setText(el, text) {
  if (!el || el.textContent === text) {
    return false;
  }
  el.textContent = text;
  return true;
}
