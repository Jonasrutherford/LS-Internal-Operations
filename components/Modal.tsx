'use client';

import { useEffect } from 'react';

export default function Modal({
  title, onClose, children, footer, wide = false, error,
}: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean; error?: string | null;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="btn ghost sm" onClick={onClose}>Close</button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && (
          <div className="sheet-foot">
            {error && <span className="error" role="alert">{error}</span>}
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
