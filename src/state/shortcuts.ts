import { useEffect, useRef } from 'react';
import type { EditorTool } from '../document/defaults';

export interface ShortcutHandlers {
  undo(): void;
  redo(): void;
  selectAll(): void;
  deleteSelection(): void;
  duplicate(): void;
  detach(): void;
  createComponent(): void;
  deselect(): void;
  nudge(dx: number, dy: number): void;
  smallNudge: number;
  bigNudge: number;
  setTool(tool: EditorTool): void;
  zoomBy(factor: number): void;
  zoomTo(scale: number): void;
  zoomToFit(): void;
  reorder(mode: 'front' | 'back' | 'forward' | 'backward'): void;
}

export function useEditorShortcuts(handlers: ShortcutHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      const api = ref.current;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key;

      if (typing && key !== 'Escape') return;

      if (mod && key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) api.redo();
        else api.undo();
        return;
      }
      if (mod && key.toLowerCase() === 'y') {
        event.preventDefault();
        api.redo();
        return;
      }
      if (mod && key.toLowerCase() === 'a') {
        event.preventDefault();
        api.selectAll();
        return;
      }
      if (mod && key.toLowerCase() === 'd') {
        event.preventDefault();
        api.duplicate();
        return;
      }
      if (mod && event.altKey && key.toLowerCase() === 'k') {
        event.preventDefault();
        api.createComponent();
        return;
      }
      if (mod && event.altKey && key.toLowerCase() === 'x') {
        event.preventDefault();
        api.detach();
        return;
      }
      if (mod && (key === '=' || key === '+')) {
        event.preventDefault();
        api.zoomBy(1.25);
        return;
      }
      if (mod && key === '-') {
        event.preventDefault();
        api.zoomBy(0.8);
        return;
      }
      if (mod && key === '0') {
        event.preventDefault();
        api.zoomTo(1);
        return;
      }
      if (!mod && event.shiftKey && (key === '!' || key === '1')) {
        event.preventDefault();
        api.zoomToFit();
        return;
      }
      if (key === 'Backspace' || key === 'Delete') {
        event.preventDefault();
        api.deleteSelection();
        return;
      }
      if (mod && key === ']') {
        event.preventDefault();
        api.reorder('forward');
        return;
      }
      if (mod && key === '[') {
        event.preventDefault();
        api.reorder('backward');
        return;
      }
      if (!mod && !event.altKey && key === ']') {
        event.preventDefault();
        api.reorder('front');
        return;
      }
      if (!mod && !event.altKey && key === '[') {
        event.preventDefault();
        api.reorder('back');
        return;
      }
      if (key === 'Escape') {
        api.deselect();
        return;
      }
      if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
        event.preventDefault();
        const step = event.shiftKey ? api.bigNudge : api.smallNudge;
        const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
        const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
        api.nudge(dx, dy);
        return;
      }
      if (!mod && !event.altKey) {
        switch (key.toLowerCase()) {
          case 'v':
            api.setTool('move');
            return;
          case 'k':
            api.setTool('scale');
            return;
          case 'h':
            api.setTool('hand');
            return;
          case 'f':
          case 'a':
            api.setTool('frame');
            return;
          case 'r':
            api.setTool('rectangle');
            return;
          case 'o':
            api.setTool('ellipse');
            return;
          case 'p':
            api.setTool('pen');
            return;
          case 'n':
            api.setTool('prompt');
            return;
          case 't':
            api.setTool('text');
            return;
          default:
            return;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
