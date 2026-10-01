import type { PenNode } from './types';

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// Pen serializes 2-element padding as [vertical, horizontal] and 4-element as
// [top, right, bottom, left]. The exact convention is not proven by the audit,
// so it is recorded here and exercised by the layout tests.
export function resolvePadding(padding: unknown): Padding {
  if (typeof padding === 'number' && Number.isFinite(padding)) {
    return { top: padding, right: padding, bottom: padding, left: padding };
  }
  if (Array.isArray(padding)) {
    const values = padding.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (values.length === 2) {
      return { top: values[0], right: values[1], bottom: values[0], left: values[1] };
    }
    if (values.length === 4) {
      return { top: values[0], right: values[1], bottom: values[2], left: values[3] };
    }
    if (values.length === 1) {
      const value = values[0];
      return { top: value, right: value, bottom: value, left: value };
    }
  }
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

export type SizeKind = 'fixed' | 'fill' | 'fit' | 'unsupported';

export interface SizeSpec {
  kind: SizeKind;
  value?: number;
  fallback?: number;
  raw?: string;
}

export function parseSize(value: unknown): SizeSpec {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { kind: 'fixed', value };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const fill = /^fill_container(?:\(([0-9.]+)\))?$/.exec(trimmed);
    if (fill) {
      return { kind: 'fill', fallback: fill[1] !== undefined ? Number.parseFloat(fill[1]) : undefined, raw: trimmed };
    }
    const fit = /^fit_content(?:\(([0-9.]+)\))?$/.exec(trimmed);
    if (fit) {
      return { kind: 'fit', fallback: fit[1] !== undefined ? Number.parseFloat(fit[1]) : undefined, raw: trimmed };
    }
    const numeric = Number.parseFloat(trimmed);
    if (Number.isFinite(numeric) && String(numeric) === trimmed) {
      return { kind: 'fixed', value: numeric };
    }
    if (Number.isFinite(numeric)) {
      return { kind: 'unsupported', fallback: numeric, raw: trimmed };
    }
    return { kind: 'unsupported', raw: trimmed };
  }
  if (value === undefined || value === null) {
    return { kind: 'fit' };
  }
  return { kind: 'unsupported', raw: String(value) };
}

export interface TextMetrics {
  width: number;
  height: number;
  lines: number;
  estimated: true;
}

const DEFAULT_FONT_SIZE = 14;
const DEFAULT_LINE_HEIGHT = 1.2;
const ADVANCE_RATIO = 0.55;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// Deterministic text measurement used by layout and tests. The real renderer
// uses DOM text metrics; this estimate keeps nested geometry reproducible.
export function intrinsicTextSize(node: PenNode, availableWidth?: number): TextMetrics {
  const fontSize = typeof node.fontSize === 'number' && node.fontSize > 0 ? node.fontSize : DEFAULT_FONT_SIZE;
  const lineHeightFactor = typeof node.lineHeight === 'number' && node.lineHeight > 0 ? node.lineHeight : DEFAULT_LINE_HEIGHT;
  const lineHeight = fontSize * lineHeightFactor;
  const content = typeof node.content === 'string' ? node.content : '';
  const advance = fontSize * ADVANCE_RATIO;
  const hardLines = content.split('\n');
  const fixedWidth = node.textGrowth === 'fixed-width' || node.textGrowth === 'fixed-width-height';

  if (!fixedWidth || availableWidth === undefined || availableWidth <= 0) {
    const widest = hardLines.reduce((max, line) => Math.max(max, line.length * advance), 0);
    return {
      width: round(Math.max(fontSize, widest)),
      height: round(Math.max(lineHeight, lineHeight * hardLines.length)),
      lines: hardLines.length,
      estimated: true,
    };
  }

  const charsPerLine = Math.max(1, Math.floor(availableWidth / advance));
  let lines = 0;
  for (const line of hardLines) {
    lines += Math.max(1, Math.ceil(line.length / charsPerLine));
  }
  return {
    width: round(availableWidth),
    height: round(Math.max(lineHeight, lineHeight * lines)),
    lines,
    estimated: true,
  };
}

export type PenLayoutMode = 'none' | 'horizontal' | 'vertical';

// Pen v2.19 defaults an omitted Frame `layout` to horizontal (schema evidence:
// handoff/pen-evidence/api/schema-doc.json, corroborated by the captured
// api-components and api-layout workflows). Groups and every other node type
// stay absolute unless they declare horizontal/vertical, and an explicit
// `layout: "none"` always means absolute positioning.
export function resolveEffectiveLayout(node: Pick<PenNode, 'type' | 'layout'>): PenLayoutMode {
  if (node.layout === 'none' || node.layout === 'horizontal' || node.layout === 'vertical') {
    return node.layout;
  }
  return node.type === 'frame' ? 'horizontal' : 'none';
}

export function isAutoLayout(node: PenNode): boolean {
  return resolveEffectiveLayout(node) !== 'none';
}

export interface FrameFitInput {
  layout: PenLayoutMode;
  pad: Padding;
  gap: number;
  // Child extents on the fitted axis, document order, absolute children already
  // removed by the caller.
  childExtents: number[];
}

// Pure model helper for a frame's fit_content extent along ONE axis.
//
// Pen v2.19 treats fit_content as the combined size of the children along the
// layout main axis and their maximum along the cross axis, plus padding and
// main-axis gaps (schema evidence: handoff/pen-evidence/api/schema-doc.json).
// An empty frame has no combined size, so an explicit `fit_content(n)` fallback
// is applied by the caller; padding alone is the neutral fit of no children.
// Callers must filter out absolute children before calling.
export function frameFitExtent(input: FrameFitInput): number {
  const { layout, pad, gap, childExtents } = input;
  if (layout === 'none') return 0;
  const count = childExtents.length;
  if (count === 0) {
    return pad.left + pad.right;
  }
  if (layout === 'horizontal') {
    const sum = childExtents.reduce((total, extent) => total + extent, 0);
    return sum + gap * Math.max(0, count - 1) + pad.left + pad.right;
  }
  const widest = childExtents.reduce((max, extent) => Math.max(max, extent), 0);
  return widest + pad.left + pad.right;
}
