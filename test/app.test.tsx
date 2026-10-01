import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/ui/App';
import { useEditorStore } from '../src/state/editorStore';
import { layoutDocument } from '../src/document/layout';
import { ColorField } from '../src/ui/fields';
import { clearPersistedDocument, loadPersistedDocument } from '../src/document/persistence';
import { COMPONENT_REPLACEMENT_FIXTURE, freshPrimitives } from './fixtures';

// The canvas stage is translated by the default pan (24,24) at zoom 1 and the
// jsdom viewport rect is at (0,0), so screen coordinates are canvas + pan.
const PAN = 24;

function toClient(x: number, y: number): { clientX: number; clientY: number; button: number; pointerId: number } {
  return { clientX: x + PAN, clientY: y + PAN, button: 0, pointerId: 1 };
}

function renderApp() {
  clearPersistedDocument();
  return render(<App initialDocument={freshPrimitives()} initialFileName="audit-primitives.pen" />);
}

function canvas(): HTMLElement {
  return screen.getByTestId('canvas-root');
}

function propValue(testId: string): string {
  return (screen.getByTestId(testId) as HTMLInputElement).value;
}

function clickCanvas(x: number, y: number): void {
  const target = canvas();
  fireEvent.pointerDown(target, toClient(x, y));
  fireEvent.pointerUp(target, toClient(x, y));
}

describe('editor interactions', () => {
  it('selects the containing frame on click and moves it with a pointer drag', () => {
    renderApp();
    clickCanvas(100, 80);
    expect(screen.getByTestId('selection-summary').textContent).toBe('JLb0R');
    expect(propValue('prop-x')).toBe('32');
    expect(propValue('prop-y')).toBe('32');

    const target = canvas();
    fireEvent.pointerDown(target, toClient(100, 80));
    fireEvent.pointerMove(target, toClient(110, 90));
    fireEvent.pointerUp(target, toClient(110, 90));

    expect(propValue('prop-x')).toBe('42');
    expect(propValue('prop-y')).toBe('42');
    expect(screen.getByTestId('node-JLb0R').getAttribute('data-abs-x')).toBe('42');
  });

  it('deep selects a child on double click and resizes it with a corner handle', () => {
    renderApp();
    fireEvent.doubleClick(canvas(), toClient(100, 80));
    expect(screen.getByTestId('selection-summary').textContent).toBe('LvT0V');

    const handle = canvas().querySelector('[data-handle="se"]');
    expect(handle).not.toBeNull();
    const start = { clientX: 648 + PAN, clientY: 136 + PAN, button: 0, pointerId: 1 };
    fireEvent.pointerDown(handle as Element, start);
    fireEvent.pointerMove(canvas(), { clientX: 668 + PAN, clientY: 156 + PAN, pointerId: 1 });
    fireEvent.pointerUp(canvas(), { clientX: 668 + PAN, clientY: 156 + PAN, pointerId: 1 });

    expect(propValue('prop-w')).toBe('612');
    expect(propValue('prop-h')).toBe('100');
  });

  it('nudges with arrow keys and undoes/redoes with the keyboard', () => {
    renderApp();
    clickCanvas(100, 80);
    expect(propValue('prop-x')).toBe('32');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(propValue('prop-x')).toBe('33');

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(propValue('prop-x')).toBe('32');

    fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true });
    expect(propValue('prop-x')).toBe('33');
  });

  it('deletes the selection and restores it through undo and redo', () => {
    renderApp();
    clickCanvas(100, 80);
    expect(screen.queryByTestId('node-JLb0R')).not.toBeNull();

    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(screen.queryByTestId('node-JLb0R')).toBeNull();

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(screen.queryByTestId('node-JLb0R')).not.toBeNull();

    fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true });
    expect(screen.queryByTestId('node-JLb0R')).toBeNull();

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(screen.queryByTestId('node-JLb0R')).not.toBeNull();
  });

  it('edits geometry through the property panel', () => {
    renderApp();
    clickCanvas(100, 80);
    const input = screen.getByTestId('prop-x') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '100' } });
    fireEvent.blur(input);
    expect(screen.getByTestId('node-JLb0R').getAttribute('data-abs-x')).toBe('100');
  });

  it('creates a rectangle node with the rectangle tool', () => {
    renderApp();
    const before = canvas().querySelectorAll('[data-node-id]').length;
    fireEvent.click(screen.getByTestId('tool-rectangle'));
    fireEvent.pointerDown(canvas(), toClient(700, 500));
    fireEvent.pointerMove(canvas(), toClient(760, 540));
    fireEvent.pointerUp(canvas(), toClient(760, 540));
    const after = canvas().querySelectorAll('[data-node-id]').length;
    expect(after).toBe(before + 1);
  });

  it('resolves themed variables when the theme mode changes', () => {
    renderApp();
    expect(screen.getByTestId('node-JLb0R').getAttribute('data-fill')).toBe('#F8FAFC');
    fireEvent.click(screen.getByTestId('theme-dark'));
    expect(screen.getByTestId('node-JLb0R').getAttribute('data-fill')).toBe('#0F172A');
  });

  it('renders the nested ref instance from its reusable origin', () => {
    renderApp();
    expect(screen.getByTestId('node-x7eMPw')).not.toBeNull();
    expect(screen.getByTestId('node-Iy7jv')).not.toBeNull();
  });

  it('keeps the open document when an invalid .pen file is imported', async () => {
    renderApp();
    const input = screen.getByTestId('open-file-input') as HTMLInputElement;
    const file = new File(['{"version":"2.19","children":[null]}'], 'broken.pen', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    const notice = await screen.findByTestId('notice');
    expect(notice.textContent).toContain('Import rejected');
    expect(screen.queryByTestId('node-JLb0R')).not.toBeNull();
  });

  it('saves to local storage and reloads the persisted document in a new editor', () => {
    const first = renderApp();
    clickCanvas(100, 80);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.click(screen.getByTestId('save-file'));

    const persisted = loadPersistedDocument();
    expect(persisted).not.toBeNull();
    expect(persisted?.fileName).toBe('audit-primitives.pen');

    first.unmount();
    render(<App initialDocument={persisted!.document} initialFileName={persisted!.fileName} />);
    expect(screen.getByTestId('node-JLb0R').getAttribute('data-abs-x')).toBe('33');
  });

  it('cancels a pending pointer preview without mutating the document or history', () => {
    renderApp();
    clickCanvas(100, 80);
    expect(propValue('prop-x')).toBe('32');

    const target = canvas();
    fireEvent.pointerDown(target, toClient(100, 80));
    fireEvent.pointerMove(target, toClient(200, 200));
    fireEvent.pointerCancel(target, toClient(200, 200));
    expect(propValue('prop-x')).toBe('32');
    expect(screen.getByTestId('node-JLb0R').getAttribute('data-abs-x')).toBe('32');

    fireEvent.pointerDown(target, toClient(100, 80));
    fireEvent.pointerMove(target, toClient(110, 90));
    fireEvent.pointerUp(target, toClient(110, 90));
    expect(propValue('prop-x')).toBe('42');

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(propValue('prop-x')).toBe('32');
  });

  it('keeps the raw variable reference while the swatch shows the resolved color', () => {
    renderApp();
    fireEvent.doubleClick(canvas(), toClient(100, 80));
    expect(screen.getByTestId('selection-summary').textContent).toBe('LvT0V');
    expect(propValue('prop-fill')).toBe('$audit-accent');
    const swatch = screen.getByTestId('prop-fill-swatch');
    expect(swatch.getAttribute('data-resolved')).toBe('true');
    expect(swatch.getAttribute('data-resolved-color')).toBe('#7C3AED');
    expect(swatch.style.background).not.toBe('');
  });

  it('updates the fill swatch on theme change while keeping the raw reference', () => {
    renderApp();
    clickCanvas(100, 80);
    expect(screen.getByTestId('selection-summary').textContent).toBe('JLb0R');
    expect(propValue('prop-fill')).toBe('$audit-surface');
    expect(screen.getByTestId('prop-fill-swatch').getAttribute('data-resolved-color')).toBe('#F8FAFC');
    fireEvent.click(screen.getByTestId('theme-dark'));
    expect(propValue('prop-fill')).toBe('$audit-surface');
    expect(screen.getByTestId('prop-fill-swatch').getAttribute('data-resolved-color')).toBe('#0F172A');
    expect(screen.getByTestId('node-JLb0R').getAttribute('data-fill')).toBe('#0F172A');
  });

  it('renders an unresolved color variable honestly instead of a black swatch', () => {
    render(<ColorField label="Fill" value="$missing" resolved={null} onCommit={() => {}} testId="cf" />);
    const swatch = screen.getByTestId('cf-swatch');
    expect(swatch.getAttribute('data-resolved')).toBe('false');
    expect(swatch.getAttribute('data-resolved-color')).toBe('');
    expect(swatch.style.backgroundColor).toBe('');
    expect(swatch.style.backgroundImage).toContain('repeating-linear-gradient');
  });

  it('commits a literal color chosen from the native picker', () => {
    const commits: string[] = [];
    render(<ColorField label="Fill" value="$audit-accent" resolved="#7C3AED" onCommit={(value) => commits.push(value)} testId="cf" />);
    fireEvent.change(screen.getByTestId('cf-picker'), { target: { value: '#123456' } });
    expect(commits).toEqual(['#123456']);
  });

  it('creates a component from one frame and preserves selection through undo and redo', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('layer-JLb0R'));
    const button = screen.getByTestId('create-component') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(screen.getByTestId('selection-summary').textContent).toBe('JLb0R');
    expect((screen.getByTestId('create-component') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect((screen.getByTestId('create-component') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true });
    expect((screen.getByTestId('create-component') as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists a newly created component in the Components sidebar', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('layer-JLb0R'));
    fireEvent.click(screen.getByTestId('create-component'));
    fireEvent.click(screen.getByTestId('tab-components'));
    expect(screen.getByTestId('component-card-JLb0R').textContent).toContain('Pen Audit Primitives');
  });

  it('saves refs with parent-local coordinates or auto-layout flow fields', () => {
    const { result } = renderHook(() => useEditorStore({ document: freshPrimitives(), fileName: 'audit-primitives.pen' }));
    act(() => result.current.select(['JLb0R']));
    act(() => result.current.createComponent());
    act(() => result.current.insertComponentAt('JLb0R', { x: 760, y: 550 }, layoutDocument(result.current.document)));
    act(() => result.current.insertComponentAt('JLb0R', { x: 900, y: 250 }, layoutDocument(result.current.document)));
    const stored = JSON.parse(JSON.stringify(result.current.document));
    const free = stored.children.find((node: { id: string }) => node.id === 'bi8Au')?.children?.at(-1);
    const auto = stored.children.find((node: { id: string }) => node.id === 'ptlRG')?.children?.at(-1);
    expect(free?.type).toBe('ref');
    expect(free?.ref).toBe('JLb0R');
    expect(free?.x).toBe(760);
    expect(free?.y).toBe(550);
    expect(Object.keys(free ?? {}).sort()).toEqual(['id', 'ref', 'type', 'x', 'y']);
    expect(auto?.type).toBe('ref');
    expect(auto?.ref).toBe('JLb0R');
    expect(Object.keys(auto ?? {}).sort()).toEqual(['id', 'ref', 'type']);
  });

  it('uses Command-Option-K for a selected frame but ignores text entry and refs', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('layer-x7eMPw'));
    expect((screen.getByTestId('create-component') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('layer-JLb0R'));
    fireEvent.keyDown(screen.getByTestId('prop-fill'), { key: 'k', metaKey: true, altKey: true });
    expect((screen.getByTestId('create-component') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(window, { key: 'k', metaKey: true, altKey: true });
    expect((screen.getByTestId('create-component') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables the Detach instance button only for a persisted ref selection', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('layer-JLb0R'));
    expect((screen.getByTestId('detach-instance') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('layer-x7eMPw'));
    expect((screen.getByTestId('detach-instance') as HTMLButtonElement).disabled).toBe(false);
  });

  it('detaches the selected instance with Command-Option-X and keeps the root selected', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('layer-x7eMPw'));
    expect(screen.getByTestId('node-x7eMPw').className).toContain('node-ref');

    fireEvent.keyDown(window, { key: 'x', metaKey: true, altKey: true });
    expect(screen.getByTestId('selection-summary').textContent).toBe('x7eMPw');
    expect(screen.getByTestId('node-x7eMPw').className).toContain('node-frame');
    expect(screen.queryByTestId('node-x7eMPw/yyyuL')).toBeNull();

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(screen.getByTestId('node-x7eMPw').className).toContain('node-ref');
    fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true });
    expect(screen.getByTestId('node-x7eMPw').className).toContain('node-frame');
  });

  it('does not detach while typing in a text field', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('layer-x7eMPw'));
    fireEvent.keyDown(screen.getByTestId('prop-fill'), { key: 'x', metaKey: true, altKey: true });
    expect(screen.getByTestId('node-x7eMPw').className).toContain('node-ref');
  });

  it('clicks Detach instance on the imported replacement fixture and keeps the root id', () => {
    clearPersistedDocument();
    render(
      <App
        initialDocument={JSON.parse(JSON.stringify(COMPONENT_REPLACEMENT_FIXTURE))}
        initialFileName="component-replacement-fixture.pen"
      />,
    );
    fireEvent.click(screen.getByTestId('layer-G3F0DE'));
    expect(screen.getByTestId('selection-summary').textContent).toBe('G3F0DE');
    expect((screen.getByTestId('detach-instance') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('detach-instance'));
    expect(screen.getByTestId('selection-summary').textContent).toBe('G3F0DE');
    expect(screen.getByTestId('node-G3F0DE').className).toContain('node-frame');
    expect(screen.getByTestId('node-D4328u').textContent).toBe('Replacement title');
    expect(screen.getByTestId('node-mNOal').textContent).toBe('Slot child');
    expect(screen.queryByTestId('node-G3F0DE/veExn')).toBeNull();
    expect(screen.queryByTestId('node-G3F0DE/c4zmg/GigZ5')).toBeNull();

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(screen.getByTestId('node-G3F0DE').className).toContain('node-ref');
  });
});
