import { Fragment, useState } from 'react';
import type { EditorTool } from '../document/defaults';
import { TOOLBAR_ITEMS } from './catalog';
import { Icon } from './Icon';

export interface ToolbarProps {
  tool: EditorTool;
  layersOpen: boolean;
  onTool: (tool: EditorTool) => void;
  onToggleLayers: () => void;
  onShortcuts: () => void;
  onVariables: () => void;
  onImportFigma: (file: File) => void;
  onImportImage: (file: File) => void;
  onImportSvg: (file: File) => void;
}

export function Toolbar({ tool, layersOpen, onTool, onToggleLayers, onShortcuts, onVariables, onImportFigma, onImportImage, onImportSvg }: ToolbarProps) {
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [primitivesMenuOpen, setPrimitivesMenuOpen] = useState(false);
  return (
    <div className="tool-rail" role="toolbar" aria-label="Tools">
      {TOOLBAR_ITEMS.map((item) => {
        const inert = item.parity === 'inert';
        const active = item.action === 'toggle-layers' ? layersOpen : item.id === 'move' ? tool === 'move' || tool === 'scale' : item.tool === tool;
        const title = inert ? item.label + ' is not available in this editor' : item.label;
        return (
          <Fragment key={item.id}><button
            key={item.id}
            type="button"
            className="tool-button"
            data-testid={'tool-' + item.id}
            data-inert={inert ? 'true' : 'false'}
            aria-disabled={inert}
            aria-pressed={active}
            aria-label={item.id === 'move' && tool === 'scale' ? 'Scale' : item.label}
            title={title}
            onClick={() => {
              if (inert) return;
              if (item.action === 'toggle-layers') onToggleLayers();
              else if (item.action === 'shortcuts') onShortcuts();
              else if (item.action === 'variables') onVariables();
              else if (item.tool) { onTool(item.tool); setMoveMenuOpen(false); setPrimitivesMenuOpen(false); }
            }}
          >
            <Icon name={item.id === 'toggle-layer-list' ? 'layers' : item.id} />
            {item.shortcut ? <span className="tool-shortcut">{item.shortcut}</span> : null}
          </button>
          {item.id === 'move' ? <div className="move-tool-dropdown">
            <button type="button" aria-label="Move Tools" data-testid="move-tools-menu" aria-expanded={moveMenuOpen} onClick={() => setMoveMenuOpen(value => !value)}>⌄</button>
            {moveMenuOpen ? <div role="menu" className="move-tool-menu" data-testid="move-tool-menu">
              <button type="button" role="menuitemradio" aria-checked={tool === 'move'} onClick={() => { onTool('move'); setMoveMenuOpen(false); }}>Move <kbd>V</kbd></button>
              <button type="button" role="menuitemradio" aria-checked={tool === 'scale'} onClick={() => { onTool('scale'); setMoveMenuOpen(false); }}>Scale <kbd>K</kbd></button>
            </div> : null}
          </div> : null}
          {item.id === 'rectangle' ? <div className="primitives-tool-dropdown">
            <button type="button" aria-label="Primitives" data-testid="primitives-menu-button" aria-expanded={primitivesMenuOpen} onClick={() => setPrimitivesMenuOpen(value => !value)}>⌄</button>
            {primitivesMenuOpen ? <div role="menu" className="primitives-tool-menu" data-testid="primitives-menu">
              <button type="button" role="menuitemradio" aria-checked={tool === 'rectangle'} onClick={() => { onTool('rectangle'); setPrimitivesMenuOpen(false); }}>Rectangle <kbd>R</kbd></button>
              <button type="button" role="menuitemradio" aria-checked={tool === 'ellipse'} onClick={() => { onTool('ellipse'); setPrimitivesMenuOpen(false); }}>Ellipse <kbd>O</kbd></button>
              <button type="button" role="menuitemradio" aria-checked={tool === 'polygon'} onClick={() => { onTool('polygon'); setPrimitivesMenuOpen(false); }}>Polygon</button>
              <button type="button" role="menuitemradio" aria-checked={tool === 'icon'} onClick={() => { onTool('icon'); setPrimitivesMenuOpen(false); }}>Icon</button>
              <button type="button" role="menuitemradio" aria-checked={tool === 'script'} onClick={() => { onTool('script'); setPrimitivesMenuOpen(false); }}>Script</button>
              <label className="primitives-import" role="menuitem" data-testid="primitives-import-asset">Import Image or SVG…<input type="file" accept=".png,.jpg,.jpeg,.gif,.webp,.svg,image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden data-testid="primitives-import-asset-input" onChange={event => { const file = event.target.files?.[0]; if (file) (/\.svg$/i.test(file.name) ? onImportSvg : onImportImage)(file); event.target.value = ''; setPrimitivesMenuOpen(false); }} /></label>
              <label className="primitives-import" role="menuitem" data-testid="primitives-import-figma">Import Figma<input type="file" accept=".fig" hidden data-testid="primitives-import-figma-input" onChange={event => { const file = event.target.files?.[0]; if (file) onImportFigma(file); event.target.value = ''; setPrimitivesMenuOpen(false); }} /></label>
            </div> : null}
          </div> : null}</Fragment>
        );
      })}
    </div>
  );
}
