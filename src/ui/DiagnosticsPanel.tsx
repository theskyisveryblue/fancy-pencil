import type { Diagnostic } from '../document/diagnostics';
import { summarizeDiagnostics } from '../document/diagnostics';

export interface DiagnosticsPanelProps {
  diagnostics: readonly Diagnostic[];
  onOpenAll: () => void;
  limit?: number;
}

const MARKER: Record<Diagnostic['level'], string> = { info: 'i', warning: '!', error: 'x' };

export function DiagnosticsPanel({ diagnostics, onOpenAll, limit = 6 }: DiagnosticsPanelProps) {
  const summary = summarizeDiagnostics(diagnostics);
  if (diagnostics.length === 0) {
    return <p className="note">No unsupported sizing, layout or feature diagnostics for this document.</p>;
  }
  const shown = diagnostics.slice(0, limit);
  return (
    <div>
      <p className="note">
        {summary.errors} error(s), {summary.warnings} warning(s), {summary.infos} note(s).
      </p>
      <div className="diagnostics-list">
        {shown.map((diagnostic, index) => (
          <div key={diagnostic.code + index} className={'diagnostic ' + diagnostic.level}>
            <span className="marker">{MARKER[diagnostic.level]}</span>
            <span>
              {diagnostic.nodeName ? <strong>{diagnostic.nodeName}: </strong> : null}
              {diagnostic.message}
            </span>
          </div>
        ))}
      </div>
      {diagnostics.length > shown.length ? (
        <button type="button" className="top-button" onClick={onOpenAll}>
          Show all {diagnostics.length} diagnostics
        </button>
      ) : null}
    </div>
  );
}
