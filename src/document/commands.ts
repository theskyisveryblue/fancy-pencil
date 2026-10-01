import { detachRefNode } from './layout';
import type { PenDocument, PenNode, PenVariable } from './types';
import { collectIds, deepClone, findNode, findParent, findPath, insertNode, removeNode, replaceNode, setChildOrder, updateNodeData } from './tree';

export interface Command {
  readonly label: string;
  apply(document: PenDocument): PenDocument;
  invert(): Command;
}

export class SetImportsCommand implements Command {
  readonly label = 'Import library';
  constructor(private readonly before: Record<string, string> | undefined, private readonly after: Record<string, string> | undefined) {}
  apply(document: PenDocument): PenDocument {
    const result = { ...document };
    if (this.after === undefined) delete result.imports;
    else result.imports = deepClone(this.after);
    return result;
  }
  invert(): Command { return new SetImportsCommand(this.after, this.before); }
}

export class SetVariablesCommand implements Command {
  readonly label = 'Edit variables';
  constructor(private readonly before: Record<string, PenVariable> | undefined, private readonly after: Record<string, PenVariable> | undefined) {}
  apply(document: PenDocument): PenDocument {
    const result = { ...document };
    if (this.after === undefined) delete result.variables;
    else result.variables = deepClone(this.after);
    return result;
  }
  invert(): Command { return new SetVariablesCommand(this.after, this.before); }
}

export class SetThemesCommand implements Command {
  readonly label = 'Edit themes';
  constructor(private readonly before: PenDocument['themes'], private readonly after: PenDocument['themes']) {}
  apply(document: PenDocument): PenDocument {
    const result = { ...document };
    if (this.after === undefined) delete result.themes;
    else result.themes = deepClone(this.after);
    return result;
  }
  invert(): Command { return new SetThemesCommand(this.after, this.before); }
}

export interface InsertEntry {
  parentId: string | null;
  node: PenNode;
  index?: number;
}

export interface NodePatch {
  id: string;
  data: Record<string, unknown>;
}

export class InsertNodeCommand implements Command {
  readonly label: string;
  private emptyParentId: string | null = null;

  constructor(private readonly entry: InsertEntry) {
    this.label = 'Insert ' + entry.node.type;
  }

  get nodeId(): string {
    return this.entry.node.id;
  }

  apply(document: PenDocument): PenDocument {
    const parent = this.entry.parentId ? findNode(document, this.entry.parentId) : null;
    this.emptyParentId = parent && !Object.hasOwn(parent, 'children') ? this.entry.parentId : null;
    return insertNode(document, this.entry.parentId, this.entry.node, this.entry.index);
  }

  invert(): Command {
    const removal = new DeleteNodesCommand([this.entry.node.id]);
    return this.emptyParentId ? new CompoundCommand([removal, new SetNodeDataCommand([{ id: this.emptyParentId, data: { children: undefined } }])]) : removal;
  }
}

export class InsertNodesCommand implements Command {
  readonly label: string;
  private emptyParentIds: string[] = [];

  constructor(private readonly entries: InsertEntry[]) {
    this.label = entries.length > 1 ? 'Insert ' + entries.length + ' nodes' : 'Insert node';
  }

  apply(document: PenDocument): PenDocument {
    this.emptyParentIds = [...new Set(this.entries.map(entry => entry.parentId).filter((id): id is string => !!id && !Object.hasOwn(findNode(document, id) ?? {}, 'children')))];
    let next = document;
    for (const entry of this.entries) {
      next = insertNode(next, entry.parentId, entry.node, entry.index);
    }
    return next;
  }

  invert(): Command {
    const removal = new DeleteNodesCommand(this.entries.map((entry) => entry.node.id));
    return this.emptyParentIds.length ? new CompoundCommand([removal, new SetNodeDataCommand(this.emptyParentIds.map(id => ({ id, data: { children: undefined } })))]) : removal;
  }
}

// Reduces a selection to its top-level ancestors. Selecting a frame and one of
// its children must delete the frame once, not the frame and a stale child.
export function normalizeTopLevelIds(document: PenDocument, ids: readonly string[]): string[] {
  const wanted: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    const path = findPath(document, id);
    if (!path) continue;
    seen.add(id);
    const hasSelectedAncestor = path.slice(0, -1).some((ancestor) => ids.includes(ancestor.id));
    if (!hasSelectedAncestor) {
      wanted.push(id);
    }
  }
  return wanted;
}

export class DeleteNodesCommand implements Command {
  readonly label: string;
  private removed: InsertEntry[] = [];

  constructor(private readonly ids: string[]) {
    this.label = ids.length > 1 ? 'Delete ' + ids.length + ' nodes' : 'Delete node';
  }

  apply(document: PenDocument): PenDocument {
    // Snapshot every original position against the untouched document first, so
    // indices are not shifted by earlier removals in the same command.
    const topLevel = normalizeTopLevelIds(document, this.ids);
    const snapshot: InsertEntry[] = [];
    for (const id of topLevel) {
      const node = findNode(document, id);
      const location = findParent(document, id);
      if (!node || !location) continue;
      snapshot.push({ parentId: location.parentId, node: deepClone(node), index: location.index });
    }
    snapshot.sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
    this.removed = snapshot;

    let next = document;
    for (const entry of snapshot) {
      next = removeNode(next, entry.node.id);
    }
    return next;
  }

  invert(): Command {
    return new InsertNodesCommand(this.removed);
  }
}

export class SetNodeDataCommand implements Command {
  readonly label: string;
  private previous: NodePatch[] = [];

  constructor(private readonly patches: NodePatch[], label = 'Update properties') {
    this.label = label;
  }

  apply(document: PenDocument): PenDocument {
    const previous: NodePatch[] = [];
    let next = document;
    for (const patch of this.patches) {
      const node = findNode(next, patch.id);
      if (!node) continue;
      const before: Record<string, unknown> = {};
      for (const key of Object.keys(patch.data)) {
        before[key] = node[key];
      }
      previous.push({ id: patch.id, data: before });
      next = updateNodeData(next, patch.id, patch.data);
    }
    this.previous = previous;
    return next;
  }

  invert(): Command {
    return new SetNodeDataCommand(this.previous, 'Undo ' + this.label);
  }
}

export class SetChildOrderCommand implements Command {
  readonly label = 'Reorder children';
  private previous: string[] = [];

  constructor(private readonly parentId: string | null, private readonly order: string[]) {}

  apply(document: PenDocument): PenDocument {
    const parent = this.parentId === null ? document : findNode(document, this.parentId);
    if (!parent || !Array.isArray(parent.children)) return document;
    this.previous = parent.children.map((child) => child.id);
    return setChildOrder(document, this.parentId, this.order);
  }

  invert(): Command {
    return new SetChildOrderCommand(this.parentId, this.previous);
  }
}

export class ReorderNodeCommand implements Command {
  readonly label: string;
  private previousOrder: string[] = [];

  constructor(
    private readonly parentId: string | null,
    private readonly nodeId: string,
    private readonly mode: 'front' | 'back' | 'forward' | 'backward',
  ) {
    this.label = 'Reorder (' + mode + ')';
  }

  apply(document: PenDocument): PenDocument {
    const parent = this.parentId === null ? document : findNode(document, this.parentId);
    if (!parent || !Array.isArray(parent.children)) return document;
    const ids = parent.children.map((child) => child.id);
    this.previousOrder = ids;
    const from = ids.indexOf(this.nodeId);
    if (from < 0) return document;
    let to = from;
    if (this.mode === 'front') to = ids.length - 1;
    else if (this.mode === 'back') to = 0;
    else if (this.mode === 'forward') to = Math.min(ids.length - 1, from + 1);
    else to = Math.max(0, from - 1);
    if (to === from) return document;
    const next = ids.slice();
    next.splice(from, 1);
    next.splice(to, 0, this.nodeId);
    return setChildOrder(document, this.parentId, next);
  }

  invert(): Command {
    return new SetChildOrderCommand(this.parentId, this.previousOrder);
  }
}

// Materialize a persisted ref into a concrete frame/group/shape tree with the
// same root id (native detach evidence). The materialization is computed once
// and cached so redo reproduces the exact same tree, including its generated
// nested ids; invert restores the raw ref node.
export class DetachNodeCommand implements Command {
  readonly label = 'Detach instance';
  private original: PenNode | null = null;
  private detached: PenNode | null = null;

  constructor(private readonly nodeId: string) {}

  apply(document: PenDocument): PenDocument {
    if (this.detached) {
      return replaceNode(document, this.nodeId, deepClone(this.detached));
    }
    const node = findNode(document, this.nodeId);
    if (!node || node.type !== 'ref' || typeof node.ref !== 'string') return document;
    const materialized = detachRefNode(document, node, collectIds(document));
    if (!materialized) return document;
    this.original = deepClone(node);
    this.detached = materialized;
    return replaceNode(document, this.nodeId, deepClone(materialized));
  }

  invert(): Command {
    if (!this.original) return new SetNodeDataCommand([], 'No change');
    return new ReplaceNodeCommand(this.nodeId, deepClone(this.original), 'Restore instance ref');
  }
}

// Swap the node carrying `nodeId` for `replacement`, remembering the node it
// replaced so the swap can be inverted.
export class ReplaceNodeCommand implements Command {
  private previous: PenNode | null = null;
  private applied = false;

  constructor(private readonly nodeId: string, private readonly replacement: PenNode, readonly label = 'Replace node') {}

  apply(document: PenDocument): PenDocument {
    if (!this.applied) {
      const current = findNode(document, this.nodeId);
      this.previous = current ? deepClone(current) : null;
      this.applied = true;
    }
    return replaceNode(document, this.nodeId, deepClone(this.replacement));
  }

  invert(): Command {
    if (!this.previous) return new SetNodeDataCommand([], 'No change');
    return new ReplaceNodeCommand(this.nodeId, this.previous, 'Undo ' + this.label);
  }
}

export class CompoundCommand implements Command {
  constructor(private readonly commands: Command[], readonly label = 'Compound change') {}

  apply(document: PenDocument): PenDocument {
    return this.commands.reduce((next, command) => command.apply(next), document);
  }

  invert(): Command {
    return new CompoundCommand([...this.commands].reverse().map((command) => command.invert()), 'Undo ' + this.label);
  }
}

export function geometryCommand(patches: NodePatch[], label = 'Change geometry'): Command {
  return new SetNodeDataCommand(patches, label);
}
