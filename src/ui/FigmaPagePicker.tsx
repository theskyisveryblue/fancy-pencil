import type { FigmaPageRef } from '../document/figmaImport';

export interface FigmaPagePickerProps {
  fileName: string;
  pages: FigmaPageRef[];
  busy: boolean;
  onChoose: (pageId: string) => void;
  onCancel: () => void;
}

// Native "Select Figma page to import": one button per real page name, plus
// Cancel/Close. Duplicate names are preserved and addressed by their page id.
export function FigmaPagePicker({ fileName, pages, busy, onChoose, onCancel }: FigmaPagePickerProps) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={busy ? undefined : onCancel}>
      <div className="modal figma-picker" role="dialog" aria-modal="true" data-testid="figma-page-picker" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>Select Figma page to import</h2>
          <button type="button" className="modal-close" aria-label="Close" data-testid="figma-page-close" disabled={busy} onClick={onCancel}>
            x
          </button>
        </div>
        <p className="note" data-testid="figma-page-source">{fileName}</p>
        <div className="figma-page-list">
          {pages.map((page, position) => (
            <button
              key={page.id + '-' + position}
              type="button"
              className="figma-page-option"
              data-page-id={page.id}
              data-testid={'figma-page-' + position}
              disabled={busy}
              onClick={() => onChoose(page.id)}
            >
              {page.name}
            </button>
          ))}
        </div>
        <div className="button-row" style={{ marginTop: 10 }}>
          <button type="button" className="top-button" data-testid="figma-page-cancel" disabled={busy} onClick={onCancel}>
            {busy ? 'Decoding .fig...' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
