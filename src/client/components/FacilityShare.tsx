import React, { useState } from 'react';
import { Copy, Share2 } from 'lucide-react';
import { encodeFacility } from '../../shared/challenges';
import type { Grid } from '../../shared/types';

export function FacilityShare({ grid, valid }: { grid: Grid; valid: boolean }) {
  const [link, setLink] = useState('');
  const [message, setMessage] = useState('');
  const generate = () => {
    try {
      const url = new URL(window.location.origin);
      url.searchParams.set('blueprint', encodeFacility(grid));
      setLink(url.toString()); setMessage('This link captures the current layout. Update it after editing.');
    } catch (error) { setMessage((error as Error).message); }
  };
  return <section className="facility-share" aria-label="Share a custom facility">
    <button className="architect-btn" disabled={!valid} onClick={generate} data-testid="share-facility-btn"><Share2 size={14} />{link ? 'Update challenge link' : 'Share facility'}</button>
    {link && <div className="facility-share-link"><label>Playable facility link<input aria-label="Playable facility link" readOnly value={link} onFocus={e => e.target.select()} /></label><button className="architect-btn" onClick={async () => {
      try { await navigator.clipboard.writeText(link); setMessage('Challenge link copied.'); }
      catch { setMessage('Select and copy the link above; clipboard access is unavailable here.'); }
    }}><Copy size={14} />Copy link</button></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
