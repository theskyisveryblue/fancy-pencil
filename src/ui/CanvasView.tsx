import goodiesNodes from './goodiesCatalog.json';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type RefObject, type WheelEvent as ReactWheelEvent } from 'react';
import type { Box, CreateTool, EditorTool } from '../document/defaults';
import { TOOL_DEFAULT_BOX } from '../document/defaults';
import { nodesInRect, selectableNodeId, type Point, type Rect } from '../document/hitTest';
import type { LayoutResult, PositionedNode } from '../document/layout';
import type { EditorPreferences } from './SettingsDialog';
import { getImageAsset } from '../document/imageAssets';

export interface PathPoint extends Point { in?: Point; out?: Point; }

export interface GeometryPatch {
  id: string;
  data: Record<string, unknown>;
}

export interface CanvasViewProps {
  layout: LayoutResult;
  selectedIds: string[];
  tool: EditorTool;
  zoom: number;
  pan: Point;
  viewportRef: RefObject<HTMLDivElement>;
  preferences: EditorPreferences;
  onSelect: (ids: string[]) => void;
  onClearSelection: () => void;
  onGeometry: (patches: GeometryPatch[]) => void;
  onCreate: (tool: CreateTool, box: Box) => void;
  onCreatePath: (points: PathPoint[], pathId: string | null, closed?: boolean) => string;
  onInsertComponent: (originId: string, point: Point) => void;
  onViewportChange: (zoom: number, pan: Point) => void;
}

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = (typeof HANDLES)[number];

interface Interaction {
  kind: 'move' | 'resize' | 'pan' | 'box';
  start: Point;
  handle?: Handle;
  base: Map<string, { x: number; y: number; width: number; height: number }>;
  startPan: Point;
  moved: boolean;
}

interface Preview {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isAutoLayoutParent(layout: LayoutResult, node: PositionedNode): boolean {
  if (!node.parentId) return false;
  const parent = layout.byId.get(node.parentId);
  if (!parent) return false;
  return parent.layout === 'horizontal' || parent.layout === 'vertical';
}

const SANS_FALLBACK = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function gradientCss(fill: unknown): string | undefined {
  if (!fill || typeof fill !== 'object' || !('type' in fill) || fill.type !== 'gradient' || !('colors' in fill) || !Array.isArray(fill.colors)) return undefined;
  const gradient = fill as { gradientType?: string; rotation?: number; opacity?: number; center?: { x?: number; y?: number }; size?: { width?: number; height?: number }; colors: { color: string; position: number }[] };
  const withOpacity = (color: string): string => {
    if (typeof gradient.opacity !== 'number' || gradient.opacity === 1 || !/^#[0-9a-f]{8}$/i.test(color)) return color;
    return color.slice(0, 7) + Math.round(parseInt(color.slice(7, 9), 16) * gradient.opacity).toString(16).padStart(2, '0');
  };
  const stops = gradient.colors.map(stop => withOpacity(stop.color) + ' ' + Math.round(stop.position * 100) + '%').join(', ');
  if (gradient.gradientType === 'radial') {
    const rx = Math.max(1, (gradient.size?.width ?? 1) * 50);
    const ry = Math.max(1, (gradient.size?.height ?? 1) * 50);
    return `radial-gradient(ellipse ${rx}% ${ry}% at ${(gradient.center?.x ?? .5) * 100}% ${(gradient.center?.y ?? .5) * 100}%, ${stops})`;
  }
  return `linear-gradient(${-1 * (gradient.rotation ?? -180)}deg, ${stops})`;
}

function fontStack(family: unknown): string {
  const declared = typeof family === 'string' && family.trim() !== '' ? family.trim() : 'Inter';
  return declared + ', ' + SANS_FALLBACK;
}

function capturePointer(element: HTMLElement, pointerId: number | undefined): void {
  if (typeof pointerId !== 'number') return;
  try {
    if (typeof element.setPointerCapture === 'function') element.setPointerCapture(pointerId);
  } catch {
    return;
  }
}

function releasePointer(element: HTMLElement, pointerId: number | undefined): void {
  if (typeof pointerId !== 'number') return;
  try {
    if (typeof element.hasPointerCapture === 'function' && !element.hasPointerCapture(pointerId)) return;
    if (typeof element.releasePointerCapture === 'function') element.releasePointerCapture(pointerId);
  } catch {
    return;
  }
}

function handleOffset(handle: Handle, width: number, height: number): Point {
  const fx = handle.includes('w') ? 0 : handle.includes('e') ? 1 : 0.5;
  const fy = handle.includes('n') ? 0 : handle.includes('s') ? 1 : 0.5;
  return { x: width * fx, y: height * fy };
}

function resizePatch(handle: Handle, base: { x: number; y: number; width: number; height: number }, dx: number, dy: number): Preview {
  let { x, y, width, height } = base;
  if (handle.includes('w')) {
    width = base.width - dx;
    x = base.x + dx;
  } else if (handle.includes('e')) {
    width = base.width + dx;
  }
  if (handle.includes('n')) {
    height = base.height - dy;
    y = base.y + dy;
  } else if (handle.includes('s')) {
    height = base.height + dy;
  }
  if (width < 1) {
    width = 1;
    x = base.x;
  }
  if (height < 1) {
    height = 1;
    y = base.y;
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

function scalePatch(handle: Handle, base: { x: number; y: number; width: number; height: number }, dx: number, dy: number): Preview {
  const resize = resizePatch(handle, base, dx, dy);
  const horizontal = handle.includes('e') || handle.includes('w');
  const vertical = handle.includes('n') || handle.includes('s');
  const sx = horizontal ? (resize.width ?? base.width) / base.width : 1;
  const sy = vertical ? (resize.height ?? base.height) / base.height : 1;
  const scale = horizontal && vertical ? (Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy) : horizontal ? sx : sy;
  const width = Math.max(1, Math.round(base.width * scale));
  const height = Math.max(1, Math.round(base.height * scale));
  return { x: handle.includes('w') ? base.x + base.width - width : base.x, y: handle.includes('n') ? base.y + base.height - height : base.y, width, height };
}

export function CanvasView(props: CanvasViewProps) {
  const { layout, selectedIds, tool, zoom, pan, viewportRef, preferences, onSelect, onClearSelection, onGeometry, onCreate, onCreatePath, onInsertComponent, onViewportChange } = props;
  const interactionRef = useRef<Interaction | null>(null);
  const previewRef = useRef<Record<string, Preview>>({});
  const [preview, setPreview] = useState<Record<string, Preview>>({});
  const drawRef = useRef<{ tool: CreateTool; start: Point } | null>(null);
  const penPointsRef = useRef<PathPoint[]>([]);
  const penPathIdRef = useRef<string | null>(null);
  const penDragRef = useRef<{ start: Point; current: Point } | null>(null);
  const [penCursor, setPenCursor] = useState<Point | null>(null);
  const [drawRect, setDrawRect] = useState<Rect | null>(null);
  const [boxRect, setBoxRect] = useState<Rect | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const imagePaths = useMemo(() => [...new Set(layout.nodes.map(node => {
    const fill = node.node.fill;
    const layers = Array.isArray(fill) ? fill : fill && typeof fill === 'object' ? [fill] : [];
    return layers.filter(layer => layer.type === 'image').map(layer => layer.type === 'image' ? layer.url : null);
  }).flat().filter((path): path is string => typeof path === 'string'))], [layout.nodes]);

  useEffect(() => {
    if (imagePaths.length === 0) { setImageUrls(current => Object.keys(current).length ? {} : current); return; }
    let active = true;
    const urls: string[] = [];
    Promise.all(imagePaths.map(async path => {
      const blob = await getImageAsset(path);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      urls.push(url);
      return [path, url] as const;
    })).then(entries => {
      if (active) setImageUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null)));
      else urls.forEach(url => URL.revokeObjectURL(url));
    });
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [imagePaths]);
  const spaceRef = useRef(false);

  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (event.code === 'Space') spaceRef.current = true;
      if (event.key === 'Escape' || event.key === 'Enter') { penPointsRef.current = []; penPathIdRef.current = null; penDragRef.current = null; setPenCursor(null); }
    };
    const up = (event: KeyboardEvent): void => {
      if (event.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => { if (tool !== 'pen') { penPointsRef.current = []; penPathIdRef.current = null; penDragRef.current = null; setPenCursor(null); } }, [tool]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, PositionedNode[]>();
    for (const node of layout.nodes) {
      const list = map.get(node.parentId);
      if (list) list.push(node);
      else map.set(node.parentId, [node]);
    }
    return map;
  }, [layout]);

  const toCanvas = (event: { clientX: number; clientY: number }): Point => {
    const element = viewportRef.current;
    const rect = element ? element.getBoundingClientRect() : { left: 0, top: 0 };
    return { x: (event.clientX - rect.left - pan.x) / zoom, y: (event.clientY - rect.top - pan.y) / zoom };
  };

  const onComponentDragOver = (event: ReactDragEvent<HTMLDivElement>): void => {
    if (!Array.from(event.dataTransfer.types).includes('application/x-pen-component-id')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const onComponentDrop = (event: ReactDragEvent<HTMLDivElement>): void => {
    const originId = event.dataTransfer.getData('application/x-pen-component-id');
    if (!originId) return;
    event.preventDefault();
    event.stopPropagation();
    onInsertComponent(originId, toCanvas(event));
  };

  const applyPreview = (next: Record<string, Preview>): void => {
    previewRef.current = next;
    setPreview(next);
  };

  const beginMove = (point: Point, ids: string[]): void => {
    const base = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const id of ids) {
      const node = layout.byId.get(id);
      if (!node) continue;
      if (isAutoLayoutParent(layout, node) && node.node.layoutPosition !== 'absolute') continue;
      base.set(id, {
        x: toNumber(node.node.x, node.localX),
        y: toNumber(node.node.y, node.localY),
        width: node.width,
        height: node.height,
      });
    }
    if (base.size === 0) return;
    interactionRef.current = { kind: 'move', start: point, base, startPan: pan, moved: false };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as HTMLElement;
    const handleAttr = target.dataset.handle as Handle | undefined;

    if (handleAttr && selectedIds.length === 1 && tool !== 'pen') {
      const node = layout.byId.get(selectedIds[0]);
      if (node) {
        const base = new Map<string, { x: number; y: number; width: number; height: number }>();
        base.set(node.id, {
          x: toNumber(node.node.x, node.localX),
          y: toNumber(node.node.y, node.localY),
          width: node.width,
          height: node.height,
        });
        interactionRef.current = { kind: 'resize', start: toCanvas(event), handle: handleAttr, base, startPan: pan, moved: false };
        capturePointer(event.currentTarget, event.pointerId);
        return;
      }
    }

    if (tool === 'hand' || event.button === 1 || spaceRef.current) {
      interactionRef.current = { kind: 'pan', start: toCanvas(event), base: new Map(), startPan: pan, moved: false };
      capturePointer(event.currentTarget, event.pointerId);
      return;
    }

    const point = toCanvas(event);

    if (tool === 'pen') { penDragRef.current = { start: point, current: point }; capturePointer(event.currentTarget, event.pointerId); return; }
    if (tool !== 'move' && tool !== 'scale') {
      drawRef.current = { tool, start: point };
      setDrawRect({ x: point.x, y: point.y, width: 0, height: 0 });
      capturePointer(event.currentTarget, event.pointerId);
      return;
    }

    const deep = event.metaKey || event.ctrlKey;
    const id = selectableNodeId(layout, point, deep);
    if (!id) {
      if (event.shiftKey) {
        interactionRef.current = { kind: 'box', start: point, base: new Map(), startPan: pan, moved: false };
        setBoxRect({ x: point.x, y: point.y, width: 0, height: 0 });
      } else {
        onClearSelection();
        interactionRef.current = { kind: 'box', start: point, base: new Map(), startPan: pan, moved: false };
        setBoxRect({ x: point.x, y: point.y, width: 0, height: 0 });
      }
      capturePointer(event.currentTarget, event.pointerId);
      return;
    }

    const additive = event.shiftKey;
    const next = additive ? Array.from(new Set([...selectedIds, id])) : selectedIds.includes(id) ? selectedIds : [id];
    onSelect(next);
    beginMove(point, next);
    if (interactionRef.current) capturePointer(event.currentTarget, event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (tool === 'pen') { const point = toCanvas(event); if (penDragRef.current) penDragRef.current.current = point; setPenCursor(point); return; }
    const interaction = interactionRef.current;
    if (!interaction) return;
    const point = toCanvas(event);
    interaction.moved = interaction.moved || Math.abs(point.x - interaction.start.x) > 0.5 || Math.abs(point.y - interaction.start.y) > 0.5;

    if (interaction.kind === 'pan') {
      onViewportChange(zoom, { x: interaction.startPan.x + (point.x - interaction.start.x) * zoom, y: interaction.startPan.y + (point.y - interaction.start.y) * zoom });
      return;
    }
    if (interaction.kind === 'box') {
      setBoxRect({
        x: interaction.start.x,
        y: interaction.start.y,
        width: point.x - interaction.start.x,
        height: point.y - interaction.start.y,
      });
      return;
    }
    if (interaction.kind === 'move') {
      let dx = point.x - interaction.start.x;
      let dy = point.y - interaction.start.y;
      if (preferences.snapObjects && Math.hypot(dx, dy) < 100) {
        const first = interaction.base.values().next().value as { x: number; y: number; width: number; height: number } | undefined;
        if (first) {
          const candidates = layout.nodes.filter(node => !interaction.base.has(node.id) && !node.insideInstance);
          const threshold = 2 / zoom;
          const snap = (start: number, length: number, delta: number, axis: 'x' | 'y') => {
            const source = [start + delta, start + delta + length / 2, start + delta + length];
            let best = delta, distance = threshold;
            for (const node of candidates) {
              const nStart = axis === 'x' ? node.absX : node.absY;
              const nLength = axis === 'x' ? node.width : node.height;
              for (const target of [nStart, nStart + nLength / 2, nStart + nLength]) for (const value of source) {
                const gap = Math.abs(target - value);
                if (gap < distance) { best = delta + target - value; distance = gap; }
              }
            }
            return best;
          };
          dx = snap(first.x, first.width, dx, 'x');
          dy = snap(first.y, first.height, dy, 'y');
        }
      }
      if (preferences.snapPixelGrid) { dx = Math.round(dx); dy = Math.round(dy); }
      const next: Record<string, Preview> = {};
      for (const [id, base] of interaction.base) {
        next[id] = { x: base.x + dx, y: base.y + dy };
      }
      applyPreview(next);
      return;
    }
    if (interaction.kind === 'resize' && interaction.handle) {
      const entry = Array.from(interaction.base.entries())[0];
      if (!entry) return;
      const dx = point.x - interaction.start.x;
      const dy = point.y - interaction.start.y;
      const patch = tool === 'scale' ? scalePatch(interaction.handle, entry[1], dx, dy) : resizePatch(interaction.handle, entry[1], dx, dy);
      if (preferences.snapPixelGrid) for (const key of ['x', 'y', 'width', 'height'] as const) if (patch[key] !== undefined) patch[key] = Math.round(patch[key]!);
      applyPreview({ [entry[0]]: patch });
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    releasePointer(event.currentTarget, event.pointerId);
    if (penDragRef.current) {
      const { start, current } = penDragRef.current;
      penDragRef.current = null;
      const point: PathPoint = { x: Math.round(start.x * 2) / 2, y: Math.round(start.y * 2) / 2 };
      if (Math.hypot(current.x - start.x, current.y - start.y) > 1) {
        const dx = current.x - start.x, dy = current.y - start.y;
        point.out = { x: Math.round((start.x + dx) * 2) / 2, y: Math.round((start.y + dy) * 2) / 2 };
        point.in = { x: Math.round((start.x - dx) * 2) / 2, y: Math.round((start.y - dy) * 2) / 2 };
      }
      const first = penPointsRef.current[0];
      if (first && penPointsRef.current.length >= 3 && Math.hypot(point.x-first.x,point.y-first.y) < 8 / zoom) {
        penPathIdRef.current = onCreatePath(penPointsRef.current, penPathIdRef.current, true);
        penPointsRef.current = []; penPathIdRef.current = null; setPenCursor(null);
        return;
      }
      penPointsRef.current = [...penPointsRef.current, point];
      if (penPointsRef.current.length >= 2) penPathIdRef.current = onCreatePath(penPointsRef.current, penPathIdRef.current);
      setPenCursor(null);
      return;
    }
    const interaction = interactionRef.current;
    const draw = drawRef.current;
    const point = toCanvas(event);

    if (draw && drawRect) {
      const box: Box = {
        x: Math.round(Math.min(draw.start.x, point.x)),
        y: Math.round(Math.min(draw.start.y, point.y)),
        width: Math.round(Math.abs(point.x - draw.start.x)),
        height: Math.round(Math.abs(point.y - draw.start.y)),
      };
      const fallback = TOOL_DEFAULT_BOX[draw.tool];
      const finalBox = box.width < 4 || box.height < 4 ? { x: Math.round(draw.start.x), y: Math.round(draw.start.y), width: fallback.width, height: fallback.height } : box;
      onCreate(draw.tool, finalBox);
      drawRef.current = null;
      setDrawRect(null);
      return;
    }
    drawRef.current = null;
    setDrawRect(null);

    if (!interaction) {
      setBoxRect(null);
      return;
    }
    interactionRef.current = null;

    if (interaction.kind === 'box') {
      if (boxRect && interaction.moved) {
        onSelect(nodesInRect(layout, boxRect));
      }
      setBoxRect(null);
      return;
    }

    if (interaction.moved) {
      const patches: GeometryPatch[] = [];
      for (const [id, geometry] of Object.entries(previewRef.current)) {
        const data: Record<string, unknown> = {};
        if (geometry.x !== undefined) data.x = geometry.x;
        if (geometry.y !== undefined) data.y = geometry.y;
        if (geometry.width !== undefined) data.width = geometry.width;
        if (geometry.height !== undefined) data.height = geometry.height;
        if (Object.keys(data).length > 0) patches.push({ id, data });
      }
      if (patches.length > 0) onGeometry(patches);
    }
    applyPreview({});
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>): void => {
    interactionRef.current = null;
    drawRef.current = null;
    applyPreview({});
    setDrawRect(null);
    setBoxRect(null);
    releasePointer(event.currentTarget, event.pointerId);
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
    if (!(event.ctrlKey || event.metaKey || preferences.wheelZoom)) {
      onViewportChange(zoom, { x: pan.x - event.deltaX, y: pan.y - event.deltaY });
      return;
    }
    const element = viewportRef.current;
    const rect = element ? element.getBoundingClientRect() : { left: 0, top: 0 };
    const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const factor = Math.exp((preferences.invertZoom ? 1 : -1) * event.deltaY / 300);
    const next = clamp(round2(zoom * factor), 0.05, 8);
    const canvasPoint = { x: (local.x - pan.x) / zoom, y: (local.y - pan.y) / zoom };
    onViewportChange(next, { x: local.x - canvasPoint.x * next, y: local.y - canvasPoint.y * next });
  };

  const onDoubleClick = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (tool === 'pen') { penPointsRef.current = []; penPathIdRef.current = null; setPenCursor(null); return; }
    if (tool !== 'move' && tool !== 'scale') return;
    const id = selectableNodeId(layout, toCanvas(event), true);
    if (id) onSelect([id]);
  };

  const renderNode = (node: PositionedNode): JSX.Element => {
    const geometry = preview[node.id];
    const x = geometry && geometry.x !== undefined ? geometry.x : node.localX;
    const y = geometry && geometry.y !== undefined ? geometry.y : node.localY;
    const width = geometry && geometry.width !== undefined ? geometry.width : node.width;
    const height = geometry && geometry.height !== undefined ? geometry.height : node.height;
    const transforms: string[] = [];
    if (node.node.rotation) transforms.push('rotate(' + String(node.node.rotation) + 'deg)');
    if (node.style.flipX) transforms.push('scaleX(-1)');
    if (node.style.flipY) transforms.push('scaleY(-1)');

    const style: CSSProperties = {
      left: x,
      top: y,
      width,
      height,
      transform: transforms.length > 0 ? transforms.join(' ') : undefined,
      transformOrigin: 'center',
      opacity: node.style.opacity,
    };

    if (node.unsupported) {
      style.background = undefined;
      return (
        <div
          key={node.id}
          className="node node-unsupported"
          style={style}
          data-node-id={node.id}
          data-testid={'node-' + node.id}
          data-abs-x={node.absX}
          data-abs-y={node.absY}
          title={'Unsupported ' + node.type + ' node'}
        >
          {node.type}
          {renderChildren(node)}
        </div>
      );
    }

    if (node.type === 'path') {
      return <svg key={node.id} className="node node-path" style={style} viewBox={typeof node.node.sourceViewBox === 'string' ? node.node.sourceViewBox : undefined} data-node-id={node.id} data-testid={'node-' + node.id} data-abs-x={node.absX} data-abs-y={node.absY}>
        <path d={String(node.node.geometry ?? '')} fill={node.style.fill ?? 'none'} stroke={String(node.node.stroke ?? '#000000')} strokeWidth={typeof node.node.strokeWidth === 'number' ? node.node.strokeWidth : 1} />
      </svg>;
    }
    if (node.type === 'icon') {
      return <svg key={node.id} className="node node-icon" style={style} viewBox="0 0 24 24" fill="none" stroke={node.style.fill ?? '#000000'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" data-node-id={node.id} data-testid={'node-' + node.id} data-abs-x={node.absX} data-abs-y={node.absY}>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
      </svg>;
    }
    if (node.type === 'prompt') {
      return <div key={node.id} className="node node-prompt" style={style} data-node-id={node.id} data-testid={'node-' + node.id} data-abs-x={node.absX} data-abs-y={node.absY}><div className="prompt-heading">Prompt⌄</div><div className="prompt-body" /></div>;
    }
    if (node.type === 'script') {
      const scriptUri = String(node.node.scriptUri ?? '');
      const goodieScriptPreview = Object.values(goodiesNodes).some(template => 'scriptUri' in template && template.scriptUri === scriptUri);
      if (goodieScriptPreview) {
        const slug = scriptUri.slice('images/'.length, -'.js'.length);
        return <div key={node.id} className="node node-script-preview" style={{...style,backgroundImage:`url(/goodies/images/script-${slug}.png)`,backgroundSize:'contain',backgroundPosition:'center',backgroundRepeat:'no-repeat',backgroundColor:'#fff'}} data-node-id={node.id} data-testid={'node-' + node.id} data-abs-x={node.absX} data-abs-y={node.absY} aria-label={node.node.name ?? slug} />;
      }
      return <div key={node.id} className="node node-script" style={{ ...style, background: '#e9f7ef', border: '1px solid #a8e9be', color: '#078449', display: 'grid', placeItems: 'center', textAlign: 'center', fontSize: 10 }} data-node-id={node.id} data-testid={'node-' + node.id} data-abs-x={node.absX} data-abs-y={node.absY}><span>〈〉<br />No script file selected</span></div>;
    }
    if (node.type === 'browser') {
      return <div key={node.id} className="node node-browser" style={style} data-node-id={node.id} data-testid={'node-' + node.id} data-abs-x={node.absX} data-abs-y={node.absY}>
        <svg className="browser-placeholder-globe" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="43" fill="none" stroke="currentColor" strokeWidth="6"/><ellipse cx="48" cy="48" rx="20" ry="43" fill="none" stroke="currentColor" strokeWidth="6"/><path d="M5 48h86" fill="none" stroke="currentColor" strokeWidth="6"/></svg>
      </div>;
    }

    if (node.type === 'text') {
      const textStyle: CSSProperties = {
        ...style,
        color: node.style.fill ?? '#111827',
        fontFamily: fontStack(node.node.fontFamily),
        fontSize: typeof node.node.fontSize === 'number' ? node.node.fontSize : 14,
        fontWeight: (node.node.fontWeight as CSSProperties['fontWeight']) ?? 'normal',
        lineHeight: typeof node.node.lineHeight === 'number' ? node.node.lineHeight : 1.2,
        textAlign: (node.node.textAlign as CSSProperties['textAlign']) ?? 'left',
      };
      return (
        <div
          key={node.id}
          className="node node-text"
          style={textStyle}
          data-node-id={node.id}
          data-testid={'node-' + node.id}
          data-abs-x={node.absX}
          data-abs-y={node.absY}
          data-fill={node.style.fill ?? ''}
        >
          {String(node.node.content ?? '')}
        </div>
      );
    }

    const fillLayers = Array.isArray(node.node.fill) ? node.node.fill.filter(layer => layer.enabled).slice().reverse() : node.node.fill && typeof node.node.fill === 'object' && node.node.fill.enabled ? [node.node.fill] : [];
    const backgrounds = fillLayers.map(layer => layer.type === 'shader' ? Object.hasOwn(goodiesNodes, String(node.node.name ?? '')) ? `url(/goodies/images/shader-${String(node.node.name).toLowerCase().replaceAll(' ','-')}.webp)` : 'none' : layer.type === 'image' ? imageUrls[layer.url] ? `url("${imageUrls[layer.url]}")` : 'none' : gradientCss(layer) ?? 'none');
    const blendModes = fillLayers.map(layer => (layer.blendMode ?? 'normal').replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()));
    const isEllipse = node.type === 'ellipse';
    const polygonSides = node.type === 'polygon' ? Math.max(3, Math.min(64, Math.round(Number(node.node.polygonCount) || 3))) : 0;
    const polygonPoints = polygonSides ? Array.from({ length: polygonSides }, (_, index) => {
      const angle = -Math.PI / 2 + 2 * Math.PI * index / polygonSides;
      return `${50 + 50 * Math.cos(angle)}% ${50 + 50 * Math.sin(angle)}%`;
    }).join(', ') : undefined;
    const frameStyle: CSSProperties = {
      ...style,
      backgroundColor: typeof node.node.fill === 'object' ? undefined : node.style.fill,
      backgroundImage: backgrounds.length ? backgrounds.join(', ') : undefined,
      backgroundSize: fillLayers.length ? fillLayers.map(layer => layer.type === 'image' ? 'cover' : 'auto').join(', ') : undefined,
      backgroundPosition: fillLayers.length ? fillLayers.map(() => 'center').join(', ') : undefined,
      backgroundBlendMode: blendModes.length ? blendModes.join(', ') : undefined,
      borderTop: node.style.stroke && (typeof node.node.strokeWidth === 'number' ? node.node.strokeWidth : node.node.strokeWidth?.top) ? (typeof node.node.strokeWidth === 'number' ? node.node.strokeWidth : node.node.strokeWidth!.top) + 'px solid ' + node.style.stroke : undefined,
      borderRight: node.style.stroke && (typeof node.node.strokeWidth === 'number' ? node.node.strokeWidth : node.node.strokeWidth?.right) ? (typeof node.node.strokeWidth === 'number' ? node.node.strokeWidth : node.node.strokeWidth!.right) + 'px solid ' + node.style.stroke : undefined,
      borderBottom: node.style.stroke && (typeof node.node.strokeWidth === 'number' ? node.node.strokeWidth : node.node.strokeWidth?.bottom) ? (typeof node.node.strokeWidth === 'number' ? node.node.strokeWidth : node.node.strokeWidth!.bottom) + 'px solid ' + node.style.stroke : undefined,
      borderLeft: node.style.stroke && (typeof node.node.strokeWidth === 'number' ? node.node.strokeWidth : node.node.strokeWidth?.left) ? (typeof node.node.strokeWidth === 'number' ? node.node.strokeWidth : node.node.strokeWidth!.left) + 'px solid ' + node.style.stroke : undefined,
      borderRadius: isEllipse ? '50%' : node.style.cornerRadius !== undefined ? String(node.style.cornerRadius) : undefined,
      clipPath: polygonPoints ? `polygon(${polygonPoints})` : undefined,
      overflow: node.clipped ? 'hidden' : 'visible',
    };

    return (
      <div
        key={node.id}
        className={'node node-' + node.type}
        style={frameStyle}
        data-node-id={node.id}
        data-testid={'node-' + node.id}
        data-abs-x={node.absX}
        data-abs-y={node.absY}
        data-fill={node.style.fill ?? ''}
      >
        {renderChildren(node)}
      </div>
    );
  };

  const renderChildren = (node: PositionedNode): JSX.Element[] | null => {
    const children = childrenByParent.get(node.id);
    if (!children || children.length === 0) return null;
    return children.map(renderNode);
  };

  const roots = childrenByParent.get(null) ?? [];
  const selectedNode = selectedIds.length === 1 ? layout.byId.get(selectedIds[0]) ?? null : null;
  const frames = layout.nodes.filter((node) => node.type === 'frame' || node.type === 'group');

  return (
    <div
      ref={viewportRef}
      className={"canvas-viewport" + (!preferences.animations ? " no-animations" : "")}
      data-testid="canvas-root"
      data-tool={tool}
      onDragOver={onComponentDragOver}
      onDrop={onComponentDrop}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
    >
      {preferences.showPixelGrid && zoom >= 4 ? <div className="canvas-pixel-grid" aria-hidden="true" style={{ backgroundSize: zoom + 'px ' + zoom + 'px', backgroundPosition: pan.x + 'px ' + pan.y + 'px' }} /> : null}
      <div className="canvas-stage" style={{ transform: 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + zoom + ')' }}>
        <div className="node-layer">{roots.map(renderNode)}</div>
        <div className="frame-label-layer">
          {frames.map((node) => (
            <div key={'label-' + node.id} className="node-label" style={{ left: node.absX, top: node.absY - 16 }}>
              {node.name}
            </div>
          ))}
        </div>
        <div className="selection-layer">
          {selectedIds.map((id) => {
            const node = layout.byId.get(id);
            if (!node) return null;
            return (
              <div
                key={'outline-' + id}
                className="selection-outline"
                style={{ left: node.absX, top: node.absY, width: node.width, height: node.height }}
              />
            );
          })}
          {selectedNode ? (
            <>
              <div className="selection-size" style={{ left: selectedNode.absX + selectedNode.width / 2, top: selectedNode.absY + selectedNode.height + 6 }}>
                {Math.round(selectedNode.width)} &times; {Math.round(selectedNode.height)}
              </div>
              {HANDLES.map((handle) => {
                const offset = handleOffset(handle, selectedNode.width, selectedNode.height);
                return (
                  <div
                    key={'handle-' + handle}
                    className="resize-handle"
                    data-handle={handle}
                    style={{ left: selectedNode.absX + offset.x, top: selectedNode.absY + offset.y }}
                  />
                );
              })}
            </>
          ) : null}
          {boxRect ? <div className="box-select" style={{ left: boxRect.x, top: boxRect.y, width: boxRect.width, height: boxRect.height }} /> : null}
        </div>
        <div className="preview-layer">
          {tool === 'pen' && penCursor && penPointsRef.current.length ? <svg aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none' }}><line x1={penPointsRef.current.at(-1)!.x} y1={penPointsRef.current.at(-1)!.y} x2={penCursor.x} y2={penCursor.y} stroke="#2674dd" strokeWidth={1 / zoom} /></svg> : null}
          {drawRect ? <div className="draw-preview" style={{ left: drawRect.x, top: drawRect.y, width: drawRect.width, height: drawRect.height }} /> : null}
        </div>
      </div>
    </div>
  );
}
