import { describe, expect, it } from 'vitest';
import { DeleteNodesCommand, DetachNodeCommand, InsertNodeCommand, InsertNodesCommand, SetNodeDataCommand, normalizeTopLevelIds } from '../src/document/commands';
import { History } from '../src/document/history';
import { createNodeForTool } from '../src/document/defaults';
import type { PenDocument } from '../src/document/types';
import { siblingsDocument, simpleDocument } from './fixtures';

function ids(document: { children: { id: string }[] }): string[] {
  return document.children.map((node) => node.id);
}

describe('DeleteNodesCommand ordering', () => {
  it('restores deleted siblings in their original order through undo and redo', () => {
    const history = new History(siblingsDocument());
    history.execute(new DeleteNodesCommand(['a', 'b']));
    expect(ids(history.document)).toEqual(['c']);

    history.undo();
    expect(ids(history.document)).toEqual(['a', 'b', 'c']);

    history.redo();
    expect(ids(history.document)).toEqual(['c']);

    history.undo();
    expect(ids(history.document)).toEqual(['a', 'b', 'c']);
  });

  it('normalizes child and parent selections to the surviving ancestor', () => {
    const document = simpleDocument();
    expect(normalizeTopLevelIds(document, ['c', 'p'])).toEqual(['p']);
    expect(normalizeTopLevelIds(document, ['p', 'c'])).toEqual(['p']);
    expect(normalizeTopLevelIds(document, ['c'])).toEqual(['c']);
  });

  it('keeps the child when a child-before-parent selection is undone and redone', () => {
    const history = new History(simpleDocument());
    history.execute(new DeleteNodesCommand(['c', 'p']));
    expect(ids(history.document)).toEqual(['s']);

    history.undo();
    expect(ids(history.document)).toEqual(['p', 's']);
    expect(history.document.children[0].children?.map((node) => node.id)).toEqual(['c']);

    history.redo();
    expect(ids(history.document)).toEqual(['s']);

    history.undo();
    expect(ids(history.document)).toEqual(['p', 's']);
    expect(history.document.children[0].children?.map((node) => node.id)).toEqual(['c']);
  });

  it('keeps the child when a parent-before-child selection is undone and redone', () => {
    const history = new History(simpleDocument());
    history.execute(new DeleteNodesCommand(['p', 'c']));
    expect(ids(history.document)).toEqual(['s']);
    history.undo();
    expect(ids(history.document)).toEqual(['p', 's']);
    expect(history.document.children[0].children?.map((node) => node.id)).toEqual(['c']);
    history.redo();
    expect(ids(history.document)).toEqual(['s']);
  });
});

describe('command inverses', () => {
  it('inverts inserts, deletes and property changes', () => {
    const history = new History(siblingsDocument());
    const node = createNodeForTool('rectangle', { x: 0, y: 0, width: 20, height: 20 });
    history.execute(new InsertNodeCommand({ parentId: null, node }));
    expect(ids(history.document)).toContain(node.id);
    history.undo();
    expect(ids(history.document)).toEqual(['a', 'b', 'c']);

    history.execute(new SetNodeDataCommand([{ id: 'a', data: { x: 42, name: 'Renamed' } }]));
    expect(history.document.children[0].x).toBe(42);
    history.undo();
    expect(history.document.children[0].x).toBe(0);
    expect(history.document.children[0].name).toBe('A');
    history.redo();
    expect(history.document.children[0].x).toBe(42);
    expect(history.document.children[0].name).toBe('Renamed');
  });

  it('creates reusable frame with exactly the native persisted field delta', () => {
    const original = simpleDocument();
    const history = new History(original);
    const initial = JSON.parse(JSON.stringify(history.document));
    history.execute(new SetNodeDataCommand([{ id: 'p', data: { reusable: true } }], 'Create component'));
    const changed = JSON.parse(JSON.stringify(history.document));
    expect(changed.children[0].id).toBe('p');
    expect(changed.children[0].reusable).toBe(true);
    delete changed.children[0].reusable;
    expect(changed).toEqual(initial);
    history.undo();
    expect(JSON.parse(JSON.stringify(history.document))).toEqual(initial);
    history.redo();
    expect(history.document.children[0].reusable).toBe(true);
  });

  it('nudges x within the audited history sequence (nudge, undo, redo)', () => {
    const history = new History(siblingsDocument());
    const start = history.document.children[1].x as number;
    history.execute(new SetNodeDataCommand([{ id: 'b', data: { x: start + 1, y: 0 } }], 'Nudge selection'));
    expect(history.document.children[1].x).toBe(start + 1);
    history.undo();
    expect(history.document.children[1].x).toBe(start);
    history.redo();
    expect(history.document.children[1].x).toBe(start + 1);
  });
});

describe('DetachNodeCommand', () => {
  function refDocument(): PenDocument {
    return {
      version: '2.19',
      children: [
        {
          type: 'frame',
          id: 'origin',
          name: 'Origin',
          width: 120,
          height: 60,
          fill: '#123456',
          layout: 'none',
          reusable: true,
          children: [{ type: 'text', id: 'label', name: 'Label', content: 'Hello', fontSize: 16 }],
        },
        { type: 'ref', id: 'inst', ref: 'origin', name: 'Instance', x: 10, y: 20 },
      ],
    };
  }

  it('materializes a ref with a fresh child id and inverts exactly', () => {
    const history = new History(refDocument());
    history.execute(new DetachNodeCommand('inst'));
    const root = history.document.children[1];
    expect(root.type).toBe('frame');
    expect(root.id).toBe('inst');
    expect(root.ref).toBeUndefined();
    expect(root.reusable).toBeUndefined();
    expect(root.name).toBe('Instance');
    expect(root.children?.[0]?.content).toBe('Hello');
    expect(root.children?.[0]?.id).not.toBe('label');
    expect(root.children?.[0]?.id).not.toContain('/');
    const first = JSON.stringify(history.document);

    history.undo();
    const restored = history.document.children[1];
    expect(restored.type).toBe('ref');
    expect(restored.ref).toBe('origin');
    expect(restored.children).toBeUndefined();

    history.redo();
    expect(JSON.stringify(history.document)).toBe(first);
  });

  it('leaves the document unchanged when the target is not a persisted ref', () => {
    const history = new History(refDocument());
    const before = JSON.stringify(history.document);
    history.execute(new DetachNodeCommand('origin'));
    expect(JSON.stringify(history.document)).toBe(before);
    history.undo();
    expect(JSON.stringify(history.document)).toBe(before);
  });
});


describe('insert undo preserves absent children', () => {
  for (const mode of ['single', 'multiple'] as const) it(mode, () => {
    const before = simpleDocument();
    const parent = { ...before.children[0] };
    delete parent.children;
    const document = { ...before, children: [parent] };
    const history = new History(document);
    const node = { type: 'rectangle' as const, id: 'inserted', x: 0, y: 0, width: 10, height: 10 };
    history.execute(mode === 'single' ? new InsertNodeCommand({ parentId: parent.id, node }) : new InsertNodesCommand([{ parentId: parent.id, node }]));
    expect(history.document.children[0].children?.[0]?.id).toBe('inserted');
    history.undo();
    expect(history.document).toEqual(document);
    history.redo();
    expect(history.document.children[0].children?.[0]?.id).toBe('inserted');
  });
});
