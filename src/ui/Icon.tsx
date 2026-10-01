const PATHS: Record<string, string> = {
  layers: 'M4 6h16M4 12h16M4 18h10',
  move: 'M6 3l12 8-5 1.5L11 18z',
  rectangle: 'M4 5h16v14H4z',
  ellipse: 'M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z',
  pen: 'M5 19l2-6 8-8 4 4-8 8z',
  text: 'M6 5h12M12 5v14',
  frame: 'M8 4v16M16 4v16M4 8h16M4 16h16',
  note: 'M5 5h14v9l-5 5H5z',
  browser: 'M4 6h16v12H4zM4 10h16',
  hand: 'M8 12V6a1.5 1.5 0 013 0v5m0-1V5a1.5 1.5 0 013 0v6m0-2v-1a1.5 1.5 0 013 0v6a6 6 0 01-6 6h-1a5 5 0 01-5-5v-4a1.5 1.5 0 013 0',
  variables: 'M12 4l8 8-8 8-8-8z',
  keyboard: 'M3 7h18v10H3zM6 10h1M9 10h1M12 10h1M15 10h1M18 10h1M7 14h10',
  plus: 'M12 6v12M6 12h12',
  minus: 'M6 12h12',
  chevron: 'M6 9l6 6 6-6',
  warning: 'M12 4l8 15H4zM12 10v4M12 16v.5',
  info: 'M12 4a8 8 0 100 16 8 8 0 000-16zM12 11v5M12 8v.5',
  close: 'M7 7l10 10M17 7L7 17',
  play: 'M8 5l11 7-11 7z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  folder: 'M3 6h6l2 2h10v10H3z',
  settings: 'M12 9a3 3 0 100 6 3 3 0 000-6zM4 12h2m12 0h2M12 4v2m0 12v2',
  target: 'M12 4v4M12 16v4M4 12h4M16 12h4M12 9a3 3 0 100 6 3 3 0 000-6z',
  search: 'M11 4a7 7 0 105 11l4 4-1.5 1.5-4-4A7 7 0 0011 4z',
  undo: 'M9 7L5 11l4 4M5 11h9a5 5 0 015 5',
  redo: 'M15 7l4 4-4 4M19 11h-9a5 5 0 00-5 5',
  trash: 'M6 7h12M9 7V5h6v2M8 7l1 12h6l1-12',
  component: 'M12 4l4 4-4 4-4-4zM12 12l4 4-4 4-4-4z',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  sun: 'M12 7a5 5 0 100 10 5 5 0 000-10zM12 2v2m0 16v2M2 12h2m16 0h2',
  moon: 'M15 4a8 8 0 100 16 8 8 0 010-16z',
  alignLeft: 'M4 4v16M8 8h11M8 16h7',
  alignCenterH: 'M12 4v16M6 8h12M8 16h8',
  alignRight: 'M20 4v16M5 8h11M9 16h7',
  alignTop: 'M4 4h16M8 8v11M16 8v7',
  alignMiddle: 'M4 12h16M8 6v12M16 8v8',
  alignBottom: 'M4 20h16M8 5v11M16 9v7',
  rotate: 'M12 5a7 7 0 107 7M12 5v0M12 2v4',
  flipH: 'M12 4v16M8 8L4 12l4 4M16 8l4 4-4 4',
  flipV: 'M4 12h16M8 8l4-4 4 4M8 16l4 4 4-4',
};

export interface IconProps {
  name: keyof typeof PATHS | string;
  size?: number;
}

export function Icon({ name, size = 16 }: IconProps) {
  const path = PATHS[name] ?? PATHS.rectangle;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
