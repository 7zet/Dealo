'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { z } from 'zod';

import { useRouter } from '@/i18n/navigation';

import { FieldError, fieldClass, primaryButtonClass } from './merchant-ui';

type Option = { id: string; label: string };
type City = Option & { lat: number; lng: number };

// Error messages are translation keys: MerchantUI keys, or MerchantRegister keys prefixed with "r:".
const schema = z.object({
  legalName: z.string().trim().min(2, 'errorMinLength'),
  displayName: z.string().trim().min(2, 'errorMinLength'),
  categoryId: z.string().min(1, 'errorChoose'),
  cityId: z.string().min(1, 'errorChoose'),
  // Same rule as the API: digits with optional +, spaces, brackets and dashes.
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 ()-]{6,19}$/, 'r:errorPhone'),
  address: z.string().trim().min(3, 'errorRequired'),
  stir: z.string().regex(/^[0-9]{9}$/, 'r:errorStir'),
  orgForm: z.enum(['mchj', 'yatt'], { message: 'r:errorOrgForm' }),
  taxRegime: z.enum(['vat_payer', 'turnover_tax'], { message: 'r:errorTaxRegime' }),
  bankMfo: z.string().regex(/^[0-9]{5}$/, 'r:errorMfo'),
  bankAccount: z.string().regex(/^[0-9]{20}$/, 'r:errorAccount'),
  responsibleName: z.string().trim().min(2, 'r:errorResponsible'),
  contractAccepted: z.literal(true, { message: 'r:errorContract' }),
});
type Values = z.infer<typeof schema>;

/** The offer text version the merchant accepts; it is stored with the acceptance time. */
const CONTRACT_VERSION = 'v1.1';

/** Maps API problem codes to translation keys. */
function problemKey(code: string | undefined) {
  switch (code) {
    case 'city_not_found':
      return 'errorCity' as const;
    case 'category_not_found':
      return 'errorCategory' as const;
    case 'invalid_phone':
      return 'errorPhone' as const;
    case 'invalid_stir':
      return 'errorStir' as const;
    case 'stir_taken':
      return 'errorStirTaken' as const;
    case 'invalid_org_form':
      return 'errorOrgForm' as const;
    case 'invalid_tax_regime':
      return 'errorTaxRegime' as const;
    case 'invalid_mfo':
      return 'errorMfo' as const;
    case 'invalid_bank_account':
      return 'errorAccount' as const;
    case 'contract_not_accepted':
      return 'errorContract' as const;
    case 'already_submitted':
      return 'errorAlreadySubmitted' as const;
    case 'already_in_another_business':
      return 'errorOtherBusiness' as const;
    default:
      return 'errorGeneric' as const;
  }
}

/** Server problem codes that belong to one field; the message is shown under that field. */
const FIELD_OF_CODE: Partial<Record<string, keyof Values>> = {
  invalid_phone: 'phone',
  invalid_stir: 'stir',
  stir_taken: 'stir',
  invalid_org_form: 'orgForm',
  invalid_tax_regime: 'taxRegime',
  invalid_mfo: 'bankMfo',
  invalid_bank_account: 'bankAccount',
  city_not_found: 'cityId',
  category_not_found: 'categoryId',
  contract_not_accepted: 'contractAccepted',
};

/**
 * Business details form (step 2 of registration). Fields are grouped like the paper forms merchants
 * know, every field shows its own error inline, and nothing on it moves.
 */
export function MerchantRegisterForm({
  categories,
  cities,
  defaultPhone = '',
}: {
  categories: Option[];
  cities: City[];
  defaultPhone?: string;
}) {
  const t = useTranslations('MerchantRegister');
  const ui = useTranslations('MerchantUI');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      legalName: '',
      displayName: '',
      categoryId: '',
      cityId: '',
      phone: defaultPhone,
      address: '',
      stir: '',
      orgForm: 'mchj',
      taxRegime: 'vat_payer',
      bankMfo: '',
      bankAccount: '',
      responsibleName: '',
      contractAccepted: undefined as unknown as true,
    },
  });

  /** Resolves a schema message key ("r:" = MerchantRegister namespace, otherwise MerchantUI). */
  function message(key: string | undefined): string | undefined {
    if (!key) return undefined;
    return key.startsWith('r:')
      ? t(key.slice(2) as Parameters<typeof t>[0])
      : ui(key as Parameters<typeof ui>[0]);
  }

  // Registration and review submission are one user step: the merchant only sees the review status.
  // Coordinates default to the city centre; the map pin on the business page refines them later.
  async function submit(values: Values) {
    setError(null);
    const city = cities.find((item) => item.id === values.cityId);
    const registered = await fetch('/api/bff/merchants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legal_name: values.legalName,
        display_name: values.displayName,
        category_id: values.categoryId,
        city_id: values.cityId,
        phone: values.phone,
        address: values.address,
        lat: city?.lat ?? 0,
        lng: city?.lng ?? 0,
        stir: values.stir,
        org_form: values.orgForm,
        tax_regime: values.taxRegime,
        bank_mfo: values.bankMfo,
        bank_account: values.bankAccount,
        responsible_name: values.responsibleName,
        contract_version: CONTRACT_VERSION,
        contract_accepted: values.contractAccepted,
      }),
    });
    if (!registered.ok) {
      const problem = (await registered.json().catch(() => ({}))) as { code?: string };
      const text = t(problemKey(problem.code));
      const field = problem.code ? FIELD_OF_CODE[problem.code] : undefined;
      if (field) {
        form.setError(field, { type: 'server', message: text }, { shouldFocus: true });
      } else {
        setError(text);
      }
      return;
    }
    // Documents and the final submission happen on the review page, which shows the status too.
    // refresh() drops the cached signed-out/no-workspace renders so the panel sees the new business.
    router.replace('/merchant/review');
    router.refresh();
  }

  const errors = form.formState.errors;
  const fieldMessage = (name: keyof Values) => {
    const raw = (errors as FieldErrors<Values>)[name]?.message;
    if (!raw) return undefined;
    // Server errors are already translated; schema errors carry a key.
    return errors[name]?.type === 'server' ? raw : message(raw);
  };

  const text = (
    name: keyof Values,
    label: string,
    options: {
      hint?: string;
      inputMode?: 'numeric' | 'tel';
      maxLength?: number;
      type?: string;
      autoComplete?: string;
    } = {},
  ) => {
    const problem = fieldMessage(name);
    const described = [options.hint ? `${name}-hint` : null, problem ? `${name}-error` : null]
      .filter(Boolean)
      .join(' ');
    return (
      <div className="grid content-start gap-1.5">
        <label className="text-small font-semibold text-ink" htmlFor={name}>
          {label}
        </label>
        <input
          id={name}
          type={options.type ?? 'text'}
          inputMode={options.inputMode}
          maxLength={options.maxLength}
          autoComplete={options.autoComplete}
          className={fieldClass}
          aria-invalid={problem ? true : undefined}
          aria-describedby={described || undefined}
          {...form.register(name)}
        />
        {options.hint && !problem && (
          <p id={`${name}-hint`} className="text-label text-ink-muted">
            {options.hint}
          </p>
        )}
        <FieldError id={`${name}-error`} message={problem} />
      </div>
    );
  };

  const select = (
    name: keyof Values,
    label: string,
    choices: { value: string; label: string }[],
  ) => {
    const problem = fieldMessage(name);
    return (
      <div className="grid content-start gap-1.5">
        <label className="text-small font-semibold text-ink" htmlFor={name}>
          {label}
        </label>
        <select
          id={name}
          className={fieldClass}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${name}-error` : undefined}
          {...form.register(name)}
        >
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        <FieldError id={`${name}-error`} message={problem} />
      </div>
    );
  };

  const fieldset = (legend: string, children: React.ReactNode) => (
    <fieldset className="grid gap-4 rounded-card-ui border border-border bg-surface p-5 sm:grid-cols-2 sm:p-6">
      <legend className="float-left mb-1 w-full text-lead font-bold text-ink sm:col-span-2">
        {legend}
      </legend>
      {children}
    </fieldset>
  );

  const hasErrors = Object.keys(errors).length > 0;
  const contractProblem = fieldMessage('contractAccepted');

  return (
    <form className="mt-6 grid gap-5" noValidate onSubmit={form.handleSubmit(submit)}>
      {fieldset(
        ui('sectionBusiness'),
        <>
          {text('displayName', t('displayName'), { hint: ui('hintDisplayName') })}
          {select('categoryId', t('category'), [
            { value: '', label: t('choose') },
            ...categories.map((item) => ({ value: item.id, label: item.label })),
          ])}
        </>,
      )}
      {fieldset(
        ui('sectionLegal'),
        <>
          {text('legalName', t('legalName'))}
          {text('stir', t('stir'), { hint: ui('hintStir'), inputMode: 'numeric', maxLength: 9 })}
          {select('orgForm', t('orgForm'), [
            { value: 'mchj', label: t('orgFormMchj') },
            { value: 'yatt', label: t('orgFormYatt') },
          ])}
          {select('taxRegime', t('taxRegime'), [
            { value: 'vat_payer', label: t('taxVat') },
            { value: 'turnover_tax', label: t('taxTurnover') },
          ])}
          {text('responsibleName', t('responsibleName'), { autoComplete: 'name' })}
        </>,
      )}
      {fieldset(
        ui('sectionBank'),
        <>
          {text('bankMfo', t('bankMfo'), {
            hint: ui('hintMfo'),
            inputMode: 'numeric',
            maxLength: 5,
          })}
          {text('bankAccount', t('bankAccount'), {
            hint: ui('hintAccount'),
            inputMode: 'numeric',
            maxLength: 20,
          })}
        </>,
      )}
      {fieldset(
        ui('sectionContact'),
        <>
          {select('cityId', t('city'), [
            { value: '', label: t('choose') },
            ...cities.map((item) => ({ value: item.id, label: item.label })),
          ])}
          {text('phone', t('phone'), {
            hint: ui('hintPhone'),
            inputMode: 'tel',
            type: 'tel',
            autoComplete: 'tel',
          })}
          <div className="sm:col-span-2">
            {text('address', t('address'), { autoComplete: 'street-address' })}
          </div>
        </>,
      )}

      <div className="grid gap-1.5 rounded-card-ui border border-border bg-surface p-5">
        <label className="flex items-start gap-3 text-ink" htmlFor="contractAccepted">
          <input
            id="contractAccepted"
            type="checkbox"
            className="mt-1 size-4 accent-[var(--brand)]"
            aria-invalid={contractProblem ? true : undefined}
            aria-describedby={contractProblem ? 'contractAccepted-error' : undefined}
            {...form.register('contractAccepted')}
          />
          <span>{t('contract')}</span>
        </label>
        <FieldError id="contractAccepted-error" message={contractProblem} />
      </div>

      {hasErrors && form.formState.isSubmitted && (
        <p className="text-small text-error">{ui('formErrorsSummary')}</p>
      )}
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control-ui bg-error-tint p-3 text-error"
        >
          <span aria-hidden="true">!</span>
          <span>{error}</span>
        </p>
      )}

      <button
        type="submit"
        disabled={form.formState.isSubmitting}
        className={`justify-self-start px-6 py-3 ${primaryButtonClass}`}
      >
        {form.formState.isSubmitting ? ui('submitting') : t('submitForReview')}
      </button>
    </form>
  );
}
