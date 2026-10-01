import { useState } from 'react';

export interface EditorPreferences {
  animations: boolean;
  showPixelGrid: boolean;
  snapPixelGrid: boolean;
  snapObjects: boolean;
  wheelZoom: boolean;
  invertZoom: boolean;
  smallNudge: number;
  bigNudge: number;
  includeHtmlMetadata: boolean;
  showDashboardInput: boolean;
  imageProvider: string;
  agentChatTextSize: string;
  agentCursorSize: string;
  agentCursorLabel: string;
  agentNameTheme: string;
  customAgentNames: string[];
}

export const DEFAULT_PREFERENCES: EditorPreferences = {
  animations: true, showPixelGrid: true, snapPixelGrid: true, snapObjects: true,
  wheelZoom: false, invertZoom: false, smallNudge: 1, bigNudge: 10,
  includeHtmlMetadata: true, showDashboardInput: true,
  imageProvider: 'Nano Banana Lite', agentChatTextSize: 'Small', agentCursorSize: 'Small (Default)', agentCursorLabel: 'Agent (Default)',
  agentNameTheme: 'Default', customAgentNames: ['Agent 1', 'Agent 2', 'Agent 3'],
};

export function loadPreferences(): EditorPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem('pen-clone.preferences.v1') || '{}') as Partial<EditorPreferences>;
    const value = { ...DEFAULT_PREFERENCES, ...saved };
    for (const key of ['smallNudge', 'bigNudge'] as const) {
      if (!Number.isFinite(value[key]) || value[key] < 0 || value[key] > 1000) value[key] = DEFAULT_PREFERENCES[key];
    }
    if (!['Default','Artists','Philosophers','Inventors','Wizards','Scientists','Custom Names'].includes(value.agentNameTheme)) value.agentNameTheme = 'Default';
    if (!Array.isArray(value.customAgentNames) || value.customAgentNames.some(name => typeof name !== 'string')) value.customAgentNames = DEFAULT_PREFERENCES.customAgentNames;
    for (const [key,options] of Object.entries(SETTING_OPTIONS) as [MenuPreference,string[]][]) if (!options.includes(String(value[key]))) value[key] = DEFAULT_PREFERENCES[key];
    return value;
  } catch { return DEFAULT_PREFERENCES; }
}

export function SettingsDialog({ preferences, onChange, themeMode, onTheme, onClose }: {
  preferences: EditorPreferences;
  onChange: (next: EditorPreferences) => void;
  themeMode: string;
  onTheme: (mode: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState('General');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const update = <K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]) => onChange({ ...preferences, [key]: value });
  const toggle = (key: keyof EditorPreferences, label: string) => <label className="settings-row" key={key}><span>{label}</span><input type="checkbox" aria-label={label} checked={Boolean(preferences[key])} onChange={event => update(key, event.target.checked as EditorPreferences[typeof key])}/><span className="settings-switch"/></label>;
  const menu = (key: MenuPreference, label: string) => <div className="settings-row" key={key}><span>{label}</span><div className="settings-select-wrap"><button type="button" className="settings-select" aria-expanded={openMenu===key} onClick={()=>setOpenMenu(openMenu===key?null:key)}>{String(preferences[key])} ﹀</button>{openMenu===key ? <div className="settings-select-menu" role="menu">{SETTING_OPTIONS[key].map(value=><button type="button" role="menuitem" key={value} aria-checked={preferences[key]===value} onClick={()=>{update(key,value);setOpenMenu(null)}}>{value}</button>)}</div> : null}</div></div>;
  return <div className="settings-backdrop" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="settings-dialog" role="dialog" aria-modal="true" aria-label="Settings" data-testid="settings-dialog">
      <header className="settings-header"><nav aria-label="Settings sections">{['General','Agents','Agent Names','Chat','MCP','Account'].map(item => <button type="button" key={item} aria-pressed={tab===item} onClick={() => setTab(item)}>{item}</button>)}</nav><button type="button" aria-label="Close" onClick={onClose}>×</button></header>
      <div className="settings-content">{tab === 'General' ? <h3>General</h3> : null}{tab === 'General' ? <>
        <h4>Interface</h4><div className="settings-row"><span>Appearance</span><div className="settings-mode"><button type="button" aria-label="Light Mode" aria-pressed={themeMode==='light'} onClick={()=>onTheme('light')}>☼　Light Mode</button><button type="button" aria-label="Dark Mode" aria-pressed={themeMode==='dark'} onClick={()=>onTheme('dark')}>☾　Dark Mode</button></div></div>
        {toggle('animations','Animations & effects (turn off to save GPU/CPU)')}
        <h4>Canvas</h4>{toggle('showPixelGrid','Show pixel grid')}{toggle('snapPixelGrid','Snap to pixel grid')}{toggle('snapObjects','Snap to objects')}{toggle('wheelZoom','Use scroll wheel to zoom')}{toggle('invertZoom','Invert zoom direction')}
        <h4>Custom nudge amount</h4><p>How far selected objects move with the arrow keys.</p>
        {(['smallNudge','bigNudge'] as const).map(key => <label className="settings-row" key={key}><span>{key==='smallNudge'?'Small nudge':'Big nudge'}</span><input className="settings-number" type="number" min="0" max="1000" step="1" aria-label={key==='smallNudge'?'Small nudge':'Big nudge'} value={preferences[key]} onChange={event => update(key, Math.max(0, Math.min(1000, Number(event.target.value)||0)))}/></label>)}
        <h4>Import & Generation</h4>{toggle('includeHtmlMetadata','Include HTML metadata when importing pages')}{menu('imageProvider','Default image generation provider')}
        <h4>Agents</h4>{menu('agentChatTextSize','Agent chat text size')}{menu('agentCursorSize','Agent cursor size')}{menu('agentCursorLabel','Agent cursor label')}{toggle('showDashboardInput','Show agent input on dashboard')}
      </> : tab === 'Agent Names' ? <AgentNamesTab preferences={preferences} onChange={onChange} /> : <div className="settings-empty">{tab === 'Account' ? 'Your files stay on this device.' : tab === 'MCP' ? 'MCP connections are managed by OpenEditor.' : 'Agent preferences are managed by OpenEditor.'}</div>}</div>
    </div>
  </div>;
}

type MenuPreference = 'imageProvider'|'agentChatTextSize'|'agentCursorSize'|'agentCursorLabel';
const SETTING_OPTIONS: Record<MenuPreference,string[]> = {
  imageProvider: ['Nano Banana Lite','Nano Banana','OpenAI Image 2','OpenAI Image 2.5 Flare','OpenAI Image 2.5 Sunburst'],
  agentChatTextSize: ['Small','Medium','Large'],
  agentCursorSize: ['Small (Default)','Hidden','Medium','Large'],
  agentCursorLabel: ['Agent (Default)','Agent + Model','Model'],
};

const NAME_THEMES: Record<string,string[]> = {
  Default: ['Phantom','Drift','Flare','Onyx','Nova','Hex','Echo','Mirage','Cosmo','Reef'],
  Artists: ['Frida','Vincent','Georgia','Pablo','Yayoi','Claude','Salvador','Hilma','Jean','Alma'],
  Philosophers: ['Plato','Aristotle','Socrates','Simone','Hannah','Friedrich','Michel','Laozi','Immanuel','Judith'],
  Inventors: ['Ada','Nikola','Grace','Alan','Marie','Leonardo','Hedy','Katherine','Thomas','Tim'],
  Wizards: ['Merlin','Morgana','Gandalf','Elminster','Circe','Prospero','Glinda','Radagast','Zatanna','Albus'],
  Scientists: ['Marie','Albert','Rosalind','Isaac','Jane','Niels','Richard','Vera','Srinivasa','Katherine'],
};
function AgentNamesTab({ preferences, onChange }: { preferences: EditorPreferences; onChange: (next: EditorPreferences) => void }) {
  const names = preferences.agentNameTheme === 'Custom Names' ? preferences.customAgentNames : NAME_THEMES[preferences.agentNameTheme];
  return <div className="settings-agent-names"><h2>Pick names for your design agents</h2><p>You can also customize the names of your agents or do this later.</p>
    <h3>◇　Agent Names</h3><p>Selected tab will be used for agent names.</p>
    <div className="settings-name-tabs">{[...Object.keys(NAME_THEMES),'Custom Names'].map(name => <button type="button" key={name} aria-pressed={preferences.agentNameTheme===name} onClick={() => onChange({ ...preferences, agentNameTheme:name })}>{name}</button>)}</div>
    <div className="settings-name-list">{names.map((name,index) => <div className="settings-name-row" key={index}>{preferences.agentNameTheme==='Custom Names' ? <input aria-label={'Agent name '+(index+1)} value={name} onChange={event=>onChange({ ...preferences, customAgentNames:preferences.customAgentNames.map((value,position)=>position===index?event.target.value:value) })}/> : <span>{name}</span>}<i style={{background:['#b7c7ed','#5fd3d2','#ffb238','#9d8cbb','#ff6da0','#ad5cf4','#7dc7ed','#dfba96','#6697ff','#4dd2c2'][index%10]}}/></div>)}{preferences.agentNameTheme==='Custom Names' ? <button type="button" onClick={()=>onChange({ ...preferences, customAgentNames:[...preferences.customAgentNames,'Agent '+(preferences.customAgentNames.length+1)] })}>Add name</button> : null}</div>
  </div>;
}
