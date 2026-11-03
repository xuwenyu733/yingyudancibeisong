/** Resolve focus in the room's own document or shadow tree. */
export function activeElementFor(root){
  const tree=root?.getRootNode?.();let active=tree?.activeElement||root?.ownerDocument?.activeElement||null;
  while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;
  return active;
}
/** Hit-testing must use the same shadow tree as the canvas. */
export function elementAtPointFor(root,x,y){
  const tree=root?.getRootNode?.(),scope=typeof tree?.elementFromPoint==='function'?tree:root?.ownerDocument;
  return scope?.elementFromPoint?.(x,y)||null;
}
