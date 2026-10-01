import type { PenDocument } from '../document/types';

export const BUILT_IN_LIBRARIES = [
  { name: 'Shadcn UI', preview: 'shadcn', key: 'B', uri: 'pencil:shadcn.lib.pen' },
  { name: 'Lunaris', preview: 'lunaris', key: 'X', uri: 'pencil:lunaris.lib.pen' },
  { name: 'Halo', preview: 'halo', key: 'M', uri: 'pencil:halo.lib.pen' },
  { name: 'Nitro', preview: 'nitro', key: 'E', uri: 'pencil:nitro.lib.pen' },
] as const;

export type BuiltInLibrary = typeof BUILT_IN_LIBRARIES[number];

export function LibrariesPanel({ document, onImport, onTurnIntoLibrary }: {
  document: PenDocument;
  onImport: (library: BuiltInLibrary) => void;
  onTurnIntoLibrary: () => void;
}) {
  const imports = document.imports ?? {};
  const imported = Object.values(imports);
  return <div className="libraries-panel" data-testid="libraries-panel">
    {imported.length ? <><h2>Imported Libraries</h2>{imported.map(uri => <div key={uri} className="imported-library">{uri.replace(/^pencil:/, '')}</div>)}</> : <p data-testid="libraries-empty">No imported libraries</p>}
    <h2>Libraries by Pencil.dev</h2>
    <div className="library-list">{BUILT_IN_LIBRARIES.map(library => <button type="button" key={library.key} className="library-card" aria-label={library.name} data-testid={'library-card-' + library.key} onClick={() => onImport(library)}>
      <span className="library-preview" aria-hidden="true" style={{ backgroundImage: 'url(/library-previews/' + library.preview + '.png)' }} /><span>{library.name}</span>
    </button>)}</div>
    <button type="button" className="library-convert" onClick={onTurnIntoLibrary}>Turn this file into a library</button>
  </div>;
}
