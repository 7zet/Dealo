'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { announceSessionChange } from '@/lib/me-query';
import { safeNextPath } from '@/lib/safe-next';

/** Uzbekistan mobile numbers: +998 followed by nine digits. The prefix is fixed in the UI. */
const phoneSchema = z.object({
  digits: z.string().regex(/^[0-9]{9}$/, { message: 'errorPhoneInvalid' }),
});
const codeSchema = z.object({
  code: z.string().regex(/^[0-9]{6}$/, { message: 'errorCodeInvalid' }),
});
type PhoneValues = z.infer<typeof phoneSchema>;
type CodeValues = z.infer<typeof codeSchema>;

const PHONE_PREFIX = '+998';

/** Maps a stable API problem code to the translation key shown to the visitor. */
function problemKey(code: string | undefined) {
  switch (code) {
    case 'invalid_phone':
      return 'errorPhoneInvalid' as const;
    case 'otp_cooldown':
      return 'errorOtpCooldown' as const;
    case 'otp_invalid':
      return 'errorOtpInvalid' as const;
    case 'otp_expired':
      return 'errorOtpExpired' as const;
    case 'otp_attempts_exceeded':
      return 'errorOtpAttempts' as const;
    case 'otp_unavailable':
      return 'errorOtpUnavailable' as const;
    case 'rate_limited':
      return 'errorRateLimited' as const;
    default:
      return 'errorGeneric' as const;
  }
}

type Problem = { code?: string; retry_after_seconds?: number };

/** Problems that carry a wait; the page counts it down instead of saying "a few minutes". */
const WAIT_KEYS = {
  rate_limited: 'errorRateLimitedWait',
  otp_cooldown: 'errorOtpCooldownWait',
} as const;

/** Seconds to wait, from the problem body or the Retry-After header; 0 when unknown. */
export function retryAfterSeconds(problem: Problem, header: string | null): number {
  const fromBody = problem.retry_after_seconds;
  if (typeof fromBody === 'number' && Number.isInteger(fromBody) && fromBody > 0) return fromBody;
  const fromHeader = header === null ? NaN : Number.parseInt(header, 10);
  return Number.isInteger(fromHeader) && fromHeader > 0 ? fromHeader : 0;
}

/** "2:45" style wait. Digits only, so server and browser render it the same way. */
export function formatWait(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/** The moment, in ms since epoch, at which a wait of `seconds` starting now ends. */
function deadlineIn(seconds: number): number {
  return Date.now() + seconds * 1000;
}

/**
 * Remaining whole seconds of a wait that ends at `until` (ms since epoch), refreshed once a second.
 * It never exceeds the wait the server gave, even before the first tick.
 */
function useSecondsLeft(wait: { until: number; seconds: number } | null): number {
  const [now, setNow] = useState(() => Date.now());
  const until = wait?.until ?? null;
  useEffect(() => {
    if (until === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  if (wait === null) return 0;
  return Math.max(0, Math.min(wait.seconds, Math.ceil((wait.until - now) / 1000)));
}

/**
 * Phone sign-in: send a code, then enter it. The account is created on first use. After sign-in the
 * visitor goes to `next` (already checked to be a same-site path) or, without one, to the landing
 * page of their role that the sign-in route reports.
 */
export function AuthForm({ next }: { mode?: 'login' | 'register'; next?: string | undefined }) {
  const t = useTranslations('Auth');
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  // A wait belongs to the phone that hit the limit; typing another number lifts it at once.
  const [wait, setWait] = useState<{
    key: (typeof WAIT_KEYS)[keyof typeof WAIT_KEYS];
    phone: string;
    until: number;
    seconds: number;
  } | null>(null);
  const secondsLeft = useSecondsLeft(wait);

  const phoneForm = useForm<PhoneValues>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { digits: '' },
  });
  const codeForm = useForm<CodeValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  });

  const typedDigits = useWatch({ control: phoneForm.control, name: 'digits' });
  const currentPhone = phone ?? `${PHONE_PREFIX}${typedDigits}`;
  const waiting = wait !== null && wait.phone === currentPhone && secondsLeft > 0;

  /** Shows the problem; a problem with a known wait becomes a countdown for that phone. */
  async function showProblem(response: Response, forPhone: string) {
    const problem = (await response.json().catch(() => ({}))) as Problem;
    const seconds = retryAfterSeconds(problem, response.headers.get('Retry-After'));
    const waitKey = WAIT_KEYS[problem.code as keyof typeof WAIT_KEYS];
    if (waitKey && seconds > 0) {
      setServerError(null);
      setWait({ key: waitKey, phone: forPhone, until: deadlineIn(seconds), seconds });
      return;
    }
    setWait(null);
    setServerError(t(problemKey(problem.code)));
  }

  const notice = waiting ? (
    <WaitBox
      message={t(wait.key, { time: formatWait(secondsLeft) })}
      announcement={t(wait.key, { time: formatWait(wait.seconds) })}
    />
  ) : serverError ? (
    <ErrorBox message={serverError} />
  ) : null;

  async function sendCode(values: PhoneValues) {
    if (waiting) return;
    setServerError(null);
    const full = `${PHONE_PREFIX}${values.digits}`;
    const response = await fetch('/api/auth/phone-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: full }),
    });
    if (!response.ok) {
      await showProblem(response, full);
      return;
    }
    const sent = (await response.json().catch(() => ({}))) as { dev_code?: string };
    setWait(null);
    setPhone(full);
    setDevCode(sent.dev_code ?? null);
  }

  async function verifyCode(values: CodeValues) {
    if (waiting) return;
    setServerError(null);
    let response: Response;
    try {
      response = await fetch('/api/auth/phone-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: values.code }),
      });
    } catch {
      setServerError(t('errorGeneric'));
      return;
    }
    if (!response.ok) {
      await showProblem(response, phone ?? '');
      return;
    }
    const session = (await response.json().catch(() => ({}))) as { landing?: string };
    announceSessionChange();
    router.replace(next ?? safeNextPath(session.landing));
    router.refresh();
  }

  if (phone === null) {
    const errors = phoneForm.formState.errors;
    return (
      <form
        className="mx-auto mt-10 grid max-w-md gap-5"
        noValidate
        onSubmit={phoneForm.handleSubmit(sendCode)}
      >
        <div className="grid gap-2">
          <label htmlFor="phone" className="font-medium text-ink">
            {t('phoneLabel')}
          </label>
          <div className="flex items-center gap-2">
            <span className="rounded-control-ui border border-border bg-page px-4 py-3 text-ink-muted">
              {PHONE_PREFIX}
            </span>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={9}
              placeholder="901234567"
              className="min-w-0 flex-1 rounded-control-ui border border-border bg-surface px-4 py-3 text-ink"
              aria-invalid={Boolean(errors.digits)}
              {...phoneForm.register('digits')}
            />
          </div>
          {errors.digits && (
            <p className="text-sm text-error">{t(errors.digits.message as 'errorPhoneInvalid')}</p>
          )}
        </div>
        {notice}
        <button
          type="submit"
          disabled={phoneForm.formState.isSubmitting || waiting}
          aria-disabled={phoneForm.formState.isSubmitting || waiting}
          className="rounded-control-ui bg-brand px-5 py-3 font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('sendCode')}
        </button>
      </form>
    );
  }

  const errors = codeForm.formState.errors;
  return (
    <form
      className="mx-auto mt-10 grid max-w-md gap-5"
      noValidate
      onSubmit={codeForm.handleSubmit(verifyCode)}
    >
      <p className="text-ink-muted">{t('codeSent', { phone })}</p>
      {devCode && <p className="text-sm text-ink-muted">{t('devCodeHint', { code: devCode })}</p>}
      <div className="grid gap-2">
        <label htmlFor="code" className="font-medium text-ink">
          {t('codeLabel')}
        </label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="rounded-control-ui border border-border bg-surface px-4 py-3 text-center text-lead tracking-widest text-ink"
          aria-invalid={Boolean(errors.code)}
          {...codeForm.register('code')}
        />
        {errors.code && (
          <p className="text-sm text-error">{t(errors.code.message as 'errorCodeInvalid')}</p>
        )}
      </div>
      {notice}
      <button
        type="submit"
        disabled={codeForm.formState.isSubmitting || waiting}
        aria-disabled={codeForm.formState.isSubmitting || waiting}
        className="rounded-control-ui bg-brand px-5 py-3 font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-60"
      >
        {t('verifyCode')}
      </button>
      <button
        type="button"
        className="text-sm text-brand"
        onClick={() => {
          setServerError(null);
          setPhone(null);
        }}
      >
        {t('changePhone')}
      </button>
    </form>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-control-ui bg-error-tint p-3 text-error"
    >
      <span aria-hidden="true">!</span>
      <span>{message}</span>
    </p>
  );
}

/**
 * A countdown notice. The visible text changes every second, so it is not a live region; screen
 * readers hear the message once, with the wait as it was when the limit was hit.
 */
function WaitBox({ message, announcement }: { message: string; announcement: string }) {
  return (
    <div className="rounded-control-ui bg-error-tint p-3 text-error">
      <p role="alert" className="sr-only">
        {announcement}
      </p>
      <p aria-hidden="true" className="flex items-start gap-2 tabular-nums">
        <span>!</span>
        <span>{message}</span>
      </p>
    </div>
  );
}
