import { useState } from 'react';
import { Icon } from './Icon';

export type SaveStatus = 'idle' | 'pending' | 'saved' | 'error' | 'unavailable';

export interface TopBarProps {
  fileName: string;
  saveStatus: SaveStatus;
  onOpenFile: (file: File) => void;
  onOpenFixture: () => void;
  onImportFigma: (file: File) => void;
  onShare: () => void;
  onPresent: () => void;
  onOpenWorkspaceFolder: () => void;
  onDashboard: () => void;
  onBrowserView: () => void;
  onSettings: () => void;
  onGoodies: () => void;
  onAgents: () => void;
}

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: 'Unsaved changes',
  pending: 'Saving...',
  saved: 'Auto-saved locally',
  error: 'Local save failed',
  unavailable: 'Local saving unavailable',
};

export function TopBar({ fileName, saveStatus, onOpenFile, onOpenFixture, onImportFigma, onShare, onPresent, onOpenWorkspaceFolder, onDashboard, onBrowserView, onSettings, onGoodies, onAgents }: TopBarProps) {
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  return (
    <header className="top-bar">
      <span className="brand">
        <span className="brand-mark" aria-hidden="true" />
        Fancy Pencil
      </span>
      <span className="file-name">
        <button type="button" className="dashboard-toggle" aria-label="toggle-new-file" data-testid="toggle-new-file" onClick={onDashboard}><Icon name="grid" size={14} /></button>
        <button type="button" className="workspace-folder-button" aria-label="Workspace folder menu" aria-expanded={workspaceMenuOpen} data-testid="workspace-folder-menu-button" onClick={() => setWorkspaceMenuOpen(value => !value)}><Icon name="folder" size={14} /></button>
        {workspaceMenuOpen ? <div className="workspace-folder-menu" role="menu" data-testid="workspace-folder-menu"><div className="workspace-folder-hint">⌘+⇧+S to 'Save As' to a new location</div><div className="workspace-folder-help">Code gets generated to the workspace folder</div><button type="button" role="menuitem" onClick={() => { setWorkspaceMenuOpen(false); onOpenWorkspaceFolder(); }}><Icon name="folder" size={14} />Open Workspace Folder</button></div> : null}
        <strong data-testid="file-name">{fileName}</strong>
        <span data-testid="save-status">&mdash; {SAVE_LABEL[saveStatus]}</span>
      </span>
      <span className="top-bar-spacer" />
      <div className="top-bar-actions">
        <button type="button" className="top-button" data-testid="open-file-menu" onClick={onOpenFixture}>
          Open audit fixture
        </button>
        <label className="top-button pill" data-testid="import-figma" title="Import a .fig file and choose a page">
          Import Figma
          <input
            type="file"
            accept=".fig"
            hidden
            data-testid="import-figma-input"
            onChange={(event) => {
              const file = event.target.files && event.target.files[0];
              if (file) onImportFigma(file);
              event.target.value = '';
            }}
          />
        </label>
        <label className="top-button pill" data-testid="open-file">
          Open .pen
          <input
            type="file"
            accept=".pen,.zip,application/json,application/zip"
            hidden
            data-testid="open-file-input"
            onChange={(event) => {
              const file = event.target.files && event.target.files[0];
              if (file) onOpenFile(file);
              event.target.value = '';
            }}
          />
        </label>
        <button type="button" className="top-button" aria-label="Agents" onClick={onAgents}>
          Agents
        </button>
        <button type="button" className="top-button" aria-label="goodies" onClick={onGoodies}>
          Goodies
        </button>
        <button type="button" className="top-button pill" data-testid="open-share" onClick={onShare}>
          Share
        </button>
        <button type="button" className="top-button" aria-label="open-settings" title="Settings" onClick={onSettings}>
          <Icon name="settings" />
        </button>
        <button type="button" className="top-button" aria-label="present" title="Present slides" onClick={onPresent}>
          <Icon name="play" />
        </button>
        <button type="button" className="top-button" aria-label="toggle-browser-view" title="Browser View" onClick={onBrowserView}>
          <Icon name="browser" />
        </button>
      </div>
    </header>
  );
}
