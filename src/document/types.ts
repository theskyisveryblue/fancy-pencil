export type PenNodeType =
  | 'frame'
  | 'group'
  | 'rectangle'
  | 'ellipse'
  | 'polygon'
  | 'path'
  | 'text'
  | 'note'
  | 'context'
  | 'prompt'
  | 'icon'
  | 'script'
  | 'browser'
  | 'ref';

export type PenSize = number | string;
export type PenLayout = 'none' | 'horizontal' | 'vertical';

export type PenImageFill = { type: 'image'; enabled: boolean; url: string; mode: 'fill' | 'fit' | 'stretch'; opacity?: number; blendMode?: string };
export type PenGradientFill = { type: 'gradient'; enabled: boolean; gradientType: 'linear' | 'radial'; rotation: number; colors: { color: string; position: number }[]; center?: { x?: number; y?: number }; size?: { width?: number; height?: number }; opacity?: number; blendMode?: string };
export type PenColorFill = { type: 'color'; enabled: boolean; color: string; opacity?: number; blendMode?: string };
export type PenShaderFill = { type: 'shader'; enabled: boolean; url: string; uniforms: Record<string, number | string>; opacity?: number; blendMode?: string };
export type PenFillLayer = PenImageFill | PenGradientFill | PenColorFill | PenShaderFill;

export interface PenNode {
  id: string;
  type: PenNodeType;
  name?: string;
  x?: number;
  y?: number;
  width?: PenSize;
  height?: PenSize;
  fill?: string | PenFillLayer | PenFillLayer[];
  stroke?: string | PenColorFill;
  strokeWidth?: number | { top?: number; right?: number; bottom?: number; left?: number };
  strokeAlignment?: 'inner' | 'outer' | 'center';
  cornerRadius?: number | number[];
  clip?: boolean;
  opacity?: number;
  flipX?: boolean;
  flipY?: boolean;
  rotation?: number;
  layout?: PenLayout;
  layoutPosition?: 'absolute' | 'auto';
  gap?: number | string;
  padding?: number | number[];
  justifyContent?: string;
  alignItems?: string;
  reusable?: boolean;
  ref?: string;
  context?: string;
  textGrowth?: 'auto' | 'fixed-width' | 'fixed-width-height';
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  children?: PenNode[];
  [key: string]: unknown;
}

export interface PenVariable {
  type: 'color' | 'number' | 'string' | 'boolean';
  value: unknown;
  [key: string]: unknown;
}

export interface PenDocument {
  version: string;
  children: PenNode[];
  themes?: { mode?: string[]; [key: string]: unknown };
  variables?: Record<string, PenVariable>;
  imports?: Record<string, string>;
  fileToken?: string;
  [key: string]: unknown;
}

export const SUPPORTED_VERSION = '2.19';

export const CONTAINER_TYPES: PenNodeType[] = ['frame', 'group'];

export const EDITABLE_TYPES: PenNodeType[] = ['frame', 'rectangle', 'ellipse', 'text'];

export const KNOWN_NODE_TYPES: PenNodeType[] = [
  'frame',
  'group',
  'rectangle',
  'ellipse',
  'polygon',
  'path',
  'text',
  'note',
  'context',
  'prompt',
  'icon',
  'script',
  'browser',
  'ref',
];

export const UNSUPPORTED_NODE_TYPES: PenNodeType[] = [
  'note',
  'context',
];
