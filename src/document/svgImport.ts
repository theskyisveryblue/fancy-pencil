import type { PenNode } from './types';

const SUPPORTED = new Set(['rect', 'circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'g']);
const MAX_BYTES = 4 * 1024 * 1024;

function number(element: Element, name: string, fallback = 0): number {
  const value = Number.parseFloat(element.getAttribute(name) ?? '');
  return Number.isFinite(value) ? value : fallback;
}

function color(value: string): string | undefined {
  if (value === 'none' || value === 'transparent') return undefined;
  const el = document.createElement('span');
  el.style.color = value;
  document.body.append(el);
  const rgb = getComputedStyle(el).color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  el.remove();
  if (!rgb) return value || undefined;
  const hex = rgb.slice(1, 4).map(v => Number(v).toString(16).padStart(2, '0')).join('');
  return hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5] ? '#' + hex[0] + hex[2] + hex[4] : '#' + hex;
}

function style(element: Element, shape: PenNode): void {
  const computed = getComputedStyle(element);
  const fill = color(computed.fill || element.getAttribute('fill') || '#000');
  if (fill) shape.fill = fill;
  const stroke = color(computed.stroke || element.getAttribute('stroke') || 'none');
  if (stroke) {
    shape.stroke = stroke;
    const strokeWidth = Number.parseFloat(computed.strokeWidth || element.getAttribute('stroke-width') || '1');
    shape.strokeWidth = Number.isFinite(strokeWidth) ? strokeWidth : 1;
  }
  const opacity = Number.parseFloat(computed.opacity || element.getAttribute('opacity') || '1');
  if (opacity < 1) shape.opacity = opacity;
}

function points(element: Element): number[][] {
  const values = (element.getAttribute('points') ?? '').match(/-?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
  const result: number[][] = [];
  for (let i = 0; i + 1 < values.length; i += 2) result.push([values[i], values[i + 1]]);
  return result;
}

function bounds(points: number[][]): { x: number; y: number; width: number; height: number } {
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y) };
}

function pathFromPoints(points: number[][], closed: boolean): string {
  const base = points[0];
  let text = 'M0 0';
  for (let index = 1; index < points.length; index++) text += 'l' + (points[index][0] - points[index - 1][0]) + ' ' + (points[index][1] - points[index - 1][1]);
  if (closed) text += 'z';
  return text;
}

export function importSvg(text: string, name: string, id: () => string): PenNode {
  if (text.length > MAX_BYTES) throw new Error('SVG exceeds 4 MB.');
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = parsed.documentElement;
  if (svg.localName !== 'svg' || parsed.querySelector('parsererror')) throw new Error('Invalid SVG.');
  if (svg.querySelector('script,foreignObject,image,use,animate,animateMotion,animateTransform')) throw new Error('SVG includes unsupported external or active content.');
  const viewBox = (svg.getAttribute('viewBox') ?? '').split(/[ ,]+/).map(Number);
  const width = number(svg, 'width', viewBox.length === 4 ? viewBox[2] : 0);
  const height = number(svg, 'height', viewBox.length === 4 ? viewBox[3] : 0);
  if (!(width > 0 && height > 0)) throw new Error('SVG must have positive width and height.');
  const live = document.importNode(svg, true) as unknown as SVGSVGElement;
  live.style.position = 'absolute'; live.style.left = '-10000px'; live.style.top = '-10000px';
  document.body.append(live);
  try {
    const convert = (element: Element, dx = 0, dy = 0): PenNode | null => {
      const type = element.localName;
      if (!SUPPORTED.has(type)) return null;
      if (type === 'g') {
        const translate = (element.getAttribute('transform') ?? '').match(/translate\(\s*([-\d.]+)(?:[ ,]+([-\d.]+))?\s*\)/);
        const nextX = dx + (translate ? Number(translate[1]) : 0), nextY = dy + (translate ? Number(translate[2] ?? 0) : 0);
        return { type: 'group', id: id(), x: 0, y: 0, children: [...element.children].map(child => convert(child, nextX, nextY)).filter((item): item is PenNode => item !== null) };
      }
      let node: PenNode;
      if (type === 'rect') {
        node = { type: 'rectangle', id: id(), x: dx + number(element, 'x'), y: dy + number(element, 'y'), width: number(element, 'width'), height: number(element, 'height') };
        const radius = number(element, 'rx'); if (radius) node.cornerRadius = radius;
      } else if (type === 'circle' || type === 'ellipse') {
        const rx = type === 'circle' ? number(element, 'r') : number(element, 'rx');
        const ry = type === 'circle' ? rx : number(element, 'ry');
        node = { type: 'ellipse', id: id(), x: dx + number(element, 'cx') - rx, y: dy + number(element, 'cy') - ry, width: rx * 2, height: ry * 2 };
      } else if (type === 'line') {
        const coords = [[number(element, 'x1'), number(element, 'y1')], [number(element, 'x2'), number(element, 'y2')]];
        const box = bounds(coords);
        node = { type: 'path', id: id(), x: dx + box.x, y: dy + box.y, width: box.width, height: box.height, geometry: pathFromPoints(coords, false), fill: '#000000' };
      } else if (type === 'polygon' || type === 'polyline') {
        const coords = points(element);
        if (coords.length < 2) return null;
        const box = bounds(coords);
        node = { type: 'path', id: id(), x: dx + box.x, y: dy + box.y, width: box.width, height: box.height, geometry: pathFromPoints(coords, type === 'polygon') };
      } else {
        const box = (element as SVGGraphicsElement).getBBox();
        node = { type: 'path', id: id(), x: dx + box.x, y: dy + box.y, width: Math.max(1, box.width), height: Math.max(1, box.height), geometry: element.getAttribute('d') ?? '', sourceViewBox: `${box.x} ${box.y} ${Math.max(1, box.width)} ${Math.max(1, box.height)}` };
      }
      style(element, node);
      if (type === 'line') node.fill = '#000000';
      return node;
    };
    return { type: 'frame', id: id(), name, clip: true, width, height, layout: 'none', children: [...live.children].map(child => convert(child)).filter((item): item is PenNode => item !== null) };
  } finally { live.remove(); }
}
