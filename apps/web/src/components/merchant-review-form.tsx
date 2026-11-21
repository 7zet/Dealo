'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { CheckCircle2, Circle } from 'lucide-react';
import { useState } from 'react';

import { primaryButtonClass } from './merchant-ui';

type DocumentKind = 'certificate' | 'bank_letter' | 'price_proof';
type Uploaded = Record<DocumentKind, boolean>;

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png'];
const REQUIRED: DocumentKind[] = ['certificate', 'bank_letter'];
const OPTIONAL: DocumentKind[] = ['price_proof'];

/** Uploads the two required documents and sends the business to review. Shown only while it is a draft. */
export function MerchantReviewForm({ uploaded }: { uploaded: Uploaded }) {
  const t = useTranslations('MerchantReview');
  const router = useRouter();
  const [done, setDone] = useState(uploaded);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(kind: DocumentKind, file: File | undefined) {
    setMessage(null);
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) return setMessage(t('errorType'));
    if (file.size > MAX_BYTES) return setMessage(t('errorSize'));
    setBusy(true);
    const response = await fetch(`/api/bff/merchant/documents/${kind}`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    setBusy(false);
    if (!response.ok) return setMessage(t('errorGeneric'));
    setDone((current) => ({ ...current, [kind]: true }));
    router.refresh();
  }

  async function submit() {
    setMessage(null);
    setBusy(true);
    const response = await fetch('/api/bff/merchant/submit', { method: 'POST' });
    setBusy(false);
    if (!response.ok) {
      const problem = (await response.json().catch(() => ({}))) as { code?: string };
      return setMessage(t(problem.code === 'documents_required' ? 'errorMissing' : 'errorGeneric'));
    }
    router.refresh();
  }

  const complete = REQUIRED.every((kind) => done[kind]);
  return (
    <div className="grid gap-4">
      <ul className="grid gap-3">
        {[...REQUIRED, ...OPTIONAL].map((kind) => (
          <li key={kind}>
            <label className="grid gap-3 rounded-control-ui border border-border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <span className="grid gap-1">
                <span className="font-semibold text-ink">
                  {t(`kind.${kind}`)}
                  {OPTIONAL.includes(kind) && (
                    <span className="font-normal text-ink-muted"> · {t('optional')}</span>
                  )}
                </span>
                <span
                  className={`flex items-center gap-1.5 text-small ${done[kind] ? 'text-save' : 'text-ink-muted'}`}
                >
                  {done[kind] ? (
                    <CheckCircle2 aria-hidden="true" className="size-4" />
                  ) : (
                    <Circle aria-hidden="true" className="size-4" />
                  )}
                  {done[kind] ? t('uploaded') : t('notUploaded')}
                </span>
              </span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                disabled={busy}
                onChange={(event) => upload(kind, event.target.files?.[0])}
                className="max-w-full text-small file:mr-3 file:rounded-control-ui file:border file:border-border file:bg-surface file:px-3 file:py-2 file:font-semibold file:text-ink"
              />
            </label>
          </li>
        ))}
      </ul>
      {message && (
        <p role="alert" className="rounded-control-ui bg-error-tint p-3 text-error">
          {message}
        </p>
      )}
      <button
        type="button"
        disabled={!complete || busy}
        onClick={submit}
        className={`justify-self-start ${primaryButtonClass}`}
      >
        {t('submit')}
      </button>
    </div>
  );
}
