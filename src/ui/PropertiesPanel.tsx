import type { Diagnostic } from '../document/diagnostics';
import type { LayoutResult } from '../document/layout';
import { resolvePadding } from '../document/sizing';
import { findNode, findPath } from '../document/tree';
import { isVariableReference } from '../document/variables';
import type { EditorStore, NodePatch } from '../state/editorStore';
import { CheckboxField, ColorField, IconButton, NumberField, SelectField, SizeField, TextAreaField } from './fields';
import { Icon } from './Icon';

export interface PropertiesPanelProps {
  store: EditorStore;
  layout: LayoutResult;
  diagnostics: Diagnostic[];
}

type AlignEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function PropertiesPanel({ store, layout, diagnostics }: PropertiesPanelProps) {
  const selected = store.selectedIds.map((id) => layout.byId.get(id)).filter((node): node is NonNullable<typeof node> => Boolean(node));
  const single = selected.length === 1 ? selected[0] : null;
  const node = single ? single.node : null;
  const parent = single && single.parentId ? layout.byId.get(single.parentId) ?? null : null;
  const parentAutoLayout = parent ? parent.layout === 'horizontal' || parent.layout === 'vertical' : false;
  const nodeDiagnostics = single ? diagnostics.filter((diagnostic) => diagnostic.nodeId === single.id) : [];
  const rawNode = single ? findNode(store.document, single.id) : null;
  const canDetach = rawNode !== null && rawNode.type === 'ref';
  const canCreateComponent = rawNode !== null && rawNode.type === 'frame' && rawNode.reusable !== true;

  const patch = (data: Record<string, unknown>): void => {
    if (!single) return;
    store.updateNodes([{ id: single.id, data }]);
  };

  const align = (edge: AlignEdge): void => {
    const patches: NodePatch[] = [];
    for (const item of selected) {
      const itemParent = item.parentId ? layout.byId.get(item.parentId) ?? null : null;
      const padding = itemParent ? resolvePadding(itemParent.node.padding) : { top: 0, right: 0, bottom: 0, left: 0 };
      const box = itemParent
        ? {
            x: padding.left,
            y: padding.top,
            width: Math.max(0, itemParent.width - padding.left - padding.right),
            height: Math.max(0, itemParent.height - padding.top - padding.bottom),
          }
        : {
            x: layout.bounds.minX,
            y: layout.bounds.minY,
            width: layout.bounds.maxX - layout.bounds.minX,
            height: layout.bounds.maxY - layout.bounds.minY,
          };
      const baseX = toNumber(item.node.x, item.localX);
      const baseY = toNumber(item.node.y, item.localY);
      if (edge === 'left') patches.push({ id: item.id, data: { x: Math.round(box.x) } });
      else if (edge === 'center') patches.push({ id: item.id, data: { x: Math.round(box.x + (box.width - item.width) / 2) } });
      else if (edge === 'right') patches.push({ id: item.id, data: { x: Math.round(box.x + box.width - item.width) } });
      else if (edge === 'top') patches.push({ id: item.id, data: { y: Math.round(box.y) } });
      else if (edge === 'middle') patches.push({ id: item.id, data: { y: Math.round(box.y + (box.height - item.height) / 2) } });
      else patches.push({ id: item.id, data: { y: Math.round(box.y + box.height - item.height) } });
      void baseX;
      void baseY;
    }
    if (patches.length > 0) store.updateNodes(patches, 'Align selection');
  };

  const alignCell = (row: number, column: number): void => {
    if (!single) return;
    const vertical = single ? single.layout === 'vertical' : false;
    const positions = ['start', 'center', 'end'] as const;
    if (vertical) {
      patch({ alignItems: positions[column], justifyContent: positions[row] });
    } else {
      patch({ alignItems: positions[row], justifyContent: positions[column] });
    }
  };

  const breadcrumb = single && node ? findPath(store.document, single.id) ?? [] : [];
  const rawFill = node && typeof node.fill === 'string' ? node.fill : '';
  const styleFill = single && typeof single.style.fill === 'string' ? single.style.fill : null;
  const fillUnresolved = isVariableReference(rawFill) && styleFill === rawFill;
  const resolvedFill = fillUnresolved ? null : styleFill;

  return (
    <aside className="panel" aria-label="Properties">
      {selected.length === 0 ? (
        <p className="note">Nothing selected. Click a frame, shape or text node on the canvas. Deep select with Command-click or double-click.</p>
      ) : null}

      {selected.length > 1 ? (
        <div className="panel-section">
          <div className="panel-section-header">
            <span className="panel-section-title">{selected.length} nodes selected</span>
          </div>
          <div className="button-row">
            {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as AlignEdge[]).map((edge) => (
              <IconButton key={edge} label={'Align ' + edge} testId={'align-' + edge} onClick={() => align(edge)}>
                <Icon name={edge === 'left' ? 'alignLeft' : edge === 'center' ? 'alignCenterH' : edge === 'right' ? 'alignRight' : edge === 'top' ? 'alignTop' : edge === 'middle' ? 'alignMiddle' : 'alignBottom'} />
              </IconButton>
            ))}
          </div>
          <div className="button-row" style={{ marginTop: 6 }}>
            <button type="button" className="top-button" onClick={() => store.reorderSelection('front')}>Bring to front</button>
            <button type="button" className="top-button" onClick={() => store.reorderSelection('back')}>Send to back</button>
            <button type="button" className="top-button" onClick={() => store.deleteSelection()}>Delete</button>
          </div>
        </div>
      ) : null}

      {single && node ? (
        <>
          <div className="panel-section">
            <div className="breadcrumb" data-testid="selection-label">
              {breadcrumb.map((entry, index) => (
                <span key={entry.id}>
                  {index > 0 ? <span className="sep">/</span> : null}
                  <button type="button" onClick={() => store.select([entry.id])}>
                    {String(entry.name ?? entry.id)}
                  </button>
                </span>
              ))}
            </div>
            <div className="button-row" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="top-button"
                data-testid="create-component"
                disabled={!canCreateComponent}
                title={canCreateComponent ? 'Create component (Command-Option-K)' : 'Select one frame that is not already a component'}
                onClick={() => store.createComponent()}
              >
                Create Component
              </button>
              <button type="button" className="top-button" disabled title="Node context metadata is not available in this editor">
                Context
              </button>
              <button
                type="button"
                className="top-button"
                data-testid="detach-instance"
                disabled={!canDetach}
                title={canDetach ? 'Detach this component instance (Command-Option-X)' : 'Select a persisted component instance to detach'}
                onClick={() => store.detachSelection()}
              >
                Detach instance
              </button>
            </div>
          </div>

          <div className="panel-section">
            <div className="panel-section-header">
              <span className="panel-section-title">Alignment</span>
            </div>
            <div className="button-row">
              {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as AlignEdge[]).map((edge) => (
                <IconButton key={edge} label={'Align ' + edge} testId={'align-' + edge} onClick={() => align(edge)}>
                  <Icon name={edge === 'left' ? 'alignLeft' : edge === 'center' ? 'alignCenterH' : edge === 'right' ? 'alignRight' : edge === 'top' ? 'alignTop' : edge === 'middle' ? 'alignMiddle' : 'alignBottom'} />
                </IconButton>
              ))}
            </div>
          </div>

          <div className="panel-section">
            <div className="panel-section-header">
              <span className="panel-section-title">Position</span>
            </div>
            <div className="field-row">
              <NumberField label="X" testId="prop-x" value={toNumber(node.x, single.localX)} disabled={parentAutoLayout} onCommit={(value) => patch({ x: value })} title={parentAutoLayout ? 'X is managed by the parent auto layout' : 'X'} />
              <NumberField label="Y" testId="prop-y" value={toNumber(node.y, single.localY)} disabled={parentAutoLayout} onCommit={(value) => patch({ y: value })} title={parentAutoLayout ? 'Y is managed by the parent auto layout' : 'Y'} />
            </div>
            <div className="field-row">
              <NumberField label="R" testId="prop-r" value={toNumber(node.rotation, 0)} onCommit={(value) => patch({ rotation: value })} />
              <div className="button-row">
                <IconButton label="Rotate 90 right" testId="rotate-90" onClick={() => patch({ rotation: (toNumber(node.rotation, 0) + 90) % 360 })}>
                  <Icon name="rotate" />
                </IconButton>
                <IconButton label="Flip horizontal" testId="flip-h" pressed={node.flipX === true} onClick={() => patch({ flipX: node.flipX !== true })}>
                  <Icon name="flipH" />
                </IconButton>
                <IconButton label="Flip vertical" testId="flip-v" pressed={node.flipY === true} onClick={() => patch({ flipY: node.flipY !== true })}>
                  <Icon name="flipV" />
                </IconButton>
              </div>
            </div>
          </div>

          {node.type === 'frame' || node.type === 'group' || node.type === 'ref' ? (
            <div className="panel-section">
              <div className="panel-section-header">
                <span className="panel-section-title">Flex Layout</span>
              </div>
              <div className="button-row">
                {(['none', 'vertical', 'horizontal'] as const).map((mode) => (
                  <IconButton key={mode} label={'Layout ' + mode} testId={'layout-' + mode} pressed={single.layout === mode} onClick={() => patch({ layout: mode })}>
                    <span style={{ fontSize: 10 }}>{mode === 'none' ? 'off' : mode === 'vertical' ? 'col' : 'row'}</span>
                  </IconButton>
                ))}
              </div>
              {(single.layout !== 'none') ? (
                <>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <div className="align-grid">
                      {[0, 1, 2].map((row) =>
                        [0, 1, 2].map((column) => (
                          <button
                            key={row + '-' + column}
                            type="button"
                            className="icon-button"
                            aria-label={'Align cell ' + row + ',' + column}
                            data-testid={'align-cell-' + row + '-' + column}
                            onClick={() => alignCell(row, column)}
                          >
                            &middot;
                          </button>
                        )),
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <NumberField label="Gap" testId="prop-gap" value={typeof node.gap === 'number' ? node.gap : undefined} onCommit={(value) => patch({ gap: value })} />
                      <div className="checkbox-row">
                        <CheckboxField label="Space Between" checked={node.justifyContent === 'space_between'} testId="justify-between" onChange={() => patch({ justifyContent: 'space_between' })} />
                        <CheckboxField label="Space Around" checked={node.justifyContent === 'space_around'} testId="justify-around" onChange={() => patch({ justifyContent: 'space_around' })} />
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
              <div className="field-row" style={{ marginTop: 8 }}>
                <NumberField label="Pad" testId="prop-padding" value={typeof node.padding === 'number' ? node.padding : uniformPadding(node.padding)} onCommit={(value) => patch({ padding: value })} />
              </div>
            </div>
          ) : null}

          <div className="panel-section">
            <div className="panel-section-header">
              <span className="panel-section-title">Dimensions</span>
            </div>
            <div className="field-row">
              <SizeField label="W" testId="prop-w" value={node.width} onCommit={(value) => patch({ width: value })} />
              <SizeField label="H" testId="prop-h" value={node.height} onCommit={(value) => patch({ height: value })} />
            </div>
            <div className="checkbox-row">
              <CheckboxField label="Fill Width" testId="fill-width" checked={node.width === 'fill_container'} onChange={(checked) => patch({ width: checked ? 'fill_container' : single.width })} />
              <CheckboxField label="Fill Height" testId="fill-height" checked={node.height === 'fill_container'} onChange={(checked) => patch({ height: checked ? 'fill_container' : single.height })} />
              <CheckboxField label="Hug Width" testId="hug-width" checked={node.width === 'fit_content'} onChange={(checked) => patch({ width: checked ? 'fit_content' : single.width })} />
              <CheckboxField label="Hug Height" testId="hug-height" checked={node.height === 'fit_content'} onChange={(checked) => patch({ height: checked ? 'fit_content' : single.height })} />
              <CheckboxField label="Clip Content" testId="clip-content" checked={node.clip === true} onChange={(checked) => patch({ clip: checked })} />
            </div>
          </div>

          <div className="panel-section">
            <div className="panel-section-header">
              <span className="panel-section-title">Appearance</span>
            </div>
            <div className="field-row">
              <NumberField label="%" testId="prop-opacity" value={node.opacity === undefined ? 100 : Math.round(node.opacity * 100)} onCommit={(value) => patch({ opacity: Math.max(0, Math.min(1, value / 100)) })} />
              <NumberField label="R" testId="prop-corner" value={typeof node.cornerRadius === 'number' ? node.cornerRadius : undefined} onCommit={(value) => patch({ cornerRadius: value })} />
            </div>
          </div>

          <div className="panel-section">
            <div className="panel-section-header">
              <span className="panel-section-title">Fill</span>
            </div>
            <ColorField label="Fill" testId="prop-fill" value={rawFill} resolved={resolvedFill} onCommit={(value) => patch({ fill: value })} />
          </div>

          {node.type === 'text' ? (
            <div className="panel-section">
              <div className="panel-section-header">
                <span className="panel-section-title">Text</span>
              </div>
              <TextAreaField label="Content" testId="prop-content" value={String(node.content ?? '')} onCommit={(value) => patch({ content: value })} />
              <div className="field-row" style={{ marginTop: 6 }}>
                <SelectField label="Font" testId="prop-font" value={String(node.fontFamily ?? 'Inter')} options={[{ value: 'Inter', label: 'Inter' }, { value: 'Arial', label: 'Arial' }, { value: 'system-ui', label: 'system-ui' }]} onCommit={(value) => patch({ fontFamily: value })} />
                <NumberField label="Size" testId="prop-font-size" value={typeof node.fontSize === 'number' ? node.fontSize : 14} onCommit={(value) => patch({ fontSize: value })} />
              </div>
              <div className="field-row">
                <SelectField label="Weight" testId="prop-font-weight" value={String(node.fontWeight ?? 'normal')} options={[{ value: 'normal', label: 'normal' }, { value: '500', label: '500' }, { value: '600', label: '600' }, { value: '700', label: '700' }]} onCommit={(value) => patch({ fontWeight: value === 'normal' ? 'normal' : Number(value) })} />
                <SelectField label="Align" testId="prop-text-align" value={String(node.textAlign ?? 'left')} options={[{ value: 'left', label: 'left' }, { value: 'center', label: 'center' }, { value: 'right', label: 'right' }]} onCommit={(value) => patch({ textAlign: value })} />
              </div>
              <div className="field-row">
                <SelectField label="Growth" testId="prop-text-growth" value={String(node.textGrowth ?? 'auto')} options={[{ value: 'auto', label: 'auto' }, { value: 'fixed-width', label: 'fixed width' }, { value: 'fixed-width-height', label: 'fixed both' }]} onCommit={(value) => patch({ textGrowth: value })} />
              </div>
            </div>
          ) : null}

          <div className="panel-section">
            <div className="panel-section-header">
              <span className="panel-section-title">Diagnostics</span>
            </div>
            {nodeDiagnostics.length === 0 ? (
              <p className="note">No issues for this node.</p>
            ) : (
              <div className="diagnostics-list">
                {nodeDiagnostics.map((diagnostic, index) => (
                  <div key={diagnostic.code + index} className={'diagnostic ' + diagnostic.level}>
                    <span className="marker">{diagnostic.level === 'error' ? 'x' : diagnostic.level === 'warning' ? '!' : 'i'}</span>
                    <span>{diagnostic.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </aside>
  );
}

function uniformPadding(padding: unknown): number | undefined {
  const resolved = resolvePadding(padding);
  const values = [resolved.top, resolved.right, resolved.bottom, resolved.left];
  return values.every((value) => value === values[0]) ? values[0] : undefined;
}
