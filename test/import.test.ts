import { describe, expect, it } from 'vitest';
import { parsePenFile, serializePenFile } from '../src/document/serialize';
import { COMPONENT_REPLACEMENT_FIXTURE_SOURCE, NESTED_FIXTURE_SOURCE, SAMPLE_PRIMITIVES_SOURCE } from './fixtures';

describe('parsePenFile validation', () => {
  it('rejects invalid JSON', () => {
    const result = parsePenFile('{not json');
    expect(result.ok).toBe(false);
    expect(result.document).toBeNull();
  });

  it('rejects a non-object document', () => {
    expect(parsePenFile('[]').ok).toBe(false);
    expect(parsePenFile('"text"').ok).toBe(false);
  });

  it('rejects null and primitive children without throwing', () => {
    const nullChild = parsePenFile('{"version":"2.19","children":[null]}');
    expect(nullChild.ok).toBe(false);
    expect(nullChild.errors.join(' ')).toContain('children[0] must be a node object.');

    const primitiveChild = parsePenFile('{"version":"2.19","children":[42]}');
    expect(primitiveChild.ok).toBe(false);
    expect(primitiveChild.errors.join(' ')).toContain('children[0] must be a node object.');
  });

  it('rejects nested malformed children', () => {
    const result = parsePenFile('{"version":"2.19","children":[{"type":"frame","id":"a","children":[[1,2]]}]}');
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('children[0].children[0] must be a node object.');
  });

  it('rejects non-array children and nodes without a type', () => {
    expect(parsePenFile('{"version":"2.19","children":[{"type":"frame","id":"a","children":"nope"}]}').ok).toBe(false);
    const missingType = parsePenFile('{"version":"2.19","children":[{"id":"a"}]}');
    expect(missingType.ok).toBe(false);
    expect(missingType.errors.join(' ')).toContain('missing a string node "type"');
  });

  it('rejects duplicate ids with a clear error instead of rewriting them', () => {
    const result = parsePenFile(
      '{"version":"2.19","children":[{"type":"frame","id":"dup"},{"type":"rectangle","id":"dup"}]}',
    );
    expect(result.ok).toBe(false);
    expect(result.document).toBeNull();
    expect(result.errors.join(' ')).toContain('Duplicate node id "dup"');
  });

  it('rejects nodes without an id', () => {
    const result = parsePenFile('{"version":"2.19","children":[{"type":"frame"}]}');
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('missing a string "id"');
  });

  it('preserves unknown node types and reports them as a warning', () => {
    const result = parsePenFile('{"version":"2.19","children":[{"type":"widget","id":"w","custom":1}]}');
    expect(result.ok).toBe(true);
    expect(result.warnings.join(' ')).toContain('not a documented .pen type');
    expect(result.document?.children[0].custom).toBe(1);
  });

  it('warns on an unexpected version but still imports', () => {
    const result = parsePenFile('{"version":"2.6","children":[{"type":"frame","id":"f","width":800,"height":600}]}');
    expect(result.ok).toBe(true);
    expect(result.warnings.join(' ')).toContain('differs from the supported 2.19');
  });
});

describe('round trip', () => {
  it('round trips the audit fixture without losing variables, themes or references', () => {
    const parsed = parsePenFile(SAMPLE_PRIMITIVES_SOURCE);
    expect(parsed.ok).toBe(true);
    expect(parsed.document).not.toBeNull();

    const serialized = serializePenFile(parsed.document!);
    expect(JSON.parse(serialized)).toEqual(JSON.parse(SAMPLE_PRIMITIVES_SOURCE));

    expect(parsed.document!.version).toBe('2.19');
    expect(parsed.document!.themes?.mode).toEqual(['light', 'dark']);
    expect(parsed.document!.variables?.['audit-accent'].value).toBe('#7C3AED');
    expect(parsed.document!.variables?.['audit-spacing'].value).toBe(20);
    expect(Array.isArray(parsed.document!.variables?.['audit-surface'].value)).toBe(true);

    const findRef = (nodes: { type: string; id: string; ref?: string; children?: unknown }[]): string | null => {
      for (const node of nodes) {
        if (node.type === 'ref') return String(node.ref);
        const nested = Array.isArray(node.children) ? findRef(node.children as { type: string; id: string }[]) : null;
        if (nested) return nested;
      }
      return null;
    };
    expect(findRef(parsed.document!.children)).toBe('Iy7jv');
  });

  it('preserves unsupported fields and sizing strings across a round trip', () => {
    const source = {
      version: '2.19',
      children: [
        {
          type: 'frame',
          id: 'root',
          width: 400,
          height: 300,
          layout: 'vertical',
          shader: 'shader.webgl',
          effects: [{ type: 'blur', radius: 4 }],
          customKey: { nested: [1, 2, 3] },
          children: [{ type: 'path', id: 'path1', width: '50%', height: 'fit_content(20)', fill: 'shader:bg' }],
        },
      ],
    };
    const text = JSON.stringify(source);
    const parsed = parsePenFile(text);
    expect(parsed.ok).toBe(true);
    const serialized = serializePenFile(parsed.document!);
    expect(JSON.parse(serialized)).toEqual(source);
    expect(JSON.parse(serialized).children[0].children[0].width).toBe('50%');
  });

  it('preserves the raw nested ref+descendants model across a round trip', () => {
    const parsed = parsePenFile(NESTED_FIXTURE_SOURCE);
    expect(parsed.ok).toBe(true);
    const serialized = serializePenFile(parsed.document!);
    expect(JSON.parse(serialized)).toEqual(JSON.parse(NESTED_FIXTURE_SOURCE));
    const instance = parsed.document!.children.find((node) => node.id === 'G3F0DE');
    expect(instance?.descendants).toEqual({
      veExn: { content: 'Overridden outer' },
      'c4zmg/GigZ5': { content: 'Overridden inner', fill: '#7C3AED' },
    });
  });

  it('preserves the raw component replacement descendants across a round trip', () => {
    const parsed = parsePenFile(COMPONENT_REPLACEMENT_FIXTURE_SOURCE);
    expect(parsed.ok).toBe(true);
    const serialized = serializePenFile(parsed.document!);
    expect(JSON.parse(serialized)).toEqual(JSON.parse(COMPONENT_REPLACEMENT_FIXTURE_SOURCE));
    const instance = parsed.document!.children.find((node) => node.id === 'G3F0DE');
    const descendants = instance?.descendants as Record<string, Record<string, unknown>> | undefined;
    expect(descendants?.veExn?.type).toBe('text');
    expect(descendants?.veExn?.id).toBe('D4328u');
    const children = descendants?.c4zmg?.children as { id?: string }[] | undefined;
    expect(children?.[0]?.id).toBe('x8HgK');
  });
});
