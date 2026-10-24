import { useEffect, useRef } from 'react';

/** Shared focus, keyboard and scroll behavior for game-owned modal dialogs. */
export function useGameDialog(open: boolean, onClose: () => void) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const root = document.getElementById('root');
    const previousInert = root?.inert ?? false;
    const previousHidden = root?.getAttribute('aria-hidden');
    const isolate = root && dialog.current && !root.contains(dialog.current);
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    if (isolate) { root.inert = true; root.setAttribute('aria-hidden', 'true'); }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); return; }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, [tabindex="0"]') ?? []);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = previousOverflow;
      if (isolate) {
        root.inert = previousInert;
        if (previousHidden === null || previousHidden === undefined) root.removeAttribute('aria-hidden'); else root.setAttribute('aria-hidden', previousHidden);
      }
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);
  return dialog;
}
