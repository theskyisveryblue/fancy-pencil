import { generateId } from './ids';
import type { PenDocument, PenNode } from './types';
import { SUPPORTED_VERSION } from './types';

export type EditorTool = 'move' | 'scale' | 'hand' | 'frame' | 'rectangle' | 'ellipse' | 'polygon' | 'icon' | 'script' | 'prompt' | 'text' | 'browser' | 'pen';

export type CreateTool = Exclude<EditorTool, 'move' | 'scale' | 'hand' | 'pen'>;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const TOOL_DEFAULT_BOX: Record<CreateTool, Box> = {
  rectangle: { x: 0, y: 0, width: 160, height: 80 },
  ellipse: { x: 0, y: 0, width: 120, height: 120 },
  polygon: { x: 0, y: 0, width: 100, height: 100 },
  icon: { x: 0, y: 0, width: 24, height: 24 },
  script: { x: 0, y: 0, width: 200, height: 200 },
  prompt: { x: 0, y: 0, width: 250, height: 219 },
  text: { x: 0, y: 0, width: 200, height: 24 },
  frame: { x: 0, y: 0, width: 320, height: 240 },
  browser: { x: 0, y: 0, width: 1200, height: 900 },
};

export function createEmptyDocument(): PenDocument {
  return {
    version: SUPPORTED_VERSION,
    children: [
      {
        type: 'frame',
        id: generateId(),
        x: 0,
        y: 0,
        name: 'Frame',
        clip: true,
        width: 800,
        height: 600,
        fill: '#FFFFFF',
        layout: 'none',
      },
    ],
  };
}

export function createNodeForTool(tool: CreateTool, box: Box): PenNode {
  const id = generateId();
  const x = Math.round(box.x);
  const y = Math.round(box.y);
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));

  switch (tool) {
    case 'browser':
      return { type: 'browser', id, x, y, width: 1200, height: 900 };
    case 'rectangle':
      return {
        type: 'rectangle',
        id,
        x,
        y,
        name: 'Rectangle',
        width,
        height,
        fill: '#E5E7EB',
        cornerRadius: 8,
      };
    case 'ellipse':
      return { type: 'ellipse', id, x, y, name: 'Ellipse', width, height, fill: '#F97316' };
    case 'polygon':
      return { type: 'polygon', id, x, y, width, height, polygonCount: 3, fill: '#CCCCCC' };
    case 'icon':
      return { type: 'icon', id, x, y, width: 24, height: 24, icon: 'heart', library: 'lucide', fill: '#000000' };
    case 'script':
      return { type: 'script', id, x, y, width: 200, height: 200 };
    case 'prompt':
      return { type: 'prompt', id, x, y, width: 250, height: 219 };
    case 'text':
      return {
        type: 'text',
        id,
        x,
        y,
        name: 'Text',
        width: Math.max(width, 80),
        content: 'Text',
        fill: '#111827',
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: 'normal',
        textGrowth: 'fixed-width',
      };
    case 'frame':
      return { type: 'frame', id, x, y, name: 'Frame', width, height, fill: '#FFFFFF', clip: true, layout: 'none' };
    default:
      return { type: 'rectangle', id, x, y, name: 'Rectangle', width, height, fill: '#E5E7EB' };
  }
}
