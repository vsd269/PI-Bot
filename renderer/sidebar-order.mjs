// Stable manual order within each category; explicitly pinned chats stay first.
export function compareSidebarEntries(a,b){
  return Number(Boolean(b.item.pinned))-Number(Boolean(a.item.pinned))
    ||(a.item.sidebarOrder??Number.MAX_SAFE_INTEGER)-(b.item.sidebarOrder??Number.MAX_SAFE_INTEGER)
    ||String(b.item.log?.at(-1)?.at||b.item.chat?.at(-1)?.at||'').localeCompare(String(a.item.log?.at(-1)?.at||a.item.chat?.at(-1)?.at||''));
}
