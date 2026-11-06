/** 装修撤销/重做栈（v2.17/F2）：只记录“变换型”操作（拖动落定、旋转、碰撞盒调整）。
 * 集合变更（摆放/收回/取出）会清空栈，避免 restore 到已经注销家具的快照。
 * 纯函数、可测；快照是 layout-manager 的 snapshot() 输出（{version,furniture,definitions?}）。
 */
export function createEditHistory({ cap = 40 } = {}) {
  let undoStack = [], redoStack = [];
  const limit = Math.max(1, Math.floor(Number(cap) || 1));
  return {
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
    get length() { return undoStack.length; },
    /** 记录“操作前”快照；新操作会清空重做栈。 */
    push(snapshot) {
      undoStack.push(snapshot);
      if (undoStack.length > limit) undoStack.shift();
      redoStack = [];
    },
    /** 撤销：把当前状态压入重做栈，返回要恢复的“操作前”快照。 */
    undo(current) {
      if (!undoStack.length) return null;
      if (current !== undefined) redoStack.push(current);
      return undoStack.pop();
    },
    /** 重做：把当前状态压入撤销栈，返回要恢复的快照。 */
    redo(current) {
      if (!redoStack.length) return null;
      if (current !== undefined) undoStack.push(current);
      return redoStack.pop();
    },
    clear() { undoStack = []; redoStack = []; },
  };
}

export function cloneForHistory(snapshot) {
  if (snapshot === null || snapshot === undefined) return snapshot;
  try { return JSON.parse(JSON.stringify(snapshot)); } catch { return snapshot; }
}