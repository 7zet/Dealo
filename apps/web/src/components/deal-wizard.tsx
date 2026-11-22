'use client';

import type { Locale } from '@dealo/config';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useState } from 'react';

import type { MediaAsset } from '@/components/merchant-media-library';
import { fromTashkentInput, startOfTashkentDay } from '@/lib/dates';
import { formatMoney, tiyinFromSom } from '@dealo/ui';

type Localized = { uz: string; ru: string; en: string };
type Location = { id: string; label: string };

type Props = {
  categories: { id: string; label: string; subcategories: { id: string; label: string }[] }[];
  locations: Location[];
  media: MediaAsset[];
  /** An existing deal opened for editing. Without it the wizard creates a new deal. */
  existing?: ExistingDeal;
};

/** A saved deal loaded into the wizard. Its photos are offered next to the library, already picked. */
export type ExistingDeal = { id: string; status: string; draft: Draft; photos: MediaAsset[] };

/** Statuses from which a deal can be sent to moderation (the API refuses the rest). */
const SUBMITTABLE = new Set(['draft', 'changes_requested']);

type Draft = {
  slug: string;
  categoryId: string;
  subcategoryId: string;
  title: Localized;
  shortDescription: Localized;
  description: Localized;
  highlights: Localized[];
  terms: Localized;
  redemptionMethod: 'qr' | 'code' | 'qr_or_code';
  redemptionInstructions: Localized;
  maxPerUser: number;
  // Prices (so'm) and stock stay as typed text so a field can be empty instead of a "0" the merchant
  // has to delete first.
  options: DraftOption[];
  mediaIds: string[];
  locationIds: string[];
  startsAt: string;
  endsAt: string;
  validDays: number;
};

// id is set for an option that already exists, so an edit updates it instead of replacing it: sold
// vouchers keep pointing at the same option.
type DraftOption = {
  id?: string;
  title: Localized;
  originalPrice: string;
  dealPrice: string;
  stock: string;
};

const empty: Localized = { uz: '', ru: '', en: '' };
const emptyOption: DraftOption = { title: empty, originalPrice: '', dealPrice: '', stock: '' };
const initial: Draft = {
  slug: '',
  categoryId: '',
  subcategoryId: '',
  title: empty,
  shortDescription: empty,
  description: empty,
  highlights: [empty, empty, empty],
  terms: empty,
  redemptionMethod: 'qr_or_code',
  redemptionInstructions: empty,
  maxPerUser: 1,
  options: [emptyOption],
  mediaIds: [],
  locationIds: [],
  startsAt: '',
  endsAt: '',
  validDays: 30,
};

const STEPS = [
  'stepBasics',
  'stepOptions',
  'stepMedia',
  'stepDetails',
  'stepSchedule',
  'stepReview',
] as const;
const MEDIA_STEP = STEPS.indexOf('stepMedia');
const inputClass = 'rounded-control-ui border border-border bg-surface px-4 py-3 text-ink';

function localized(text: Localized) {
  return { uz: text.uz.trim(), ru: text.ru.trim(), en: text.en.trim() };
}

function filled(text: Localized) {
  return [text.uz, text.ru, text.en].every((value) => value.trim() !== '');
}

/** A whole non-negative number typed into a field, or null when the field is empty or not a number. */
function whole(value: string): number | null {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** The text in the merchant's own language first, then the others. */
function inLocale(text: Localized, locale: Locale) {
  return text[locale].trim() || text.uz.trim() || text.ru.trim() || text.en.trim();
}

/**
 * Returns the first problem in the current step as a translation key, or null when the step is complete.
 * A new deal must not start in the past; an edited deal may keep the start it already had.
 */
export function stepProblem(
  step: number,
  draft: Draft,
  { editing = false, now = new Date() }: { editing?: boolean; now?: Date } = {},
): string | null {
  if (step === 0) {
    if (draft.slug.trim() === '') return 'slugRequired';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) return 'invalidSlug';
    if (!draft.categoryId || !draft.subcategoryId) return 'required';
    if (!filled(draft.title) || !filled(draft.shortDescription) || !filled(draft.description))
      return 'required';
  }
  if (step === 1) {
    if (draft.options.length === 0) return 'optionsRequired';
    if (draft.options.some((o) => !filled(o.title))) return 'required';
    const priced = draft.options.map((o) => ({
      original: whole(o.originalPrice),
      deal: whole(o.dealPrice),
      stock: whole(o.stock),
    }));
    if (priced.some((o) => !o.original || !o.deal)) return 'priceRequired';
    if (priced.some((o) => (o.deal ?? 0) > (o.original ?? 0))) return 'price';
    if (priced.some((o) => !o.stock)) return 'stockRequired';
  }
  if (step === 2 && (draft.mediaIds.length < 3 || draft.mediaIds.length > 8)) return 'mediaCount';
  if (step === 3) {
    if (draft.highlights.length < 3 || !draft.highlights.every(filled)) return 'highlights';
    if (!filled(draft.terms) || !filled(draft.redemptionInstructions)) return 'required';
    if (!Number.isInteger(draft.maxPerUser) || draft.maxPerUser < 1) return 'maxPerUserRange';
  }
  if (step === 4) {
    if (draft.locationIds.length === 0) return 'locationRequired';
    // Deal times are Tashkent times, whatever the browser's own time zone.
    const startsAt = fromTashkentInput(draft.startsAt);
    const endsAt = fromTashkentInput(draft.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt)
      return 'schedule';
    // A new deal may start today but not on a day that has passed.
    if (!editing && startsAt < startOfTashkentDay(now)) return 'startsInPast';
    if (endsAt <= now) return 'endsInPast';
    if (!Number.isInteger(draft.validDays) || draft.validDays < 1) return 'validDaysRange';
  }
  return null;
}

function toBody(draft: Draft, media: MediaAsset[]) {
  return {
    slug: draft.slug,
    category_id: draft.categoryId,
    subcategory_id: draft.subcategoryId,
    title: localized(draft.title),
    short_description: localized(draft.shortDescription),
    description: localized(draft.description),
    highlights: draft.highlights.map(localized),
    whats_included: [],
    terms: localized(draft.terms),
    faq: [],
    redemption_method: draft.redemptionMethod,
    redemption_instructions: localized(draft.redemptionInstructions),
    booking_required: false,
    starts_at: fromTashkentInput(draft.startsAt).toISOString(),
    ends_at: fromTashkentInput(draft.endsAt).toISOString(),
    voucher_valid_days: draft.validDays,
    voucher_valid_until: null,
    max_per_user: draft.maxPerUser,
    location_ids: draft.locationIds,
    options: draft.options.map((o, index) => ({
      ...(o.id ? { id: o.id } : {}),
      title: localized(o.title),
      original_price: tiyinFromSom(whole(o.originalPrice) ?? 0),
      deal_price: tiyinFromSom(whole(o.dealPrice) ?? 0),
      stock_total: whole(o.stock) ?? 0,
      sort_order: index,
      is_active: true,
    })),
    media: draft.mediaIds.map((id, index) => ({
      url: media.find((asset) => asset.id === id)?.url ?? '',
      alt: localized(draft.title),
      sort_order: index,
      width: media.find((asset) => asset.id === id)?.width ?? 1,
      height: media.find((asset) => asset.id === id)?.height ?? 1,
      blurhash: '',
    })),
  };
}

/** Translation key for an API refusal of a deal save. */
function problemFor(code: string | undefined) {
  if (code === 'slug_taken') return 'slugTaken';
  if (code === 'in_past') return 'endsInPast';
  return 'errorGeneric';
}

function LocalizedFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Localized;
  onChange: (next: Localized) => void;
}) {
  const t = useTranslations('Deals');
  return (
    <fieldset className="grid gap-2 rounded-card-ui border border-border p-4">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      {(['uz', 'ru', 'en'] as const).map((locale) => (
        <label key={locale} className="grid gap-1 text-sm">
          {t(`lang_${locale}`)}
          <input
            className={inputClass}
            value={value[locale]}
            onChange={(e) => onChange({ ...value, [locale]: e.target.value })}
          />
        </label>
      ))}
    </fieldset>
  );
}

export type { Draft as DealDraft };
export { initial as initialDealDraft };

/** The wizard's photo choices: the saved deal's own photos first, then the library without duplicates. */
function mergeAssets(photos: MediaAsset[], library: MediaAsset[]) {
  return [
    ...photos,
    ...library.filter((asset) => !photos.some((photo) => photo.url === asset.url)),
  ];
}

export function DealWizard({ categories, locations, media, existing }: Props) {
  const t = useTranslations('Deals');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [step, setStep] = useState(0);
  const editing = existing !== undefined;
  const [draft, setDraft] = useState<Draft>(existing?.draft ?? initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [success, setSuccess] = useState<'submitted' | 'saved' | 'updated' | null>(null);
  const [busy, setBusy] = useState(false);
  // The deal is created once. A failed submit keeps its id, so a retry only submits and never creates
  // a second copy.
  const [createdId, setCreatedId] = useState<string | null>(existing?.id ?? null);
  const photos = existing?.photos ?? [];
  const [assets, setAssets] = useState<MediaAsset[]>(mergeAssets(photos, media));
  const [mediaStale, setMediaStale] = useState(false);

  const subcategories = categories.find((c) => c.id === draft.categoryId)?.subcategories ?? [];
  const done = success !== null;
  const firstOption = draft.options[0];
  const previewOriginal = firstOption ? whole(firstOption.originalPrice) : null;
  const previewDeal = firstOption ? whole(firstOption.dealPrice) : null;
  const previewPrice =
    previewOriginal && previewDeal ? { original: previewOriginal, deal: previewDeal } : null;

  /** Re-reads the media library, for photos uploaded on the media page while the wizard is open. */
  async function reloadMedia() {
    setMediaStale(false);
    const response = await fetch('/api/bff/merchant/media').catch(() => null);
    if (!response?.ok) return setMediaStale(true);
    const list = (await response.json()) as { items: MediaAsset[] };
    const next = mergeAssets(photos, list.items);
    setAssets(next);
    // A photo deleted on the media page drops out of the selection.
    setDraft((current) => ({
      ...current,
      mediaIds: current.mediaIds.filter((id) => next.some((asset) => asset.id === id)),
    }));
  }

  function update(patch: Partial<Draft>) {
    setProblem(null);
    setDraft((current) => ({ ...current, ...patch }));
  }

  /** Moves to a step. Entering the photo step re-reads the library, so new uploads show up. */
  function go(target: number) {
    setProblem(null);
    setStep(target);
    if (target === MEDIA_STEP) void reloadMedia();
  }

  function next() {
    const issue = stepProblem(step, draft, { editing });
    setProblem(issue);
    if (!issue) go(Math.min(step + 1, STEPS.length - 1));
  }

  /** Where the deal list shows the outcome, so the merchant sees it after the redirect too. */
  function finish(outcome: 'submitted' | 'saved' | 'updated' | 'review') {
    setSuccess(outcome === 'review' ? 'updated' : outcome);
    router.push(`/merchant/deals?deal=${outcome}`);
    router.refresh();
  }

  async function save(submit: boolean) {
    if (busy || done) return;
    const issue =
      [0, 1, 2, 3, 4].map((s) => stepProblem(s, draft, { editing })).find(Boolean) ?? null;
    setProblem(issue);
    if (issue) return;
    setBusy(true);
    let id = createdId;
    if (existing) {
      const updated = await fetch(`/api/bff/merchant/deals/${existing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toBody(draft, assets)),
      });
      if (!updated.ok) {
        setBusy(false);
        const body = (await updated.json().catch(() => ({}))) as { code?: string };
        return setProblem(problemFor(body.code));
      }
      const saved = (await updated.json()) as { status: string };
      // A price or terms change on a live deal already sent it back to review.
      if (!submit)
        return finish(
          saved.status === 'in_review' && existing.status !== 'in_review' ? 'review' : 'updated',
        );
    } else if (!id) {
      const created = await fetch('/api/bff/merchant/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toBody(draft, assets)),
      });
      if (!created.ok) {
        setBusy(false);
        const body = (await created.json().catch(() => ({}))) as { code?: string };
        return setProblem(problemFor(body.code));
      }
      id = ((await created.json()) as { id: string }).id;
      setCreatedId(id);
    }
    if (submit) {
      const response = await fetch(`/api/bff/merchant/deals/${id}/submit`, { method: 'POST' });
      if (!response.ok) {
        setBusy(false);
        return setProblem('submitFailed');
      }
    }
    // The buttons stay disabled from here on: the deal exists, so a second click must not resend it.
    finish(submit ? 'submitted' : 'saved');
  }

  const canSubmit = !existing || SUBMITTABLE.has(existing.status);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="grid gap-6">
        <ol className="flex flex-wrap gap-2 text-sm">
          {STEPS.map((key, index) => (
            <li
              key={key}
              aria-current={index === step ? 'step' : undefined}
              className={index === step ? 'font-bold text-brand' : 'text-ink-muted'}
            >
              {index + 1}. {t(key)}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="grid max-w-xl gap-4">
            <label className="grid gap-1 text-sm">
              {t('slug')}
              <input
                className={`${inputClass} disabled:bg-page disabled:text-ink-muted`}
                value={draft.slug}
                disabled={editing}
                aria-describedby={editing ? 'deal-slug-locked' : undefined}
                onChange={(e) => update({ slug: e.target.value })}
              />
              {editing && (
                <span id="deal-slug-locked" className="text-ink-muted">
                  {t('slugLocked')}
                </span>
              )}
            </label>
            <label className="grid gap-1 text-sm">
              {t('category')}
              <select
                className={inputClass}
                value={draft.categoryId}
                onChange={(e) => update({ categoryId: e.target.value, subcategoryId: '' })}
              >
                <option value="">{t('choose')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              {t('subcategory')}
              <select
                className={inputClass}
                value={draft.subcategoryId}
                onChange={(e) => update({ subcategoryId: e.target.value })}
              >
                <option value="">{t('choose')}</option>
                {subcategories.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <LocalizedFields
              label={t('titleLabel')}
              value={draft.title}
              onChange={(title) => update({ title })}
            />
            <LocalizedFields
              label={t('shortDescription')}
              value={draft.shortDescription}
              onChange={(shortDescription) => update({ shortDescription })}
            />
            <LocalizedFields
              label={t('description')}
              value={draft.description}
              onChange={(description) => update({ description })}
            />
          </div>
        )}

        {step === 1 && (
          <div className="grid max-w-xl gap-4">
            {draft.options.map((option, index) => (
              <div key={index} className="grid gap-3 rounded-card-ui border border-border p-4">
                <LocalizedFields
                  label={t('optionTitle')}
                  value={option.title}
                  onChange={(title) =>
                    update({
                      options: draft.options.map((o, i) => (i === index ? { ...o, title } : o)),
                    })
                  }
                />
                <label className="grid gap-1 text-sm">
                  {t('originalPrice')}
                  <input
                    type="text"
                    inputMode="numeric"
                    className={inputClass}
                    value={option.originalPrice}
                    onChange={(e) =>
                      update({
                        options: draft.options.map((o, i) =>
                          i === index ? { ...o, originalPrice: e.target.value } : o,
                        ),
                      })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  {t('dealPrice')}
                  <input
                    type="text"
                    inputMode="numeric"
                    className={inputClass}
                    value={option.dealPrice}
                    onChange={(e) =>
                      update({
                        options: draft.options.map((o, i) =>
                          i === index ? { ...o, dealPrice: e.target.value } : o,
                        ),
                      })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  {t('stock')}
                  <input
                    type="text"
                    inputMode="numeric"
                    className={inputClass}
                    value={option.stock}
                    onChange={(e) =>
                      update({
                        options: draft.options.map((o, i) =>
                          i === index ? { ...o, stock: e.target.value } : o,
                        ),
                      })
                    }
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              className="w-fit font-semibold text-brand"
              onClick={() =>
                update({
                  options: [...draft.options, emptyOption],
                })
              }
            >
              {t('addOption')}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4">
            <p className="text-sm text-ink-muted">{t('mediaPick')}</p>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                href="/merchant/media"
                target="_blank"
                className="font-semibold text-brand underline-offset-2 hover:underline"
              >
                {t('mediaOpenLibrary')}
              </Link>
              <button
                type="button"
                onClick={() => void reloadMedia()}
                className="font-semibold text-brand underline-offset-2 hover:underline"
              >
                {t('mediaReload')}
              </button>
            </div>
            {mediaStale && (
              <p role="alert" className="text-sm text-error">
                {t('errorGeneric')}
              </p>
            )}
            {assets.length === 0 ? (
              <p className="text-ink-muted">{t('mediaEmpty')}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {assets.map((asset) => {
                  const selected = draft.mediaIds.includes(asset.id);
                  return (
                    <li key={asset.id}>
                      <label className="grid cursor-pointer gap-2">
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={selected}
                          onChange={() =>
                            update({
                              mediaIds: selected
                                ? draft.mediaIds.filter((id) => id !== asset.id)
                                : [...draft.mediaIds, asset.id].slice(0, 8),
                            })
                          }
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element -- merchant uploads are served by the API */}
                        <img
                          src={asset.url}
                          alt=""
                          className={`aspect-square w-full rounded-control-ui object-cover ${selected ? 'ring-2 ring-brand' : ''}`}
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="grid max-w-xl gap-4">
            {draft.highlights.map((highlight, index) => (
              <LocalizedFields
                key={index}
                label={`${t('highlights')} ${index + 1}`}
                value={highlight}
                onChange={(next) =>
                  update({ highlights: draft.highlights.map((h, i) => (i === index ? next : h)) })
                }
              />
            ))}
            <LocalizedFields
              label={t('terms')}
              value={draft.terms}
              onChange={(terms) => update({ terms })}
            />
            <label className="grid gap-1 text-sm">
              {t('redemptionMethod')}
              <select
                className={inputClass}
                value={draft.redemptionMethod}
                onChange={(e) =>
                  update({ redemptionMethod: e.target.value as Draft['redemptionMethod'] })
                }
              >
                <option value="qr_or_code">{t('redemptionBoth')}</option>
                <option value="qr">{t('redemptionQr')}</option>
                <option value="code">{t('redemptionCode')}</option>
              </select>
            </label>
            <LocalizedFields
              label={t('redemptionInstructions')}
              value={draft.redemptionInstructions}
              onChange={(redemptionInstructions) => update({ redemptionInstructions })}
            />
            <label className="grid gap-1 text-sm">
              {t('maxPerUser')}
              <input
                type="number"
                min={1}
                className={inputClass}
                value={Number.isNaN(draft.maxPerUser) ? '' : draft.maxPerUser}
                onChange={(e) => update({ maxPerUser: e.target.valueAsNumber })}
              />
            </label>
          </div>
        )}

        {step === 4 && (
          <div className="grid max-w-xl gap-4">
            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold">{t('locations')}</legend>
              {locations.map((location) => (
                <label key={location.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.locationIds.includes(location.id)}
                    onChange={() =>
                      update({
                        locationIds: draft.locationIds.includes(location.id)
                          ? draft.locationIds.filter((id) => id !== location.id)
                          : [...draft.locationIds, location.id],
                      })
                    }
                  />
                  {location.label}
                </label>
              ))}
            </fieldset>
            <label className="grid gap-1 text-sm">
              {t('startsAt')}
              <input
                type="datetime-local"
                className={inputClass}
                value={draft.startsAt}
                onChange={(e) => update({ startsAt: e.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              {t('endsAt')}
              <input
                type="datetime-local"
                className={inputClass}
                value={draft.endsAt}
                onChange={(e) => update({ endsAt: e.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              {t('validDays')}
              <input
                type="number"
                min={1}
                className={inputClass}
                value={Number.isNaN(draft.validDays) ? '' : draft.validDays}
                onChange={(e) => update({ validDays: e.target.valueAsNumber })}
              />
            </label>
          </div>
        )}

        {step === 5 && (
          <div className="grid gap-3 text-sm">
            <p>{t('reviewHint')}</p>
            <p className="font-semibold text-ink">{inLocale(draft.title, locale)}</p>
            <dl className="grid w-fit grid-cols-[auto_auto] gap-x-6 gap-y-1">
              <dt className="text-ink-muted">{t('reviewOptions')}</dt>
              <dd className="font-semibold tabular-nums">{draft.options.length}</dd>
              <dt className="text-ink-muted">{t('reviewPhotos')}</dt>
              <dd className="font-semibold tabular-nums">{draft.mediaIds.length}</dd>
              <dt className="text-ink-muted">{t('reviewLocations')}</dt>
              <dd className="font-semibold tabular-nums">{draft.locationIds.length}</dd>
            </dl>
          </div>
        )}

        {success && (
          <p role="status" className="rounded-control-ui bg-save-tint p-3 font-semibold text-save">
            {t(success)}
          </p>
        )}

        {problem && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-control-ui bg-error-tint p-3 text-error"
          >
            <span aria-hidden="true">!</span>
            <span>{t(problem as Parameters<typeof t>[0])}</span>
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          {step > 0 && (
            <button
              type="button"
              disabled={busy || done}
              onClick={() => go(step - 1)}
              className="rounded-control-ui border border-border px-5 py-3"
            >
              {t('back')}
            </button>
          )}
          {step < STEPS.length - 1 && (
            <button
              type="button"
              onClick={next}
              className="rounded-control-ui bg-brand px-5 py-3 font-semibold text-surface"
            >
              {t('next')}
            </button>
          )}
          {step === STEPS.length - 1 && (
            <>
              <button
                type="button"
                disabled={busy || done}
                onClick={() => save(false)}
                className={
                  canSubmit
                    ? 'rounded-control-ui border border-border px-5 py-3 disabled:opacity-60'
                    : 'rounded-control-ui bg-brand px-5 py-3 font-semibold text-surface disabled:opacity-60'
                }
              >
                {editing ? t('saveChanges') : t('saveDraft')}
              </button>
              {canSubmit && (
                <button
                  type="button"
                  disabled={busy || done}
                  onClick={() => save(true)}
                  className="rounded-control-ui bg-brand px-5 py-3 font-semibold text-surface disabled:opacity-60"
                >
                  {t('submitReview')}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <aside
        aria-label={t('previewTitle')}
        className="grid h-fit gap-3 rounded-card-ui border border-border bg-surface p-4"
      >
        <h2 className="font-semibold">{t('previewTitle')}</h2>
        <p className="font-semibold">{inLocale(draft.title, locale) || '—'}</p>
        <p className="text-sm text-ink-muted">{inLocale(draft.shortDescription, locale)}</p>
        {previewPrice && (
          <p className="text-sm">
            <span className="text-ink-muted line-through">
              {formatMoney(tiyinFromSom(previewPrice.original), locale, 'UZS')}
            </span>{' '}
            <span className="font-bold text-ink">
              {formatMoney(tiyinFromSom(previewPrice.deal), locale, 'UZS')}
            </span>
          </p>
        )}
      </aside>
    </div>
  );
}
