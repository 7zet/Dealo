'use client';

import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { announceSessionChange } from '@/lib/me-query';
import { clearBuyNow } from '@/stores/buy-now';

/**
 * Revokes the session on the API, clears the session cookies and the buy-now selection, and returns to
 * the home page. The selection is cleared first so it never reaches the next account on this browser.
 */
export function SignOutButton() {
  const t = useTranslations('Navigation');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        clearBuyNow();
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
        announceSessionChange();
        router.replace('/');
        router.refresh();
      }}
      className="inline-flex items-center gap-2 rounded-round-ui border px-4 py-2 text-small font-semibold text-ink-muted transition hover:border-brand hover:text-brand disabled:opacity-60"
    >
      <LogOut className="size-4" />
      {t('signOut')}
    </button>
  );
}
