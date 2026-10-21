// Compatibility fixture for the launcher shipped by Our Free Model pi.9.
// It shares only the reservation above the footer and uses a fixed column.
export function mountLegacy(pi, {column = 0, onClick = () => {}} = {}) {
  const layer = pi.ui.openLayer(), button = document.createElement('button');
  button.className = 'pi-sidebar-entry';
  button.setAttribute('aria-label', 'Other plugin');
  button.textContent = '\u2727';
  button.addEventListener('click', onClick);
  layer.element.append(button);
  const owner = document.createElement('span'); owner.hidden = true;
  let spacer, footer, frame = 0, hidden = false, stopped = false;
  const resize = new ResizeObserver(schedule);
  const contains = node => node.nodeType === 1 && (node.matches?.('.sidebar-body,.sidebar-footer') || node.querySelector?.('.sidebar-body,.sidebar-footer'));
  const observer = new MutationObserver(records => {
    if (records.some(r => r.target.closest?.('.sidebar-body') || [...r.addedNodes, ...r.removedNodes].some(contains))) schedule();
  });
  function release() {
    owner.remove();
    if (spacer && !spacer.childElementCount) spacer.remove();
    spacer = undefined;
  }
  function update() {
    frame = 0; if (stopped) return;
    const next = document.querySelector('.sidebar-body > .sidebar-footer');
    if (next !== footer) {
      resize.disconnect(); release(); footer = next;
      if (footer) { resize.observe(footer); resize.observe(footer.parentElement); }
    }
    const rect = footer?.getBoundingClientRect();
    const valid = Boolean(rect && rect.width >= 88 && rect.height >= 32 && rect.left >= 0 && rect.top > 100 && rect.bottom <= innerHeight + 1);
    if (valid) {
      if (!spacer?.isConnected || spacer.nextElementSibling !== footer) {
        release();
        spacer = footer.previousElementSibling?.hasAttribute('data-pi-sidebar-entry-space') ? footer.previousElementSibling : document.createElement('div');
        spacer.setAttribute('data-pi-sidebar-entry-space', '');
        spacer.style.cssText = 'height:40px;min-height:40px;flex:0 0 40px;margin-top:auto;pointer-events:none;';
        footer.before(spacer);
      }
      if (owner.parentElement !== spacer) spacer.append(owner);
      const bounds = footer.getBoundingClientRect();
      const anchor = footer.querySelector(column === 0 ? '[data-nav="settings"]' : '[data-nav="plugins"]')?.getBoundingClientRect();
      button.style.left = `${anchor ? anchor.left + anchor.width / 2 - 16 : bounds.left + column * 40}px`;
      button.style.top = `${bounds.top - 36}px`;
    } else release();
    button.style.display = valid && !hidden ? 'flex' : 'none';
  }
  function schedule() { if (!frame && !stopped) frame = requestAnimationFrame(update); }
  const mode = event => { hidden = event.detail === true; schedule(); };
  observer.observe(document.body, {childList: true, subtree: true});
  window.addEventListener('resize', schedule); window.addEventListener('pi-bot:mode', mode); update();
  return {
    hide(value) { hidden = value; schedule(); },
    close() { stopped = true; cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', schedule); window.removeEventListener('pi-bot:mode', mode); release(); layer.close(); },
  };
}
