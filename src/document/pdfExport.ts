import type { LayoutResult, PositionedNode } from './layout';

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const xml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? character);
const finite = (value: number, fallback = 0): number => Number.isFinite(value) ? value : fallback;
const color = (value: string | undefined, fallback: string): string => value && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;

function renderSvg(layout: LayoutResult, slide: PositionedNode): string {
  const belongs = (node: PositionedNode): boolean => {
    let parent = node.parentId;
    while (parent) {
      if (parent === slide.id) return true;
      parent = layout.byId.get(parent)?.parentId ?? null;
    }
    return false;
  };
  const shapes = [slide, ...layout.nodes.filter(node => belongs(node))].map(node => {
    const x = finite(node.absX - slide.absX), y = finite(node.absY - slide.absY);
    const width = Math.max(1, finite(node.width, 1)), height = Math.max(1, finite(node.height, 1));
    const opacity = node.style.opacity === undefined ? '' : ` opacity="${Math.max(0, Math.min(1, finite(node.style.opacity, 1)))}"`;
    const fill = color(node.style.fill, node.type === 'frame' ? '#ffffff' : '#e5e7eb');
    const stroke = node.style.stroke ? ` stroke="${color(node.style.stroke, '#000000')}" stroke-width="${Math.max(0, finite(node.style.strokeWidth ?? 1))}"` : '';
    if (node.type === 'text') {
      const size = Math.max(1, finite(Number(node.node.fontSize ?? 14), 14));
      const content = xml(node.node.content ?? '');
      return `<text x="${x}" y="${y + size}" fill="${color(node.style.fill, '#111827')}" font-family="Inter,Arial,sans-serif" font-size="${size}"${opacity}>${content}</text>`;
    }
    if (node.type === 'path' && typeof node.node.geometry === 'string') return `<path d="${xml(node.node.geometry)}" transform="translate(${x} ${y})" fill="${fill}"${stroke}${opacity}/>`;
    if (node.type === 'ellipse') return `<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}" fill="${fill}"${stroke}${opacity}/>`;
    if (node.type === 'polygon') {
      const sides = Math.max(3, Math.min(64, Math.round(Number(node.node.polygonCount) || 3)));
      const points = Array.from({ length: sides }, (_, index) => { const angle = -Math.PI / 2 + 2 * Math.PI * index / sides; return `${x + width / 2 + width / 2 * Math.cos(angle)},${y + height / 2 + height / 2 * Math.sin(angle)}`; }).join(' ');
      return `<polygon points="${points}" fill="${fill}"${stroke}${opacity}/>`;
    }
    const radius = typeof node.style.cornerRadius === 'number' ? Math.max(0, node.style.cornerRadius) : 0;
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}"${stroke}${opacity}/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, finite(slide.width, 1))}" height="${Math.max(1, finite(slide.height, 1))}" viewBox="0 0 ${Math.max(1, finite(slide.width, 1))} ${Math.max(1, finite(slide.height, 1))}">${shapes}</svg>`;
}

async function jpegForSlide(layout: LayoutResult, slide: PositionedNode): Promise<{ data: Uint8Array; width: number; height: number }> {
  const scale = Math.min(1, 4096 / Math.max(slide.width, slide.height, 1));
  const width = Math.max(1, Math.round(slide.width * scale)), height = Math.max(1, Math.round(slide.height * scale));
  const url = URL.createObjectURL(new Blob([renderSvg(layout, slide)], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable for PDF export');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
    const bytes = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    return { data: Uint8Array.from(bytes, character => character.charCodeAt(0)), width, height };
  } finally { URL.revokeObjectURL(url); }
}

function pdfFromJpegs(pages: { data: Uint8Array; width: number; height: number }[]): Blob {
  const objects: Uint8Array[] = [];
  objects.push(encode('<< /Type /Catalog /Pages 2 0 R >>'));
  objects.push(encode(`<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 3} 0 R`).join(' ')}] /Count ${pages.length} >>`));
  for (const [index, page] of pages.entries()) {
    const pageId = 3 + index * 3, contentId = pageId + 1, imageId = pageId + 2;
    objects.push(encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
    const commands = encode(`q ${page.width} 0 0 ${page.height} 0 0 cm /Im0 Do Q`);
    objects.push(joinBytes([encode(`<< /Length ${commands.length} >>\nstream\n`), commands, encode('\nendstream')]));
    objects.push(joinBytes([encode(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.data.length} >>\nstream\n`), page.data, encode('\nendstream')]));
  }
  const parts: Uint8Array[] = [encode('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n')];
  const offsets = [0]; let length = parts[0].length;
  for (const [index, object] of objects.entries()) {
    offsets.push(length);
    const chunk = joinBytes([encode(`${index + 1} 0 obj\n`), object, encode('\nendobj\n')]);
    parts.push(chunk); length += chunk.length;
  }
  const xref = length;
  parts.push(encode(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

function joinBytes(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

export async function exportSlidesPdf(layout: LayoutResult, slides: PositionedNode[], fileName: string): Promise<Blob> {
  if (slides.length === 0) throw new Error('No slides to export');
  const pdf = pdfFromJpegs(await Promise.all(slides.map(slide => jpegForSlide(layout, slide))));
  const name = fileName.replace(/\.(pen|json)$/i, '').replace(/[^a-z0-9._ -]+/gi, '_') || 'slides';
  const url = URL.createObjectURL(pdf);
  const link = document.createElement('a'); link.href = url; link.download = name + '.pdf';
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  return pdf;
}
