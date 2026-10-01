import type { LayoutResult, PositionedNode } from './layout';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function containsPoint(node: PositionedNode, point: Point): boolean {
  return (
    node.width > 0 &&
    node.height > 0 &&
    point.x >= node.absX &&
    point.x <= node.absX + node.width &&
    point.y >= node.absY &&
    point.y <= node.absY + node.height
  );
}

export function hitTest(layout: LayoutResult, point: Point): PositionedNode | null {
  for (let index = layout.nodes.length - 1; index >= 0; index -= 1) {
    const node = layout.nodes[index];
    if (node.insideInstance) continue;
    if (containsPoint(node, point)) return node;
  }
  return null;
}

// Single click selects the containing frame (matching the audited Pen
// behavior); deep select (double click / Command-click) selects the hit node.
export function selectableNodeId(layout: LayoutResult, point: Point, deep: boolean): string | null {
  const hit = hitTest(layout, point);
  if (!hit) return null;
  if (deep) return hit.id;
  let current = hit;
  while (current.parentId) {
    const parent = layout.byId.get(current.parentId);
    if (!parent) break;
    if (parent.type === 'frame' || parent.type === 'group') return parent.id;
    current = parent;
  }
  return hit.id;
}

export function nodesInRect(layout: LayoutResult, rect: Rect): string[] {
  const minX = Math.min(rect.x, rect.x + rect.width);
  const maxX = Math.max(rect.x, rect.x + rect.width);
  const minY = Math.min(rect.y, rect.y + rect.height);
  const maxY = Math.max(rect.y, rect.y + rect.height);
  const ids: string[] = [];
  for (const node of layout.nodes) {
    if (node.insideInstance) continue;
    if (node.width <= 0 || node.height <= 0) continue;
    if (node.absX >= minX && node.absY >= minY && node.absX + node.width <= maxX && node.absY + node.height <= maxY) {
      ids.push(node.id);
    }
  }
  return ids;
}
