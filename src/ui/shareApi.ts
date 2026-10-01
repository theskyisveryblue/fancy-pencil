import type { PenDocument } from '../document/types';

type RuntimeShareWindow = Window & { __PEN_SHARE_API_URL__?: string };
export function shareApiBase(): string {
  const runtime = (window as RuntimeShareWindow).__PEN_SHARE_API_URL__;
  return String(runtime ?? import.meta.env.VITE_PEN_SHARE_API ?? '').trim().replace(/\/$/, '');
}

export async function getShareStatus(): Promise<{ ready: boolean; reason?: string }> {
  const base = shareApiBase();
  if (!base) return { ready: false, reason: 'Share service URL is not configured.' };
  try {
    const response = await fetch(base + '/v1/status');
    if (!response.ok) return { ready: false, reason: 'Share service returned HTTP ' + response.status };
    const data = await response.json() as { ready?: boolean; reason?: string };
    return { ready: data.ready === true, reason: data.reason };
  } catch (error) {
    return { ready: false, reason: 'Share service unavailable: ' + (error as Error).message };
  }
}

export async function createShareSnapshot(document: PenDocument, fileName: string, uploadKey: string): Promise<string> {
  const base = shareApiBase();
  if (!base) throw new Error('Share service URL is not configured.');
  const response = await fetch(base + '/v1/shares', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + uploadKey },
    body: JSON.stringify({ fileName, document }),
  });
  const data = await response.json() as { url?: string; error?: string };
  if (!response.ok || !data.url) throw new Error(data.error ?? 'Share upload failed (HTTP ' + response.status + ').');
  return data.url;
}

export async function loadShareSnapshot(id: string): Promise<{ fileName: string; document: PenDocument }> {
  if (!/^[a-f0-9]{48}$/.test(id)) throw new Error('Invalid share identifier.');
  const base = shareApiBase();
  if (!base) throw new Error('Share service URL is not configured.');
  const response = await fetch(base + '/v1/shares/' + id);
  if (!response.ok) throw new Error('Shared snapshot unavailable (HTTP ' + response.status + ').');
  return await response.json() as { fileName: string; document: PenDocument };
}
