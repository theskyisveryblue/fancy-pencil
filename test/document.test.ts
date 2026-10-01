import { describe, expect, it } from 'vitest';
import { createEmptyDocument, createNodeForTool } from '../src/document/defaults';
import { analyzeDocument } from '../src/document/diagnostics';
import { layoutDocument, resolveLayoutMode } from '../src/document/layout';
import { hitTest, selectableNodeId } from '../src/document/hitTest';
import { collectIds, countNodes, findNode, findParent, insertNode, removeNode } from '../src/document/tree';
import { parsePenFile, serializePenFile } from '../src/document/serialize';
import { DetachNodeCommand } from '../src/document/commands';
import { History } from '../src/document/history';
import type { PenDocument, PenNode } from '../src/document/types';
import { COMPONENT_REPLACEMENT_FIXTURE, COMPONENT_REPLACEMENT_FIXTURE_SOURCE, DETACHED_INNER_REF_FIXTURE, FIT_FIXTURE_SOURCE, NESTED_FIXTURE, NESTED_FIXTURE_SOURCE, SAMPLE_PRIMITIVES } from './fixtures';

describe('document model and layout', () => {
  it('creates an empty document containing one frame', () => {
    const document = createEmptyDocument();
    expect(document.version).toBe('2.19');
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe('frame');
  });

  it('resolves nested frame coordinates parent-relative to absolute', () => {
    const layout = layoutDocument(SAMPLE_PRIMITIVES);
    const frame = layout.byId.get('JLb0R');
    const rectangle = layout.byId.get('LvT0V');
    expect(frame).toBeDefined();
    expect(rectangle).toBeDefined();
    // Frame is at (32,32) inside the root; the rectangle is the first child of a
    // vertical layout with padding 24, so it sits at 32+24 = (56,56) absolute.
    expect(frame?.absX).toBe(32);
    expect(frame?.absY).toBe(32);
    expect(rectangle?.localX).toBe(24);
    expect(rectangle?.localY).toBe(24);
    expect(rectangle?.absX).toBe(56);
    expect(rectangle?.absY).toBe(56);
  });

  it('resolves fill_container children against the parent padding', () => {
    const layout = layoutDocument(SAMPLE_PRIMITIVES);
    const rectangle = layout.byId.get('LvT0V');
    // 640 wide frame with 24 padding on both sides leaves 592.
    expect(rectangle?.width).toBe(592);
  });

  it('resolves themed variables with the selected mode', () => {
    const light = layoutDocument(SAMPLE_PRIMITIVES, { themeMode: 'light' });
    const dark = layoutDocument(SAMPLE_PRIMITIVES, { themeMode: 'dark' });
    expect(light.byId.get('JLb0R')?.style.fill).toBe('#F8FAFC');
    expect(dark.byId.get('JLb0R')?.style.fill).toBe('#0F172A');
    expect(light.byId.get('LvT0V')?.style.fill).toBe('#7C3AED');
  });

  it('renders ref instances from their reusable origin', () => {
    const layout = layoutDocument(SAMPLE_PRIMITIVES);
    const instance = layout.byId.get('x7eMPw');
    expect(instance?.isInstance).toBe(true);
    expect(instance?.style.fill).toBe('#16A34A');
  });

  it('selects the containing frame on single click and the leaf on deep select', () => {
    const layout = layoutDocument(SAMPLE_PRIMITIVES);
    const point = { x: 100, y: 80 };
    expect(hitTest(layout, point)?.id).toBe('LvT0V');
    expect(selectableNodeId(layout, point, false)).toBe('JLb0R');
    expect(selectableNodeId(layout, point, true)).toBe('LvT0V');
  });

  it('reports unsupported sizing and node types without dropping fields', () => {
    const document: PenDocument = {
      version: '2.19',
      children: [
        {
          type: 'frame',
          id: 'root',
          x: 0,
          y: 0,
          width: 400,
          height: 300,
          layout: 'vertical',
          children: [
            { type: 'polygon', id: 'polygon1', name: 'A polygon', width: '50%', height: 20 },
          ],
        },
      ],
    };
    const analysis = analyzeDocument(document);
    const codes = analysis.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).not.toContain('unsupported-node-type');
    expect(codes).toContain('unsupported-size');
    expect(document.children[0].children?.[0].width).toBe('50%');
  });

  it('inserts and removes nodes while preserving sibling order', () => {
    let document = insertNode(createEmptyDocument(), null, createNodeForTool('rectangle', { x: 0, y: 0, width: 10, height: 10 }));
    document = insertNode(document, null, createNodeForTool('ellipse', { x: 0, y: 0, width: 10, height: 10 }));
    const ids = document.children.map((node) => node.id);
    expect(countNodes(document)).toBe(3);
    const rectangleId = ids[1];
    const removed = removeNode(document, rectangleId);
    expect(findNode(removed, rectangleId)).toBeNull();
    expect(findParent(removed, ids[2])?.index).toBe(1);
  });
});

describe('frame layout defaults (Pen v2.19)', () => {
  it('treats an omitted frame layout as horizontal and keeps none/group absolute', () => {
    expect(resolveLayoutMode({ type: 'frame', id: 'f' })).toBe('horizontal');
    expect(resolveLayoutMode({ type: 'frame', id: 'f', layout: 'none' })).toBe('none');
    expect(resolveLayoutMode({ type: 'frame', id: 'f', layout: 'vertical' })).toBe('vertical');
    expect(resolveLayoutMode({ type: 'group', id: 'g' })).toBe('none');
    expect(resolveLayoutMode({ type: 'rectangle', id: 'r' })).toBe('none');
  });

  it('lays out the omitted-layout fixture component horizontally with padding', () => {
    const layout = layoutDocument(SAMPLE_PRIMITIVES);
    const component = layout.byId.get('Iy7jv');
    const label = layout.byId.get('yyyuL');
    expect(component?.layout).toBe('horizontal');
    expect(label).toBeDefined();
    // padding 12 on the omitted-layout frame: the label is inset, not flush.
    expect(label?.localX).toBe(12);
    expect(label?.localY).toBe(12);
    expect((label?.absX ?? 0) - (component?.absX ?? 0)).toBe(12);
  });

  it('keeps an explicit layout none absolute', () => {
    const document: PenDocument = {
      version: '2.19',
      children: [
        {
          type: 'frame',
          id: 'abs',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          layout: 'none',
          children: [{ type: 'rectangle', id: 'child', x: 30, y: 40, width: 20, height: 20 }],
        },
      ],
    };
    const layout = layoutDocument(document);
    expect(layout.byId.get('abs')?.layout).toBe('none');
    expect(layout.byId.get('child')?.localX).toBe(30);
    expect(layout.byId.get('child')?.localY).toBe(40);
  });

  it('keeps an omitted-layout group absolute', () => {
    const document: PenDocument = {
      version: '2.19',
      children: [
        {
          type: 'group',
          id: 'grp',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          children: [{ type: 'rectangle', id: 'gchild', x: 30, y: 40, width: 20, height: 20 }],
        },
      ],
    };
    const layout = layoutDocument(document);
    expect(layout.byId.get('grp')?.layout).toBe('none');
    expect(layout.byId.get('gchild')?.localX).toBe(30);
    expect(layout.byId.get('gchild')?.localY).toBe(40);
  });

  it('inherits the origin layout for a ref instance of an omitted-layout frame', () => {
    const layout = layoutDocument(SAMPLE_PRIMITIVES);
    const instance = layout.byId.get('x7eMPw');
    const instanceLabel = layout.byId.get('x7eMPw/yyyuL');
    expect(instance?.layout).toBe('horizontal');
    expect(instanceLabel).toBeDefined();
    expect(instanceLabel?.localX).toBe(12);
    expect(instanceLabel?.localY).toBe(12);
  });
});

describe('frame fit_content projection (Pen v2.19)', () => {
  it('fits an omitted-width horizontal frame to children plus gap and padding', () => {
    const document: PenDocument = {
      version: '2.19',
      children: [
        {
          type: 'frame',
          id: 'row',
          x: 0,
          y: 0,
          height: 60,
          layout: 'horizontal',
          gap: 10,
          padding: 8,
          children: [
            { type: 'rectangle', id: 'r1', width: 100, height: 40 },
            { type: 'rectangle', id: 'r2', width: 50, height: 40 },
          ],
        },
      ],
    };
    const layout = layoutDocument(document);
    // 100 + 50 + gap 10 + padding 8*2 = 176, not the 100px shape fallback.
    expect(layout.byId.get('row')?.width).toBe(176);
    expect(layout.byId.get('r2')?.localX).toBe(8 + 100 + 10);
    expect(layout.byId.get('r2')?.absX).toBe(8 + 100 + 10);
  });

  it('fits an explicit fit_content width on a horizontal frame the same way', () => {
    const document: PenDocument = {
      version: '2.19',
      children: [
        {
          type: 'frame',
          id: 'row',
          x: 0,
          y: 0,
          width: 'fit_content',
          height: 60,
          layout: 'horizontal',
          gap: 10,
          padding: 8,
          children: [
            { type: 'rectangle', id: 'r1', width: 100, height: 40 },
            { type: 'rectangle', id: 'r2', width: 50, height: 40 },
          ],
        },
      ],
    };
    const layout = layoutDocument(document);
    expect(layout.byId.get('row')?.width).toBe(176);
  });

  it('fits an omitted-width vertical frame to the widest child plus padding', () => {
    const document: PenDocument = {
      version: '2.19',
      children: [
        {
          type: 'frame',
          id: 'col',
          x: 0,
          y: 0,
          layout: 'vertical',
          gap: 6,
          padding: 12,
          children: [
            { type: 'rectangle', id: 'c1', width: 120, height: 20 },
            { type: 'rectangle', id: 'c2', width: 40, height: 20 },
          ],
        },
      ],
    };
    const layout = layoutDocument(document);
    // cross axis takes the max child (120), not the sum; + padding 12*2 = 144.
    expect(layout.byId.get('col')?.width).toBe(144);
    // main axis stacks children above the padding.
    expect(layout.byId.get('c1')?.localY).toBe(12);
    expect(layout.byId.get('c2')?.localY).toBe(12 + 20 + 6);
  });

  it('recomputes inner fit frames before the outer fit frame', () => {
    const document: PenDocument = {
      version: '2.19',
      children: [
        {
          type: 'frame',
          id: 'outer',
          x: 0,
          y: 0,
          layout: 'horizontal',
          gap: 4,
          padding: 5,
          children: [
            {
              type: 'frame',
              id: 'inner',
              layout: 'horizontal',
              gap: 2,
              padding: 3,
              children: [
                { type: 'rectangle', id: 'i1', width: 30, height: 10 },
                { type: 'rectangle', id: 'i2', width: 20, height: 10 },
              ],
            },
            { type: 'rectangle', id: 'tail', width: 10, height: 10 },
          ],
        },
      ],
    };
    const layout = layoutDocument(document);
    // inner = 30 + 20 + 2 + 3*2 = 58; outer = 58 + 10 + gap 4 + padding 5*2 = 82.
    expect(layout.byId.get('inner')?.width).toBe(58);
    expect(layout.byId.get('outer')?.width).toBe(82);
    expect(layout.byId.get('tail')?.localX).toBe(5 + 58 + 4);
  });

  it('fits a ref instance width from its cloned origin children', () => {
    const document: PenDocument = {
      version: '2.19',
      children: [
        {
          type: 'frame',
          id: 'origin',
          reusable: true,
          layout: 'horizontal',
          gap: 5,
          padding: 5,
          children: [
            { type: 'rectangle', id: 'o1', width: 40, height: 20 },
            { type: 'rectangle', id: 'o2', width: 30, height: 20 },
          ],
        },
        { type: 'ref', id: 'inst', ref: 'origin', x: 200, y: 0 },
      ],
    };
    const layout = layoutDocument(document);
    const instance = layout.byId.get('inst');
    // 40 + 30 + gap 5 + padding 5*2 = 85.
    expect(instance?.isInstance).toBe(true);
    expect(instance?.width).toBe(85);
  });

  it('excludes absolute children from a fit width', () => {
    const document: PenDocument = {
      version: '2.19',
      children: [
        {
          type: 'frame',
          id: 'row',
          x: 0,
          y: 0,
          layout: 'horizontal',
          padding: 5,
          children: [
            { type: 'rectangle', id: 'flow', width: 200, height: 20 },
            { type: 'rectangle', id: 'detached', layoutPosition: 'absolute', x: 900, y: 0, width: 500, height: 20 },
          ],
        },
      ],
    };
    const layout = layoutDocument(document);
    // Only the in-flow child contributes: 200 + padding 5*2 = 210.
    expect(layout.byId.get('row')?.width).toBe(210);
    // The absolute child keeps its own x, outside the fit.
    expect(layout.byId.get('detached')?.localX).toBe(900);
  });

  it('uses an explicit fit_content(n) fallback when the frame has no children', () => {
    const document: PenDocument = {
      version: '2.19',
      children: [
        { type: 'frame', id: 'empty', x: 0, y: 0, width: 'fit_content(90)', height: 30, layout: 'horizontal' },
        { type: 'frame', id: 'bare', x: 0, y: 40, width: 'fit_content', height: 30, layout: 'vertical' },
      ],
    };
    const layout = layoutDocument(document);
    expect(layout.byId.get('empty')?.width).toBe(90);
    // A bare fit_content with no children keeps the neutral shape fallback.
    expect(layout.byId.get('bare')?.width).toBe(100);
  });

  it('falls back deterministically for a fill child of a fit parent', () => {
    const document: PenDocument = {
      version: '2.19',
      children: [
        {
          type: 'frame',
          id: 'row',
          x: 0,
          y: 0,
          layout: 'horizontal',
          padding: 10,
          children: [{ type: 'rectangle', id: 'filler', width: 'fill_container', height: 20 }],
        },
      ],
    };
    const layout = layoutDocument(document);
    const codes = layout.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toContain('fit-fill-cycle');
    // No recursion and no accidental 100: the fill child keeps its neutral
    // fallback width and the fit parent wraps exactly that plus padding.
    expect(layout.byId.get('filler')?.width).toBe(100);
    expect(layout.byId.get('row')?.width).toBe(120);
  });

  it('loads the same owned fit fixture used by Chrome', () => {
    const parsed = parsePenFile(FIT_FIXTURE_SOURCE);
    expect(parsed.ok).toBe(true);
    const layout = layoutDocument(parsed.document!);
    expect(layout.byId.get('fxRow')?.width).toBe(176);
    expect(layout.byId.get('fxCol')?.width).toBe(144);
  });
});

// Native evidence: handoff/pen-evidence/workflows/api-nested-components. The
// The isolated owned fixture contains the three native nodes as direct roots;
// the full persisted document places them under the audit frame bi8Au.
const NESTED_ROOT_IDS = ['skSG2', 'gL2Ml', 'G3F0DE'];
const NESTED_INSTANCE = 'G3F0DE';

function nestedDocument(): PenDocument {
  return JSON.parse(JSON.stringify(NESTED_FIXTURE)) as PenDocument;
}

function rawNestedInstance(document: PenDocument): { descendants?: Record<string, Record<string, unknown>> } {
  const found = findNode(document, NESTED_INSTANCE);
  if (!found) throw new Error('nested instance missing');
  return found as unknown as { descendants?: Record<string, Record<string, unknown>> };
}

describe('nested ref descendant overrides (Pen v2.19 native evidence)', () => {
  it('loads the owned native fixture and keeps the raw descendants byte-identical', () => {
    const parsed = parsePenFile(NESTED_FIXTURE_SOURCE);
    expect(parsed.ok).toBe(true);
    // Serializing the parsed document reproduces the owned fixture exactly, so
    // the raw ref+descendants model is never rewritten on an import/save round
    // trip.
    expect(JSON.parse(serializePenFile(parsed.document!))).toEqual(JSON.parse(NESTED_FIXTURE_SOURCE));

    const instance = rawNestedInstance(NESTED_FIXTURE);
    expect(instance.descendants).toEqual({
      veExn: { content: 'Overridden outer' },
      'c4zmg/GigZ5': { content: 'Overridden inner', fill: '#7C3AED' },
    });
  });

  it('projects the outer and inner descendant overrides while origins stay original', () => {
    const document = nestedDocument();
    const layout = layoutDocument(document);
    const codes = layout.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).not.toContain('missing-descendant');
    expect(codes).not.toContain('ref-cycle');

    const instance = layout.byId.get(NESTED_INSTANCE);
    expect(instance?.isInstance).toBe(true);

    const outer = layout.byId.get(NESTED_INSTANCE + '/veExn');
    expect(outer).toBeDefined();
    expect(outer?.node.content).toBe('Overridden outer');
    expect(outer?.insideInstance).toBe(true);
    // Non-overridden fields still come from the origin.
    expect(outer?.node.fill).toBe('#111827');
    expect(outer?.node.fontSize).toBe(22);

    // The nested origin re-applies its own descendants map: the inner label text
    // and purple fill override, its projected id keeps the "/" path, and its
    // other fields still come from the nested origin.
    const inner = layout.byId.get(NESTED_INSTANCE + '/c4zmg/GigZ5');
    expect(inner).toBeDefined();
    expect(inner?.node.content).toBe('Overridden inner');
    expect(inner?.node.fill).toBe('#7C3AED');
    expect(inner?.node.fontSize).toBe(18);
    expect(inner?.insideInstance).toBe(true);

    // The nested ref projection node itself is re-cloned from skSG2 and keeps the
    // non-overridden frame fields.
    const nestedRef = layout.byId.get(NESTED_INSTANCE + '/c4zmg');
    expect(nestedRef).toBeDefined();
    expect(nestedRef?.node.name).toBe('Audit Nested Child');
    expect(nestedRef?.style.fill).toBe('#E2E8F0');
    expect(nestedRef?.width).toBe(288);

    // Origins are untouched: gL2Ml title "Original outer", skSG2 label "Changed
    // origin"; neither origin node carries an override.
    expect(layout.byId.get('veExn')?.node.content).toBe('Original outer');
    expect(layout.byId.get('GigZ5')?.node.content).toBe('Changed origin');
    expect(layout.byId.get('GigZ5')?.node.fill).toBe('#111827');

    // Projected ids are unique across the whole layout and never collide with the
    // origin ids.
    expect(layout.nodes.length).toBe(layout.byId.size);
    expect(layout.byId.has('VEExn')).toBe(false);
    expect(document.children.map((node) => node.id)).toEqual(NESTED_ROOT_IDS);
  });

  it('keeps the persisted instance descendants byte-identical after a layout', () => {
    const document = nestedDocument();
    const before = JSON.stringify(rawNestedInstance(document).descendants);
    layoutDocument(document);
    const after = JSON.stringify(rawNestedInstance(document).descendants);
    expect(after).toBe(before);
    // The origin trees are not mutated either.
    expect(findNode(document, 'gL2Ml')?.children?.[0].content).toBe('Original outer');
    expect(findNode(document, 'skSG2')?.children?.[0].content).toBe('Changed origin');
  });

  it('propagates a non-overridden origin edit to the instance but not to sibling instances', () => {
    const document = nestedDocument();
    const origin = findNode(document, 'gL2Ml');
    if (!origin || !Array.isArray(origin.children)) throw new Error('nested outer origin missing');
    // Edit a NON-overridden origin field (the nested ref child's height).
    const nestedChildRef = origin.children.find((child) => child.id === 'c4zmg');
    if (!nestedChildRef) throw new Error('nested child ref missing');
    nestedChildRef.height = 96;

    // Add an independent second instance of the same origin with NO overrides.
    document.children.push({ id: 'G3F0DZ', type: 'ref', ref: 'gL2Ml', name: 'Audit Nested Instance 2', x: 2160, y: 120 });

    const layout = layoutDocument(document);

    // The origin edit reaches both instances' non-overridden fields.
    expect(layout.byId.get(NESTED_INSTANCE + '/c4zmg')?.node.height).toBe(96);
    expect(layout.byId.get('G3F0DZ/c4zmg')?.node.height).toBe(96);

    // The override only affects the first instance.
    expect(layout.byId.get(NESTED_INSTANCE + '/c4zmg/GigZ5')?.node.content).toBe('Overridden inner');
    expect(layout.byId.get(NESTED_INSTANCE + '/veExn')?.node.content).toBe('Overridden outer');
    expect(layout.byId.get('G3F0DZ/veExn')?.node.content).toBe('Original outer');
    expect(layout.byId.get('G3F0DZ/c4zmg/GigZ5')?.node.content).toBe('Changed origin');
    expect(layout.byId.get('G3F0DZ/c4zmg/GigZ5')?.node.fill).toBe('#111827');
  });

  it('reports a missing descendant path without throwing and still projects valid paths', () => {
    const document = nestedDocument();
    const instance = rawNestedInstance(document) as unknown as Record<string, unknown>;
    instance.descendants = {
      'veExn/nope': { content: 'ignored' },
      veExn: { content: 'Overridden outer' },
    };
    const layout = layoutDocument(document);
    const missing = layout.diagnostics.find((diagnostic) => diagnostic.code === 'missing-descendant');
    expect(missing).toBeDefined();
    expect(layout.byId.get(NESTED_INSTANCE + '/veExn')?.node.content).toBe('Overridden outer');
  });

  it('reports a recursive ref cycle without throwing', () => {
    const document: PenDocument = {
      version: '2.19',
      children: [
        {
          type: 'frame',
          id: 'cycA',
          reusable: true,
          width: 100,
          height: 100,
          children: [{ id: 'cycRefA', type: 'ref', ref: 'cycB', name: 'Ref to B' }],
        },
        {
          type: 'frame',
          id: 'cycB',
          reusable: true,
          width: 100,
          height: 100,
          children: [{ id: 'cycRefB', type: 'ref', ref: 'cycA', name: 'Ref to A' }],
        },
        {
          id: 'cycInst',
          type: 'ref',
          ref: 'cycA',
          name: 'Cyclic instance',
          x: 0,
          y: 0,
          descendants: { 'cycRefA/cycRefB/x': { content: 'never' } },
        },
      ],
    };
    const layout = layoutDocument(document);
    const cycle = layout.diagnostics.find((diagnostic) => diagnostic.code === 'ref-cycle');
    expect(cycle).toBeDefined();
    expect(cycle?.level).toBe('error');
  });

  it('ignores an invalid descendant value and keeps projecting the valid keys', () => {
    const document = nestedDocument();
    const instance = rawNestedInstance(document) as unknown as Record<string, unknown>;
    instance.descendants = { veExn: { content: 'Overridden outer', fill: 42 } };
    const layout = layoutDocument(document);
    const invalid = layout.diagnostics.find((diagnostic) => diagnostic.code === 'invalid-descendant-value');
    expect(invalid).toBeDefined();
    const outer = layout.byId.get(NESTED_INSTANCE + '/veExn');
    expect(outer?.node.content).toBe('Overridden outer');
    // The invalid fill is skipped, so the origin fill is preserved.
    expect(outer?.node.fill).toBe('#111827');
  });
});

// Native evidence: handoff/pen-evidence/workflows/api-component-replacement and
// native-component-detach. Native Replace() saved two complete-subtree
// replacement forms inline on G3F0DE.descendants: a `type:"text"` node at
// `veExn` (id D4328u, red #DC2626, "Replacement title") and a literal `children`
// list at the nested ref `c4zmg` (frame x8HgK with text mNOal "Slot child"). The
// resolved native Get keeps the replacement ids unprefixed and leaves both
// origins original.
const COMPONENT_REPLACEMENT_INSTANCE = 'G3F0DE';
const REPLACEMENT_TITLE_ID = 'D4328u';
const REPLACEMENT_FRAME_ID = 'x8HgK';
const REPLACEMENT_CHILD_ID = 'mNOal';

function replacementDocument(): PenDocument {
  return JSON.parse(JSON.stringify(COMPONENT_REPLACEMENT_FIXTURE)) as PenDocument;
}

function rawReplacementInstance(document: PenDocument): { descendants?: Record<string, Record<string, unknown>> } {
  const found = findNode(document, COMPONENT_REPLACEMENT_INSTANCE);
  if (!found) throw new Error('replacement instance missing');
  return found as unknown as { descendants?: Record<string, Record<string, unknown>> };
}

describe('component replacement projection (Pen v2.19 native evidence)', () => {
  it('loads the owned replacement fixture and keeps the raw descendants', () => {
    const parsed = parsePenFile(COMPONENT_REPLACEMENT_FIXTURE_SOURCE);
    expect(parsed.ok).toBe(true);
    // Serializing the parsed document reproduces the owned fixture exactly, so
    // the raw replacement model is never rewritten on an import/save round trip.
    expect(JSON.parse(serializePenFile(parsed.document!))).toEqual(JSON.parse(COMPONENT_REPLACEMENT_FIXTURE_SOURCE));
    expect(COMPONENT_REPLACEMENT_FIXTURE.children.map((node) => node.id)).toEqual(['skSG2', 'gL2Ml', 'G3F0DE']);

    const instance = rawReplacementInstance(COMPONENT_REPLACEMENT_FIXTURE);
    expect(instance.descendants).toEqual({
      veExn: {
        type: 'text',
        id: 'D4328u',
        name: 'Replaced title',
        fill: '#DC2626',
        content: 'Replacement title',
        fontFamily: 'Inter',
        fontSize: 22,
        fontWeight: 'normal',
      },
      c4zmg: {
        children: [
          {
            type: 'frame',
            id: 'x8HgK',
            name: 'Replaced inner subtree',
            width: 160,
            height: 36,
            fill: '#FDE68A',
            padding: 4,
            children: [
              {
                type: 'text',
                id: 'mNOal',
                name: 'Replacement child',
                fill: '#111827',
                content: 'Slot child',
                fontFamily: 'Inter',
                fontSize: 15,
                fontWeight: 'normal',
              },
            ],
          },
        ],
      },
    });
  });

  it('swaps a complete subtree for a `type` descendant value and keeps the origin', () => {
    const layout = layoutDocument(replacementDocument());
    const codes = layout.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).not.toContain('missing-descendant');
    expect(codes).not.toContain('ref-cycle');
    expect(codes).not.toContain('invalid-replacement');

    const replaced = layout.byId.get(REPLACEMENT_TITLE_ID);
    expect(replaced).toBeDefined();
    expect(replaced?.type).toBe('text');
    expect(replaced?.node.name).toBe('Replaced title');
    expect(replaced?.node.content).toBe('Replacement title');
    expect(replaced?.style.fill).toBe('#DC2626');
    expect(replaced?.insideInstance).toBe(true);
    // The swap REPLACES the origin title inside the instance, so the old
    // projected id is gone rather than duplicated.
    expect(layout.byId.has(COMPONENT_REPLACEMENT_INSTANCE + '/veExn')).toBe(false);
    // The origin is untouched.
    expect(layout.byId.get('veExn')?.node.content).toBe('Original outer');
    expect(layout.byId.get('veExn')?.node.fill).toBe('#111827');
  });

  it('replaces a nested ref child list from `children` while keeping its frame fields', () => {
    const layout = layoutDocument(replacementDocument());
    const nestedRef = layout.byId.get(COMPONENT_REPLACEMENT_INSTANCE + '/c4zmg');
    expect(nestedRef).toBeDefined();
    expect(nestedRef?.node.name).toBe('Audit Nested Child');
    expect(nestedRef?.style.fill).toBe('#E2E8F0');
    // fill_container against the 320 wide, 16 padded outer origin: 320 - 32.
    expect(nestedRef?.width).toBe(288);
    // The replaced child list drops the origin label from the instance.
    expect(layout.byId.has(COMPONENT_REPLACEMENT_INSTANCE + '/c4zmg/GigZ5')).toBe(false);

    const frame = layout.byId.get(REPLACEMENT_FRAME_ID);
    expect(frame).toBeDefined();
    expect(frame?.node.name).toBe('Replaced inner subtree');
    expect(frame?.style.fill).toBe('#FDE68A');
    expect(frame?.width).toBe(160);
    expect(frame?.height).toBe(36);
    expect(frame?.insideInstance).toBe(true);

    const child = layout.byId.get(REPLACEMENT_CHILD_ID);
    expect(child).toBeDefined();
    expect(child?.node.content).toBe('Slot child');
    expect(child?.style.fill).toBe('#111827');
    expect(child?.insideInstance).toBe(true);

    // The origin label survives unchanged.
    expect(layout.byId.get('GigZ5')?.node.content).toBe('Changed origin');
  });

  it('keeps the persisted document and origins byte-identical after projection', () => {
    const document = replacementDocument();
    const before = JSON.stringify(document);
    layoutDocument(document);
    expect(JSON.stringify(document)).toBe(before);
    expect(findNode(document, 'gL2Ml')?.children?.[0].content).toBe('Original outer');
    expect(findNode(document, 'skSG2')?.children?.[0].content).toBe('Changed origin');
  });

  it('emits unique projected ids with no collision against the origins', () => {
    const layout = layoutDocument(replacementDocument());
    const ids = layout.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(layout.nodes.length).toBe(layout.byId.size);
    expect(layout.byId.has('skSG2')).toBe(true);
    expect(layout.byId.has('gL2Ml')).toBe(true);
    expect(layout.byId.has(COMPONENT_REPLACEMENT_INSTANCE)).toBe(true);
  });

  it('projects the detached ref-with-children form (native detach evidence)', () => {
    const document = JSON.parse(JSON.stringify(DETACHED_INNER_REF_FIXTURE)) as PenDocument;
    const layout = layoutDocument(document);
    const codes = layout.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).not.toContain('ref-cycle');
    expect(codes).not.toContain('invalid-replacement');

    // G3F0DE is a plain frame after detach; the replaced title and the inner ref
    // are concrete children.
    expect(layout.byId.get('G3F0DE')?.type).toBe('frame');
    expect(layout.byId.get(REPLACEMENT_TITLE_ID)?.node.content).toBe('Replacement title');

    // The nested ref oH6Xn still points at skSG2, keeps the origin frame fields,
    // and uses its literal replacement children instead of the origin label.
    const innerRef = layout.byId.get('oH6Xn');
    expect(innerRef).toBeDefined();
    expect(innerRef?.isInstance).toBe(true);
    expect(innerRef?.node.name).toBe('Audit Nested Child');
    expect(innerRef?.style.fill).toBe('#E2E8F0');
    expect(layout.byId.has('oH6Xn/GigZ5')).toBe(false);
    expect(layout.byId.get(REPLACEMENT_FRAME_ID)?.node.name).toBe('Replaced inner subtree');
    expect(layout.byId.get(REPLACEMENT_CHILD_ID)?.node.content).toBe('Slot child');

    // The inner origin keeps its own label.
    expect(layout.byId.get('GigZ5')?.node.content).toBe('Changed origin');
    const ids = layout.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('diagnoses an invalid replacement and keeps projecting the valid form', () => {
    const document = replacementDocument();
    const instance = rawReplacementInstance(document) as unknown as Record<string, unknown>;
    instance.descendants = {
      veExn: { type: 'text' },
      c4zmg: { children: 'not-an-array' },
    };
    const layout = layoutDocument(document);
    const invalid = layout.diagnostics.filter((diagnostic) => diagnostic.code === 'invalid-replacement');
    expect(invalid.length).toBeGreaterThanOrEqual(2);
    // The malformed `type` swap is ignored, so the origin title is projected.
    expect(layout.byId.get(COMPONENT_REPLACEMENT_INSTANCE + '/veExn')?.node.content).toBe('Original outer');
    // The malformed `children` override is ignored, so the nested origin label is
    // still projected.
    expect(layout.byId.get(COMPONENT_REPLACEMENT_INSTANCE + '/c4zmg/GigZ5')?.node.content).toBe('Changed origin');
  });

  it('diagnoses a duplicate replacement id instead of emitting a duplicate', () => {
    const document = replacementDocument();
    const instance = rawReplacementInstance(document) as unknown as Record<string, unknown>;
    instance.descendants = {
      veExn: { type: 'text', id: 'veExn', content: 'Colliding replacement' },
    };
    const layout = layoutDocument(document);
    const duplicate = layout.diagnostics.find((diagnostic) => diagnostic.code === 'duplicate-replacement-id');
    expect(duplicate).toBeDefined();
    // The colliding replacement was refused, so the origin title is projected.
    expect(layout.byId.get(COMPONENT_REPLACEMENT_INSTANCE + '/veExn')?.node.content).toBe('Original outer');
    const ids = layout.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// Native evidence: handoff/pen-evidence/workflows/native-component-detach. The
// signed-in Pen app selected G3F0DE (a ref to gL2Ml) and pressed Command-Option-X;
// after.json saves a plain frame with the SAME id, the origin fields plus the
// instance overrides, a materialized replacement title D4328u, and a NEW nested
// ref -> skSG2 that keeps the literal replacement children x8HgK/mNOal. The exact
// new nested ref id is random, so only its shape is asserted.
describe('instance detach (Pen v2.19 native evidence)', () => {
  const NATIVE_AFTER_ROOT: Record<string, unknown> = {
    type: 'frame',
    id: 'G3F0DE',
    x: 1760,
    y: 120,
    name: 'Audit Nested Instance',
    width: 320,
    height: 200,
    fill: '#FFFFFF',
    stroke: '#64748B',
    strokeWidth: 1,
    layout: 'vertical',
    gap: 12,
    padding: 16,
  };

  function detachedDocument(): PenDocument {
    const document = JSON.parse(JSON.stringify(COMPONENT_REPLACEMENT_FIXTURE)) as PenDocument;
    const history = new History(document);
    history.execute(new DetachNodeCommand('G3F0DE'));
    return history.document;
  }

  function detachRoot(): PenNode {
    const root = findNode(detachedDocument(), 'G3F0DE');
    if (!root) throw new Error('detached root missing');
    return root;
  }

  it('materializes the persisted ref into the native detached frame (after.json)', () => {
    const root = detachRoot();
    for (const [key, value] of Object.entries(NATIVE_AFTER_ROOT)) {
      expect(root[key]).toEqual(value);
    }
    // The detached root is no longer a component instance.
    expect(root.ref).toBeUndefined();
    expect(root.descendants).toBeUndefined();
    expect(root.reusable).toBeUndefined();

    // The direct `type` replacement keeps its saved id and content.
    const title = root.children?.[0];
    expect(title?.id).toBe('D4328u');
    expect(title?.type).toBe('text');
    expect(title?.name).toBe('Replaced title');
    expect(title?.content).toBe('Replacement title');
    expect(title?.fill).toBe('#DC2626');

    // The nested component link is preserved with a fresh, persistent id.
    const nested = root.children?.[1];
    expect(nested?.type).toBe('ref');
    expect(nested?.ref).toBe('skSG2');
    expect(nested?.name).toBe('Audit Nested Child');
    expect(nested?.width).toBe('fill_container');
    expect(nested?.height).toBe(64);
    expect(nested?.id).not.toBe('c4zmg');
    expect(nested?.id).toMatch(/^[A-Za-z0-9]{5}$/);
    expect(nested?.id).not.toContain('/');
    // Its literal replacement children keep their saved ids.
    expect(nested?.children?.[0]?.id).toBe('x8HgK');
    expect(nested?.children?.[0]?.name).toBe('Replaced inner subtree');
    expect(nested?.children?.[0]?.children?.[0]?.id).toBe('mNOal');
    expect(nested?.children?.[0]?.children?.[0]?.content).toBe('Slot child');
  });

  it('leaves both reusable origins unchanged and emits unique slash-free ids', () => {
    const document = detachedDocument();
    expect(findNode(document, 'gL2Ml')?.children?.[0].content).toBe('Original outer');
    expect(findNode(document, 'veExn')?.content).toBe('Original outer');
    expect(findNode(document, 'skSG2')?.children?.[0].content).toBe('Changed origin');
    expect(findNode(document, 'GigZ5')?.content).toBe('Changed origin');

    const ids = Array.from(collectIds(document));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((id) => id.includes('/'))).toBe(false);

    const layout = layoutDocument(document);
    const layoutIds = layout.nodes.map((node) => node.id);
    expect(new Set(layoutIds).size).toBe(layoutIds.length);
  });

  it('is undo/redo safe and reproduces the same detached tree on redo', () => {
    const document = JSON.parse(JSON.stringify(COMPONENT_REPLACEMENT_FIXTURE)) as PenDocument;
    const history = new History(document);
    history.execute(new DetachNodeCommand('G3F0DE'));
    const first = JSON.stringify(history.document);

    const rawInstance = findNode(COMPONENT_REPLACEMENT_FIXTURE, 'G3F0DE') as unknown as Record<string, unknown>;
    history.undo();
    const restored = findNode(history.document, 'G3F0DE');
    expect(restored?.type).toBe('ref');
    expect(restored?.ref).toBe('gL2Ml');
    expect(restored?.descendants).toEqual(rawInstance.descendants);

    history.redo();
    expect(JSON.stringify(history.document)).toBe(first);

    history.undo();
    expect(findNode(history.document, 'G3F0DE')?.type).toBe('ref');
  });

  it('survives a save and reload with the detached content intact', () => {
    const document = detachedDocument();
    const parsed = parsePenFile(serializePenFile(document));
    expect(parsed.ok).toBe(true);
    const layout = layoutDocument(parsed.document!);
    expect(layout.byId.get('G3F0DE')?.type).toBe('frame');
    expect(layout.byId.get('D4328u')?.node.content).toBe('Replacement title');
    expect(layout.byId.get('x8HgK')?.node.name).toBe('Replaced inner subtree');
    expect(layout.byId.get('mNOal')?.node.content).toBe('Slot child');
    expect(layout.byId.has('G3F0DE/veExn')).toBe(false);
  });

  it('refuses to detach a non-ref node without changing the document', () => {
    const document = JSON.parse(JSON.stringify(COMPONENT_REPLACEMENT_FIXTURE)) as PenDocument;
    const history = new History(document);
    const before = JSON.stringify(history.document);
    history.execute(new DetachNodeCommand('gL2Ml'));
    expect(JSON.stringify(history.document)).toBe(before);
  });
});
