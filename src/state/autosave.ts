import { useEffect, useState } from 'react';
import type { PenDocument } from '../document/types';
import { isPersistenceAvailable, savePersistedDocument } from '../document/persistence';

export type PersistenceStatus = 'idle' | 'pending' | 'saved' | 'error' | 'unavailable';

export interface AutosaveResult {
  status: PersistenceStatus;
  error?: string;
}

export function useDocumentAutosave(document: PenDocument, fileName: string, enabled = true): AutosaveResult {
  const [status, setStatus] = useState<PersistenceStatus>(() => (isPersistenceAvailable() ? 'idle' : 'unavailable'));
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!isPersistenceAvailable()) {
      setStatus('unavailable');
      return undefined;
    }
    setStatus('pending');
    const timer = globalThis.setTimeout(() => {
      const result = savePersistedDocument(document, fileName);
      if (result.ok) {
        setStatus('saved');
        setError(undefined);
      } else {
        setStatus('error');
        setError(result.error);
      }
    }, 400);
    return () => globalThis.clearTimeout(timer);
  }, [document, fileName, enabled]);

  return { status, error };
}
