import type { PenDocument, PenNode } from './types';
import { UNSUPPORTED_NODE_TYPES } from './types';
import { forEachNode } from './tree';
import { parseSize } from './sizing';

export type DiagnosticLevel = 'info' | 'warning' | 'error';

export interface Diagnostic {
  level: DiagnosticLevel;
  code: string;
  message: string;
  nodeId?: string;
  nodeName?: string;
}

export interface DiagnosticSummary {
  errors: number;
  warnings: number;
  infos: number;
}

export function summarizeDiagnostics(diagnostics: readonly Diagnostic[]): DiagnosticSummary {
  const summary: DiagnosticSummary = { errors: 0, warnings: 0, infos: 0 };
  for (const diagnostic of diagnostics) {
    if (diagnostic.level === 'error') summary.errors += 1;
    else if (diagnostic.level === 'warning') summary.warnings += 1;
    else summary.infos += 1;
  }
  return summary;
}

export function inspectNode(node: PenNode): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const push = (level: DiagnosticLevel, code: string, message: string): void => {
    diagnostics.push({ level, code, message, nodeId: node.id, nodeName: node.name });
  };

  if (UNSUPPORTED_NODE_TYPES.includes(node.type)) {
    push('warning', 'unsupported-node-type', 'Node type "' + node.type + '" is not editable in this slice; it renders as a labelled placeholder.');
  }

  if (node.type === 'ref') {
    push('info', 'ref-instance', 'Instance of "' + String(node.ref ?? '') + '"; overrides apply to named properties of the origin and its named descendants (descendant paths address stable source ids).');
  }

  for (const axis of ['width', 'height'] as const) {
    const value = node[axis];
    if (typeof value === 'string') {
      const spec = parseSize(value);
      if (spec.kind === 'unsupported') {
        push('warning', 'unsupported-size', 'Unsupported ' + axis + ' value ' + JSON.stringify(value) + '; a numeric fallback is used.');
      }
    }
  }

  if (node.layout !== undefined && node.layout !== 'none' && node.layout !== 'horizontal' && node.layout !== 'vertical') {
    push('warning', 'unsupported-layout', 'Unsupported layout ' + JSON.stringify(node.layout) + '; treated as absolute positioning.');
  }

  const fills = Array.isArray(node.fill) ? node.fill : node.fill && typeof node.fill === 'object' ? [node.fill] : [];
  if (node.fill !== undefined && typeof node.fill !== 'string' && !fills.every(fill => fill.type === 'image' || fill.type === 'gradient' || fill.type === 'color')) {
    push('warning', 'unsupported-fill', 'Complex fills (shader and gradient objects) are not rendered in this slice.');
  } else if (typeof node.fill === 'string' && /^(shader|gradient|image):/i.test(node.fill)) {
    push('warning', 'unsupported-fill', 'Fill ' + JSON.stringify(node.fill) + ' is not rendered in this slice.');
  }

  if (Array.isArray(node.children) && node.type !== 'frame' && node.type !== 'group' && node.type !== 'ref') {
    push('warning', 'children-on-non-container', 'Node type "' + node.type + '" carries children; only frames, groups and detached refs are containers.');
  }

  if (node.effects !== undefined || node.shader !== undefined || node.blur !== undefined) {
    push('warning', 'unsupported-effect', 'Effects, shaders and blurs are not rendered in this slice.');
  }

  return diagnostics;
}

export function analyzeDocument(document: PenDocument): { diagnostics: Diagnostic[]; unsupportedIds: Set<string> } {
  const diagnostics: Diagnostic[] = [];
  const unsupportedIds = new Set<string>();
  forEachNode(document, (node) => {
    const found = inspectNode(node);
    for (const diagnostic of found) {
      diagnostics.push(diagnostic);
      if (diagnostic.level !== 'info') {
        unsupportedIds.add(node.id);
      }
    }
    if (UNSUPPORTED_NODE_TYPES.includes(node.type)) {
      unsupportedIds.add(node.id);
    }
  });
  return { diagnostics, unsupportedIds };
}
