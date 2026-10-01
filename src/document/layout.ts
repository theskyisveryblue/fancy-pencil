import type { PenDocument, PenNode, PenNodeType } from './types';
import { UNSUPPORTED_NODE_TYPES } from './types';
import { inspectNode, type Diagnostic } from './diagnostics';
import { createIdFactory } from './ids';
import { findNode, findPath } from './tree';
import { frameFitExtent, intrinsicTextSize, parseSize, resolveEffectiveLayout, resolvePadding, type Padding, type PenLayoutMode, type SizeSpec } from './sizing';
import { resolveColor, resolveNumber } from './variables';

export type { PenLayoutMode };

export interface ResolvedStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number | number[];
  opacity?: number;
  flipX: boolean;
  flipY: boolean;
}

export interface PositionedNode {
  id: string;
  type: PenNodeType;
  name: string;
  absX: number;
  absY: number;
  localX: number;
  localY: number;
  width: number;
  height: number;
  depth: number;
  parentId: string | null;
  style: ResolvedStyle;
  node: PenNode;
  layout: PenLayoutMode;
  isInstance: boolean;
  insideInstance: boolean;
  unsupported: boolean;
  clipped: boolean;
}

export interface LayoutResult {
  nodes: PositionedNode[];
  byId: Map<string, PositionedNode>;
  diagnostics: Diagnostic[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface LayoutOptions {
  themeMode?: string;
}

const DEFAULT_SHAPE_SIZE = 100;

interface Ctx {
  document: PenDocument;
  themeMode: string;
  diagnostics: Diagnostic[];
  seen: Set<string>;
}

interface Measured {
  id: string;
  type: PenNodeType;
  name: string;
  original: PenNode;
  effective: PenNode;
  width: number;
  height: number;
  localX: number;
  localY: number;
  style: ResolvedStyle;
  layout: PenLayoutMode;
  unsupported: boolean;
  isInstance: boolean;
  insideInstance: boolean;
  clip: boolean;
  children: Measured[];
}

export function resolveLayoutMode(node: PenNode): PenLayoutMode {
  return resolveEffectiveLayout(node);
}

export function layoutDocument(document: PenDocument, options: LayoutOptions = {}): LayoutResult {
  const ctx: Ctx = {
    document,
    themeMode: options.themeMode ?? 'light',
    diagnostics: [],
    seen: new Set<string>(),
  };

  const roots = (document.children ?? []).map((child) => {
    const measured = measureNode(child, ctx, { width: undefined, height: undefined }, false);
    measured.localX = toNumber(child.x, 0);
    measured.localY = toNumber(child.y, 0);
    return measured;
  });

  const nodes: PositionedNode[] = [];
  const byId = new Map<string, PositionedNode>();
  for (const root of roots) {
    flatten(root, 0, 0, 0, null, nodes, byId);
  }

  return { nodes, byId, diagnostics: ctx.diagnostics, bounds: computeBounds(nodes) };
}

function flatten(
  measured: Measured,
  parentX: number,
  parentY: number,
  depth: number,
  parentId: string | null,
  out: PositionedNode[],
  byId: Map<string, PositionedNode>,
): void {
  const absX = parentX + measured.localX;
  const absY = parentY + measured.localY;
  const positioned: PositionedNode = {
    id: measured.id,
    type: measured.type,
    name: measured.name,
    absX,
    absY,
    localX: measured.localX,
    localY: measured.localY,
    width: measured.width,
    height: measured.height,
    depth,
    parentId,
    style: measured.style,
    node: measured.original,
    layout: measured.layout,
    isInstance: measured.isInstance,
    insideInstance: measured.insideInstance,
    unsupported: measured.unsupported,
    clipped: measured.clip,
  };
  out.push(positioned);
  byId.set(positioned.id, positioned);
  for (const child of measured.children) {
    flatten(child, absX, absY, depth + 1, measured.id, out, byId);
  }
}

function measureNode(
  node: PenNode,
  ctx: Ctx,
  available: { width?: number; height?: number },
  insideInstance: boolean,
  refStack: readonly string[] = [],
): Measured {
  const instance =
    node.type === 'ref' ? resolveInstance(node, ctx, refStack) : { node, isInstance: false, missingOrigin: false };
  const target = instance.node;

  for (const diagnostic of inspectNode(node)) {
    pushDiagnostic(ctx, diagnostic);
  }

  const pad = resolvePadding(target.padding);
  const layout = resolveLayoutMode(target);
  const isText = target.type === 'text';
  const declaredUnsupported = UNSUPPORTED_NODE_TYPES.includes(target.type);
  const unsupported = declaredUnsupported || instance.missingOrigin;

  const widthSpec = parseSize(target.width);
  const heightSpec = parseSize(target.height);
  const autoText = isText ? intrinsicTextSize(target, undefined) : null;
  const gap = resolveNumber(ctx.document, target.gap, ctx.themeMode, 0);
  const autoLayout = layout !== 'none';

  // A fit_content width needs the measured children, so only fixed / fill /
  // unsupported widths are resolved eagerly here. `fitsWidth` marks a frame
  // whose width is derived from content (Pen v2.19 also defaults an omitted
  // width to fit_content).
  const fitsWidth = target.type === 'frame' && autoLayout && widthSpec.kind === 'fit';
  const widthFallback = autoText ? autoText.width : DEFAULT_SHAPE_SIZE;
  let width = fitsWidth
    ? widthFallback
    : resolveExtent({
        spec: widthSpec,
        fallback: widthFallback,
        available: available.width,
        ctx,
        node,
        axis: 'width',
      });
  // A deferred-fit parent measures its children without a resolved available
  // width so a fill child cannot recurse into an undefined parent extent. Fill
  // children of a fit parent are handled after the child pass below.
  const measureWidth = fitsWidth ? undefined : Math.max(0, width - pad.left - pad.right);

  const rawChildren = Array.isArray(target.children) ? target.children : [];
  // Each measured child carries the ref stack it came from, so resolving a nested
  // ref can detect a recursive ref cycle without recursing forever.
  const childRefStack = node.type === 'ref' && typeof node.ref === 'string' ? [...refStack, node.ref] : refStack;
  const children = rawChildren.map((child) =>
    measureNode(
      child,
      ctx,
      { width: measureWidth, height: undefined },
      instance.isInstance ? true : insideInstance,
      instance.isInstance ? childRefStack : refStack,
    ),
  );

  const stackable = children.filter((child) => child.original.layoutPosition !== 'absolute');

  if (fitsWidth) {
    const childExtents = stackable.map((child) => child.width);
    // Empty (or all-absolute) frame: honour fit_content(n) first, else the
    // neutral fallback. A populated frame fits its measured children.
    width = stackable.length === 0 ? widthSpec.fallback ?? widthFallback : frameFitExtent({ layout, pad, gap, childExtents });
    for (const child of stackable) {
      if (parseSize(child.original.width).kind !== 'fill') continue;
      // A fill_container child of a fit_content parent has no non-circular
      // available extent. Keep the deterministic fallback it was measured with
      // and report it once instead of recursing or silently using 100px.
      pushDiagnostic(ctx, {
        level: 'warning',
        code: 'fit-fill-cycle',
        message:
          '"width: fill_container" inside a fit_content parent "' +
          String(node.name ?? node.id) +
          '" has no resolved parent extent; using its fallback width ' +
          Math.round(child.width) +
          'px.',
        nodeId: child.id,
        nodeName: child.original.name,
      });
    }
  }

  const contentWidth = Math.max(0, width - pad.left - pad.right);

  if (layout === 'horizontal') {
    distributeFillWidths(children, contentWidth, gap);
  }

  let height: number;
  if (isText) {
    const useFixedWidth = widthSpec.kind === 'fixed' || widthSpec.kind === 'fill';
    const metrics = intrinsicTextSize(target, useFixedWidth ? contentWidth : undefined);
    height = resolveExtent({ spec: heightSpec, fallback: metrics.height, available: available.height, ctx, node, axis: 'height' });
  } else if (layout !== 'none') {
    const natural =
      layout === 'vertical'
        ? stackable.reduce((sum, child) => sum + child.height, 0) + gap * Math.max(0, stackable.length - 1) + pad.top + pad.bottom
        : stackable.reduce((max, child) => Math.max(max, child.height), 0) + pad.top + pad.bottom;
    height = resolveExtent({ spec: heightSpec, fallback: natural, available: available.height, ctx, node, axis: 'height' });
  } else {
    height = resolveExtent({ spec: heightSpec, fallback: DEFAULT_SHAPE_SIZE, available: available.height, ctx, node, axis: 'height' });
  }

  if (layout !== 'none') {
    positionAutoLayoutChildren(children, layout, width, height, pad, gap, target);
    for (const child of children) {
      if (child.original.layoutPosition === 'absolute') {
        child.localX = toNumber(child.original.x, 0);
        child.localY = toNumber(child.original.y, 0);
      }
    }
  } else {
    for (const child of children) {
      child.localX = toNumber(child.original.x, 0);
      child.localY = toNumber(child.original.y, 0);
    }
  }

  return {
    id: node.id,
    type: node.type,
    name: String(node.name ?? target.name ?? node.type),
    original: node,
    effective: target,
    width,
    height,
    localX: 0,
    localY: 0,
    style: resolveStyle(target, ctx),
    layout,
    unsupported,
    isInstance: instance.isInstance,
    insideInstance,
    clip: target.clip === true,
    children,
  };
}

// Persisted instance property overrides live on the ref under `descendants`,
// keyed by a path of STABLE source ids joined with "/". A path either names a
// descendant of the origin directly ("veExn") or walks through a nested ref
// instance ("c4zmg/GigZ5", where c4zmg is a ref inside the origin and GigZ5 is a
// source id inside that ref's own origin). Both the native resolved Get output
// and the persisted document address a nested ref's origin by source ids, so a
// path is partitioned by its FIRST source-id segment: the direct child patch is
// applied here, and any remaining path is routed into that child's own
// `descendants` map with the ORIGINAL source ids. The nested ref then applies its
// own descendants when it is measured, so the overrides can never be discarded by
// re-cloning the nested origin.
export function readDescendants(node: PenNode): Record<string, Record<string, unknown>> {
  const raw = (node as { descendants?: unknown }).descendants;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const result: Record<string, Record<string, unknown>> = {};
  for (const [path, patch] of Object.entries(raw)) {
    if (typeof patch === 'object' && patch !== null && !Array.isArray(patch)) {
      result[path] = patch as Record<string, unknown>;
    }
  }
  return result;
}

function resolveInstance(
  node: PenNode,
  ctx: Ctx,
  refStack: readonly string[],
): { node: PenNode; isInstance: boolean; missingOrigin: boolean } {
  if (typeof node.ref === 'string' && refStack.includes(node.ref)) {
    pushDiagnostic(ctx, {
      level: 'error',
      code: 'ref-cycle',
      message: 'Component ref cycle at ' + node.ref + '; instance was not projected.',
      nodeId: node.id,
      nodeName: node.name,
    });
    return { node, isInstance: true, missingOrigin: true };
  }
  const origin = typeof node.ref === 'string' ? findNode(ctx.document, node.ref) : null;
  if (!origin) {
    pushDiagnostic(ctx, {
      level: 'error',
      code: 'missing-component',
      message: 'Instance "' + String(node.name ?? node.id) + '" references missing component "' + String(node.ref ?? '') + '".',
      nodeId: node.id,
      nodeName: node.name,
    });
    return { node, isInstance: true, missingOrigin: true };
  }
  // Deep clone so instance descendants never alias the reusable origin. Only the
  // projection is ever rewritten; the persisted raw ref+descendants model and the
  // origin tree in the document are never mutated.
  const merged = JSON.parse(JSON.stringify(origin)) as PenNode;
  const topLevel: (keyof PenNode)[] = ['name', 'x', 'y', 'width', 'height', 'opacity'];
  for (const key of topLevel) {
    const value = node[key];
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  const replacementIds = new Set<string>();
  const claimed = collectSubtreeIds(merged);
  claimed.add(node.id);
  applyDescendantOverrides(merged, node, ctx, refStack, replacementIds, claimed);
  applyLiteralChildrenReplacement(merged, node, ctx, replacementIds, claimed);

  merged.id = node.id;
  // Prefix ids for the projection, depth-first, so layout.byId stays unique for
  // every instance tree. This single "/" separator matches the captured native
  // evidence and covers descendants, nested ref children and nested ref origins.
  // A complete replacement subtree (a `type` descendant swap or a `children`
  // override / detached ref-with-children list) was SAVED by native Pen with its
  // own new node ids (e.g. D4328u, x8HgK, mNOal), so those nodes and their
  // descendants keep their ids and are skipped here.
  const prefix = node.id + '/';
  const reid = (target: PenNode, insideReplacement: boolean): void => {
    const replacement = insideReplacement || replacementIds.has(target.id);
    if (!replacement) target.id = prefix + target.id;
    if (Array.isArray(target.children)) {
      for (const child of target.children) reid(child, replacement);
    }
  };
  if (Array.isArray(merged.children)) {
    for (const child of merged.children) reid(child, false);
  }
  return { node: merged, isInstance: true, missingOrigin: false };
}

// ---------------------------------------------------------------------------
// Detach: materialize a persisted ref into a concrete saved tree (undoable via
// DetachNodeCommand). Native evidence (handoff/pen-evidence/workflows/
// native-component-detach): selecting G3F0DE (a ref to gL2Ml whose descendants
// carry a `type` replacement D4328u and a nested-ref `children` replacement
// x8HgK/mNOal) and pressing Command-Option-X saves a plain frame with the SAME
// id G3F0DE, the origin frame fields plus the instance overrides, and no
// `ref`/`descendants`/`reusable`. Its concrete children are the replacement
// title D4328u and a NEW ref oH6Xn -> skSG2 that keeps its literal replacement
// children x8HgK/mNOal: the nested component link is PRESERVED, not flattened.
// Both origins are untouched. after.json is the semantic target.
//
// The instance is rebuilt with the same top-level and descendant override logic
// the renderer uses, then every origin-derived id (which the renderer prefixes)
// receives a fresh unique persistent id while replacement subtrees keep their
// saved ids. The result never carries a "/" and never collides with the document.
export function detachRefNode(document: PenDocument, node: PenNode, taken: Set<string>): PenNode | null {
  if (node.type !== 'ref' || typeof node.ref !== 'string') return null;
  const origin = findNode(document, node.ref);
  if (!origin) return null;

  const ctx: Ctx = { document, themeMode: 'light', diagnostics: [], seen: new Set<string>() };
  const merged = JSON.parse(JSON.stringify(origin)) as PenNode;
  const topLevel: (keyof PenNode)[] = ['name', 'x', 'y', 'width', 'height', 'opacity'];
  for (const key of topLevel) {
    const value = node[key];
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  const replacementIds = new Set<string>();
  const claimed = collectSubtreeIds(merged);
  claimed.add(node.id);
  applyDescendantOverrides(merged, node, ctx, ancestorRefStack(document, node.id), replacementIds, claimed);
  applyLiteralChildrenReplacement(merged, node, ctx, replacementIds, claimed);

  merged.id = node.id;
  delete (merged as Record<string, unknown>).ref;
  delete (merged as Record<string, unknown>).descendants;
  delete (merged as Record<string, unknown>).reusable;

  const reserved = new Set<string>(taken);
  for (const id of replacementIds) reserved.add(id);
  const nextId = createIdFactory(reserved);
  const reid = (current: PenNode, insideReplacement: boolean): void => {
    const replacement = insideReplacement || replacementIds.has(current.id);
    if (replacement) {
      reserved.add(current.id);
    } else {
      current.id = nextId();
    }
    if (Array.isArray(current.children)) {
      for (const child of current.children) reid(child, replacement);
    }
  };
  if (Array.isArray(merged.children)) {
    for (const child of merged.children) reid(child, false);
  }
  return merged;
}

function ancestorRefStack(document: PenDocument, id: string): string[] {
  const path = findPath(document, id);
  if (!path) return [];
  const stack: string[] = [];
  for (const ancestor of path.slice(0, -1)) {
    if (ancestor.type === 'ref' && typeof ancestor.ref === 'string') stack.push(ancestor.ref);
  }
  return stack;
}

function collectSubtreeIds(node: PenNode): Set<string> {
  const ids = new Set<string>();
  const walk = (current: PenNode): void => {
    if (typeof current.id === 'string' && current.id !== '') ids.add(current.id);
    if (Array.isArray(current.children)) current.children.forEach(walk);
  };
  walk(node);
  return ids;
}

// Native detach (handoff/pen-evidence/workflows/native-component-detach/
// detached-isolated.pen) saves a ref that carries its own literal `children`
// array: oH6Xn -> skSG2 keeps the cloned origin frame fields but replaces the
// projected child list with the saved replacement subtree (x8HgK/mNOal). A ref
// node with a non-empty literal `children` array is that replacement form, so it
// overrides the freshly cloned origin children and keeps the saved ids verbatim.
function applyLiteralChildrenReplacement(
  target: PenNode,
  node: PenNode,
  ctx: Ctx,
  replacementIds: Set<string>,
  claimed: Set<string>,
): void {
  if (!Array.isArray(node.children) || node.children.length === 0) return;
  const replacement = node.children.map((child) => JSON.parse(JSON.stringify(child)) as PenNode);
  const ids = new Set<string>();
  for (const child of replacement) {
    for (const id of collectSubtreeIds(child)) ids.add(id);
  }
  const duplicate = findClaimedId(ids, claimed);
  if (duplicate !== null) {
    diagnoseDuplicateReplacement(node, 'literal children', duplicate, ctx);
    return;
  }
  for (const id of ids) {
    claimed.add(id);
    replacementIds.add(id);
  }
  target.children = replacement;
}

// Partition each persisted descendant path by its FIRST source-id segment and
// apply it to the freshly cloned `target` (a projection node whose child ids are
// still the STABLE source ids). A one-segment path patches the direct child; a
// deeper path routes the REMAINING segments into the matched nested ref node's
// own `descendants` map so the nested ref re-applies them from a fresh origin
// clone when it is measured. Nothing here mutates `document` or `origin`.
function applyDescendantOverrides(
  target: PenNode,
  node: PenNode,
  ctx: Ctx,
  refStack: readonly string[],
  replacementIds: Set<string>,
  claimed: Set<string>,
): void {
  const descend = (current: PenNode, overrides: Record<string, Record<string, unknown>>): void => {
    for (const [rawPath, patch] of Object.entries(overrides)) {
      const segments = rawPath.split('/').map((segment) => segment.trim()).filter((segment) => segment !== '');
      if (segments.length === 0) {
        pushDiagnostic(ctx, {
          level: 'warning',
          code: 'invalid-descendant-path',
          message: 'Instance "' + String(node.name ?? node.id) + '" has an empty descendant path; it was ignored.',
          nodeId: node.id,
          nodeName: node.name,
        });
        continue;
      }
      const children = Array.isArray(current.children) ? current.children : [];
      const index = children.findIndex((candidate) => candidate.id === segments[0]);
      const child = index >= 0 ? children[index] : undefined;
      if (!child) {
        pushDiagnostic(ctx, {
          level: 'warning',
          code: 'missing-descendant',
          message:
            'Instance "' +
            String(node.name ?? node.id) +
            '" references descendant path "' +
            rawPath +
            '" which does not exist in component "' +
            String(current.ref ?? node.ref ?? '') +
            '"; it was ignored.',
          nodeId: node.id,
          nodeName: node.name,
        });
        continue;
      }
      if (segments.length === 1) {
        applyDescendantPatch(current, index, child, patch, node, rawPath, ctx, replacementIds, claimed);
        continue;
      }
      if (child.type !== 'ref') {
        // A deeper path only makes sense through a nested ref; a non-ref child
        // cannot own a deeper descendant source id. Report once and move on.
        pushDiagnostic(ctx, {
          level: 'warning',
          code: 'missing-descendant',
          message:
            'Instance "' +
            String(node.name ?? node.id) +
            '" descendant path "' +
            rawPath +
            '" traverses "' +
            segments[0] +
            '", which is not a ref; it was ignored.',
          nodeId: node.id,
          nodeName: node.name,
        });
        continue;
      }
      const refId = typeof child.ref === 'string' ? child.ref : '';
      if (refId === '') {
        pushDiagnostic(ctx, {
          level: 'warning',
          code: 'missing-descendant',
          message:
            'Instance "' +
            String(node.name ?? node.id) +
            '" descendant path "' +
            rawPath +
            '" traverses ref "' +
            segments[0] +
            '" with no target component; it was ignored.',
          nodeId: node.id,
          nodeName: node.name,
        });
        continue;
      }
      if (refStack.includes(refId)) {
        pushDiagnostic(ctx, {
          level: 'error',
          code: 'ref-cycle',
          message:
            'Component "' +
            refId +
            '" forms a recursive ref cycle; descendant path "' +
            rawPath +
            '" of instance "' +
            String(node.name ?? node.id) +
            '" is not projected.',
          nodeId: node.id,
          nodeName: node.name,
        });
        continue;
      }
      // Route the remaining path (ORIGINAL source ids) into the nested ref's own
      // descendants map. The nested ref re-clones its origin and re-applies this
      // map when it is measured, so the patch is not discarded.
      const remaining = segments.slice(1).join('/');
      const own = readDescendants(child);
      own[remaining] = { ...own[remaining], ...patch };
      (child as Record<string, unknown>).descendants = own;
    }
  };
  descend(target, readDescendants(node));
}

// Apply a validated override patch to the resolved descendant node. Invalid keys
// or values are reported and skipped rather than written, so a bad override can
// never silently corrupt an unrelated field or node.
function applyDescendantPatch(
  parent: PenNode,
  index: number,
  target: PenNode,
  patch: Record<string, unknown>,
  instance: PenNode,
  path: string,
  ctx: Ctx,
  replacementIds: Set<string>,
  claimed: Set<string>,
): void {
  // Native Pen saves two complete-subtree replacement forms inline on
  // `descendants` (handoff/pen-evidence/workflows/api-component-replacement/
  // after.json): a `type` value that swaps the whole node, and a `children` list
  // that replaces a nested ref's projected child list.
  if (typeof patch.type === 'string') {
    const replacement = buildReplacementNode(patch, instance, path, ctx, replacementIds, claimed);
    if (replacement) {
      const children = Array.isArray(parent.children) ? parent.children : [];
      children[index] = replacement;
      parent.children = children;
    }
    return;
  }
  if (patch.children !== undefined) {
    const replacement = buildReplacementChildren(patch.children, instance, path, ctx, replacementIds, claimed);
    if (replacement) {
      (target as Record<string, unknown>).children = replacement;
    }
  }
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'children') continue;
    if (value === undefined) continue;
    if (!isOverrideValueValid(key, value)) {
      pushDiagnostic(ctx, {
        level: 'warning',
        code: 'invalid-descendant-value',
        message:
          'Instance "' +
          String(instance.name ?? instance.id) +
          '" descendant path "' +
          path +
          '" has an invalid value for "' +
          key +
          '": ' +
          JSON.stringify(value) +
          '; it was ignored.',
        nodeId: instance.id,
        nodeName: instance.name,
      });
      continue;
    }
    (target as Record<string, unknown>)[key] = value;
  }
}

function findClaimedId(ids: Set<string>, claimed: Set<string>): string | null {
  for (const id of ids) {
    if (claimed.has(id)) return id;
  }
  return null;
}

function diagnoseInvalidReplacement(instance: PenNode, path: string, detail: string, ctx: Ctx): void {
  pushDiagnostic(ctx, {
    level: 'warning',
    code: 'invalid-replacement',
    message:
      'Instance "' +
      String(instance.name ?? instance.id) +
      '" replacement "' +
      path +
      '" ' +
      detail +
      '; it was ignored.',
    nodeId: instance.id,
    nodeName: instance.name,
  });
}

function diagnoseDuplicateReplacement(instance: PenNode, path: string, id: string, ctx: Ctx): void {
  pushDiagnostic(ctx, {
    level: 'error',
    code: 'duplicate-replacement-id',
    message:
      'Instance "' +
      String(instance.name ?? instance.id) +
      '" replacement "' +
      path +
      '" reuses projected id "' +
      id +
      '"; it was ignored to avoid a duplicate projected id.',
    nodeId: instance.id,
    nodeName: instance.name,
  });
}

// Build a validated complete replacement node from a `type` descendant value.
// The persisted node is cloned verbatim (its own id and descendants kept) unless
// it is malformed or would reuse an id already claimed by this projection.
function buildReplacementNode(
  patch: Record<string, unknown>,
  instance: PenNode,
  path: string,
  ctx: Ctx,
  replacementIds: Set<string>,
  claimed: Set<string>,
): PenNode | null {
  const type = typeof patch.type === 'string' ? patch.type.trim() : '';
  if (type === '') {
    diagnoseInvalidReplacement(instance, path, 'has a blank "type"', ctx);
    return null;
  }
  const id = typeof patch.id === 'string' ? patch.id.trim() : '';
  if (id === '') {
    diagnoseInvalidReplacement(instance, path, 'replaces a subtree with a node that has no string "id"', ctx);
    return null;
  }
  const node = JSON.parse(JSON.stringify(patch)) as PenNode;
  const ids = collectSubtreeIds(node);
  const duplicate = findClaimedId(ids, claimed);
  if (duplicate !== null) {
    diagnoseDuplicateReplacement(instance, path, duplicate, ctx);
    return null;
  }
  for (const candidate of ids) {
    claimed.add(candidate);
    replacementIds.add(candidate);
  }
  return node;
}

// Build a validated replacement child list from a `children` descendant value.
function buildReplacementChildren(
  value: unknown,
  instance: PenNode,
  path: string,
  ctx: Ctx,
  replacementIds: Set<string>,
  claimed: Set<string>,
): PenNode[] | null {
  if (!Array.isArray(value)) {
    diagnoseInvalidReplacement(instance, path, 'has a non-array "children" value', ctx);
    return null;
  }
  const nodes: PenNode[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      diagnoseInvalidReplacement(instance, path, 'has a non-node entry in "children"', ctx);
      return null;
    }
    const id = (entry as { id?: unknown }).id;
    if (typeof id !== 'string' || id.trim() === '') {
      diagnoseInvalidReplacement(instance, path, 'has a "children" entry with no string "id"', ctx);
      return null;
    }
    nodes.push(JSON.parse(JSON.stringify(entry)) as PenNode);
  }
  const ids = new Set<string>();
  for (const node of nodes) {
    for (const id of collectSubtreeIds(node)) ids.add(id);
  }
  const duplicate = findClaimedId(ids, claimed);
  if (duplicate !== null) {
    diagnoseDuplicateReplacement(instance, path, duplicate, ctx);
    return null;
  }
  for (const id of ids) {
    claimed.add(id);
    replacementIds.add(id);
  }
  return nodes;
}

function isOverrideValueValid(key: string, value: unknown): boolean {
  if (value === null) return false;
  if (key === 'opacity') return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  if (key === 'content' || key === 'name' || key === 'fontFamily') return typeof value === 'string';
  if (
    key === 'x' ||
    key === 'y' ||
    key === 'fontSize' ||
    key === 'lineHeight' ||
    key === 'letterSpacing' ||
    key === 'strokeWidth' ||
    key === 'rotation' ||
    key === 'gap'
  ) {
    return typeof value === 'number' && Number.isFinite(value);
  }
  if (key === 'width' || key === 'height') {
    return (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.trim() !== '');
  }
  if (key === 'fontWeight') return (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'string';
  if (key === 'fill' || key === 'stroke') return typeof value === 'string';
  if (key === 'clip' || key === 'flipX' || key === 'flipY') return typeof value === 'boolean';
  if (key === 'cornerRadius') return (typeof value === 'number' && Number.isFinite(value)) || Array.isArray(value);
  if (key === 'padding') return (typeof value === 'number' && Number.isFinite(value)) || Array.isArray(value);
  if (key === 'layout') return value === 'none' || value === 'horizontal' || value === 'vertical';
  if (key === 'textAlign') return value === 'left' || value === 'center' || value === 'right' || value === 'justify';
  if (key === 'textGrowth') return value === 'auto' || value === 'fixed-width' || value === 'fixed-width-height';
  if (key === 'justifyContent' || key === 'alignItems') return typeof value === 'string';
  return false;
}

function distributeFillWidths(children: Measured[], contentWidth: number, gap: number): void {
  const stackable = children.filter((child) => child.original.layoutPosition !== 'absolute');
  const fillers = stackable.filter((child) => parseSize(child.original.width).kind === 'fill');
  if (fillers.length === 0) return;
  const others = stackable.filter((child) => parseSize(child.original.width).kind !== 'fill');
  const used = others.reduce((sum, child) => sum + child.width, 0) + gap * Math.max(0, stackable.length - 1);
  const share = Math.max(0, (contentWidth - used) / fillers.length);
  for (const filler of fillers) {
    filler.width = share;
  }
}

function positionAutoLayoutChildren(
  children: Measured[],
  layout: PenLayoutMode,
  width: number,
  height: number,
  pad: Padding,
  gap: number,
  target: PenNode,
): void {
  const stackable = children.filter((child) => child.original.layoutPosition !== 'absolute');
  const contentWidth = Math.max(0, width - pad.left - pad.right);
  const contentHeight = Math.max(0, height - pad.top - pad.bottom);
  const vertical = layout === 'vertical';
  const mainExtent = vertical ? contentHeight : contentWidth;
  const used =
    stackable.reduce((sum, child) => sum + (vertical ? child.height : child.width), 0) + gap * Math.max(0, stackable.length - 1);
  const remaining = Math.max(0, mainExtent - used);
  const justify = typeof target.justifyContent === 'string' ? target.justifyContent : 'start';
  const align = typeof target.alignItems === 'string' ? target.alignItems : 'start';

  let cursor = vertical ? pad.top : pad.left;
  let extraGap = 0;
  if (justify === 'center') {
    cursor += remaining / 2;
  } else if (justify === 'end') {
    cursor += remaining;
  } else if (justify === 'space_between' && stackable.length > 1) {
    extraGap = remaining / (stackable.length - 1);
  } else if (justify === 'space_around' && stackable.length > 0) {
    extraGap = remaining / stackable.length;
    cursor += extraGap / 2;
  }

  for (const child of stackable) {
    if (vertical) {
      if (align === 'stretch') {
        child.width = contentWidth;
        child.localX = pad.left;
      } else if (align === 'center') {
        child.localX = pad.left + Math.max(0, (contentWidth - child.width) / 2);
      } else if (align === 'end') {
        child.localX = pad.left + Math.max(0, contentWidth - child.width);
      } else {
        child.localX = pad.left;
      }
      child.localY = cursor;
      cursor += child.height + gap + extraGap;
    } else {
      if (align === 'stretch') {
        child.height = contentHeight;
        child.localY = pad.top;
      } else if (align === 'center') {
        child.localY = pad.top + Math.max(0, (contentHeight - child.height) / 2);
      } else if (align === 'end') {
        child.localY = pad.top + Math.max(0, contentHeight - child.height);
      } else {
        child.localY = pad.top;
      }
      child.localX = cursor;
      cursor += child.width + gap + extraGap;
    }
  }
}

function resolveStyle(node: PenNode, ctx: Ctx): ResolvedStyle {
  return {
    fill: resolveColor(ctx.document, node.fill, ctx.themeMode),
    stroke: resolveColor(ctx.document, node.stroke, ctx.themeMode),
    strokeWidth: typeof node.strokeWidth === 'number' ? node.strokeWidth : undefined,
    cornerRadius: node.cornerRadius,
    opacity: typeof node.opacity === 'number' ? node.opacity : undefined,
    flipX: node.flipX === true,
    flipY: node.flipY === true,
  };
}

function resolveExtent(args: {
  spec: SizeSpec;
  fallback: number;
  available?: number;
  ctx: Ctx;
  node: PenNode;
  axis: 'width' | 'height';
}): number {
  const { spec, fallback, available, ctx, node, axis } = args;
  switch (spec.kind) {
    case 'fixed':
      return spec.value ?? fallback;
    case 'fill': {
      if (typeof available === 'number' && Number.isFinite(available)) {
        return available;
      }
      pushDiagnostic(ctx, {
        level: 'warning',
        code: 'fill-without-parent',
        message: '"' + axis + ': fill_container" has no resolved parent extent; using ' + Math.round(fallback) + 'px.',
        nodeId: node.id,
        nodeName: node.name,
      });
      return spec.fallback ?? fallback;
    }
    case 'fit':
      return spec.fallback ?? fallback;
    case 'unsupported': {
      pushDiagnostic(ctx, {
        level: 'warning',
        code: 'unsupported-size',
        message: 'Unsupported ' + axis + ' value ' + JSON.stringify(spec.raw) + '; using ' + Math.round(spec.fallback ?? fallback) + 'px.',
        nodeId: node.id,
        nodeName: node.name,
      });
      return spec.fallback ?? fallback;
    }
    default:
      return fallback;
  }
}

function computeBounds(nodes: readonly PositionedNode[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.absX);
    minY = Math.min(minY, node.absY);
    maxX = Math.max(maxX, node.absX + node.width);
    maxY = Math.max(maxY, node.absY + node.height);
  }
  return { minX, minY, maxX, maxY };
}

function pushDiagnostic(ctx: Ctx, diagnostic: Diagnostic): void {
  const key = (diagnostic.nodeId ?? 'document') + ':' + diagnostic.code + ':' + diagnostic.message;
  if (ctx.seen.has(key)) return;
  ctx.seen.add(key);
  ctx.diagnostics.push(diagnostic);
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
