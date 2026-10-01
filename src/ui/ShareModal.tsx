import { useEffect, useState } from 'react';
import type { PenDocument } from '../document/types';
import { createShareSnapshot, getShareStatus } from './shareApi';

export function ShareModal({ document, fileName, onClose }: { document: PenDocument; fileName: string; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const [reason, setReason] = useState('Checking share service…');
  const [uploadKey, setUploadKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    getShareStatus().then(status => { if (live) { setReady(status.ready); setReason(status.reason ?? ''); } });
    return () => { live = false; };
  }, []);
  const create = async () => {
    if (!showKey) { setShowKey(true); return; }
    if (!ready || !uploadKey || busy) return;
    setBusy(true); setError('');
    try { setLink(await createShareSnapshot(document, fileName, uploadKey)); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal share-modal" role="dialog" aria-modal="true" aria-label="Share a snapshot" data-testid="share-dialog">
      <div className="modal-header"><h2>Share a snapshot</h2><button type="button" aria-label="Close" onClick={onClose}>×</button></div>
      <p>Snapshot is a frozen state of your design file.</p>
      <div className="share-permission"><span aria-hidden="true">◎</span><span>Anyone with the link can see it and download the .pen file.</span></div>
      {link ? <div className="share-result"><label htmlFor="share-link">Share link</label><input id="share-link" data-testid="share-link" readOnly value={link} /><button type="button" data-testid="copy-share-link" onClick={() => void navigator.clipboard.writeText(link)}>Copy link</button></div> :
        <>{showKey ? <><label className="share-key-label" htmlFor="share-upload-key">Upload key</label><input id="share-upload-key" data-testid="share-upload-key" type="password" value={uploadKey} onChange={event => setUploadKey(event.target.value)} autoComplete="off" /></> : null}
        <button type="button" className="share-create" data-testid="create-share-link" disabled={!ready || (showKey && !uploadKey) || busy} onClick={() => void create()}>{busy ? 'Creating link…' : 'Create share link'}</button></>}
      {!ready ? <p className="note" data-testid="share-status">{reason}</p> : null}
      {error ? <p className="note" role="alert" data-testid="share-error">{error}</p> : null}
    </div>
  </div>;
}
