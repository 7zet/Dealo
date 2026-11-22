'use client';

import { Info } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

/**
 * Says why the visitor landed here when a page guard sent them away from a section their role may not
 * open (requirePanelPermission adds ?denied=1). Without it the redirect looks like a broken link.
 */
export function MerchantDeniedNotice({ text }: { text: string }) {
  const params = useSearchParams();
  if (params.get('denied') !== '1') return null;
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-control-ui border border-border bg-brand-tint p-3 text-ink"
    >
      <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" />
      {text}
    </p>
  );
}
