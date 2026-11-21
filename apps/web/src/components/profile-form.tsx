'use client';

import { locales, type Locale } from '@grupon/config';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { usePathname, useRouter } from '@/i18n/navigation';
import { isDefaultName, profileErrorKey, type ProfileErrorKey } from '@/lib/profile';

const inputClass =
  'w-full rounded-control-ui border border-border bg-surface px-4 py-3 text-ink aria-[invalid=true]:border-error';

/**
 * Edits the name and preferred language through PATCH /me (via the same-origin BFF proxy). Only the
 * changed fields are sent. A new language is stored on the account and the page reopens in it.
 */
export function ProfileForm({
  initial,
  currentLocale,
}: {
  initial: { name: string; locale: Locale };
  currentLocale: string;
}) {
  const t = useTranslations('Profile');
  const names = useTranslations('Locale');
  const router = useRouter();
  const pathname = usePathname();
  const [saved, setSaved] = useState(initial);
  const [result, setResult] = useState<'saved' | ProfileErrorKey | null>(null);

  // The generated default name is not shown as a value; the field may stay empty until the person
  // types one, but an existing real name cannot be erased.
  const unnamed = isDefaultName(saved.name);
  const schema = useMemo(
    () =>
      z.object({
        name: unnamed ? z.string().trim().max(200) : z.string().trim().min(1).max(200),
        locale: z.enum(locales),
      }),
    [unnamed],
  );
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: unnamed ? '' : saved.name, locale: saved.locale },
  });

  async function submit(values: Values) {
    setResult(null);
    const body: { name?: string; locale?: Locale } = {};
    const name = values.name.trim();
    if (name && name !== saved.name) body.name = name;
    if (values.locale !== saved.locale) body.locale = values.locale;
    if (Object.keys(body).length === 0) {
      form.reset(values);
      setResult('saved');
      return;
    }

    let response: Response;
    try {
      response = await fetch('/api/bff/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      setResult('errorGeneric');
      return;
    }
    if (!response.ok) {
      const problem = (await response.json().catch(() => ({}))) as {
        code?: string;
        errors?: Record<string, string[]>;
      };
      setResult(profileErrorKey(response.status, problem));
      return;
    }

    const user = (await response.json().catch(() => null)) as {
      name?: string;
      locale?: Locale;
    } | null;
    const next = {
      name: user?.name ?? body.name ?? saved.name,
      locale: user?.locale ?? values.locale,
    };
    setSaved(next);
    form.reset({ name: isDefaultName(next.name) ? '' : next.name, locale: next.locale });
    setResult('saved');
    if (body.locale && body.locale !== currentLocale) {
      router.replace(pathname, { locale: body.locale });
    } else {
      router.refresh();
    }
  }

  const { errors, isDirty, isSubmitting } = form.formState;
  return (
    <form className="grid gap-5" noValidate onSubmit={form.handleSubmit(submit)}>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="grid content-start gap-2 text-small font-semibold text-ink">
          {t('nameLabel')}
          <input
            type="text"
            autoComplete="name"
            maxLength={200}
            placeholder={t('namePlaceholder')}
            className={`${inputClass} font-normal`}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'profile-name-error' : undefined}
            {...form.register('name')}
          />
          {errors.name && (
            <span id="profile-name-error" className="font-normal text-error">
              {t('nameError')}
            </span>
          )}
        </label>
        <label className="grid content-start gap-2 text-small font-semibold text-ink">
          {t('languageLabel')}
          <select className={`${inputClass} font-normal`} {...form.register('locale')}>
            {locales.map((locale) => (
              <option key={locale} value={locale}>
                {names(locale)}
              </option>
            ))}
          </select>
          <span className="font-normal text-ink-muted">{t('languageHint')}</span>
        </label>
      </div>

      {result && result !== 'saved' && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control-ui bg-error-tint p-3 text-small text-error"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{t(result)}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={!isDirty || isSubmitting}
          className="rounded-control-ui bg-brand px-5 py-3 font-semibold text-surface hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? t('saving') : t('save')}
        </button>
        {result === 'saved' && !isDirty && (
          <span role="status" className="inline-flex items-center gap-2 text-small text-save">
            <CircleCheck aria-hidden="true" className="size-4" />
            {t('saved')}
          </span>
        )}
      </div>
    </form>
  );
}
