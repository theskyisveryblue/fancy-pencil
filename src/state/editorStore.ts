import { useCallback, useRef, useState } from 'react';
import type { Command } from '../document/commands';
import { CompoundCommand, DeleteNodesCommand, DetachNodeCommand, InsertNodeCommand, ReorderNodeCommand, SetNodeDataCommand, SetVariablesCommand } from '../document/commands';
import { createEmptyDocument, createNodeForTool, type Box, type CreateTool } from '../document/defaults';
import { generateId } from '../document/ids';
import { History } from '../document/history';
import { hitTest } from '../document/hitTest';
import type { LayoutResult } from '../document/layout';
import { collectIds, findNode, findParent } from '../document/tree';
import type { PenDocument, PenNode, PenVariable } from '../document/types';

export interface EditorState {
  document: PenDocument;
  fileName: string;
  selectedIds: string[];
  themeMode: string;
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
  revision: number;
}

export interface NodePatch {
  id: string;
  data: Record<string, unknown>;
}

export interface EditorStore extends EditorState {
  dispatch(command: Command): void;
  undo(): void;
  redo(): void;
  select(ids: string[]): void;
  clearSelection(): void;
  updateNodes(patches: NodePatch[], label?: string): void;
  deleteSelection(): void;
  detachSelection(): void;
  createComponent(): void;
  updateVariableMode(name: string, mode: string, text: string): void;
  addVariable(type: PenVariable['type']): void;
  insertComponentAt(originId: string, point: { x: number; y: number }, layout: LayoutResult): void;
  nudge(dx: number, dy: number): void;
  createNodeAt(tool: CreateTool, box: Box, layout: LayoutResult): void;
  duplicateSelection(): void;
  reorderSelection(mode: 'front' | 'back' | 'forward' | 'backward'): void;
  loadDocument(document: PenDocument, fileName: string): void;
  newDocument(): void;
  setFileName(fileName: string): void;
  setThemeMode(mode: string): void;
}

function buildState(document: PenDocument, fileName: string, themeMode: string): EditorState {
  return {
    document,
    fileName,
    selectedIds: [],
    themeMode,
    canUndo: false,
    canRedo: false,
    undoDepth: 0,
    redoDepth: 0,
    revision: 0,
  };
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function useEditorStore(initial: { document: PenDocument; fileName: string; themeMode?: string }): EditorStore {
  const historyRef = useRef<History | null>(null);
  if (!historyRef.current) {
    historyRef.current = new History(initial.document);
  }
  const [state, setState] = useState<EditorState>(() =>
    buildState(historyRef.current ? historyRef.current.document : initial.document, initial.fileName, initial.themeMode ?? 'light'),
  );

  const sync = useCallback((patch: Partial<EditorState> = {}): void => {
    setState((current) => {
      const history = historyRef.current;
      if (!history) return current;
      const ids = collectIds(history.document);
      const requested = patch.selectedIds ?? current.selectedIds;
      return {
        ...current,
        ...patch,
        document: history.document,
        selectedIds: requested.filter((id) => ids.has(id)),
        canUndo: history.state.canUndo,
        canRedo: history.state.canRedo,
        undoDepth: history.state.undoDepth,
        redoDepth: history.state.redoDepth,
        revision: current.revision + 1,
      };
    });
  }, []);

  const dispatch = useCallback(
    (command: Command): void => {
      const history = historyRef.current;
      if (!history) return;
      history.execute(command);
      sync();
    },
    [sync],
  );

  const undo = useCallback((): void => {
    historyRef.current?.undo();
    sync();
  }, [sync]);

  const redo = useCallback((): void => {
    historyRef.current?.redo();
    sync();
  }, [sync]);

  const select = useCallback((ids: string[]): void => sync({ selectedIds: ids }), [sync]);
  const clearSelection = useCallback((): void => sync({ selectedIds: [] }), [sync]);

  const updateNodes = useCallback(
    (patches: NodePatch[], label?: string): void => {
      if (patches.length === 0) return;
      dispatch(new SetNodeDataCommand(patches, label ?? 'Update properties'));
    },
    [dispatch],
  );

  const deleteSelection = useCallback((): void => {
    const ids = state.selectedIds;
    if (ids.length === 0) return;
    dispatch(new DeleteNodesCommand(ids));
    sync({ selectedIds: [] });
  }, [dispatch, state.selectedIds, sync]);

  // Native Pen UI: Command-Option-K adds only reusable:true to the selected
  // frame. Keep its id, descendants, appearance, and selection unchanged.
  const createComponent = useCallback((): void => {
    const history = historyRef.current;
    if (!history || state.selectedIds.length !== 1) return;
    const id = state.selectedIds[0];
    const node = findNode(history.document, id);
    if (!node || node.type !== 'frame' || node.reusable === true) return;
    dispatch(new SetNodeDataCommand([{ id, data: { reusable: true } }], 'Create component'));
  }, [dispatch, state.selectedIds]);

  // Native Components drag: append one compact top-level ref to its reusable
  // origin. The only other persisted fields are the canvas-space drop x/y.
  const insertComponentAt = useCallback((originId: string, point: { x: number; y: number }, layout: LayoutResult): void => {
    const history = historyRef.current;
    if (!history || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const origin = findNode(history.document, originId);
    if (!origin || origin.type !== 'frame' || origin.reusable !== true) return;
    const node: PenNode = { id: generateId(collectIds(history.document)), type: 'ref', ref: originId };
    let parentId: string | null = null;
    let current = hitTest(layout, point);
    while (current) {
      const candidate = findNode(history.document, current.id);
      // The native nested drop under bi8Au skipped the reusable origin JLb0R.
      // Only persisted, non-reusable containers can own a new instance here.
      if (candidate && (candidate.type === 'frame' || candidate.type === 'group') && candidate.reusable !== true) {
        parentId = candidate.id;
        const parent = layout.byId.get(candidate.id);
        const mode = parent?.layout;
        if (mode !== 'horizontal' && mode !== 'vertical') {
          node.x = point.x - (parent?.absX ?? 0);
          node.y = point.y - (parent?.absY ?? 0);
        }
        break;
      }
      current = current.parentId ? layout.byId.get(current.parentId) ?? null : null;
    }
    if (!parentId) {
      node.x = point.x;
      node.y = point.y;
    }
    dispatch(new InsertNodeCommand({ parentId, node }));
    sync({ selectedIds: [node.id] });
  }, [dispatch, sync]);

  const updateVariableMode = useCallback((name: string, mode: string, text: string): void => {
    const document = historyRef.current?.document;
    const variable = document?.variables?.[name];
    if (!document || !variable) return;
    let value: unknown = text;
    if (variable.type === 'number') {
      if (text.trim() === '' || !Number.isFinite(Number(text))) return;
      value = Number(text);
    } else if (variable.type === 'boolean') {
      if (text !== 'true' && text !== 'false') return;
      value = text === 'true';
    } else if (variable.type === 'color' && !/^#[0-9a-fA-F]{6}$/.test(text)) return;
    const modes = document.themes?.mode?.length ? document.themes.mode : ['light', 'dark'];
    const entries: { value: unknown; theme: { mode: string }; [key: string]: unknown }[] = Array.isArray(variable.value)
      ? structuredClone(variable.value) as { value: unknown; theme: { mode: string } }[]
      : modes.map((item) => ({ value: variable.value, theme: { mode: item } }));
    const entry = entries.find((item) => item.theme?.mode === mode);
    if (entry) entry.value = value;
    else entries.push({ value, theme: { mode } });
    if (JSON.stringify(entries) === JSON.stringify(variable.value)) return;
    const variables = { ...document.variables, [name]: { ...variable, value: entries } };
    dispatch(new SetVariablesCommand(document.variables, variables));
  }, [dispatch]);

  const addVariable = useCallback((type: PenVariable['type']): void => {
    const document = historyRef.current?.document;
    if (!document) return;
    const variables = document.variables ?? {};
    let index = 1;
    while (Object.hasOwn(variables, 'variable-' + index)) index++;
    const value: unknown = type === 'color' ? '#000000' : type === 'number' ? 0 : type === 'boolean' ? false : '';
    dispatch(new SetVariablesCommand(document.variables, { ...variables, ['variable-' + index]: { type, value } }));
  }, [dispatch]);

  const detachSelection = useCallback((): void => {
    const history = historyRef.current;
    if (!history) return;
    const commands: Command[] = [];
    for (const id of state.selectedIds) {
      const node = findNode(history.document, id);
      if (!node || node.type !== 'ref') continue;
      commands.push(new DetachNodeCommand(id));
    }
    if (commands.length === 0) return;
    dispatch(commands.length === 1 ? commands[0] : new CompoundCommand(commands, 'Detach instances'));
  }, [dispatch, state.selectedIds]);

  const nudge = useCallback(
    (dx: number, dy: number): void => {
      const history = historyRef.current;
      if (!history) return;
      const patches: NodePatch[] = [];
      for (const id of state.selectedIds) {
        const node = findNode(history.document, id);
        if (!node) continue;
        patches.push({ id, data: { x: toNumber(node.x, 0) + dx, y: toNumber(node.y, 0) + dy } });
      }
      if (patches.length > 0) dispatch(new SetNodeDataCommand(patches, 'Nudge selection'));
    },
    [dispatch, state.selectedIds],
  );

  const createNodeAt = useCallback(
    (tool: CreateTool, box: Box, layout: LayoutResult): void => {
      const history = historyRef.current;
      if (!history) return;
      const node = createNodeForTool(tool, box);
      if (tool === 'browser') { node.x = box.x - 600; node.y = box.y - 450; dispatch(new InsertNodeCommand({ parentId: null, node })); sync({ selectedIds: [node.id] }); return; }
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      let current = hitTest(layout, point);
      let parentId: string | null = null;
      while (current) {
        const candidate = findNode(history.document, current.id);
        if (candidate && (candidate.type === 'frame' || candidate.type === 'group')) {
          parentId = candidate.id;
          const frameBox = layout.byId.get(candidate.id);
          node.x = Math.round(box.x - (frameBox ? frameBox.absX : 0));
          node.y = Math.round(box.y - (frameBox ? frameBox.absY : 0));
          if (['polygon', 'icon', 'script', 'prompt'].includes(tool) && (candidate.layout === 'vertical' || candidate.layout === 'horizontal')) {
            delete node.x;
            delete node.y;
          }
          break;
        }
        current = current.parentId ? layout.byId.get(current.parentId) ?? null : null;
      }
      dispatch(new InsertNodeCommand({ parentId, node }));
      sync({ selectedIds: [node.id] });
    },
    [dispatch, sync],
  );

  const duplicateSelection = useCallback((): void => {
    const history = historyRef.current;
    if (!history) return;
    const commands: Command[] = [];
    const created: string[] = [];
    const seen = collectIds(history.document);
    for (const id of state.selectedIds) {
      const node = findNode(history.document, id);
      if (!node) continue;
      const location = findParent(history.document, id);
      const clone = JSON.parse(JSON.stringify(node)) as PenNode;
      const reid = (target: PenNode): void => {
        let next = target.id;
        do {
          next = Math.floor(Math.random() * 60466176).toString(36).padStart(5, '0');
        } while (seen.has(next));
        seen.add(next);
        target.id = next;
        if (Array.isArray(target.children)) target.children.forEach(reid);
      };
      reid(clone);
      clone.x = toNumber(node.x, 0) + 10;
      clone.y = toNumber(node.y, 0) + 10;
      created.push(clone.id);
      commands.push(new InsertNodeCommand({ parentId: location ? location.parentId : null, node: clone }));
    }
    if (commands.length === 0) return;
    dispatch(new CompoundCommand(commands, 'Duplicate selection'));
    sync({ selectedIds: created });
  }, [dispatch, state.selectedIds, sync]);

  const reorderSelection = useCallback(
    (mode: 'front' | 'back' | 'forward' | 'backward'): void => {
      const history = historyRef.current;
      if (!history) return;
      const commands: Command[] = [];
      for (const id of state.selectedIds) {
        const location = findParent(history.document, id);
        if (!location) continue;
        commands.push(new ReorderNodeCommand(location.parentId, id, mode));
      }
      if (commands.length === 0) return;
      dispatch(commands.length === 1 ? commands[0] : new CompoundCommand(commands, 'Reorder selection'));
    },
    [dispatch, state.selectedIds],
  );

  const loadDocument = useCallback(
    (document: PenDocument, fileName: string): void => {
      const history = historyRef.current;
      if (!history) return;
      history.reset(document);
      sync({ fileName, selectedIds: [], document });
    },
    [sync],
  );

  const newDocument = useCallback((): void => {
    loadDocument(createEmptyDocument(), 'untitled.pen');
  }, [loadDocument]);

  const setFileName = useCallback((fileName: string): void => sync({ fileName }), [sync]);
  const setThemeMode = useCallback((mode: string): void => sync({ themeMode: mode }), [sync]);

  return {
    ...state,
    dispatch,
    undo,
    redo,
    select,
    clearSelection,
    updateNodes,
    deleteSelection,
    detachSelection,
    createComponent,
    updateVariableMode,
    addVariable,
    insertComponentAt,
    nudge,
    createNodeAt,
    duplicateSelection,
    reorderSelection,
    loadDocument,
    newDocument,
    setFileName,
    setThemeMode,
  };
}
