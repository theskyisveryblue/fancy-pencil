import type { PenDocument, PenVariable } from './types';

const REFERENCE_PATTERN = /^\$[A-Za-z0-9_-]+$/;

export function isVariableReference(value: unknown): value is string {
  return typeof value === 'string' && REFERENCE_PATTERN.test(value);
}

export function variableName(reference: string): string {
  return reference.slice(1);
}

export interface VariableResolution {
  resolved: boolean;
  value: unknown;
  reason?: string;
}

export function readThemedValue(variable: PenVariable, themeMode: string): unknown {
  const value = variable.value;
  if (Array.isArray(value)) {
    const entries = value as { value?: unknown; theme?: { mode?: string } }[];
    const match = entries.find((entry) => entry && entry.theme && entry.theme.mode === themeMode);
    if (match) return match.value;
    const first = entries.find((entry) => entry && typeof entry === 'object' && 'value' in entry);
    return first ? first.value : undefined;
  }
  return value;
}

export function resolveVariable(document: PenDocument, reference: string, themeMode: string, depth = 0): VariableResolution {
  if (depth > 8) {
    return { resolved: false, value: reference, reason: 'variable alias chain is too deep' };
  }
  const name = variableName(reference);
  const variable = document.variables ? document.variables[name] : undefined;
  if (!variable) {
    return { resolved: false, value: reference, reason: 'variable "' + name + '" is not defined' };
  }
  const value = readThemedValue(variable, themeMode);
  if (isVariableReference(value)) {
    return resolveVariable(document, value, themeMode, depth + 1);
  }
  return { resolved: true, value };
}

export function resolveValue(document: PenDocument, value: unknown, themeMode: string): unknown {
  if (!isVariableReference(value)) return value;
  const resolution = resolveVariable(document, value, themeMode);
  return resolution.resolved ? resolution.value : value;
}

export function resolveNumber(document: PenDocument, value: unknown, themeMode: string, fallback: number): number {
  const resolved = resolveValue(document, value, themeMode);
  if (typeof resolved === 'number' && Number.isFinite(resolved)) return resolved;
  if (typeof resolved === 'string') {
    const parsed = Number.parseFloat(resolved);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function resolveColor(document: PenDocument, value: unknown, themeMode: string): string | undefined {
  const resolved = resolveValue(document, value, themeMode);
  return typeof resolved === 'string' ? resolved : undefined;
}

export function describeVariables(document: PenDocument): { name: string; type: string; themed: boolean }[] {
  const variables = document.variables ?? {};
  return Object.entries(variables).map(([name, variable]) => ({
    name,
    type: typeof variable.type === 'string' ? variable.type : 'unknown',
    themed: Array.isArray(variable.value),
  }));
}
