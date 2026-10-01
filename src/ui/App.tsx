import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import { createEmptyDocument, type Box, type CreateTool, type EditorTool } from '../document/defaults';
import { InsertNodeCommand, SetImportsCommand } from '../document/commands';
import { generateId } from '../document/ids';
import type { BuiltInLibrary } from './LibrariesPanel';
import { SlidePresentation } from './SlidePresentation';
import { Dashboard } from './Dashboard';
import { BrowserView } from './BrowserView';
import { GoodiesDialog, type Goodie } from './GoodiesDialog';
import goodiesNodes from './goodiesCatalog.json';
import { AgentComposer, type AgentContext, type AgentMessage } from './AgentComposer';
import { SettingsDialog, loadPreferences, type EditorPreferences } from './SettingsDialog';
import { ShareModal } from './ShareModal';
import { loadShareSnapshot } from './shareApi';
import { analyzeDocument } from '../document/diagnostics';
import { convertFigmaPage, figmaImportNotice, figmaPenFileName, parseFigmaBlob, type FigmaPageRef } from '../document/figmaImport';
import { layoutDocument } from '../document/layout';
import { downloadPenFile, readFileAsText, savePersistedDocument } from '../document/persistence';
import { parsePenFile } from '../document/serialize';
import { importImageAsset, openPenBundle, putImageAsset, savePenBundle } from '../document/imageAssets';
import { importSvg } from '../document/svgImport';
import type { PenDocument, PenNode } from '../document/types';
import { FigmaPagePicker } from './FigmaPagePicker';
import { useDocumentAutosave } from '../state/autosave';
import { useEditorStore } from '../state/editorStore';
import { useEditorShortcuts } from '../state/shortcuts';
import { CanvasView, type GeometryPatch, type PathPoint } from './CanvasView';
import { Icon } from './Icon';
import { LayerPanel } from './LayerPanel';
import { Modals, type ModalKind } from './modals';
import { PropertiesPanel } from './PropertiesPanel';
import { Toolbar } from './Toolbar';
import { VariablesPanel } from './VariablesPanel';
import { TopBar } from './TopBar';

export interface AppProps {
  initialDocument?: PenDocument;
  initialFileName?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function App({ initialDocument, initialFileName = 'untitled.pen' }: AppProps) {
  const store = useEditorStore({ document: initialDocument ?? createEmptyDocument(), fileName: initialFileName });
  const [tool, setTool] = useState<EditorTool>('move');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: window.innerWidth >= 1100 ? 450 : 24, y: 24 });
  const [layersOpen, setLayersOpen] = useState(true);
  const [modal, setModal] = useState<ModalKind>(null);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [presentIndex, setPresentIndex] = useState<number | null>(null);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [browserViewOpen, setBrowserViewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goodiesOpen, setGoodiesOpen] = useState(false);
  const [goodiesInitialTab, setGoodiesInitialTab] = useState<'Featured' | 'Styles'>('Featured');
  const [agentContexts, setAgentContexts] = useState<AgentContext[]>([]);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [agentRequest, setAgentRequest] = useState(0);
  const [preferences, setPreferences] = useState<EditorPreferences>(loadPreferences);
  const updatePreferences = (next: EditorPreferences) => { setPreferences(next); try { localStorage.setItem('pen-clone.preferences.v1', JSON.stringify(next)); } catch { /* Session settings still work. */ } };
  const [browserCodingMode, setBrowserCodingMode] = useState(false);
  const [hiddenRecentFileName, setHiddenRecentFileName] = useState<string | null>(() => { try { return localStorage.getItem('pen-clone.hidden-recent.v1'); } catch { return null; } });
  const [recentDocument, setRecentDocument] = useState<{ fileName: string; document: PenDocument } | null>(() => { try { const raw=localStorage.getItem('pen-clone.recent-document.v1'); if(!raw)return null; const value=JSON.parse(raw); return value&&typeof value.fileName==='string'&&parsePenFile(JSON.stringify(value.document)).ok ? value : null; } catch { return null; } });
  const [notice, setNotice] = useState<string | null>(null);
  const [figmaPicker, setFigmaPicker] = useState<{ fileName: string; pages: FigmaPageRef[]; blob: Blob } | null>(null);
  const [figmaBusy, setFigmaBusy] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const layout = useMemo(() => layoutDocument(store.document, { themeMode: store.themeMode }), [store.document, store.themeMode]);
  const analysis = useMemo(() => analyzeDocument(store.document), [store.document]);
  const autosave = useDocumentAutosave(store.document, store.fileName);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('share');
    if (!id) return;
    let live = true;
    loadShareSnapshot(id).then(snapshot => {
      if (!live) return;
      const parsed = parsePenFile(JSON.stringify(snapshot.document));
      if (!parsed.ok || !parsed.document) throw new Error('Shared snapshot failed document validation.');
      store.loadDocument(parsed.document, snapshot.fileName);
      setNotice('Viewing frozen snapshot. Edits remain local to this editor.');
    }).catch((error: Error) => { if (live) setNotice(error.message); });
    return () => { live = false; };
  }, []);

  const zoomTo = useCallback(
    (scale: number) => {
      const element = viewportRef.current;
      const next = clamp(round2(scale), 0.05, 8);
      if (!element) {
        setZoom(next);
        return;
      }
      const rect = element.getBoundingClientRect();
      const center = { x: (rect.width / 2 - pan.x) / zoom, y: (rect.height / 2 - pan.y) / zoom };
      setZoom(next);
      setPan({ x: rect.width / 2 - center.x * next, y: rect.height / 2 - center.y * next });
    },
    [pan.x, pan.y, zoom],
  );

  const zoomBy = useCallback((factor: number) => {
    setZoom((current) => clamp(round2(current * factor), 0.05, 8));
  }, []);

  const zoomToFit = useCallback(() => {
    const element = viewportRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const padding = 64;
    const width = Math.max(1, layout.bounds.maxX - layout.bounds.minX);
    const height = Math.max(1, layout.bounds.maxY - layout.bounds.minY);
    const scale = clamp(Math.min((rect.width - padding * 2) / width, (rect.height - padding * 2) / height), 0.05, 4);
    setZoom(round2(scale));
    setPan({ x: padding - layout.bounds.minX * scale, y: padding - layout.bounds.minY * scale });
  }, [layout.bounds]);

  const applyLoadedText = useCallback(
    (text: string, fileName: string, source: string) => {
      const result = parsePenFile(text);
      if (!result.ok || !result.document) {
        // Invalid imports never replace the currently open document.
        setNotice('Import rejected (' + source + '): ' + result.errors.join(' '));
        return;
      }
      store.loadDocument(result.document, fileName);
      setNotice(
        result.warnings.length > 0
          ? 'Imported ' + source + ' with ' + result.warnings.length + ' warning(s): ' + result.warnings.join(' ')
          : 'Imported ' + source + '.',
      );
    },
    [store],
  );

  const onOpenFile = useCallback(
    (file: File) => {
      (file.name.toLowerCase().endsWith('.zip') ? openPenBundle(file) : readFileAsText(file).then(text => ({ text, fileName: file.name })))
        .then(({ text, fileName }) => applyLoadedText(text, fileName, file.name))
        .catch((error: Error) => setNotice('Unable to read ' + file.name + ': ' + error.message));
    },
    [applyLoadedText],
  );

  const onOpenFixture = useCallback(() => {
    fetch('audit-primitives.pen', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then((text) => applyLoadedText(text, 'audit-primitives.pen', 'audit-primitives.pen'))
      .catch((error: Error) => setNotice('Unable to load the audit fixture: ' + error.message));
  }, [applyLoadedText]);

  // Native Figma import: keep the raw .fig Blob, open the real page picker,
  // then decode + convert ONLY the chosen page. Nothing is loaded or persisted
  // until a page is chosen and saved.
  const beginFigmaImport = useCallback((file: File) => {
    setNotice('Reading ' + file.name + '...');
    parseFigmaBlob(file)
      .then((parsed) => {
        if (!parsed.ok) {
          setNotice('Figma import rejected (' + file.name + '): ' + parsed.error);
          return;
        }
        setNotice(null);
        setFigmaPicker({ fileName: file.name, pages: parsed.pages, blob: file });
      })
      .catch((error: Error) => setNotice('Unable to read ' + file.name + ': ' + error.message));
  }, []);

  const onImportFigma = useCallback((file: File) => beginFigmaImport(file), [beginFigmaImport]);
  const onImportImage = useCallback((file: File) => {
    importImageAsset(file).then(({ path, width, height }) => {
      const id = generateId();
      const selected = store.selectedIds.length === 1 ? layout.byId.get(store.selectedIds[0]) : undefined;
      const parentId = selected && (selected.type === 'frame' || selected.type === 'group') ? selected.id : null;
      store.dispatch(new InsertNodeCommand({ parentId, node: { type: 'rectangle', id, width, height, fill: { type: 'image', enabled: true, url: path, mode: 'fill' } } }));
      store.select([id]);
      setNotice('Imported ' + file.name + '.');
    }).catch((error: Error) => setNotice('Image import failed: ' + error.message));
  }, [layout.byId, store]);

  const onImportSvg = useCallback((file: File) => {
    file.text().then(text => {
      const node = importSvg(text, file.name, generateId);
      const selected = store.selectedIds.length === 1 ? layout.byId.get(store.selectedIds[0]) : undefined;
      const parentId = selected && (selected.type === 'frame' || selected.type === 'group') ? selected.id : null;
      store.dispatch(new InsertNodeCommand({ parentId, node }));
      store.select([node.id]);
      setNotice('Imported ' + file.name + '.');
    }).catch((error: Error) => setNotice('SVG import failed: ' + error.message));
  }, [layout.byId, store]);

  const chooseFigmaPage = useCallback(
    (pageId: string) => {
      if (!figmaPicker) return;
      setFigmaBusy(true);
      parseFigmaBlob(figmaPicker.blob)
        .then(async (parsed) => {
          if (!parsed.ok) {
            setNotice('Figma import rejected (' + figmaPicker.fileName + '): ' + parsed.error);
            setFigmaBusy(false);
            return;
          }
          const conversion = convertFigmaPage(parsed.document, pageId);
          if (!conversion) {
            setNotice('Figma page ' + pageId + ' could not be converted.');
            setFigmaBusy(false);
            return;
          }
          await Promise.all(conversion.assets.map(asset => putImageAsset(asset.path, asset.bytes, asset.mime)));
          store.loadDocument(conversion.document, figmaPenFileName(figmaPicker.fileName));
          setNotice(figmaImportNotice(conversion));
          setFigmaPicker(null);
          setFigmaBusy(false);
        })
        .catch((error: Error) => {
          setNotice('Unable to decode ' + figmaPicker.fileName + ': ' + error.message);
          setFigmaBusy(false);
        });
    },
    [figmaPicker, store],
  );

  const onCanvasDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const file = event.dataTransfer.files && event.dataTransfer.files[0];
      if (!file) return;
      if (!/\.fig$/i.test(file.name)) return;
      event.preventDefault();
      event.stopPropagation();
      beginFigmaImport(file);
    },
    [beginFigmaImport],
  );

  const onNewFile = useCallback(() => {
    const recent = { fileName: store.fileName, document: store.document };
    setRecentDocument(recent);
    setHiddenRecentFileName(null);
    try { localStorage.removeItem('pen-clone.hidden-recent.v1'); localStorage.setItem('pen-clone.recent-document.v1', JSON.stringify(recent)); } catch { /* Current document remains available in memory. */ }
    store.loadDocument(createEmptyDocument(), 'untitled.pen');
    setDashboardOpen(false);
    setNotice('Created untitled.pen.');
  }, [store]);


  const onOpenWorkspaceFolder = useCallback(() => {
    const picker = (window as Window & { showDirectoryPicker?: (options?: { mode?: string }) => Promise<{ name: string }> }).showDirectoryPicker;
    if (!picker) { setNotice('Folder access is unavailable in this browser.'); return; }
    picker({ mode: 'readwrite' }).then(handle => setNotice('Workspace folder: ' + handle.name)).catch((error: Error) => { if (error.name !== 'AbortError') setNotice('Unable to open workspace folder: ' + error.message); });
  }, []);

  const onSave = useCallback(() => {
    const persisted = savePersistedDocument(store.document, store.fileName);
    savePenBundle(store.document, store.fileName).then((hasImages) => {
      const downloaded = hasImages ? true : downloadPenFile(store.document, store.fileName);
      setNotice(downloaded ? 'Saved ' + store.fileName + (hasImages ? ' with image assets.' : '.') : persisted.ok ? 'Saved to local storage (download unavailable).' : 'Save failed.');
    }).catch((error: Error) => setNotice('Save failed: ' + error.message));
  }, [store.document, store.fileName]);

  useEditorShortcuts({
    undo: store.undo,
    redo: store.redo,
    selectAll: () => store.select(layout.nodes.filter((node) => !node.insideInstance).map((node) => node.id)),
    deleteSelection: store.deleteSelection,
    duplicate: store.duplicateSelection,
    detach: store.detachSelection,
    createComponent: store.createComponent,
    deselect: store.clearSelection,
    nudge: store.nudge,
    smallNudge: preferences.smallNudge,
    bigNudge: preferences.bigNudge,
    setTool,
    zoomBy,
    zoomTo,
    zoomToFit,
    reorder: store.reorderSelection,
  });

  const selectedNode = store.selectedIds.length === 1 ? layout.byId.get(store.selectedIds[0]) ?? null : null;

  return (
    <div className={'app-shell'+(browserViewOpen?' browser-view-open':'')+(browserCodingMode?' browser-coding-mode':'')}>
      <TopBar fileName={store.fileName} saveStatus={autosave.status} onOpenFile={onOpenFile} onOpenFixture={onOpenFixture} onImportFigma={onImportFigma} onShare={() => setShareModalOpen(true)} onPresent={() => setPresentIndex(0)} onOpenWorkspaceFolder={onOpenWorkspaceFolder} onDashboard={() => setDashboardOpen(true)} onBrowserView={() => setBrowserViewOpen(value => !value)} onSettings={() => setSettingsOpen(true)} onGoodies={() => {setGoodiesInitialTab('Featured');setGoodiesOpen(true)}} onAgents={() => setAgentRequest(value=>value+1)} />
      <div
        className="body"
        data-testid="figma-drop-zone"
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault();
        }}
        onDrop={onCanvasDrop}
      >
        <Toolbar
          tool={tool}
          layersOpen={layersOpen}
          onTool={setTool}
          onToggleLayers={() => setLayersOpen((value) => !value)}
          onShortcuts={() => setModal('shortcuts')}
          onVariables={() => setVariablesOpen(value => !value)}
          onImportFigma={onImportFigma}
          onImportImage={onImportImage}
          onImportSvg={onImportSvg}
        />
        <LayerPanel open={layersOpen} document={store.document} layout={layout} selectedIds={store.selectedIds} onSelect={(id) => store.select([id])} onImportLibrary={(library: BuiltInLibrary) => { const before = store.document.imports; if (before?.[library.key] !== library.uri) store.dispatch(new SetImportsCommand(before, { ...before, [library.key]: library.uri })); }} onTurnIntoLibrary={() => setLibraryModalOpen(true)} onPresentSlides={setPresentIndex} fileName={store.fileName} agentMessages={agentMessages} agentRequest={agentRequest} onNewAgent={() => {setAgentMessages([]);setAgentContexts([])}} />
        <CanvasView
          layout={layout}
          selectedIds={store.selectedIds}
          tool={tool}
          zoom={zoom}
          pan={pan}
          viewportRef={viewportRef}
          preferences={preferences}
          onSelect={store.select}
          onClearSelection={store.clearSelection}
          onGeometry={(patches: GeometryPatch[]) => store.updateNodes(patches, 'Move or resize')}
          onCreate={(createTool: CreateTool, box: Box) => {
            store.createNodeAt(createTool, box, layout);
            setTool('move');
          }}
          onCreatePath={(points: PathPoint[], pathId: string | null, closed = false) => {
            const first = points[0];
            const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
            const minY = Math.min(...points.map(point => point.y)), maxY = Math.max(...points.map(point => point.y));
            const pair = (point: { x: number; y: number }, base: { x: number; y: number }) => {
              const dx = Math.round((point.x-base.x)*2)/2, dy = Math.round((point.y-base.y)*2)/2;
              return String(dx) + (dy < 0 ? '' : ' ') + String(dy);
            };
            let geometry = 'M0 0', lastKind = '';
            for (let index = 1; index < points.length; index++) {
              const prev = points[index-1], point = points[index];
              const kind = prev.out || point.in ? 'c' : 'l';
              const args = kind === 'c' ? [pair(prev.out ?? prev, prev), pair(point.in ?? point, prev), pair(point, prev)].join(' ') : pair(point, prev);
              geometry += (lastKind === kind ? ' ' : kind) + args;
              lastKind = kind;
            }
            if (closed) geometry += 'Z';
            const data = { geometry, width: Math.max(1, maxX-minX), height: Math.max(1, maxY-minY) };
            if (pathId) { store.updateNodes([{ id: pathId, data }], 'Edit path'); return pathId; }
            const id = generateId();
            store.dispatch(new InsertNodeCommand({ parentId: null, node: { type: 'path', id, x: first.x, y: first.y, ...data, stroke: '#000000', strokeWidth: 1 } }));
            store.select([id]);
            return id;
          }}
          onInsertComponent={(originId, point) => store.insertComponentAt(originId, point, layout)}
          onViewportChange={(nextZoom, nextPan) => {
            setZoom(nextZoom);
            setPan(nextPan);
          }}
        />
        <PropertiesPanel store={store} layout={layout} diagnostics={analysis.diagnostics} />
      </div>
      <AgentComposer contexts={agentContexts} selectedName={selectedNode?.node.name??null} onAddContext={context=>setAgentContexts(items=>items.some(item=>item.kind===context.kind&&item.name===context.name)?items:[...items,context])} onRemoveContext={name=>setAgentContexts(items=>items.filter(item=>item.name!==name))} onChooseStyle={()=>{setGoodiesInitialTab('Styles');setGoodiesOpen(true)}} onSend={message=>{setAgentMessages(items=>[...items,message]);setAgentRequest(value=>value+1);setNotice('Message queued in this session; OpenEditor agent service is not configured.')}} />
      {browserViewOpen ? <BrowserView onClose={() => { setBrowserViewOpen(false); setBrowserCodingMode(false); }} onImportImage={onImportImage} codingMode={browserCodingMode} onCodingMode={() => setBrowserCodingMode(value => !value)} /> : null}
      {dashboardOpen ? <Dashboard currentFileName={store.fileName} currentDocument={store.document} recent={recentDocument} hiddenRecentFileName={hiddenRecentFileName} showDashboardInput={preferences.showDashboardInput} onClose={() => setDashboardOpen(false)} onNewFile={onNewFile} onOpenFile={file => { setDashboardOpen(false); onOpenFile(file); }} onImportFigma={file => { setDashboardOpen(false); onImportFigma(file); }} onImportImage={file => { setDashboardOpen(false); onImportImage(file); }} onOpenRecent={() => { if (recentDocument) store.loadDocument(recentDocument.document, recentDocument.fileName); setDashboardOpen(false); }} onRemoveRecent={fileName => { setHiddenRecentFileName(fileName); try { localStorage.setItem('pen-clone.hidden-recent.v1', fileName); } catch { /* Dashboard remains usable. */ } }} /> : null}
      {goodiesOpen ? <GoodiesDialog initialTab={goodiesInitialTab} onClose={() => setGoodiesOpen(false)} onInsert={(goodie:Goodie) => {
        const parent = store.selectedIds.length===1 ? layout.byId.get(store.selectedIds[0]) : null;
        const parentId = parent?.type==='frame' ? parent.id : null;
        const id=generateId();
        const template = goodiesNodes[goodie.name as keyof typeof goodiesNodes];
        if (!template) { setNotice('Goodie template unavailable: '+goodie.name); return; }
        const node = { ...template, id, ...(parentId ? {} : { x: 100, y: 100 }) } as PenNode;
        store.dispatch(new InsertNodeCommand({ parentId, node }));
        store.select([id]);setGoodiesOpen(false);
      }} onOpenDocument={name=>{const slug=name.toLowerCase().replaceAll(' ','-');fetch('/goodies/documents/'+slug+'.pen').then(response=>{if(!response.ok)throw Error('Document unavailable');return response.text()}).then(raw=>{const parsed=parsePenFile(raw);if(!parsed.ok||!parsed.document)throw Error('Invalid design system document');store.loadDocument(parsed.document,name+'.pen');setGoodiesOpen(false);setNotice('Opened '+name+'.pen')}).catch((error:Error)=>setNotice('Unable to open '+name+': '+error.message))}} onCopyFill={goodie=>{const template=goodiesNodes[goodie.name as keyof typeof goodiesNodes];const fill='fill' in template?template.fill:undefined;void navigator.clipboard?.writeText(JSON.stringify(fill));setNotice('Copied '+goodie.name+' fill.')}} onCopyStyle={name=>{setAgentContexts(items=>items.some(item=>item.kind==='style'&&item.name===name)?items:[...items,{kind:'style',name}]);setGoodiesOpen(false);setAgentRequest(value=>value+1);setNotice('Added '+name+' to agent context.')}} /> : null}
      {settingsOpen ? <SettingsDialog preferences={preferences} onChange={updatePreferences} themeMode={store.themeMode} onTheme={store.setThemeMode} onClose={() => setSettingsOpen(false)} /> : null}
      {shareModalOpen ? <ShareModal document={store.document} fileName={store.fileName} onClose={() => setShareModalOpen(false)} /> : null}
      {variablesOpen ? <VariablesPanel document={store.document} onClose={() => setVariablesOpen(false)} onCommit={store.updateVariableMode} onAdd={store.addVariable} /> : null}
      {presentIndex !== null ? <SlidePresentation layout={layout} slides={layout.nodes.filter(node => node.parentId===null && (node.type==='frame' || node.type==='ref'))} index={presentIndex} onIndex={setPresentIndex} onClose={() => setPresentIndex(null)} /> : null}
      {libraryModalOpen ? <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" data-testid="turn-library-dialog">
        <div className="modal-header"><h2>Turn {store.fileName} into a library?</h2><button type="button" aria-label="Close" onClick={() => setLibraryModalOpen(false)}>×</button></div>
        <p>You can't undo this action. Components and variables in this file will become available to add to other files.</p>
        <div className="button-row"><button type="button" onClick={() => setLibraryModalOpen(false)}>Cancel</button><button type="button" disabled title="Native publishing confirmation has not been captured">Turn into a library</button></div>
      </div></div> : null}
      <footer className="status-bar">
        <span data-testid="file-status">{store.fileName}</span>
        <span>{layout.nodes.length} nodes</span>
        <button type="button" className="top-button" data-testid="diagnostics-toggle" onClick={() => setModal('diagnostics')}>
          diagnostics: {analysis.diagnostics.length}
        </button>
        <button type="button" className="top-button" data-testid="theme-light" aria-pressed={store.themeMode === 'light'} onClick={() => store.setThemeMode('light')}>
          light
        </button>
        <button type="button" className="top-button" data-testid="theme-dark" aria-pressed={store.themeMode === 'dark'} onClick={() => store.setThemeMode('dark')}>
          dark
        </button>
        {notice ? (
          <span className="note" data-testid="notice">
            {notice}
          </span>
        ) : null}
        <span className="spacer" />
        <div className="zoom-cluster">
          <button type="button" className="icon-button" aria-label="Zoom Out" data-testid="zoom-out" onClick={() => zoomBy(0.8)}>
            <Icon name="minus" />
          </button>
          <button type="button" className="zoom-level" data-testid="zoom-level" onClick={zoomToFit}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className="icon-button" aria-label="Zoom In" data-testid="zoom-in" onClick={() => zoomBy(1.25)}>
            <Icon name="plus" />
          </button>
        </div>
        <button type="button" className="icon-button" aria-label="Undo" data-testid="undo-button" disabled={!store.canUndo} onClick={store.undo}>
          <Icon name="undo" />
        </button>
        <button type="button" className="icon-button" aria-label="Redo" data-testid="redo-button" disabled={!store.canRedo} onClick={store.redo}>
          <Icon name="redo" />
        </button>
        <button type="button" className="icon-button" aria-label="Save" data-testid="save-file" onClick={onSave}>
          <Icon name="copy" />
        </button>
      </footer>
      {figmaPicker ? (
        <FigmaPagePicker
          fileName={figmaPicker.fileName}
          pages={figmaPicker.pages}
          busy={figmaBusy}
          onChoose={chooseFigmaPage}
          onCancel={() => { if (!figmaBusy) setFigmaPicker(null); }}
        />
      ) : null}
      <Modals kind={modal} onClose={() => setModal(null)} diagnostics={analysis.diagnostics} />
      <div hidden data-testid="selection-summary">
        {selectedNode ? selectedNode.id : ''}
      </div>
      <div hidden data-testid="autosave-status">
        {autosave.status}
      </div>
    </div>
  );
}
