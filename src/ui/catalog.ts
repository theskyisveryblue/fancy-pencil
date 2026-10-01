import type { EditorTool } from '../document/defaults';

export type ParityStatus = 'implemented' | 'partial' | 'inert';

export interface ToolbarItem {
  id: string;
  label: string;
  tool?: EditorTool;
  action?: 'toggle-layers' | 'shortcuts' | 'variables';
  shortcut?: string;
  parity: ParityStatus;
}

export const TOOLBAR_ITEMS: ToolbarItem[] = [
  { id: 'toggle-layer-list', label: 'Layers', action: 'toggle-layers', parity: 'implemented' },
  { id: 'move', label: 'Move', tool: 'move', shortcut: 'V', parity: 'implemented' },
  { id: 'rectangle', label: 'Rectangle', tool: 'rectangle', shortcut: 'R', parity: 'implemented' },
  { id: 'ellipse', label: 'Ellipse', tool: 'ellipse', shortcut: 'O', parity: 'implemented' },
  { id: 'pen', label: 'Pen', tool: 'pen', shortcut: 'P', parity: 'implemented' },
  { id: 'text', label: 'Text', tool: 'text', shortcut: 'T', parity: 'implemented' },
  { id: 'frame', label: 'Frame', tool: 'frame', shortcut: 'F', parity: 'implemented' },
  { id: 'sticky_note', label: 'Sticky note', tool: 'prompt', shortcut: 'N', parity: 'implemented' },
  { id: 'browser', label: 'Browser', tool: 'browser', parity: 'implemented' },
  { id: 'hand', label: 'Hand', tool: 'hand', shortcut: 'H', parity: 'implemented' },
  { id: 'variables', label: 'Variables', action: 'variables', parity: 'implemented' },
  { id: 'keyboard-shortcuts', label: 'Keyboard shortcuts', action: 'shortcuts', shortcut: '?', parity: 'implemented' },
];

export interface ShortcutRow {
  label: string;
  keys: string;
  implemented: boolean;
}

export interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'File',
    rows: [
      { label: 'Save', keys: 'Cmd S', implemented: true },
      { label: 'New file', keys: 'Cmd N', implemented: true },
      { label: 'Open file', keys: 'Cmd O', implemented: true },
    ],
  },
  {
    title: 'Tools',
    rows: [
      { label: 'Move', keys: 'V', implemented: true },
      { label: 'Scale', keys: 'K', implemented: true },
      { label: 'Hand', keys: 'H', implemented: true },
      { label: 'Frame', keys: 'A or F', implemented: true },
      { label: 'Text', keys: 'T', implemented: true },
      { label: 'Rectangle', keys: 'R', implemented: true },
      { label: 'Ellipse', keys: 'O', implemented: true },
      { label: 'Pen', keys: 'P', implemented: true },
      { label: 'Sticky note', keys: 'N', implemented: false },
    ],
  },
  {
    title: 'Design',
    rows: [
      { label: 'Duplicate', keys: 'Cmd D', implemented: true },
      { label: 'Delete', keys: 'Del', implemented: true },
      { label: 'Undo', keys: 'Cmd Z', implemented: true },
      { label: 'Redo', keys: 'Cmd Shift Z', implemented: true },
      { label: 'Add flex layout', keys: 'Shift A', implemented: false },
      { label: 'Flip horizontal', keys: 'Shift H', implemented: false },
      { label: 'Flip vertical', keys: 'Shift V', implemented: false },
    ],
  },
  {
    title: 'Arrange',
    rows: [
      { label: 'Bring forward', keys: 'Cmd ]', implemented: true },
      { label: 'Send backward', keys: 'Cmd [', implemented: true },
      { label: 'Bring to front', keys: ']', implemented: true },
      { label: 'Send to back', keys: '[', implemented: true },
    ],
  },
  {
    title: 'Selection',
    rows: [
      { label: 'Select all', keys: 'Cmd A', implemented: true },
      { label: 'Deselect', keys: 'Esc', implemented: true },
      { label: 'Deep select', keys: 'Cmd Click', implemented: true },
      { label: 'Add to selection', keys: 'Shift Click', implemented: true },
      { label: 'Box select', keys: 'Drag', implemented: true },
      { label: 'Nudge (Shift for big nudge)', keys: 'Arrows', implemented: true },
    ],
  },
  {
    title: 'Navigation',
    rows: [
      { label: 'Zoom in', keys: 'Cmd +', implemented: true },
      { label: 'Zoom out', keys: 'Cmd -', implemented: true },
      { label: 'Zoom to 100%', keys: 'Cmd 0', implemented: true },
      { label: 'Zoom to fit', keys: 'Shift 1', implemented: true },
      { label: 'Zoom', keys: 'Cmd Scroll', implemented: true },
      { label: 'Pan', keys: 'Scroll', implemented: true },
      { label: 'Pan by dragging', keys: 'Space Drag', implemented: true },
    ],
  },
];

export interface ParityRow {
  control: string;
  evidence: string;
  penClone: string;
  status: 'match' | 'partial' | 'gap';
}

export const DIFFERENCE_CHECKLIST: ParityRow[] = [
  {
    control: 'Left tool rail order',
    evidence: 'toggle-layer-list, move, rectangle, pen, text, frame, sticky_note, browser, hand, variables, keyboard-shortcuts',
    penClone: 'Same rail plus an explicit ellipse button. Pen exposes Ellipse through the O shortcut / Primitives menu instead.',
    status: 'partial',
  },
  {
    control: 'Toolbar tool buttons (move, frame, rectangle, text, hand)',
    evidence: 'ui-controls.md rail controls with V/F/R/T/H shortcuts',
    penClone: 'All create/select tools implemented and shortcut-bound.',
    status: 'match',
  },
  {
    control: 'Pen tool, sticky note, browser node, variables panel',
    evidence: 'Rail buttons and shortcuts exist in Pen',
    penClone: 'Rendered as inert controls (aria-disabled) and listed here; not implemented in this slice.',
    status: 'gap',
  },
  {
    control: 'Top bar right cluster (Agents, Goodies, Share, settings, present, browser view)',
    evidence: 'ui-controls.md captures exact labels and bounds',
    penClone: 'Labels and positions match; the buttons are inert because agent/account features are out of scope for P1.',
    status: 'partial',
  },
  {
    control: 'On-canvas agent prompt bar',
    evidence: 'ui/keyboard-shortcuts.txt shows "Design anything..." input with model menu at the bottom',
    penClone: 'Intentionally omitted; it requires AI/account features that later tasks own.',
    status: 'gap',
  },
  {
    control: 'Properties panel sections',
    evidence: 'select-rectangle/editor.png: breadcrumb, Create Component, Context, Alignment, Position X/Y/R, rotate/flip, Flex Layout, padding, Dimensions, Appearance, Fill',
    penClone: 'Same sections render with editable X/Y/R, W/H, fill, padding, gap, layout, alignment, opacity, corner radius, clip.',
    status: 'match',
  },
  {
    control: 'Create Component and Context buttons',
    evidence: 'Present for frame and browser-frame selections',
    penClone: 'Rendered but inert; component creation is P3 scope.',
    status: 'gap',
  },
  {
    control: 'Single click selects containing frame; double click selects the leaf',
    evidence: 'selection-properties.md with native get_app_state confirmation',
    penClone: 'Implemented in selectableNodeId and covered by layout/UI tests.',
    status: 'match',
  },
  {
    control: 'Arrow-key nudge, undo, redo persistence',
    evidence: 'ui-history validation: x840 -> 841 -> undo 840 -> redo 841',
    penClone: 'Mirrored as a unit test over the same document shape; synthetic redo works here (native redo was verified separately in Pen).',
    status: 'match',
  },
  {
    control: 'Fill/stroke/text styling',
    evidence: 'Rectangle fill #7C3AED via $audit-accent, ellipse #F97316, Inter text',
    penClone: 'Rendered from the document model with theme-aware variable resolution.',
    status: 'partial',
  },
  {
    control: 'Flip horizontal/vertical encoding',
    evidence: 'Flip buttons exist; the stored representation was not captured',
    penClone: 'Stored as flipX/flipY booleans authored by this clone; the Pen encoding is unverified.',
    status: 'partial',
  },
  {
    control: 'Rotation',
    evidence: 'R field with 0 degrees and Rotate 90 right',
    penClone: 'R field and rotate/flip buttons render the stored rotation; rotate 90 right is wired.',
    status: 'partial',
  },
  {
    control: 'Image, shader, gradient fills',
    evidence: 'Images are node fills; shaders are WebGL fragment files',
    penClone: 'Not rendered; explicitly reported as unsupported diagnostics.',
    status: 'gap',
  },
  {
    control: 'Components, variables propagation, libraries',
    evidence: 'Reusable origins, ref instances, typed variables, themes',
    penClone: 'Ref instances render from their origin and themed variables resolve; create/update/detach propagation is P3 scope.',
    status: 'partial',
  },
  {
    control: 'Figma import, exports, MCP transport, desktop save',
    evidence: 'features/figma-import.md, exports.md, api.md',
    penClone: 'Not implemented in this slice; documented as later-task scope.',
    status: 'gap',
  },
];

export const PARITY_MARK: Record<'match' | 'partial' | 'gap', string> = {
  match: 'Match',
  partial: 'Partial',
  gap: 'Gap',
};
