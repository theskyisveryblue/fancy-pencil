import type { PenDocument, PenNode } from './types';

export type TreeParent = PenDocument | PenNode;

export interface NodeLocation {
  parent: TreeParent;
  parentId: string | null;
  index: number;
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function childrenOf(parent: TreeParent): PenNode[] | undefined {
  const children = (parent as { children?: unknown }).children;
  return Array.isArray(children) ? (children as PenNode[]) : undefined;
}

export function forEachNode(document: PenDocument, visit: (node: PenNode) => void): void {
  const walk = (nodes: readonly PenNode[]): void => {
    for (const node of nodes) {
      visit(node);
      if (Array.isArray(node.children)) {
        walk(node.children);
      }
    }
  };
  walk(document.children ?? []);
}

export function findNode(document: PenDocument, id: string): PenNode | null {
  const search = (nodes: readonly PenNode[]): PenNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (Array.isArray(node.children)) {
        const nested = search(node.children);
        if (nested) return nested;
      }
    }
    return null;
  };
  return search(document.children ?? []);
}

export function findPath(document: PenDocument, id: string): PenNode[] | null {
  const search = (nodes: readonly PenNode[], path: PenNode[]): PenNode[] | null => {
    for (const node of nodes) {
      const nextPath = [...path, node];
      if (node.id === id) return nextPath;
      if (Array.isArray(node.children)) {
        const nested = search(node.children, nextPath);
        if (nested) return nested;
      }
    }
    return null;
  };
  return search(document.children ?? [], []);
}

export function findParent(document: PenDocument, id: string): NodeLocation | null {
  const search = (parent: TreeParent, parentId: string | null): NodeLocation | null => {
    const children = childrenOf(parent) ?? [];
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (child.id === id) {
        return { parent, parentId, index };
      }
      if (Array.isArray(child.children)) {
        const nested = search(child, child.id);
        if (nested) return nested;
      }
    }
    return null;
  };
  return search(document, null);
}

export function countNodes(document: PenDocument): number {
  let total = 0;
  forEachNode(document, () => {
    total += 1;
  });
  return total;
}

export function applyNodeData(node: PenNode, data: Record<string, unknown>): PenNode {
  const next: Record<string, unknown> = { ...node };
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next as PenNode;
}

export function updateNodeData(document: PenDocument, id: string, data: Record<string, unknown>): PenDocument {
  const update = (nodes: readonly PenNode[]): { changed: boolean; nodes: PenNode[] } => {
    let changed = false;
    const next = nodes.map((node) => {
      if (node.id === id) {
        changed = true;
        return applyNodeData(node, data);
      }
      if (Array.isArray(node.children)) {
        const nested = update(node.children);
        if (nested.changed) {
          changed = true;
          return { ...node, children: nested.nodes };
        }
      }
      return node;
    });
    return { changed, nodes: changed ? next : (nodes as PenNode[]) };
  };
  const result = update(document.children ?? []);
  if (!result.changed) return document;
  return { ...document, children: result.nodes };
}

export function replaceChildren(document: PenDocument, parentId: string | null, children: PenNode[]): PenDocument {
  if (parentId === null) {
    return { ...document, children };
  }
  return updateNodeData(document, parentId, { children });
}

export function insertNode(document: PenDocument, parentId: string | null, node: PenNode, index?: number): PenDocument {
  const insertInto = (children: PenNode[]): PenNode[] => {
    const at = typeof index === 'number' ? Math.max(0, Math.min(index, children.length)) : children.length;
    const next = children.slice();
    next.splice(at, 0, node);
    return next;
  };
  if (parentId === null) {
    return { ...document, children: insertInto(document.children ?? []) };
  }
  const parent = findNode(document, parentId);
  if (!parent) return document;
  const current = Array.isArray(parent.children) ? parent.children : [];
  return updateNodeData(document, parentId, { children: insertInto(current) });
}

export function removeNode(document: PenDocument, id: string): PenDocument {
  const remove = (children: readonly PenNode[]): { removed: boolean; nodes: PenNode[] } => {
    const next: PenNode[] = [];
    let removed = false;
    for (const child of children) {
      if (!removed && child.id === id) {
        removed = true;
        continue;
      }
      if (!removed && Array.isArray(child.children)) {
        const nested = remove(child.children);
        if (nested.removed) {
          removed = true;
          next.push({ ...child, children: nested.nodes });
          continue;
        }
      }
      next.push(child);
    }
    return { removed, nodes: next };
  };
  const result = remove(document.children ?? []);
  if (!result.removed) return document;
  return { ...document, children: result.nodes };
}

// Replace the node carrying `id` in place with `replacement` (same location and
// index). Used by the undoable detach command, which keeps the root id while
// swapping a persisted ref for its materialized tree.
export function replaceNode(document: PenDocument, id: string, replacement: PenNode): PenDocument {
  const replace = (nodes: readonly PenNode[]): { changed: boolean; nodes: PenNode[] } => {
    let changed = false;
    const next = nodes.map((node) => {
      if (node.id === id) {
        changed = true;
        return replacement;
      }
      if (Array.isArray(node.children)) {
        const nested = replace(node.children);
        if (nested.changed) {
          changed = true;
          return { ...node, children: nested.nodes };
        }
      }
      return node;
    });
    return { changed, nodes: changed ? next : (nodes as PenNode[]) };
  };
  const result = replace(document.children ?? []);
  if (!result.changed) return document;
  return { ...document, children: result.nodes };
}

export function collectIds(document: PenDocument): Set<string> {
  const ids = new Set<string>();
  forEachNode(document, (node) => {
    ids.add(node.id);
  });
  return ids;
}

export function setChildOrder(document: PenDocument, parentId: string | null, orderedIds: readonly string[]): PenDocument {
  const parent = parentId === null ? document : findNode(document, parentId);
  if (!parent) return document;
  const children = childrenOf(parent) ?? [];
  const byId = new Map<string, PenNode>();
  for (const child of children) {
    byId.set(child.id, child);
  }
  const ordered: PenNode[] = [];
  for (const id of orderedIds) {
    const child = byId.get(id);
    if (child) {
      ordered.push(child);
      byId.delete(id);
    }
  }
  for (const remaining of byId.values()) {
    ordered.push(remaining);
  }
  return replaceChildren(document, parentId, ordered);
}
