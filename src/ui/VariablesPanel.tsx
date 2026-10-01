import { useEffect, useState } from 'react';
import type { PenDocument, PenVariable } from '../document/types';
import { readThemedValue } from '../document/variables';

interface Props {
  document: PenDocument;
  onClose: () => void;
  onCommit: (name: string, mode: string, value: string) => void;
  onAdd: (type: PenVariable['type']) => void;
}

function ValueInput({ name, mode, value, type, onCommit }: { name: string; mode: string; value: unknown; type: PenVariable['type']; onCommit: Props['onCommit'] }) {
  const displayed = String(value ?? '');
  const [text, setText] = useState(displayed);
  useEffect(() => setText(displayed), [displayed]);
  return <span className="variable-cell">
    {type === 'color' ? <span className="variable-swatch" style={{ background: /^#[0-9a-fA-F]{6}$/.test(text) ? text : '#fff' }} /> : null}
    <input aria-label={name + ' ' + mode} data-testid={'variable-' + name + '-' + mode} value={text} onChange={(event) => setText(event.target.value)} onBlur={() => onCommit(name, mode, text)} onKeyDown={(event) => {
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') { setText(displayed); event.currentTarget.blur(); }
    }} />
  </span>;
}

export function VariablesPanel({ document, onClose, onCommit, onAdd }: Props) {
  const modes = document.themes?.mode?.length ? document.themes.mode : ['light', 'dark'];
  const [addOpen, setAddOpen] = useState(false);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return <section className="variables-panel" data-testid="variables-panel" aria-label="Variables">
    <header className="variables-header"><strong>mode</strong><span>⌄</span><span className="variables-spacer" /><button type="button" data-testid="variables-close" aria-label="Close variables" onClick={onClose}>×</button></header>
    <div className="variables-grid">
      <div className="variables-row variables-head"><span>Name</span>{modes.map(mode => <span key={mode}>{mode}</span>)}</div>
      {Object.entries(document.variables ?? {}).map(([name, variable]) => <div className="variables-row" key={name}>
        <span className="variable-name"><span aria-hidden="true">{variable.type === 'color' ? '♧' : variable.type === 'number' ? '#' : variable.type === 'boolean' ? '◉' : 'T'}</span>{name}</span>
        {modes.map(mode => <ValueInput key={mode} name={name} mode={mode} type={variable.type} value={readThemedValue(variable, mode)} onCommit={onCommit} />)}
      </div>)}
    </div>
    <footer className="variables-footer"><button type="button" data-testid="variables-add" onClick={() => setAddOpen(value => !value)}>＋ Add variable ⌄</button>
      {addOpen ? <div className="variables-add-menu">{(['color','number','string','boolean'] as const).map(type => <button type="button" key={type} onClick={() => { onAdd(type); setAddOpen(false); }}>Add {type}</button>)}</div> : null}
    </footer>
  </section>;
}
