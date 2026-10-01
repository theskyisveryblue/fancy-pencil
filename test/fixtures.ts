import fixtureSource from '../public/audit-primitives.pen?raw';
import fitFixtureSource from '../public/fit-content-fixture.pen?raw';
import nestedFixtureSource from '../public/nested-overrides-fixture.pen?raw';
import componentReplacementFixtureSource from '../public/component-replacement-fixture.pen?raw';
import detachedInnerRefFixtureSource from '../public/detached-inner-ref-fixture.pen?raw';
import { parsePenFile } from '../src/document/serialize';
import type { PenDocument } from '../src/document/types';

// The owned fit-content fixture is authored for the fit projection checks and
// shared verbatim by the unit tests and the browser check.
export const FIT_FIXTURE_SOURCE: string = fitFixtureSource;

// The owned nested-override fixture is a verbatim copy of the captured native
// document handoff/pen-evidence/workflows/api-nested-components/isolated-native-fixture.pen.
export const NESTED_FIXTURE_SOURCE: string = nestedFixtureSource;

function loadNested(): PenDocument {
  const result = parsePenFile(nestedFixtureSource);
  if (!result.ok || !result.document) {
    throw new Error('nested-override fixture failed to parse: ' + result.errors.join('; '));
  }
  return result.document;
}

export const NESTED_FIXTURE: PenDocument = loadNested();

// The owned component-replacement fixture is a verbatim copy of the captured
// native document handoff/pen-evidence/workflows/native-component-detach/
// replacement-isolated.pen (the api-component-replacement roots).
export const COMPONENT_REPLACEMENT_FIXTURE_SOURCE: string = componentReplacementFixtureSource;

function loadComponentReplacement(): PenDocument {
  const result = parsePenFile(componentReplacementFixtureSource);
  if (!result.ok || !result.document) {
    throw new Error('component-replacement fixture failed to parse: ' + result.errors.join('; '));
  }
  return result.document;
}

export const COMPONENT_REPLACEMENT_FIXTURE: PenDocument = loadComponentReplacement();

// The owned detached inner-ref fixture is a verbatim copy of the captured native
// document handoff/pen-evidence/workflows/native-component-detach/
// detached-isolated.pen: a plain frame G3F0DE whose ref oH6Xn -> skSG2 carries a
// literal replacement `children` list.
export const DETACHED_INNER_REF_FIXTURE_SOURCE: string = detachedInnerRefFixtureSource;

function loadDetachedInnerRef(): PenDocument {
  const result = parsePenFile(detachedInnerRefFixtureSource);
  if (!result.ok || !result.document) {
    throw new Error('detached inner-ref fixture failed to parse: ' + result.errors.join('; '));
  }
  return result.document;
}

export const DETACHED_INNER_REF_FIXTURE: PenDocument = loadDetachedInnerRef();

// The owned audit fixture is copied verbatim from the saved primitive/layout
// document in handoff/pen-evidence/workflows/api-render-retest/after.json.
export const SAMPLE_PRIMITIVES_SOURCE: string = fixtureSource;

function load(): PenDocument {
  const result = parsePenFile(fixtureSource);
  if (!result.ok || !result.document) {
    throw new Error('audit fixture failed to parse: ' + result.errors.join('; '));
  }
  return result.document;
}

export const SAMPLE_PRIMITIVES: PenDocument = load();

export function freshPrimitives(): PenDocument {
  return JSON.parse(JSON.stringify(SAMPLE_PRIMITIVES)) as PenDocument;
}

export function simpleDocument(): PenDocument {
  return {
    version: '2.19',
    children: [
      { type: 'frame', id: 'p', name: 'Parent', x: 0, y: 0, width: 400, height: 300, layout: 'none', children: [{ type: 'rectangle', id: 'c', name: 'Child', x: 10, y: 10, width: 50, height: 40, fill: '#000000' }] },
      { type: 'frame', id: 's', name: 'Sibling', x: 500, y: 0, width: 100, height: 100, layout: 'none' },
    ],
  };
}

export function siblingsDocument(): PenDocument {
  return {
    version: '2.19',
    children: [
      { type: 'frame', id: 'a', name: 'A', x: 0, y: 0, width: 100, height: 100, layout: 'none' },
      { type: 'frame', id: 'b', name: 'B', x: 200, y: 0, width: 100, height: 100, layout: 'none' },
      { type: 'frame', id: 'c', name: 'C', x: 400, y: 0, width: 100, height: 100, layout: 'none' },
    ],
  };
}
