'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { secondaryButtonClass } from './merchant-ui';

/**
 * A remove button that asks once before it acts. The question replaces the button in place, with no
 * motion, so a branch, photo or staff member is never deleted by a single stray click.
 */
export function ConfirmRemoveButton({
  label,
  question,
  onConfirm,
  disabled = false,
  className = `${secondaryButtonClass} hover:border-error hover:text-error`,
}: {
  label: string;
  question: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}) {
  const ui = useTranslations('MerchantUI');
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAsking(true)}
        className={className}
      >
        {label}
      </button>
    );
  }
  return (
    <span role="group" aria-label={question} className="flex flex-wrap items-center gap-2">
      <span className="text-small font-semibold text-ink">{question}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          void onConfirm();
        }}
        className="inline-flex items-center justify-center rounded-control-ui bg-error px-3.5 py-2 text-small font-semibold text-surface disabled:opacity-60"
      >
        {ui('confirmRemoveYes')}
      </button>
      <button
        type="button"
        autoFocus
        onClick={() => setAsking(false)}
        className={`${secondaryButtonClass} px-3.5 py-2 text-small`}
      >
        {ui('confirmRemoveCancel')}
      </button>
    </span>
  );
}
