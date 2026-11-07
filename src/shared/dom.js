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
