import type { PenDocument } from './types';
import { parsePenFile, serializePenFile } from './serialize';

export const STORAGE_KEY = 'pen-clone.document.v1';
export const STORAGE_VERSION = 1;

export interface PersistedState {
  storageVersion: number;
  savedAt: string;
  fileName: string;
  document: PenDocument;
}

export interface LoadedDocument {
  document: PenDocument;
  fileName: string;
  savedAt: string;
}

export function isPersistenceAvailable(): boolean {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    const probe = STORAGE_KEY + '.probe';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function loadPersistedDocument(): LoadedDocument | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed || typeof parsed !== 'object' || !parsed.document) return null;
    const result = parsePenFile(JSON.stringify(parsed.document));
    if (!result.ok || !result.document) return null;
    return {
      document: result.document,
      fileName: typeof parsed.fileName === 'string' ? parsed.fileName : 'untitled.pen',
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
    };
  } catch {
    return null;
  }
}

export function savePersistedDocument(
  penDocument: PenDocument,
  fileName: string,
): { ok: boolean; error?: string; savedAt?: string } {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return { ok: false, error: 'localStorage is unavailable in this environment.' };
    const state: PersistedState = {
      storageVersion: STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      fileName,
      document: penDocument,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true, savedAt: state.savedAt };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export function clearPersistedDocument(): void {
  try {
    const storage = globalThis.localStorage;
    if (storage) storage.removeItem(STORAGE_KEY);
  } catch {
    // Persistence is best-effort; a failure to clear must not break the editor.
  }
}

export function downloadPenFile(penDocument: PenDocument, fileName: string): boolean {
  try {
    const blob = new Blob([serializePenFile(penDocument)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = fileName.endsWith('.pen') ? fileName : fileName + '.pen';
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('unable to read file'));
    reader.readAsText(file);
  });
}
