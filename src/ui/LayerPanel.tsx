import { useEffect, useState } from 'react';
import type { AgentMessage } from './AgentComposer';
import type { PenDocument, PenNode } from '../document/types';
import type { LayoutResult } from '../document/layout';
import { LibrariesPanel, type BuiltInLibrary } from './LibrariesPanel';
import { exportSlidesPdf } from '../document/pdfExport';

export interface LayerPanelProps {
  open: boolean;
  document: PenDocument;
  layout: LayoutResult;
  selectedIds: string[];
  onSelect: (id: string) => void;
  onImportLibrary: (library: BuiltInLibrary) => void;
  onTurnIntoLibrary: () => void;
  onPresentSlides: (index: number) => void;
  fileName: string;
  agentMessages: AgentMessage[];
  agentRequest: number;
  onNewAgent: () => void;
}

export function LayerPanel({ open, document, layout, selectedIds, onSelect, onImportLibrary, onTurnIntoLibrary, onPresentSlides, fileName, agentMessages, agentRequest, onNewAgent }: LayerPanelProps) {
  const [tab, setTab] = useState<'Agent' | 'Layers' | 'Components' | 'Libraries' | 'Slides'>('Layers');
  useEffect(() => { if (agentRequest > 0) setTab('Agent'); }, [agentRequest]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportError, setExportError] = useState('');
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const selected = new Set(selectedIds);
  const reusable: PenNode[] = [];
  const collectReusable = (nodes: readonly PenNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'frame' && node.reusable === true) reusable.push(node);
      if (Array.isArray(node.children)) collectReusable(node.children);
    }
  };
  collectReusable(document.children ?? []);
  const names = new Map<string, string>();
  const collectNames = (nodes: readonly PenNode[]): void => {
    for (const node of nodes) {
      if (typeof node.name === 'string') names.set(node.id, node.name);
      if (Array.isArray(node.children)) collectNames(node.children);
    }
  };
  collectNames(document.children ?? []);
  reusable.sort((a, b) => String(a.name ?? a.id).localeCompare(String(b.name ?? b.id)));
  const slides = layout.nodes.filter(node => node.parentId === null && (node.type === 'frame' || node.type === 'ref'));
  const selectedSlides = slides.filter(slide => selected.has(slide.id));
  const exportPdf = (items: typeof slides): void => { setExportMenuOpen(false); exportSlidesPdf(layout, items, fileName).catch(error => setExportError(error instanceof Error ? error.message : String(error))); };
  const preview = (component: PenNode): JSX.Element => {
    const root = layout.byId.get(component.id);
    if (!root) return <span aria-hidden="true">◇</span>;
    const descendants = layout.nodes.filter((item) => {
      let parent = item.parentId;
      while (parent) {
        if (parent === component.id) return true;
        parent = layout.byId.get(parent)?.parentId ?? null;
      }
      return false;
    });
    const width = Math.max(root.width, 1), height = Math.max(root.height, 1);
    return <svg viewBox={'0 0 ' + width + ' ' + height} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {[root, ...descendants].map((item) => {
        const x = item.absX - root.absX, y = item.absY - root.absY;
        const fill = item.style.fill ?? (item.type === 'text' ? '#111827' : 'none');
        if (item.type === 'text') return <text key={item.id} x={x} y={y + (typeof item.node.fontSize === 'number' ? item.node.fontSize : 14)} fill={fill} fontSize={typeof item.node.fontSize === 'number' ? item.node.fontSize : 14}>{String(item.node.content ?? '')}</text>;
        if (item.type === 'ellipse') return <ellipse key={item.id} cx={x + item.width / 2} cy={y + item.height / 2} rx={item.width / 2} ry={item.height / 2} fill={fill} />;
        return <rect key={item.id} x={x} y={y} width={item.width} height={item.height} rx={typeof item.style.cornerRadius === 'number' ? item.style.cornerRadius : 0} fill={fill} />;
      })}
    </svg>;
  };

  const renderRows = (nodes: readonly PenNode[], depth: number): JSX.Element[] =>
    [...nodes].reverse().map((node) => {
      const label = String(node.name ?? (node.type === 'ref' && typeof node.ref === 'string' ? names.get(node.ref) : null) ?? node.id);
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const positioned = layout.byId.get(node.id);
      const unsupported = positioned ? positioned.unsupported : false;
      return (
        <div key={node.id}>
          <div className="layer-line" style={{ paddingLeft: depth * 10 }}>
            {hasChildren ? <button type="button" className="layer-disclosure" aria-label={'Toggle ' + label} aria-expanded={expandedIds.has(node.id)} data-testid={'layer-toggle-' + node.id} onClick={() => setExpandedIds(current => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; })}>{expandedIds.has(node.id) ? '⌄' : '›'}</button> : <span className="layer-disclosure-space" />}
            <button type="button" className="layer-row" aria-label={label} aria-selected={selected.has(node.id)} data-testid={'layer-' + node.id} onClick={() => onSelect(node.id)}>
              <span className="layer-icon" aria-hidden="true">{node.type === 'text' ? 'T' : node.type === 'ref' ? '◇' : '□'}</span>
              <span className="layer-name">{label}</span>
              {unsupported ? <span className="layer-warning" aria-label="Unsupported">!</span> : null}
            </button>
          </div>
          {hasChildren ? <div className="layer-children" style={{ display: expandedIds.has(node.id) ? undefined : 'none' }}>{renderRows(node.children ?? [], depth + 1)}</div> : null}
        </div>
      );
    });

  return (
    <aside className="layer-panel" data-open={open ? 'true' : 'false'} aria-label="Layers and Components">
      <div className="panel-tabs">
        <button type="button" data-testid="tab-agent" aria-label="Agent" aria-pressed={tab === 'Agent'} onClick={() => setTab('Agent')}><span aria-hidden="true">♧</span>{tab === 'Agent' ? <span>Agent</span> : null}</button>
        <button type="button" data-testid="tab-layers" aria-label="Layers" aria-pressed={tab === 'Layers'} onClick={() => setTab('Layers')}><span aria-hidden="true">▱</span>{tab === 'Layers' ? <span>Layers</span> : null}</button>
        <button type="button" data-testid="tab-slides" aria-label="Slides" aria-pressed={tab === 'Slides'} onClick={() => setTab('Slides')}><span aria-hidden="true">⚑</span>{tab === 'Slides' ? <span>Slides</span> : null}</button>
        <button type="button" data-testid="tab-components" aria-label="Components" aria-pressed={tab === 'Components'} onClick={() => setTab('Components')}><span aria-hidden="true">◇</span>{tab === 'Components' ? <span>Components</span> : null}</button>
        <button type="button" data-testid="tab-libraries" aria-label="Libraries" aria-pressed={tab === 'Libraries'} onClick={() => setTab('Libraries')}><span aria-hidden="true">Ⅲ</span>{tab === 'Libraries' ? <span>Libraries</span> : null}</button>
      </div>
      {tab === 'Agent' ? <div className="agent-panel" data-testid="agent-panel"><div className="agent-session-head"><button type="button" onClick={onNewAgent}>New Agent⌄</button><button type="button" onClick={onNewAgent}>＋ New</button></div>{agentMessages.length ? <div className="agent-messages">{agentMessages.map((message,index)=><div key={index}><p>{message.text}</p><small>{message.model} · Waiting for OpenEditor</small></div>)}</div> : <div className="agent-suggestions"><h3>Ask me to design anything</h3>{['Bold magazine-style blog for urban skateboarding culture','Playful ordering app for matcha cakes','Cozy mobile app for tracking houseplants and watering schedules','Vintage ticketing site for an independent arthouse cinema','Retro-futuristic landing page for a private space tourism company'].map(item=><p key={item}>{item}</p>)}<h3>How to export to code.</h3><p>Click the folder next to file name and ask to generate code from the design.</p><h3>Attach context files.</h3><p>Drop a PNG/JPG, DESIGN.md or any text file here or attach via +</p></div>}</div> : tab === 'Slides' ? <div className="slides-panel" data-testid="slides-panel">
        {slides.map((slide,index) => <button type="button" key={slide.id} data-testid={'slide-item-'+index} className="slide-item" aria-label={String(slide.node.name ?? (slide.type === 'ref' ? layout.byId.get(String(slide.node.ref ?? ''))?.node.name : null) ?? slide.id)} aria-pressed={index===activeSlide} onClick={() => { setActiveSlide(index); onSelect(slide.id); }}><span>{index+1}</span><span className="slide-item-preview">{preview(slide.node)}</span></button>)}
        {exportError ? <p role="alert" className="note">{exportError}</p> : null}
        <div className="slide-actions"><button type="button" data-testid="present-slides" disabled={slides.length===0} onClick={() => onPresentSlides(activeSlide)}>Present</button><button type="button" data-testid="export-slides-pdf" aria-label="Export PDF" aria-expanded={exportMenuOpen} onClick={() => setExportMenuOpen(value => !value)}>Export PDF⌄</button>{exportMenuOpen ? <div role="menu" className="slide-export-menu" data-testid="slide-export-menu"><button type="button" role="menuitem" onClick={() => exportPdf(slides)}>Export all slides</button><button type="button" role="menuitem" disabled={selectedSlides.length===0} onClick={() => exportPdf(selectedSlides)}>Export selected slides ({selectedSlides.length})</button></div> : null}</div>
      </div> : tab === 'Libraries' ? <LibrariesPanel document={document} onImport={onImportLibrary} onTurnIntoLibrary={onTurnIntoLibrary} /> : tab === 'Layers' ? renderRows(document.children ?? [], 0) : <>
        <input className="component-search" aria-label="Search components" placeholder="Search components..." value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" className="component-create" onClick={() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, altKey: true, bubbles: true })); }}>◇ Create Component</button>
        <div className="component-list" data-testid="component-list">
          {reusable.length === 0 ? <p className="note">Create a component from a selected frame.</p> : null}
          {reusable.filter((component) => String(component.name ?? component.id).toLowerCase().includes(query.toLowerCase())).map((component) => (
            <div
              key={component.id}
              className="component-card"
              data-testid={'component-card-' + component.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('application/x-pen-component-id', component.id);
                event.dataTransfer.effectAllowed = 'copy';
              }}
            >
              <div className="component-thumbnail">{preview(component)}</div>
              <span>{String(component.name ?? component.id)}</span>
            </div>
          ))}
        </div>
      </>}
    </aside>
  );
}
