import JSZip from 'jszip';
import { serializePenFile } from './serialize';
import type { PenDocument, PenNode } from './types';

const DB_NAME = 'pen-clone.assets.v1';
const STORE = 'images';
const MAX_BYTES = 40 * 1024 * 1024;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function asset(path: string, value?: Blob): Promise<Blob | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, value ? 'readwrite' : 'readonly');
      const request = value ? tx.objectStore(STORE).put(value, path) : tx.objectStore(STORE).get(path);
      request.onsuccess = () => resolve(value ?? request.result as Blob | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export function getImageAsset(path: string): Promise<Blob | undefined> { return asset(path); }

export async function putImageAsset(path: string, bytes: Uint8Array, mime: string): Promise<void> {
  if (!/^images\/[a-zA-Z0-9._-]+$/.test(path) || !mime.startsWith('image/') || bytes.byteLength > MAX_BYTES) throw new Error('Invalid imported image asset.');
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  await asset(path, new Blob([copy], { type: mime }));
}

export async function importImageAsset(file: File): Promise<{ path: string; width: number; height: number }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!MIME[ext] || file.size > MAX_BYTES || file.size === 0) throw new Error('Use a PNG, JPEG, GIF, or WebP under 40 MB.');
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width, height = bitmap.height;
  bitmap.close();
  if (!width || !height) throw new Error('Image has no dimensions.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  let path = 'images/' + safeName;
  if (await asset(path)) path = 'images/' + crypto.randomUUID().slice(0, 8) + '-' + safeName;
  await asset(path, file);
  return { path, width, height };
}

function imagePaths(document: PenDocument): string[] {
  const paths = new Set<string>();
  const visit = (node: PenNode): void => {
    const fills = Array.isArray(node.fill) ? node.fill : node.fill && typeof node.fill === 'object' ? [node.fill] : [];
    for (const fill of fills) if (fill.type === 'image') paths.add(fill.url);
    node.children?.forEach(visit);
  };
  document.children.forEach(visit);
  return [...paths];
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function savePenBundle(document: PenDocument, fileName: string): Promise<boolean> {
  const paths = imagePaths(document);
  if (!paths.length) return false;
  const zip = new JSZip();
  const penName = fileName.endsWith('.pen') ? fileName : fileName + '.pen';
  zip.file(penName, serializePenFile(document));
  for (const path of paths) {
    const blob = await asset(path);
    if (!blob) throw new Error('Missing image asset: ' + path);
    zip.file(path, blob);
  }
  download(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), penName + '.zip');
  return true;
}

export async function openPenBundle(file: File): Promise<{ text: string; fileName: string }> {
  const zip = await JSZip.loadAsync(file);
  const pen = Object.values(zip.files).find(entry => !entry.dir && entry.name.endsWith('.pen'));
  if (!pen) throw new Error('Bundle has no .pen file.');
  const text = await pen.async('string');
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !/^images\/[a-zA-Z0-9._-]+$/.test(entry.name)) continue;
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
    if (!MIME[ext]) continue;
    const bytes = await entry.async('uint8array');
    if (bytes.byteLength > MAX_BYTES) throw new Error('Image asset exceeds 40 MB.');
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    await asset(entry.name, new Blob([copy], { type: MIME[ext] }));
  }
  return { text, fileName: pen.name.split('/').pop() ?? 'import.pen' };
}
