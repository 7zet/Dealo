'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useRouter } from '@/i18n/navigation';

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().min(20).max(2000),
});
type Values = z.infer<typeof schema>;

const inputClass = 'w-full rounded-control-ui border border-border bg-surface px-4 py-3 text-ink';
const ghostButton =
  'inline-flex items-center gap-1.5 rounded-control-ui px-3 py-2 text-small font-semibold text-ink-muted hover:bg-page hover:text-ink disabled:opacity-50';

/** Edit (PATCH /reviews/{id}) and delete (DELETE /reviews/{id}) for one of the visitor's own reviews. */
export function MyReviewActions({
  review,
}: {
  review: { id: string; rating: number; text: string; locale: string };
}) {
  const t = useTranslations('Account');
  const r = useTranslations('Reviews');
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'edit' | 'confirmDelete'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { rating: review.rating, text: review.text },
  });

  async function send(method: 'PATCH' | 'DELETE', body?: object): Promise<boolean> {
    setError(false);
    setBusy(true);
    const init: RequestInit = body
      ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { method };
    const ok = await fetch(`/api/bff/reviews/${review.id}`, init)
      .then((response) => response.ok)
      .catch(() => false);
    setBusy(false);
    if (!ok) {
      setError(true);
      return false;
    }
    setMode('idle');
    router.refresh();
    return true;
  }

  const alert = error && (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-control-ui bg-error-tint p-3 text-small text-error"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {r('errorGeneric')}
    </p>
  );

  if (mode === 'edit') {
    const errors = form.formState.errors;
    return (
      <form
        noValidate
        className="grid gap-4 border-t border-border pt-4"
        onSubmit={form.handleSubmit((values) =>
          send('PATCH', { rating: values.rating, text: values.text, locale: review.locale }),
        )}
      >
        <p className="font-semibold text-ink">{t('reviewEditTitle')}</p>
        <label className="grid gap-1 text-small font-semibold">
          {r('rating')}
          <select
            className={`${inputClass} font-normal sm:w-48`}
            {...form.register('rating', { valueAsNumber: true })}
          >
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {'★'.repeat(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-small font-semibold">
          {r('text')}
          <textarea
            rows={4}
            className={`${inputClass} font-normal`}
            aria-invalid={Boolean(errors.text)}
            {...form.register('text')}
          />
        </label>
        {errors.text && <p className="text-small text-error">{r('textLength')}</p>}
        {alert}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-control-ui bg-brand px-4 py-2 text-small font-semibold text-surface disabled:opacity-60"
          >
            {t('reviewSave')}
          </button>
          <button
            type="button"
            className={ghostButton}
            onClick={() => {
              form.reset();
              setError(false);
              setMode('idle');
            }}
          >
            {r('cancel')}
          </button>
        </div>
      </form>
    );
  }

  if (mode === 'confirmDelete') {
    return (
      <div className="grid gap-3 border-t border-border pt-4">
        <p className="text-small text-ink">{t('reviewDeleteConfirm')}</p>
        {alert}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => send('DELETE')}
            className="rounded-control-ui bg-error px-4 py-2 text-small font-semibold text-surface disabled:opacity-60"
          >
            {t('reviewDelete')}
          </button>
          <button
            type="button"
            className={ghostButton}
            onClick={() => {
              setError(false);
              setMode('idle');
            }}
          >
            {r('cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      <button type="button" className={ghostButton} onClick={() => setMode('edit')}>
        <Pencil aria-hidden="true" className="size-4" />
        {t('reviewEdit')}
      </button>
      <button type="button" className={ghostButton} onClick={() => setMode('confirmDelete')}>
        <Trash2 aria-hidden="true" className="size-4" />
        {t('reviewDelete')}
      </button>
    </div>
  );
}
