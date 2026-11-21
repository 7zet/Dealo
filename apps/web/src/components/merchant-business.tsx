'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { pickText } from '@/lib/localized';
import { useState } from 'react';

import { ConfirmRemoveButton } from './merchant-confirm';
import { FieldError, fieldClass, primaryButtonClass } from './merchant-ui';

type Business = {
  display_name: string;
  phone: string;
  website: string | null;
  instagram: string | null;
  telegram: string | null;
};

type Location = {
  id: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  city: { id: string; name: { uz: string; ru: string; en: string } };
};

type City = { id: string; label: string; lat: number; lng: number };

const inputClass = fieldClass;
const PHONE = /^\+?[0-9][0-9 ()-]{6,19}$/;
const HOURS = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-4]):([0-5]\d)$/;

/**
 * One day's opening hours, "HH:MM-HH:MM" on a 24-hour clock. Mirrors the API rule: the close may be
 * 24:00 or past midnight, and open and close must differ.
 */
export function validHours(value: string): boolean {
  const parts = HOURS.exec(value.trim());
  if (!parts) return false;
  if (parts[3] === '24' && parts[4] !== '00') return false;
  return `${parts[1]}${parts[2]}` !== `${parts[3]}${parts[4]}`;
}

/** Maps API problem codes to translation keys for the panel. */
function problemKey(code: string | undefined) {
  switch (code) {
    case 'forbidden':
      return 'forbidden' as const;
    case 'location_in_use':
      return 'locationInUse' as const;
    default:
      return 'errorGeneric' as const;
  }
}

type SendResult = { ok: boolean; code?: string | undefined };

async function send(path: string, method: string, body?: unknown): Promise<SendResult> {
  const response = await fetch(`/api/bff/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
  if (response.status === 204) return { ok: true };
  const data = (await response.json().catch(() => ({}))) as { code?: string };
  return response.ok ? { ok: true } : { ok: false, code: data.code };
}

export function BusinessForm({ business, canEdit }: { business: Business; canEdit: boolean }) {
  const t = useTranslations('Panel');
  const ui = useTranslations('MerchantUI');
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Business, string>>>({});
  const [values, setValues] = useState({
    display_name: business.display_name,
    phone: business.phone,
    website: business.website ?? '',
    instagram: business.instagram ?? '',
    telegram: business.telegram ?? '',
  });

  function validate() {
    const next: typeof errors = {};
    if (values.display_name.trim().length < 2) next.display_name = ui('errorMinLength');
    if (!PHONE.test(values.phone.trim())) next.phone = ui('errorPhone');
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!validate()) return;
    setBusy(true);
    const result = await send('merchant/business', 'PATCH', values);
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: t(problemKey(result.code)) });
      return;
    }
    setMessage({ ok: true, text: t('saved') });
    router.refresh();
  }

  return (
    <form className="grid gap-4" noValidate onSubmit={save}>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['display_name', 'phone', 'website', 'instagram', 'telegram'] as const).map((field) => (
          <div key={field} className="grid content-start gap-1.5">
            <label className="text-small font-semibold text-ink" htmlFor={field}>
              {t(field === 'display_name' ? 'displayName' : field)}
            </label>
            <input
              id={field}
              disabled={!canEdit}
              className={inputClass}
              value={values[field]}
              aria-invalid={errors[field] ? true : undefined}
              aria-describedby={errors[field] ? `${field}-error` : undefined}
              onChange={(event) => setValues({ ...values, [field]: event.target.value })}
            />
            <FieldError id={`${field}-error`} message={errors[field]} />
          </div>
        ))}
      </div>
      {!canEdit && <p className="text-small text-ink-muted">{t('readOnly')}</p>}
      {message && (
        <p role="status" className={`text-small ${message.ok ? 'text-save' : 'text-error'}`}>
          {message.text}
        </p>
      )}
      {canEdit && (
        <button
          type="submit"
          disabled={busy}
          className={`justify-self-start ${primaryButtonClass}`}
        >
          {t('save')}
        </button>
      )}
    </form>
  );
}

export function LocationsPanel({
  locations,
  cities,
  canEdit,
  locale,
}: {
  locations: Location[];
  cities: City[];
  canEdit: boolean;
  locale: string;
}) {
  const t = useTranslations('Panel');
  const ui = useTranslations('MerchantUI');
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ address?: string; phone?: string; hours?: string }>({});
  const [draft, setDraft] = useState({
    city_id: cities[0]?.id ?? '',
    address: '',
    phone: '',
    hours: '09:00-18:00',
  });

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const invalid: typeof errors = {};
    if (draft.address.trim().length < 3) invalid.address = ui('errorRequired');
    if (!PHONE.test(draft.phone.trim())) invalid.phone = ui('errorPhone');
    if (!validHours(draft.hours)) invalid.hours = ui('errorHours');
    setErrors(invalid);
    if (Object.keys(invalid).length > 0) return;
    const city = cities.find((item) => item.id === draft.city_id);
    const result = await send('merchant/locations', 'POST', {
      city_id: draft.city_id,
      address: draft.address,
      phone: draft.phone,
      lat: city?.lat ?? 0,
      lng: city?.lng ?? 0,
      opening_hours: {
        mon: draft.hours,
        tue: draft.hours,
        wed: draft.hours,
        thu: draft.hours,
        fri: draft.hours,
        sat: draft.hours,
        sun: draft.hours,
      },
    });
    if (!result.ok) {
      if (result.code === 'invalid_hours') {
        setErrors({ hours: ui('errorHours') });
        return;
      }
      setMessage(t(problemKey(result.code)));
      return;
    }
    setDraft({ ...draft, address: '', phone: '' });
    router.refresh();
  }

  async function remove(id: string) {
    setMessage(null);
    const result = await send(`merchant/locations/${id}`, 'DELETE');
    if (!result.ok) {
      setMessage(t(problemKey(result.code)));
      return;
    }
    router.refresh();
  }

  const field = (name: 'address' | 'phone' | 'hours', label: string, inputMode?: 'tel') => (
    <div className="grid content-start gap-1.5">
      <label className="text-small font-semibold text-ink" htmlFor={`location-${name}`}>
        {label}
      </label>
      <input
        id={`location-${name}`}
        className={inputClass}
        inputMode={inputMode}
        value={draft[name]}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `location-${name}-error` : undefined}
        onChange={(e) => setDraft({ ...draft, [name]: e.target.value })}
      />
      <FieldError id={`location-${name}-error`} message={errors[name]} />
    </div>
  );

  return (
    <section
      aria-labelledby="locations-title"
      className="rounded-card-ui border border-border bg-surface"
    >
      <h2 id="locations-title" className="border-b border-border px-5 py-4 font-semibold">
        {t('locations')}
      </h2>
      <div className="grid gap-5 p-5">
        {locations.length === 0 ? (
          <p className="text-ink-muted">{t('noLocations')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-control-ui border border-border">
            {locations.map((location) => (
              <li key={location.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">
                    {pickText(location.city.name, locale)}
                  </span>
                  <span className="block truncate text-small text-ink-muted">
                    {location.address}
                  </span>
                </span>
                {canEdit && (
                  <ConfirmRemoveButton
                    label={t('remove')}
                    question={ui('confirmRemoveLocation')}
                    onConfirm={() => remove(location.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form className="grid gap-4 border-t border-border pt-5" noValidate onSubmit={add}>
            <h3 className="font-semibold">{t('addLocation')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <label className="text-small font-semibold text-ink" htmlFor="location-city">
                  {t('city')}
                </label>
                <select
                  id="location-city"
                  className={inputClass}
                  value={draft.city_id}
                  onChange={(e) => setDraft({ ...draft, city_id: e.target.value })}
                >
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.label}
                    </option>
                  ))}
                </select>
              </div>
              {field('address', t('address'))}
              {field('phone', t('phone'), 'tel')}
              {field('hours', t('hours'))}
            </div>
            <button type="submit" className={`justify-self-start ${primaryButtonClass}`}>
              {t('addLocation')}
            </button>
          </form>
        )}
        {message && (
          <p role="alert" className="text-small text-error">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
