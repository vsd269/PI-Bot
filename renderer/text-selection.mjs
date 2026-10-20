// Background state updates can replace message nodes while an excerpt is selected.
export function preserveTextSelection(transcript){
  const root=transcript.getRootNode(),selection=root.getSelection?.()||window.getSelection();
  if(!selection||selection.isCollapsed)return ()=>{};
  function point(node,offset){
    if(!transcript.contains(node))return null;
    const line=(node.nodeType===1?node:node.parentElement)?.closest('[data-line-id]');
    if(!line)return null;
    const range=document.createRange();range.selectNodeContents(line);range.setEnd(node,offset);
    return {id:line.dataset.lineId,offset:range.toString().length};
  }
  const anchor=point(selection.anchorNode,selection.anchorOffset),focus=point(selection.focusNode,selection.focusOffset),text=selection.toString();
  if(!anchor||!focus)return ()=>{};
  function resolve(point){
    const line=[...transcript.querySelectorAll('[data-line-id]')].find(node=>node.dataset.lineId===point.id);
    if(!line)return null;
    const walker=document.createTreeWalker(line,NodeFilter.SHOW_TEXT);let remaining=point.offset,node;
    while((node=walker.nextNode())){if(remaining<=node.length)return {node,offset:remaining};remaining-=node.length;}
    return null;
  }
  return ()=>{
    const a=resolve(anchor),b=resolve(focus);if(!a||!b)return;
    const range=document.createRange(),forward=anchor.id===focus.id?anchor.offset<=focus.offset:Boolean(a.node.compareDocumentPosition(b.node)&Node.DOCUMENT_POSITION_FOLLOWING);
    const start=forward?a:b,end=forward?b:a;range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset);
    if(range.toString()===text)selection.setBaseAndExtent(a.node,a.offset,b.node,b.offset);
  };
}
