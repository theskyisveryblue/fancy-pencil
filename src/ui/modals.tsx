import type { Diagnostic } from '../document/diagnostics';
import { summarizeDiagnostics } from '../document/diagnostics';
import { SHORTCUT_GROUPS } from './catalog';

export type ModalKind = 'shortcuts' | 'diagnostics' | null;

export interface ModalsProps {
  kind: ModalKind;
  onClose: () => void;
  diagnostics: Diagnostic[];
}

const MARKER: Record<Diagnostic['level'], string> = { info: 'i', warning: '!', error: 'x' };

export function Modals({ kind, onClose, diagnostics }: ModalsProps) {
  if (!kind) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>{kind === 'shortcuts' ? 'Keyboard shortcuts' : 'Document diagnostics'}</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>

        {kind === 'shortcuts' ? (
          <div className="shortcut-groups">
            {SHORTCUT_GROUPS.map((group) => (
              <div key={group.title} className="shortcut-group">
                <h3>{group.title}</h3>
                {group.rows.map((row) => (
                  <div key={row.label} className="shortcut-row">
                    <span>{row.implemented ? row.label : row.label + ' (unavailable)'}</span>
                    <span className="shortcut-keys">{row.keys}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}

        {kind === 'diagnostics' ? (
          <div>
            <p className="note">{summarizeDiagnostics(diagnostics).errors} error(s), {summarizeDiagnostics(diagnostics).warnings} warning(s), {summarizeDiagnostics(diagnostics).infos} note(s).</p>
            <div className="diagnostics-list">
              {diagnostics.map((diagnostic, index) => (
                <div key={diagnostic.code + index} className={'diagnostic ' + diagnostic.level}>
                  <span className="marker">{MARKER[diagnostic.level]}</span>
                  <span>
                    {diagnostic.nodeName ? <strong>{diagnostic.nodeName}: </strong> : null}
                    {diagnostic.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
