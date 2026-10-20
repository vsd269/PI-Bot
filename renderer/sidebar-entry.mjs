// Read the current footer geometry and mount this plugin's icon in its own
// layer. The spacer is a lightweight flex sibling, never a host-owned button.
export function mountSidebarEntry(pi, { column, label, markup, onClick, onPlacement }) {
  const layer = pi.ui.openLayer();
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'pi-sidebar-entry';
  button.title = label; button.setAttribute('aria-label', label);
  button.innerHTML = markup; button.addEventListener('click', onClick);
  layer.element.append(button);
  pi.ui.injectStyle(`.pi-sidebar-entry{position:fixed;width:32px;height:32px;display:flex;align-items:center;justify-content:center;padding:4px;border:0;border-radius:8px;background:transparent;color:var(--ds-text-secondary,currentColor);cursor:pointer;-webkit-app-region:no-drag;pointer-events:auto}.pi-sidebar-entry:hover{background:var(--ds-bg-hover,rgba(127,127,127,.14));color:var(--ds-text-primary,currentColor)}.pi-sidebar-entry:focus-visible{outline:2px solid #4d6bfe;outline-offset:2px}.pi-sidebar-entry .bt-mark{width:18px;height:18px;display:inline-flex;line-height:0}.pi-sidebar-entry svg{width:18px;height:18px;overflow:visible;--bt-ink-deepseek:#4d6bfe}`);
  const owner = document.createElement('span'); owner.hidden = true;
  let spacer, footer, placed = false, hidden = false, frame = 0, stopped = false;
  const resize = new ResizeObserver(schedule);
  const anchorSelector = '[data-nav="plugins"]';
  const containsTarget = node => node.nodeType === 1 && (node.matches?.('.sidebar-body,.sidebar-footer,aside,[data-nav="plugins"]') || node.querySelector?.('.sidebar-body,.sidebar-footer,[data-nav="plugins"]'));
  const observer = new MutationObserver(records => {
    if (records.some(record => record.target.closest?.('.sidebar-body,.sidebar-footer,aside') || [...record.addedNodes, ...record.removedNodes].some(containsTarget))) schedule();
  });
  function release() {
    owner.remove();
    if (spacer && !spacer.childElementCount) spacer.remove();
    spacer = undefined;
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
    if (classic) {
      if (!spacer?.isConnected || spacer.nextElementSibling !== footer) {
        release();
        spacer = footer.previousElementSibling?.hasAttribute('data-pi-sidebar-entry-space') ? footer.previousElementSibling : document.createElement('div');
        spacer.setAttribute('data-pi-sidebar-entry-space', '');
        spacer.style.cssText = 'height:40px;min-height:40px;flex:0 0 40px;margin-top:auto;pointer-events:none;';
        spacer.append(owner); footer.before(spacer);
      } else if (owner.parentElement !== spacer) spacer.append(owner);
      const bounds = footer.getBoundingClientRect();
      const anchor = footer.querySelector(column === 0 ? '[data-nav="settings"]' : '[data-nav="plugins"]')?.getBoundingClientRect();
      const start = anchor ? anchor.left + anchor.width / 2 - 16 : bounds.left + column * 40;
      button.style.left = `${start}px`;
      button.style.top = `${bounds.top - 36}px`;
    } else {
      release();
      // Avoid inserting spacers into an unfamiliar host layout. Keep an
      // independent launcher reachable even if the sidebar is redesigned.
      const anchor = hostAnchor?.getBoundingClientRect();
      const anchored = anchor && anchor.width > 0 && anchor.height > 0 && anchor.left >= 0 && anchor.bottom <= innerHeight + 1;
      button.style.left = `${anchored ? Math.max(8, anchor.left + anchor.width / 2 - 16) : 16}px`;
      button.style.top = `${anchored ? Math.max(48, anchor.top - 40) : Math.max(48, innerHeight - 100)}px`;
    }
    button.style.display = hidden ? 'none' : 'flex';
    if (!placed) { placed = true; onPlacement?.(true); }
  }
  function schedule() { if (!frame && !stopped) frame = requestAnimationFrame(update); }
  const botMode = event => { hidden = event.detail === true; schedule(); };
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule); window.addEventListener('pi-bot:mode', botMode); document.addEventListener('transitionend', schedule, true); update();
  return {
    get placed() { return placed; },
    hide(value) { hidden = value; schedule(); },
    close() { stopped = true; cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', schedule); window.removeEventListener('pi-bot:mode', botMode); document.removeEventListener('transitionend', schedule, true); release(); layer.close(); },
  };
}
