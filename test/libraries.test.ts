import { describe, expect, it } from 'vitest';
import { SetImportsCommand } from '../src/document/commands';
import { BUILT_IN_LIBRARIES } from '../src/ui/LibrariesPanel';
import { parsePenFile, serializePenFile } from '../src/document/serialize';
import { freshPrimitives } from './fixtures';

describe('native built-in library imports', () => {
  it('uses the four captured import IDs and URIs', () => {
    expect(BUILT_IN_LIBRARIES.map(({ key, uri }) => [key, uri])).toEqual([
      ['B', 'pencil:shadcn.lib.pen'], ['X', 'pencil:lunaris.lib.pen'],
      ['M', 'pencil:halo.lib.pen'], ['E', 'pencil:nitro.lib.pen'],
    ]);
  });
  it('adds only the imports field and roundtrips through save, undo, redo', () => {
    const before = freshPrimitives();
    for (const library of BUILT_IN_LIBRARIES) {
      const command = new SetImportsCommand(before.imports, { ...before.imports, [library.key]: library.uri });
      const after = command.apply(before);
      expect(after.imports).toEqual({ [library.key]: library.uri });
      expect(after.children).toEqual(before.children);
      expect(command.invert().apply(after)).toEqual(before);
      const saved = parsePenFile(serializePenFile(after));
      expect(saved.ok).toBe(true);
      expect(saved.document?.imports).toEqual(after.imports);
    }
  });
});
