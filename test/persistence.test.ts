import { beforeEach, describe, expect, it } from 'vitest';
import { clearPersistedDocument, isPersistenceAvailable, loadPersistedDocument, savePersistedDocument, STORAGE_KEY } from '../src/document/persistence';
import { NESTED_FIXTURE, SAMPLE_PRIMITIVES, freshPrimitives } from './fixtures';

describe('local persistence', () => {
  beforeEach(() => {
    clearPersistedDocument();
  });

  it('reports that localStorage is available in jsdom', () => {
    expect(isPersistenceAvailable()).toBe(true);
  });

  it('returns null when nothing has been saved', () => {
    expect(loadPersistedDocument()).toBeNull();
  });

  it('saves and reloads a document losslessly', () => {
    const document = freshPrimitives();
    const result = savePersistedDocument(document, 'audit-primitives.pen');
    expect(result.ok).toBe(true);

    const loaded = loadPersistedDocument();
    expect(loaded).not.toBeNull();
    expect(loaded?.fileName).toBe('audit-primitives.pen');
    expect(loaded?.document).toEqual(document);
    expect(loaded?.document.version).toBe('2.19');
    expect(loaded?.document.variables?.['audit-accent'].value).toBe('#7C3AED');
  });

  it('ignores corrupt persisted payloads instead of throwing', () => {
    globalThis.localStorage.setItem(STORAGE_KEY, '{"document":{"children":[null]}}');
    expect(loadPersistedDocument()).toBeNull();

    globalThis.localStorage.setItem(STORAGE_KEY, 'not json');
    expect(loadPersistedDocument()).toBeNull();
  });

  it('round trips the audit fixture through localStorage', () => {
    const result = savePersistedDocument(SAMPLE_PRIMITIVES, 'audit.pen');
    expect(result.ok).toBe(true);
    const loaded = loadPersistedDocument();
    expect(loaded?.document).toEqual(SAMPLE_PRIMITIVES);
  });

  it('preserves the raw nested descendants through localStorage', () => {
    const document = JSON.parse(JSON.stringify(NESTED_FIXTURE)) as typeof NESTED_FIXTURE;
    const result = savePersistedDocument(document, 'nested-overrides.pen');
    expect(result.ok).toBe(true);
    const loaded = loadPersistedDocument();
    expect(loaded).not.toBeNull();
    expect(loaded?.document).toEqual(document);
    const instance = loaded?.document.children.find((node) => node.id === 'G3F0DE');
    expect(instance?.descendants).toEqual({
      veExn: { content: 'Overridden outer' },
      'c4zmg/GigZ5': { content: 'Overridden inner', fill: '#7C3AED' },
    });
  });
});
