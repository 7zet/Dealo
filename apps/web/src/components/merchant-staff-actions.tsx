'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useState } from 'react';

import { ConfirmRemoveButton } from './merchant-confirm';
import { FieldError, fieldClass as inputClass, primaryButtonClass } from './merchant-ui';
const PHONE = /^\+998\d{9}$/;

type AssignableRole = 'merchant_manager' | 'merchant_cashier';

export type StaffErrorKey =
  | 'errorOtherBusiness'
  | 'errorAlreadyStaff'
  | 'errorUserNotFound'
  | 'errorStaffNotFound'
  | 'errorOwnerProtected'
  | 'errorStaffPhoneInvalid'
  | 'errorForbidden'
  | 'errorGeneric';

/** Message key for a failed staff request, from its status and problem code. */
export function staffErrorKey(status: number, code: string | undefined): StaffErrorKey {
  switch (code) {
    case 'already_in_another_business':
      return 'errorOtherBusiness';
    case 'already_staff':
      return 'errorAlreadyStaff';
    case 'user_not_found':
      return 'errorUserNotFound';
    case 'staff_not_found':
      return 'errorStaffNotFound';
    case 'owner_protected':
      return 'errorOwnerProtected';
    case 'invalid_phone':
      return 'errorStaffPhoneInvalid';
  }
  if (status === 403) return 'errorForbidden';
  return 'errorGeneric';
}

async function problemCode(response: Response): Promise<string | undefined> {
  const problem = (await response.json().catch(() => ({}))) as { code?: string };
  return problem.code;
}

/** Invite a manager or cashier by phone, change their role, or remove them. Only the owner sees these controls. */
export function MerchantStaffInvite() {
  const t = useTranslations('MerchantPanel');
  const ui = useTranslations('MerchantUI');
  const router = useRouter();
  const [phone, setPhone] = useState('+998');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [role, setRole] = useState<AssignableRole>('merchant_cashier');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!PHONE.test(phone)) {
      setPhoneError(ui('errorStaffPhone'));
      return;
    }
    setPhoneError(null);
    setBusy(true);
    const response = await fetch('/api/bff/merchant/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, role }),
    });
    setBusy(false);
    if (!response.ok) {
      setMessage(t(staffErrorKey(response.status, await problemCode(response))));
      return;
    }
    setPhone('+998');
    router.refresh();
  }

  return (
    <form
      onSubmit={invite}
      noValidate
      className="grid gap-4 rounded-card-ui border border-border bg-surface p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
    >
      <div className="sm:col-span-3">
        <h2 className="font-semibold">{t('staffInviteTitle')}</h2>
        <p className="text-small text-ink-muted">{t('staffInviteHint')}</p>
      </div>
      <div className="grid gap-1.5">
        <label className="text-small font-semibold" htmlFor="staff-phone">
          {t('staffPhone')}
        </label>
        <input
          id="staff-phone"
          className={inputClass}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          aria-invalid={phoneError ? true : undefined}
          aria-describedby={phoneError ? 'staff-phone-error' : undefined}
        />
        <FieldError id="staff-phone-error" message={phoneError ?? undefined} />
      </div>
      <label className="grid gap-1.5 text-small font-semibold">
        {t('staffRole')}
        <select
          className={inputClass}
          value={role}
          onChange={(e) => setRole(e.target.value as AssignableRole)}
        >
          <option value="merchant_cashier">{t('roleCashier')}</option>
          <option value="merchant_manager">{t('roleManager')}</option>
        </select>
      </label>
      <button type="submit" disabled={busy} className={`sm:mt-6.5 ${primaryButtonClass}`}>
        {t('staffInvite')}
      </button>
      {message && (
        <p role="alert" className="text-small text-error sm:col-span-3">
          {message}
        </p>
      )}
    </form>
  );
}

/** Change a staff member's role or remove the assignment. The phone is sent again because the contract expects both fields. */
export function MerchantStaffRow({
  assignmentId,
  phone,
  role,
}: {
  assignmentId: string;
  phone: string;
  role: AssignableRole;
}) {
  const t = useTranslations('MerchantPanel');
  const router = useRouter();
  const [current, setCurrent] = useState<AssignableRole>(role);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function changeRole(next: AssignableRole) {
    setMessage(null);
    setBusy(true);
    const response = await fetch(`/api/bff/merchant/staff/${assignmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, role: next }),
    });
    setBusy(false);
    if (!response.ok) {
      setMessage(t(staffErrorKey(response.status, await problemCode(response))));
      return;
    }
    setCurrent(next);
    router.refresh();
  }

  async function remove() {
    setMessage(null);
    setBusy(true);
    const response = await fetch(`/api/bff/merchant/staff/${assignmentId}`, { method: 'DELETE' });
    setBusy(false);
    if (!response.ok) {
      setMessage(t(staffErrorKey(response.status, await problemCode(response))));
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        aria-label={t('staffRole')}
        className={inputClass}
        disabled={busy}
        value={current}
        onChange={(e) => changeRole(e.target.value as AssignableRole)}
      >
        <option value="merchant_cashier">{t('roleCashier')}</option>
        <option value="merchant_manager">{t('roleManager')}</option>
      </select>
      <ConfirmRemoveButton
        disabled={busy}
        label={t('staffRemove')}
        question={t('staffRemoveConfirm')}
        onConfirm={remove}
      />
      {message && (
        <span role="alert" className="text-sm text-error">
          {message}
        </span>
      )}
    </div>
  );
}
