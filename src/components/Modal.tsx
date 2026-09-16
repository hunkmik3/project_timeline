'use client';

import { useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Wider panel for content with lists, e.g. the days-off settings. */
  wide?: boolean;
}

export default function Modal({ open, title, onClose, children, footer, wide }: Props) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    // Stop the calendar behind the dialog from scrolling along with it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Bottom sheet on phones, centred card from sm up. */}
      <div
        className={`relative flex max-h-[88dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-xl dark:bg-[#1b1b1f] dark:ring-1 dark:ring-neutral-700 ${
          wide ? 'sm:max-w-lg' : 'sm:max-w-md'
        }`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-800 dark:text-neutral-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 size-8 rounded text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>

        {footer && (
          <footer
            className="flex shrink-0 gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-700"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
