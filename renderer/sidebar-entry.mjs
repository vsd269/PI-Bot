// Keep the launcher in its own PI layer. Only a shared, owned reservation is
// added above the footer; horizontal positions follow the visible launchers.
export function mountSidebarEntry(pi, { label, markup, onClick, onPlacement }) {
  const layer = pi.ui.openLayer();
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'pi-sidebar-entry';
  button.title = label; button.setAttribute('aria-label', label);
  button.innerHTML = markup; button.addEventListener('click', onClick);
  layer.element.append(button);
  pi.ui.injectStyle(`.pi-sidebar-entry{position:fixed;width:32px;height:32px;display:flex;align-items:center;justify-content:center;padding:4px;border:0;border-radius:8px;background:transparent;color:var(--ds-text-secondary,currentColor);cursor:pointer;-webkit-app-region:no-drag;pointer-events:auto}.pi-sidebar-entry:hover{background:var(--ds-bg-hover,rgba(127,127,127,.14));color:var(--ds-text-primary,currentColor)}.pi-sidebar-entry:focus-visible{outline:2px solid #4d6bfe;outline-offset:2px}.pi-sidebar-entry .bt-mark{width:18px;height:18px;display:inline-flex;line-height:0}.pi-sidebar-entry svg{width:18px;height:18px;overflow:visible;--bt-ink-deepseek:#4d6bfe}`);
  const owner = document.createElement('span'); owner.hidden = true;
  owner.setAttribute('data-pi-sidebar-entry-owner', 'local.pi-bot');
  let spacer, footer, placed = false, hidden = false, frame = 0, stopped = false;
  const resize = new ResizeObserver(schedule);
  const anchorSelector = '[data-nav="plugins"]';
  const targets = '.sidebar-body,.sidebar-footer,aside,[data-nav="plugins"],.pi-sidebar-entry';
  const containsTarget = node => node.nodeType === 1 && node !== button && (node.matches?.(targets) || node.querySelector?.(targets));
  const observer = new MutationObserver(records => {
    if (records.some(record => record.target !== button && (record.type === 'attributes'
      ? containsTarget(record.target)
      : record.target.closest?.('.sidebar-body,.sidebar-footer,aside') || [...record.addedNodes, ...record.removedNodes].some(containsTarget)))) schedule();
  });
  function release() {
    owner.remove();
    if (spacer && !spacer.childElementCount) spacer.remove();
    spacer = undefined;
  }
  function reserve() {
    if (!spacer?.isConnected || spacer.nextElementSibling !== footer) {
      release();
      const previous = footer.previousElementSibling;
      spacer = previous?.hasAttribute('data-pi-sidebar-entry-space') ? previous : document.createElement('div');
      if (!spacer.isConnected) {
        spacer.setAttribute('data-pi-sidebar-entry-space', '');
        spacer.style.cssText = 'height:40px;min-height:40px;flex:0 0 40px;margin-top:auto;pointer-events:none;';
        footer.before(spacer);
      }
    }
    if (owner.parentElement !== spacer) spacer.append(owner);
  }
  function freePosition(left, top, right, gap) {
    const peers = [...document.querySelectorAll('.pi-sidebar-entry')].filter(node => node !== button).flatMap(node => {
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' &&
        rect.bottom > top && rect.top < top + 32 ? [rect] : [];
    });
    for (let x = left; x + 32 <= right + 1; x += gap) {
      if (!peers.some(rect => rect.right > x && rect.left < x + 32)) return x;
    }
    return null;
  }
  function update() {
    frame = 0; if (stopped) return;
    const hostAnchor = document.querySelector(anchorSelector);
    const next = document.querySelector('.sidebar-body > .sidebar-footer') || hostAnchor?.closest('.sidebar-footer') || hostAnchor?.parentElement?.parentElement;
    if (next !== footer) {
      resize.disconnect(); release(); footer = next;
      if (footer) { resize.observe(footer); if (footer.parentElement) resize.observe(footer.parentElement); }
    }
    const rect = footer?.getBoundingClientRect();
    const valid = Boolean(rect && rect.width >= 88 && rect.height >= 32 && rect.left >= 0 && rect.top > 100 && rect.bottom <= innerHeight + 1);
    const classic = valid && footer.matches('.sidebar-body > .sidebar-footer');
    let available = true;
    if (classic) {
      reserve();
      const bounds = footer.getBoundingClientRect();
      const first = footer.querySelector('[data-nav="settings"]')?.getBoundingClientRect();
      const second = footer.querySelector(anchorSelector)?.getBoundingClientRect();
      const left = first?.width > 0 ? first.left + first.width / 2 - 16 : bounds.left;
      const gap = first?.width > 0 && second?.left > first.left ? Math.max(32, second.left - first.left) : 40;
      const top = bounds.top - 36;
      const start = freePosition(left, top, bounds.right, gap);
      available = start !== null;
      button.style.left = `${start ?? left}px`;
      button.style.top = `${top}px`;
    } else {
      release();
      // Avoid inserting spacers into an unfamiliar host layout. Keep an
      // independent launcher reachable even if the sidebar is redesigned.
      const anchor = hostAnchor?.getBoundingClientRect();
      const anchored = anchor && anchor.width > 0 && anchor.height > 0 && anchor.left >= 0 && anchor.bottom <= innerHeight + 1;
      const left = anchored ? Math.max(8, anchor.left + anchor.width / 2 - 16) : 16;
      const top = anchored ? Math.max(48, anchor.top - 40) : Math.max(48, innerHeight - 100);
      const start = freePosition(left, top, innerWidth - 8, 40);
      available = start !== null;
      button.style.left = `${start ?? left}px`;
      button.style.top = `${top}px`;
    }
    const display = hidden || !available ? 'none' : 'flex';
    if (button.style.display !== display) button.style.display = display;
    if (placed !== available) { placed = available; onPlacement?.(available); }
  }
  function schedule() { if (!frame && !stopped) frame = requestAnimationFrame(update); }
  const botMode = event => { hidden = event.detail === true; schedule(); };
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  window.addEventListener('resize', schedule); window.addEventListener('pi-bot:mode', botMode); document.addEventListener('transitionend', schedule, true); update();
  return {
    get placed() { return placed; },
    hide(value) { hidden = value; schedule(); },
    close() { stopped = true; cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', schedule); window.removeEventListener('pi-bot:mode', botMode); document.removeEventListener('transitionend', schedule, true); release(); button.remove(); layer.close(); },
  };
}
