import { useMemo, useState } from 'react';
import type { PenDocument } from '../document/types';
import { layoutDocument } from '../document/layout';

export function Dashboard({ currentFileName, currentDocument, recent, hiddenRecentFileName, showDashboardInput, onClose, onNewFile, onOpenFile, onImportFigma, onImportImage, onOpenRecent, onRemoveRecent }: {
  currentFileName: string;
  currentDocument: PenDocument;
  recent: { fileName: string; document: PenDocument } | null;
  hiddenRecentFileName: string | null;
  showDashboardInput: boolean;
  onClose: () => void;
  onNewFile: () => void;
  onOpenFile: (file: File) => void;
  onImportFigma: (file: File) => void;
  onImportImage: (file: File) => void;
  onOpenRecent: () => void;
  onRemoveRecent: (fileName: string) => void;
}) {
  const [section, setSection] = useState<'Recents' | 'Drafts' | 'Design Systems'>('Recents');
  const [template, setTemplate] = useState('Landing page');
  const [listView, setListView] = useState(false);
  const [recentMenuOpen, setRecentMenuOpen] = useState(false);
  const templates = ['Landing page', 'Mobile app', 'Web app', 'Slides', 'Dashboard', 'Something else...'];
  const chosen = recent ?? { fileName: currentFileName };
  const recentVisible = chosen.fileName !== hiddenRecentFileName;
  const preview = useMemo(() => {
    const layout = layoutDocument(recent?.document ?? currentDocument);
    const nodes = layout.nodes.filter(node => node.width > 0 && node.height > 0);
    if (!nodes.length) return null;
    const left = Math.min(...nodes.map(node => node.absX)), top = Math.min(...nodes.map(node => node.absY));
    const right = Math.max(...nodes.map(node => node.absX + node.width)), bottom = Math.max(...nodes.map(node => node.absY + node.height));
    return <svg viewBox={[left, top, Math.max(right-left,1), Math.max(bottom-top,1)].join(' ')} preserveAspectRatio="xMidYMid meet" aria-hidden="true">{nodes.map(node => {
      const fill = node.style.fill ?? (node.type==='text' ? '#111827' : 'none');
      if(node.type==='text') return <text key={node.id} x={node.absX} y={node.absY+(typeof node.node.fontSize==='number'?node.node.fontSize:14)} fill={fill} fontSize={typeof node.node.fontSize==='number'?node.node.fontSize:14}>{String(node.node.content ?? '')}</text>;
      if(node.type==='ellipse') return <ellipse key={node.id} cx={node.absX+node.width/2} cy={node.absY+node.height/2} rx={node.width/2} ry={node.height/2} fill={fill}/>;
      return <rect key={node.id} x={node.absX} y={node.absY} width={node.width} height={node.height} rx={typeof node.style.cornerRadius==='number'?node.style.cornerRadius:0} fill={fill}/>;
    })}</svg>;
  }, [currentDocument, recent]);
  return <div className="dashboard-view" data-testid="dashboard-view" role="dialog" aria-modal="true" aria-label="Dashboard">
    <aside className="dashboard-sidebar"><div className="dashboard-brand">◧ Fancy Pencil</div>
      <button type="button" aria-label="Recents" aria-pressed={section==='Recents'} onClick={() => setSection('Recents')}>◷  Recents</button>
      <button type="button" aria-label="Drafts" aria-pressed={section==='Drafts'} onClick={() => setSection('Drafts')}>♧  Drafts</button>
      <span className="dashboard-sidebar-label">TEMPLATES</span>
      <button type="button" aria-label="Design Systems" aria-pressed={section==='Design Systems'} onClick={() => setSection('Design Systems')}>◇  Design Systems</button>
    </aside>
    <div className="dashboard-main"><header className="dashboard-header"><strong>Dashboard</strong><div><label className="dashboard-open-file" role="button" tabIndex={0} aria-label="Open File" onKeyDown={event => { if(event.key==='Enter'||event.key===' ')event.currentTarget.querySelector('input')?.click(); }}>Open File<input type="file" accept=".pen,.zip,application/json,application/zip" hidden onChange={event => { const file=event.target.files?.[0]; if(file)onOpenFile(file); event.target.value=''; }} /></label><button type="button" aria-label="New File" data-testid="dashboard-new-file" onClick={onNewFile}>＋ New File</button></div></header>
      <button type="button" className="dashboard-dismiss" aria-label="Dismiss" onClick={onClose}>×</button>
      <div className="dashboard-content"><div className="dashboard-template-row">{templates.map(value=><button type="button" key={value} aria-pressed={template===value} onClick={() => setTemplate(value)}>{value}</button>)}</div>
        {showDashboardInput ? <div className="dashboard-prompt"><textarea aria-label="Design anything" placeholder="Design anything..." /><div className="dashboard-prompt-footer"><span>＋</span><span>⚡1x　▦1x　Claude Opus 5.5　<span aria-hidden="true">↑</span></span></div></div> : null}
        <div className="dashboard-imports"><label role="button" tabIndex={0} aria-label="Import from Figma" onKeyDown={event => { if(event.key==='Enter'||event.key===' ')event.currentTarget.querySelector('input')?.click(); }}>Import from Figma<input type="file" accept=".fig" hidden onChange={event => { const file=event.target.files?.[0]; if(file)onImportFigma(file); event.target.value=''; }} /></label><button type="button" disabled title="Browser import requires the OpenEditor browser capability">Import from browser</button><label role="button" tabIndex={0} aria-label="Recreate a screenshot" onKeyDown={event => { if(event.key==='Enter'||event.key===' ')event.currentTarget.querySelector('input')?.click(); }}>Recreate a screenshot<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { const file=event.target.files?.[0]; if(file)onImportImage(file); event.target.value=''; }} /></label></div>
        <div className="dashboard-section-heading"><strong>{section.toUpperCase()}</strong><div><button type="button" aria-label="Grid view" aria-pressed={!listView} onClick={() => setListView(false)}>▦</button><button type="button" aria-label="List view" aria-pressed={listView} onClick={() => setListView(true)}>☷</button></div></div>
        {section==='Recents' ? <div className={'dashboard-recents'+(listView?' list':'')}>{recentVisible ? <div className="dashboard-recent-item"><button type="button" className="dashboard-recent-card" onClick={recent ? onOpenRecent : onClose}><span className="dashboard-recent-preview">{preview ?? '▣'}</span><strong>{chosen.fileName}</strong><span>Local document</span></button><button type="button" className="dashboard-recent-more" aria-label="More actions" aria-expanded={recentMenuOpen} onClick={() => setRecentMenuOpen(value => !value)}>•••</button>{recentMenuOpen ? <div className="dashboard-recent-menu" role="menu"><button type="button" role="menuitem" onClick={recent ? onOpenRecent : onClose}>Open</button><button type="button" role="menuitem" disabled title="The browser cannot reveal a file without a local file handle">Reveal in Finder</button><button type="button" role="menuitem" onClick={() => { onRemoveRecent(chosen.fileName); setRecentMenuOpen(false); }}>Remove from Recents</button><button type="button" role="menuitem" disabled title="Deletion of an original file requires a local file handle">Delete Draft</button></div> : null}</div> : null}</div> : <p className="dashboard-empty">{section==='Drafts'?'No other local drafts yet.':'Design systems are available in the Libraries panel.'}</p>}
      </div>
    </div>
  </div>;
}
