import { extractRenderableGradientFill, getBlobBytes, nodeId, parseFig, parseVectorNetworkBlob, resolveGradientGeometry, resolveVectorNodePaths, type FigDocument, type FigNode, type FigPaint } from 'openfig-core';
import type { PenDocument, PenFillLayer, PenNode } from './types';

export const MAX_FIG_BYTES = 64_000_000;
export const MAX_FIG_DEPTH = 64;
export const IMPORTER_NAME = 'openfig-core';

export interface FigmaPageRef {
  id: string;
  name: string;
  nodeCount: number;
}

export type FigmaFigResult =
  | { ok: true; document: FigDocument; pages: FigmaPageRef[]; fileName: string }
  | { ok: false; error: string };

// openfig-core is the sole parser of the real fig-kiwi container. Keep it
// behind this one boundary so the clone model never sees a FigNode.
function parseLocalFig(bytes: Uint8Array, fileName: string): FigmaFigResult {
  if (bytes.byteLength === 0) return { ok: false, error: 'The .fig file is empty.' };
  if (bytes.byteLength > MAX_FIG_BYTES) {
    return { ok: false, error: 'The .fig file is larger than ' + MAX_FIG_BYTES / 1_000_000 + ' MB.' };
  }
  let document: FigDocument;
  try {
    document = parseFig(bytes);
  } catch (error) {
    return { ok: false, error: 'This file is not a readable Figma design archive (' + (error as Error).message + ').' };
  }
  if (document.header.prelude !== 'fig-kiwi') {
    return { ok: false, error: 'This file is not a supported Figma design archive.' };
  }
  const pages = document.nodes
    .filter((node) => node.type === 'CANVAS' && node.phase !== 'REMOVED')
    .map((node) => ({ id: nodeId(node) ?? '', name: node.name || 'Page', nodeCount: 0 }))
    .filter((page) => page.id !== '');
  if (pages.length === 0) return { ok: false, error: 'The .fig file has no design pages to import.' };
  return { ok: true, document, pages, fileName };
}

export function parseFigmaFile(buffer: ArrayBuffer, fileName: string): FigmaFigResult {
  return parseLocalFig(new Uint8Array(buffer), fileName);
}

export async function parseFigmaBlob(blob: Blob): Promise<FigmaFigResult> {
  const fileName = blob instanceof File ? blob.name : 'import.fig';
  return parseLocalFig(new Uint8Array(await blob.arrayBuffer()), fileName);
}

interface FigmaToPenDiagnostics {
  skippedTypes: Record<string, number>;
  skippedImages: number;
  skippedPaints: number;
  flattenedTransforms: number;
  truncatedDepth: number;
}

const TYPE_MAP: Record<string, PenNode['type'] | undefined> = {
  FRAME: 'frame',
  ROUNDED_RECTANGLE: 'rectangle',
  RECTANGLE: 'rectangle',
  TEXT: 'text',
  VECTOR: 'path',
  ELLIPSE: 'ellipse',
  BOOLEAN_OPERATION: 'group',
  SYMBOL: 'frame',
  INSTANCE: 'frame',
};

// Node kinds with no independent clone representation. Skipping them keeps the
// imported tree structurally honest instead of inventing geometry we cannot
// render; descendants of a skipped container are skipped with it.
const SKIPPED_TYPES = new Set([
  'GROUP', 'COMPONENT_SET', 'STAR', 'LINE', 'REGULAR_POLYGON', 'SLICE',
]);

const TEXT_ALIGN: Record<string, PenNode['textAlign']> = {
  LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify',
};

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function colorHex(color: { r: number; g: number; b: number } | undefined, opacity = 1): string | undefined {
  if (!color) return undefined;
  const channel = (value: number): string => Math.max(0, Math.min(255, Math.round(value * 255))).toString(16).padStart(2, '0');
  return '#' + channel(color.r) + channel(color.g) + channel(color.b) + channel(opacity);
}

function solidFill(node: FigNode, diagnostics: FigmaToPenDiagnostics): PenNode['fill'] | undefined {
  const paints = (node.fillPaints ?? []).filter((paint) => paint && paint.visible !== false);
  if (paints.length === 0) return undefined;
  const solid = paints.filter((paint) => paint.type === 'SOLID').at(-1);
  if (solid) return colorHex(solid.color as { r: number; g: number; b: number } | undefined, solid.opacity ?? 1);
  const gradient = extractRenderableGradientFill(paints);
  if (gradient) {
    const width = Math.max(1, node.size?.x ?? 1), height = Math.max(1, node.size?.y ?? 1);
    const geometry = resolveGradientGeometry(gradient, width, height);
    const colors = gradient.stops.map(stop => ({ color: colorHex(stop.color, stop.color.a ?? 1) ?? '#000000ff', position: stop.position }));
    const opacity = gradient.opacity === 1 ? {} : { opacity: gradient.opacity };
    if (geometry?.type === 'radial') {
      const transform = gradient.transform;
      const m00 = transform?.m00 ?? 1, m01 = transform?.m01 ?? 0;
      const m10 = transform?.m10 ?? 0, m11 = transform?.m11 ?? 1;
      const a = m00 * m00 + m10 * m10, b = m00 * m01 + m10 * m11, d = m01 * m01 + m11 * m11;
      const delta = Math.hypot(a - d, 2 * b);
      const major = Math.max(0, (a + d + delta) / 2), minor = Math.max(0, (a + d - delta) / 2);
      const axisAngle = delta < 1e-12 ? 0 : Math.atan2(2 * b, a - d) * 90 / Math.PI;
      return {
        type: 'gradient', enabled: true, gradientType: 'radial',
        rotation: -180 - axisAngle,
        size: { width: major ? 1 / Math.sqrt(major) : 1, height: minor ? 1 / Math.sqrt(minor) : 1 },
        center: { x: geometry.center.x / width, y: geometry.center.y / height }, colors, ...opacity,
      };
    }
    if (geometry?.type === 'linear') {
      const transform = gradient.transform;
      const rotation = transform ? -90 + Math.atan2(transform.m10, transform.m00) * 180 / Math.PI : -180;
      const axisLength = transform ? Math.hypot(transform.m00, transform.m10) : 1;
      const center = {
        x: (geometry.start.x + geometry.end.x) / (2 * width),
        y: (geometry.start.y + geometry.end.y) / (2 * height),
      };
      return { type: 'gradient', enabled: true, gradientType: 'linear', rotation, size: { height: axisLength ? 1 / axisLength : 1 }, center, colors, ...opacity };
    }
  }
  if (paints.some((paint: FigPaint) => paint.type === 'IMAGE')) diagnostics.skippedImages += 1;
  else diagnostics.skippedPaints += 1;
  return undefined;
}

function embeddedImage(node: FigNode, document: FigDocument, assets: Map<string, { path: string; bytes: Uint8Array; mime: string }>, specifiedPaint?: FigPaint): PenFillLayer | undefined {
  const image = specifiedPaint ?? (node.fillPaints ?? []).find(paint => paint.type === 'IMAGE' && paint.visible !== false);
  const hash = image?.image?.hash;
  if (!hash) return undefined;
  const key = typeof hash === 'string' ? hash : [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const bytes = document.images.get(key);
  if (!bytes) return undefined;
  const mime = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : bytes[0] === 0x52 && bytes[1] === 0x49 ? 'image/webp' : 'application/octet-stream';
  if (mime === 'application/octet-stream') return undefined;
  const path = 'images/' + key + (mime === 'image/png' ? '.png' : mime === 'image/jpeg' ? '.jpg' : '.webp');
  assets.set(path, { path, bytes, mime });
  const fill: Record<string, unknown> = { type: 'image', enabled: image?.visible !== false, url: path, mode: 'fill' };
  if (typeof image?.opacity === 'number' && image.opacity !== 1) fill.opacity = image.opacity;
  if (image?.blendMode && image.blendMode !== 'NORMAL') fill.blendMode = image.blendMode.toLowerCase();
  return fill as PenFillLayer;
}

function vectorNetworkGeometry(document: FigDocument, node: FigNode): string | undefined {
  const bytes = getBlobBytes(document, node.vectorData?.vectorNetworkBlob);
  if (!bytes) return undefined;
  const network = parseVectorNetworkBlob(bytes);
  if (!network.vertices.length || !network.segments.length) return undefined;
  const number = (value: number): string => String(Number(value.toFixed(5)));
  const pair = (x: number, y: number): string => {
    const renderedY = number(y);
    return number(x) + (renderedY.startsWith('-') ? '' : ' ') + renderedY;
  };
  const paths: string[] = [];
  const loops = network.regions.flatMap(region => region.loops);
  const openTrailStarts = new Map<number[], number>();
  // Regionless networks contain open strokes. Walk the segment graph into
  // trails so connected curves stay continuous and disconnected strokes never
  // acquire a connector line.
  if (!loops.length) {
    const unused = new Set(network.segments.map((_, index) => index));
    const adjacent = new Map<number, number[]>();
    network.segments.forEach((segment, index) => {
      for (const vertex of [segment.start.vertex, segment.end.vertex]) {
        const entries = adjacent.get(vertex) ?? [];
        entries.push(index);
        adjacent.set(vertex, entries);
      }
    });
    while (unused.size) {
      const first = unused.values().next().value as number;
      const segment = network.segments[first];
      const startDegree = (adjacent.get(segment.start.vertex) ?? []).filter(index => unused.has(index)).length;
      const endDegree = (adjacent.get(segment.end.vertex) ?? []).filter(index => unused.has(index)).length;
      let current = startDegree === 1 ? segment.start.vertex : endDegree === 1 ? segment.end.vertex : segment.start.vertex;
      const trail: number[] = [];
      for (;;) {
        const index = (adjacent.get(current) ?? []).find(candidate => unused.has(candidate));
        if (index === undefined) break;
        unused.delete(index);
        trail.push(index);
        const edge = network.segments[index];
        current = edge.start.vertex === current ? edge.end.vertex : edge.start.vertex;
      }
      loops.push(trail);
      openTrailStarts.set(trail, startDegree === 1 ? segment.start.vertex : endDegree === 1 ? segment.end.vertex : segment.start.vertex);
    }
  }
  for (const loop of loops) {
    if (!loop.length) continue;
    const first = network.segments[loop[0]];
    const second = network.segments[loop[1]];
    const firstStartConnects = second && (second.start.vertex === first.start.vertex || second.end.vertex === first.start.vertex);
    let current = openTrailStarts.get(loop) ?? (firstStartConnects ? first.end.vertex : first.start.vertex);
    const origin = network.vertices[current];
    if (!origin) continue;
    let path = 'M' + pair(origin.x, origin.y);
    let prior: 'l' | 'c' | null = null;
    for (const index of loop) {
      const segment = network.segments[index];
      if (!segment) continue;
      const forward = segment.start.vertex === current;
      const begin = forward ? segment.start : segment.end;
      const finish = forward ? segment.end : segment.start;
      const start = network.vertices[current], end = network.vertices[finish.vertex];
      if (!start || !end) break;
      const dx = end.x - start.x, dy = end.y - start.y;
      if (segment.isStraight) {
        path += (prior === 'l' ? (dx < 0 ? '' : ' ') : 'l') + pair(dx, dy);
        prior = 'l';
      } else {
        const c1x = begin.dx, c1y = begin.dy;
        const c2x = dx + finish.dx, c2y = dy + finish.dy;
        path += (prior === 'c' ? ' ' : 'c') + pair(c1x, c1y) + ' ' + pair(c2x, c2y) + ' ' + pair(dx, dy);
        prior = 'c';
      }
      current = finish.vertex;
    }
    if (network.regions.length) path += 'z';
    paths.push(path);
  }
  return paths.join('');
}

function textGrowth(node: FigNode): PenNode['textGrowth'] {
  if (node.textAutoResize === 'WIDTH_AND_HEIGHT') return 'auto';
  if (node.textAutoResize === 'HEIGHT') return 'fixed-width';
  if (node.textAutoResize === 'NONE') return 'fixed-width-height';
  return 'auto';
}

export interface FigmaConversion {
  assets: { path: string; bytes: Uint8Array; mime: string }[];
  document: PenDocument;
  page: FigmaPageRef;
  roots: number;
  nodes: number;
  types: Record<string, number>;
  diagnostics: FigmaToPenDiagnostics;
}

function sortedChildren(document: FigDocument, id: string): FigNode[] {
  return (document.childrenMap.get(id) ?? []).slice().sort((left, right) => {
    const a = String(left.parentIndex?.position ?? '');
    const b = String(right.parentIndex?.position ?? '');
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function convertFigNode(
  document: FigDocument,
  styles: Map<string, FigNode>,
  node: FigNode,
  parentAbsX: number,
  parentAbsY: number,
  depth: number,
  diagnostics: FigmaToPenDiagnostics,
  assets: Map<string, { path: string; bytes: Uint8Array; mime: string }>,
  overrides?: Map<string, { fillPaints?: FigPaint[]; strokePaints?: FigPaint[] }>,
): PenNode | null {
  if (node.phase === 'REMOVED') return null;
  if (SKIPPED_TYPES.has(node.type)) return null;
  const mapped = TYPE_MAP[node.type];
  if (!mapped) return null;
  const type: PenNode['type'] = node.type === 'FRAME' && node.resizeToFit === true ? 'group' : mapped;
  const id = nodeId(node);
  if (!id) return null;
  if (depth > MAX_FIG_DEPTH) {
    diagnostics.truncatedDepth += 1;
    return null;
  }

  const transform = node.transform;
  const hasRotationOrScale = Boolean(
    transform && (Math.abs(finite(transform.m01, 0)) > 0.00001 || Math.abs(finite(transform.m10, 0)) > 0.00001),
  );
  if (hasRotationOrScale) diagnostics.flattenedTransforms += 1;
  const absX = finite(transform?.m02, parentAbsX);
  const absY = finite(transform?.m12, parentAbsY);
  const width = Math.max(1e-6, finite(node.size?.x, 100));
  const height = Math.max(1e-6, finite(node.size?.y, 100));

  const paintStyleKey = (node.styleIdForFill as { assetRef?: { key?: string } } | undefined)?.assetRef?.key;
  const strokeStyleKey = (node.styleIdForStrokeFill as { assetRef?: { key?: string } } | undefined)?.assetRef?.key;
  const fillStyle = paintStyleKey ? styles.get(paintStyleKey) : undefined;
  const strokeStyle = strokeStyleKey ? styles.get(strokeStyleKey) : undefined;
  const overrideKey = node.overrideKey as { sessionID?: number; localID?: number } | undefined;
  const override = overrideKey ? overrides?.get(`${overrideKey.sessionID}:${overrideKey.localID}`) : undefined;
  const paintedNode: FigNode = override?.fillPaints || override?.strokePaints || fillStyle?.fillPaints || strokeStyle?.fillPaints
    ? { ...node, fillPaints: override?.fillPaints ?? fillStyle?.fillPaints ?? node.fillPaints, strokePaints: override?.strokePaints ?? strokeStyle?.fillPaints ?? node.strokePaints }
    : node;

  const pen: PenNode = {
    type,
    id,
    name: node.name || node.type,
    // fig-kiwi transforms are already relative to the parent node.
    x: absX,
    y: absY,
    width,
    height,
  };

  if (type === 'text') {
    pen.content = typeof node.textData?.characters === 'string' ? node.textData.characters : '';
    if (typeof node.fontSize === 'number' && node.fontSize > 0) pen.fontSize = node.fontSize;
    if (typeof node.fontName?.family === 'string' && node.fontName.family.trim() !== '') pen.fontFamily = node.fontName.family;
    const lineHeight = node.lineHeight as { units?: unknown; value?: unknown } | undefined;
    if (lineHeight && lineHeight.units === 'PIXELS' && typeof lineHeight.value === 'number' && typeof node.fontSize === 'number' && node.fontSize > 0) {
      pen.lineHeight = Math.round((lineHeight.value / node.fontSize) * 1000) / 1000;
    }
    const align = TEXT_ALIGN[String(node.textAlignHorizontal)];
    if (align) pen.textAlign = align;
    const textFill = solidFill(paintedNode, diagnostics);
    if (textFill) pen.fill = textFill;
    if (node.textAutoResize === 'WIDTH_AND_HEIGHT') { delete pen.width; delete pen.height; }
    else {
      pen.textGrowth = textGrowth(node);
      if (node.textAutoResize === 'HEIGHT') delete pen.height;
    }
    if (node.stackChildAlignSelf === 'STRETCH') pen.width = 'fill_container';
  } else {
    const paints = paintedNode.fillPaints ?? [];
    const layers: PenFillLayer[] = paints.length > 1 ? paints.map(paint => {
      if (paint.type === 'IMAGE') return embeddedImage(paintedNode, document, assets, paint);
      if (paint.type.startsWith('GRADIENT')) {
        const gradient = solidFill({ ...paintedNode, fillPaints: [{ ...paint, visible: true }] }, diagnostics);
        if (gradient && typeof gradient === 'object' && !Array.isArray(gradient)) {
          return { ...gradient, enabled: paint.visible !== false, ...(paint.blendMode && paint.blendMode !== 'NORMAL' ? { blendMode: paint.blendMode.toLowerCase().replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()) } : {}) };
        }
      }
      return undefined;
    }).filter((layer): layer is PenFillLayer => layer !== undefined) : [];
    const fill = layers.length > 1 ? layers : embeddedImage(paintedNode, document, assets) ?? solidFill(paintedNode, diagnostics);
    if (node.type !== 'BOOLEAN_OPERATION' && fill !== undefined) pen.fill = fill;
    const stroke = (paintedNode.strokePaints ?? []).find(paint => paint.type === 'SOLID');
    if (stroke?.color) {
      const color = colorHex(stroke.color as { r: number; g: number; b: number }, stroke.opacity ?? 1) ?? '#000000ff';
      pen.stroke = stroke.visible === false ? { type: 'color', color, enabled: false } : color;
      if (typeof node.strokeWeight === 'number') {
        pen.strokeWidth = node.borderStrokeWeightsIndependent === true
          ? { left: node.strokeWeight, right: node.strokeWeight }
          : node.strokeWeight;
      }
    }
    if (type === 'path') {
      const paths = resolveVectorNodePaths(document, node);
      pen.geometry = vectorNetworkGeometry(document, node) ?? (paths.fill[0] ?? paths.stroke[0])?.svgPath ?? '';
    }
    if (type === 'frame') {
      if (node.stackMode === 'VERTICAL') pen.layout = 'vertical';
      else if (node.stackMode !== 'HORIZONTAL') pen.layout = 'none';
      if (typeof node.stackSpacing === 'number' && node.stackSpacing !== 0) pen.gap = node.stackSpacing;
      if (node.stackCounterAlignItems === 'CENTER') pen.alignItems = 'center';
      if (node.stackMode === 'HORIZONTAL' || node.stackMode === 'VERTICAL') {
        const primary = node.stackPrimarySizing === undefined || String(node.stackPrimarySizing).includes('RESIZE_TO_FIT');
        const counter = String(node.stackCounterSizing ?? '').includes('RESIZE_TO_FIT');
        if ((node.stackMode === 'HORIZONTAL' && primary) || (node.stackMode === 'VERTICAL' && counter)) delete pen.width;
        if ((node.stackMode === 'VERTICAL' && primary) || (node.stackMode === 'HORIZONTAL' && counter)) delete pen.height;
      }
      if (node.stackChildAlignSelf === 'STRETCH' && node.stackMode === 'VERTICAL') pen.width = 'fill_container';
      if (node.frameMaskDisabled === false) pen.clip = true;
    }
  }

  let children = sortedChildren(document, id)
    .map((child) => convertFigNode(document, styles, child, absX, absY, depth + 1, diagnostics, assets, overrides))
    .filter((child): child is PenNode => child !== null);
  // Figma instances store their visible descendants under a separate SYMBOL.
  // Expand that symbol only when the instance has no explicit children.
  const symbolID = node.type === 'INSTANCE' ? node.symbolData?.symbolID : undefined;
  if (type === 'frame' && symbolID && children.length === 0) {
    const source = document.nodes.find(candidate => candidate.type === 'SYMBOL' && candidate.guid?.sessionID === symbolID.sessionID && candidate.guid?.localID === symbolID.localID);
    if (source) {
      const sourceId = nodeId(source);
      if (sourceId && depth < MAX_FIG_DEPTH) {
        const sourceX = finite(source.transform?.m02, 0), sourceY = finite(source.transform?.m12, 0);
        const prefixIds = (value: PenNode): PenNode => ({ ...value, id: id + '/' + value.id, children: value.children?.map(prefixIds) });
        const instanceOverrides = new Map<string, { fillPaints?: FigPaint[]; strokePaints?: FigPaint[] }>(overrides);
        for (const item of node.symbolData?.symbolOverrides ?? []) {
          const guid = item.guidPath?.guids?.at(-1);
          if (guid) instanceOverrides.set(`${guid.sessionID}:${guid.localID}`, item);
        }
        children = sortedChildren(document, sourceId)
          .map(child => convertFigNode(document, styles, child, sourceX, sourceY, depth + 1, diagnostics, assets, instanceOverrides))
          .filter((child): child is PenNode => child !== null)
          .map(prefixIds);
      }
    }
  }
  if (type === 'group') {
    // Native Pen rebases a group's negative child coordinates into the group origin.
    // Descendants keep the same absolute positions after the shift.
    const minX = Math.min(0, ...children.map(child => typeof child.x === 'number' ? child.x : 0));
    const minY = Math.min(0, ...children.map(child => typeof child.y === 'number' ? child.y : 0));
    if (minX !== 0 || minY !== 0) {
      pen.x = (pen.x ?? 0) + minX;
      pen.y = (pen.y ?? 0) + minY;
      children = children.map(child => ({
        ...child,
        x: typeof child.x === 'number' ? child.x - minX : child.x,
        y: typeof child.y === 'number' ? child.y - minY : child.y,
      }));
    }
    delete pen.width; delete pen.height;
  }
  if (type === 'frame' && (node.stackMode === 'HORIZONTAL' || node.stackMode === 'VERTICAL')) {
    children = children.map(child => { const next = { ...child }; delete next.x; delete next.y; return next; });
  }
  if ((type === 'frame' || type === 'group') && children.length > 0) pen.children = children;
  return pen;
}

function countTree(roots: PenNode[]): { nodes: number; types: Record<string, number> } {
  const types: Record<string, number> = {};
  let nodes = 0;
  const walk = (items: readonly PenNode[]): void => {
    for (const item of items) {
      nodes += 1;
      types[item.type] = (types[item.type] ?? 0) + 1;
      if (Array.isArray(item.children)) walk(item.children);
    }
  };
  walk(roots);
  return { nodes, types };
}

function collectSkipped(roots: FigNode[]): void {
  void roots;
}

// Convert ONE chosen page of an already-decoded FigDocument into a v2.19
// document. Only that page is walked; the others stay untouched. The walk
// visits every orphaning risk (removed/skipped/depth) explicitly so the result
// is deterministic for a fixed input.
export function convertFigmaPage(document: FigDocument, pageId: string): FigmaConversion | null {
  const pageNode = document.nodes.find((node) => node.type === 'CANVAS' && nodeId(node) === pageId);
  if (!pageNode) return null;
  const page: FigmaPageRef = { id: pageId, name: pageNode.name || 'Page', nodeCount: 0 };
  const diagnostics: FigmaToPenDiagnostics = {
    skippedTypes: {},
    skippedImages: 0,
    skippedPaints: 0,
    flattenedTransforms: 0,
    truncatedDepth: 0,
  };
  const assets = new Map<string, { path: string; bytes: Uint8Array; mime: string }>();
  const styles = new Map<string, FigNode>(document.nodes.filter(node => typeof node.key === 'string').map(node => [node.key as string, node]));
  const roots: PenNode[] = [];
  for (const child of sortedChildren(document, pageId)) {
    if (child.phase === 'REMOVED') continue;
    const converted = convertFigNode(document, styles, child, 0, 0, 1, diagnostics, assets);
    if (converted === null) {
      const kind = TYPE_MAP[child.type] ? child.type : child.type;
      if (!TYPE_MAP[child.type]) diagnostics.skippedTypes[kind] = (diagnostics.skippedTypes[kind] ?? 0) + 1;
      continue;
    }
    roots.push(converted);
  }
  collectSkipped([]);
  const { nodes, types } = countTree(roots);
  page.nodeCount = nodes;
  return { document: { version: '2.19', children: roots }, assets: [...assets.values()], page, roots: roots.length, nodes, types, diagnostics };
}

export function figmaPenFileName(source: string): string {
  const base = source.replace(/\\/g, '/').split('/').pop() ?? '';
  const stem = base.replace(/\.fig$/i, '').trim();
  return (stem === '' ? 'figma-import' : stem) + '.pen';
}

export function figmaImportNotice(conversion: FigmaConversion): string {
  const parts = [conversion.roots + ' root(s), ' + conversion.nodes + ' node(s)'];
  const skipped = Object.entries(conversion.diagnostics.skippedTypes)
    .map(([type, count]) => count + ' ' + type)
    .sort();
  if (skipped.length > 0) parts.push('skipped ' + skipped.join(', '));
  if (conversion.diagnostics.skippedImages > 0) parts.push(conversion.diagnostics.skippedImages + ' image fill(s)');
  if (conversion.diagnostics.flattenedTransforms > 0) parts.push(conversion.diagnostics.flattenedTransforms + ' flattened transform(s)');
  return 'Converted page "' + conversion.page.name + '" (' + parts.join('; ') + '). Unsaved until you save.';
}
