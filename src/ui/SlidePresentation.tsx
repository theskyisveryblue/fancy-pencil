import { useEffect, useMemo, type CSSProperties } from 'react';
import type { LayoutResult, PositionedNode } from '../document/layout';

export function SlidePresentation({ layout, slides, index, onIndex, onClose }: {
  layout: LayoutResult; slides: PositionedNode[]; index: number;
  onIndex: (index: number) => void; onClose: () => void;
}) {
  const slide = slides[index];
  const scale = slide ? Math.min((window.innerWidth - 120) / Math.max(slide.width, 1), (window.innerHeight - 80) / Math.max(slide.height, 1), 1.7) : 1;
  const children = useMemo(() => {
    const map = new Map<string | null, PositionedNode[]>();
    for (const node of layout.nodes) map.set(node.parentId, [...(map.get(node.parentId) ?? []), node]);
    return map;
  }, [layout]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(); return; }
      if (event.key === 'ArrowRight') { event.preventDefault(); event.stopImmediatePropagation(); onIndex(Math.min(index + 1, slides.length - 1)); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); event.stopImmediatePropagation(); onIndex(Math.max(index - 1, 0)); }
    };
    document.addEventListener('keydown', handle, true);
    return () => document.removeEventListener('keydown', handle, true);
  }, [index, slides.length, onIndex, onClose]);
  if (!slide) return null;
  const render = (node: PositionedNode): JSX.Element => {
    const isText = node.type === 'text';
    const style: CSSProperties = {
      position: 'absolute', left: node.localX, top: node.localY,
      width: node.width, height: node.height,
      background: isText ? undefined : node.style.fill,
      borderRadius: node.type === 'ellipse' ? '50%' : typeof node.style.cornerRadius === 'number' ? node.style.cornerRadius : undefined,
      borderTop: node.style.stroke && (typeof node.node.strokeWidth === 'number' ? node.node.strokeWidth : node.node.strokeWidth?.top) ? (typeof node.node.strokeWidth === 'number' ? node.node.strokeWidth : node.node.strokeWidth!.top) + 'px solid ' + node.style.stroke : undefined,
      borderRight: node.style.stroke && (typeof node.node.strokeWidth === 'number' ? node.node.strokeWidth : node.node.strokeWidth?.right) ? (typeof node.node.strokeWidth === 'number' ? node.node.strokeWidth : node.node.strokeWidth!.right) + 'px solid ' + node.style.stroke : undefined,
      borderBottom: node.style.stroke && (typeof node.node.strokeWidth === 'number' ? node.node.strokeWidth : node.node.strokeWidth?.bottom) ? (typeof node.node.strokeWidth === 'number' ? node.node.strokeWidth : node.node.strokeWidth!.bottom) + 'px solid ' + node.style.stroke : undefined,
      borderLeft: node.style.stroke && (typeof node.node.strokeWidth === 'number' ? node.node.strokeWidth : node.node.strokeWidth?.left) ? (typeof node.node.strokeWidth === 'number' ? node.node.strokeWidth : node.node.strokeWidth!.left) + 'px solid ' + node.style.stroke : undefined,
      opacity: node.style.opacity,
      overflow: node.clipped ? 'hidden' : 'visible',
      color: isText ? node.style.fill ?? '#111827' : undefined,
      fontFamily: isText ? String(node.node.fontFamily ?? 'Inter') : undefined,
      fontSize: isText && typeof node.node.fontSize === 'number' ? node.node.fontSize : undefined,
      fontWeight: isText ? String(node.node.fontWeight ?? 'normal') : undefined,
      lineHeight: isText ? typeof node.node.lineHeight === 'number' ? node.node.lineHeight : 1.2 : undefined,
      whiteSpace: isText ? 'pre-wrap' : undefined,
    };
    return <div key={node.id} className={'slide-node slide-'+node.type} style={style} data-slide-node={node.id}>
      {isText ? String(node.node.content ?? '') : null}
      {(children.get(node.id) ?? []).map(render)}
    </div>;
  };
  return <div className="presentation" data-testid="slide-presentation" role="dialog" aria-modal="true" aria-label="Presentation">
    <button type="button" className="presentation-exit" data-testid="presentation-exit" aria-label="Exit presentation" onClick={onClose}>⛶</button>
    <div className="presentation-slide" data-testid="presentation-slide" style={{width:slide.width,height:slide.height,transform:'scale('+scale+')'}}>
      {render({...slide,localX:0,localY:0})}
    </div>
    <div className="presentation-nav">
      <button type="button" aria-label="Previous slide" data-testid="previous-slide" disabled={index===0} onClick={() => onIndex(index-1)}>‹</button>
      <span data-testid="slide-counter">{index+1} / {slides.length}</span>
      <button type="button" aria-label="Next slide" data-testid="next-slide" disabled={index===slides.length-1} onClick={() => onIndex(index+1)}>›</button>
    </div>
  </div>;
}
