import type { PenDocument, PenNode } from './types';
import { KNOWN_NODE_TYPES, SUPPORTED_VERSION } from './types';

export interface ParseResult {
  ok: boolean;
  document: PenDocument | null;
  errors: string[];
  warnings: string[];
}

const KNOWN_TYPE_SET = new Set<string>(KNOWN_NODE_TYPES);

export function parsePenFile(text: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, document: null, errors: ['Invalid JSON: ' + (error as Error).message], warnings };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, document: null, errors: ['A .pen document must be a JSON object.'], warnings };
  }

  const candidate = parsed as PenDocument;
  if (typeof candidate.version !== 'string' || candidate.version.length === 0) {
    errors.push('The document is missing a string "version" field.');
  }
  if (!Array.isArray(candidate.children)) {
    errors.push('The document is missing a "children" array.');
  }
  if (errors.length > 0) {
    return { ok: false, document: null, errors, warnings };
  }

  const ids = new Set<string>();
  candidate.children.forEach((child, index) => validateNode(child, 'children[' + index + ']', ids, errors, warnings));

  if (errors.length > 0) {
    return { ok: false, document: null, errors, warnings };
  }

  if (candidate.version !== SUPPORTED_VERSION) {
    warnings.push(
      'Document version ' + candidate.version + ' differs from the supported ' + SUPPORTED_VERSION + '; unknown fields are preserved.',
    );
  }

  return { ok: true, document: candidate, errors, warnings };
}

// Structural validation only. Valid documents are never rewritten, so
// unsupported fields, sizing strings, variables, themes and references all
// survive an import/save round trip untouched.
function validateNode(value: unknown, path: string, ids: Set<string>, errors: string[], warnings: string[]): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push(path + ' must be a node object.');
    return;
  }
  const node = value as Partial<PenNode> & Record<string, unknown>;

  if (typeof node.type !== 'string' || node.type.length === 0) {
    errors.push(path + ' is missing a string node "type".');
    return;
  }

  if (typeof node.id !== 'string' || node.id.length === 0) {
    errors.push(path + ' (' + node.type + ') is missing a string "id".');
  } else if (ids.has(node.id)) {
    errors.push('Duplicate node id "' + node.id + '" at ' + path + '; duplicate ids are rejected because references would be ambiguous.');
  } else {
    ids.add(node.id);
  }

  if (!KNOWN_TYPE_SET.has(node.type)) {
    warnings.push('Node type "' + node.type + '" at ' + path + ' is not a documented .pen type; it is preserved and diagnosed as unsupported.');
  }

  if (node.children !== undefined) {
    if (!Array.isArray(node.children)) {
      errors.push(path + ' has a non-array "children" value; the document was not loaded.');
      return;
    }
    (node.children as unknown[]).forEach((child, index) =>
      validateNode(child, path + '.children[' + index + ']', ids, errors, warnings),
    );
  }
}

export function serializePenFile(document: PenDocument): string {
  return JSON.stringify(document, null, 2) + '\n';
}

export function cloneDocument(document: PenDocument): PenDocument {
  return JSON.parse(JSON.stringify(document)) as PenDocument;
}
