'use client';

import type { components } from '@grupon/api-client';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useEffect, useRef, useState } from 'react';

import { formatWait, retryAfterSeconds } from '@/components/auth-form';
import { pickText } from '@/lib/localized';
import {
  VOUCHER_CODE_MAX_LENGTH,
  formatVoucherCode,
  isCompleteVoucherCode,
} from '@/lib/voucher-code';

type Voucher = components['schemas']['Voucher'];
type Location = { id: string; label: string };

// The base stylesheet sets `font: inherit` on form controls, so the size comes from the label
// (text-lead, 18px): at 16px or more iOS does not zoom into the field on focus.
const labelClass = 'grid gap-1 text-lead';
const inputClass = 'rounded-control-ui border border-border bg-surface px-4 py-3 text-ink';

/** Problem codes the counter needs to explain. Anything else shows the generic message. */
const PROBLEM_KEYS = [
  'already_redeemed',
  'voucher_expired',
  'voucher_refunded',
  'voucher_voided',
  'voucher_on_hold',
  'wrong_merchant',
  'voucher_not_found',
  'invalid_qr',
  'invalid_code',
  'location_not_found',
  'too_many_attempts',
  'category_not_redeemable',
] as const;

type ProblemKey =
  | (typeof PROBLEM_KEYS)[number]
  | 'errorGeneric'
  | 'codeRequired'
  | 'scanner_blocked'
  | 'scanner_blocked_unknown'
  | 'sessionExpired';

type Message = { key: ProblemKey; time?: string };

type Failure = { ok: false; status: number; code?: string; retryAfter: number };

/** The message for a failed call. A 401 means the session ended and cannot be renewed. */
function problemMessage(failure: Failure): Message {
  if (failure.status === 401) return { key: 'sessionExpired' };
  if (failure.code === 'scanner_blocked') {
    return failure.retryAfter > 0
      ? { key: 'scanner_blocked', time: formatWait(failure.retryAfter) }
      : { key: 'scanner_blocked_unknown' };
  }
  const known = (PROBLEM_KEYS as readonly string[]).includes(failure.code ?? '');
  return { key: known ? (failure.code as ProblemKey) : 'errorGeneric' };
}

async function call(
  path: string,
  body: unknown,
): Promise<{ ok: true; voucher: Voucher } | Failure> {
  let response: Response;
  try {
    response = await fetch(`/api/bff/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, retryAfter: 0 };
  }
  const data = (await response.json().catch(() => ({}))) as Voucher & {
    code?: string;
    retry_after_seconds?: number;
  };
  if (response.ok) return { ok: true, voucher: data };
  return {
    ok: false,
    status: response.status,
    code: data.code,
    retryAfter: retryAfterSeconds(data, response.headers.get('Retry-After')),
  };
}

export function VoucherRedeemPanel({
  locations,
  locale,
}: {
  locations: Location[];
  locale: string;
}) {
  const t = useTranslations('Redeem');
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [code, setCode] = useState('');
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function lookup(body: { code: string } | { qr_token: string }) {
    setMessage(null);
    setDone(false);
    setBusy(true);
    const result = await call('merchant/vouchers/lookup', body);
    setBusy(false);
    if (!result.ok) {
      setVoucher(null);
      setMessage(problemMessage(result));
      return;
    }
    setVoucher(result.voucher);
  }

  /** Typed codes are checked here first: an empty or incomplete code never reaches the API. */
  function submitCode() {
    if (busy) return;
    const formatted = formatVoucherCode(code);
    if (formatted === '') {
      setVoucher(null);
      setMessage({ key: 'codeRequired' });
      return;
    }
    if (!isCompleteVoucherCode(formatted)) {
      setVoucher(null);
      setMessage({ key: 'invalid_code' });
      return;
    }
    void lookup({ code: formatted });
  }

  // The camera runs only while the scan mode is on, and stops as soon as a code is read.
  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    let controls: IScannerControls | undefined;
    let stopped = false;
    new BrowserQRCodeReader()
      .decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (!result || stopped) return;
        stopped = true;
        controls?.stop();
        setScanning(false);
        void lookup({ qr_token: result.getText() });
      })
      .then((value) => {
        controls = value;
        if (stopped) value.stop();
      })
      .catch(() => {
        setScanning(false);
        setMessage({ key: 'errorGeneric' });
      });
    return () => {
      stopped = true;
      controls?.stop();
    };
    // lookup is recreated each render but only reads state setters, so the scanner must not restart on it.
  }, [scanning]);

  async function confirm() {
    if (!voucher || !locationId || busy) return;
    setMessage(null);
    setBusy(true);
    const result = await call(`merchant/vouchers/${voucher.id}/redeem`, {
      location_id: locationId,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(problemMessage(result));
      return;
    }
    setVoucher(result.voucher);
    setDone(true);
    router.refresh();
  }

  const status = voucher?.status;
  return (
    <div className="grid gap-6">
      <section className="grid max-w-xl gap-3">
        <label className={labelClass}>
          <span className="text-sm">{t('locationLabel')}</span>
          <select
            className={inputClass}
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.label}
              </option>
            ))}
          </select>
        </label>
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submitCode();
          }}
        >
          <label className={labelClass}>
            <span className="text-sm">{t('codeLabel')}</span>
            <input
              className={`${inputClass} font-semibold tracking-widest`}
              placeholder="XXXX-XXXX"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              maxLength={VOUCHER_CODE_MAX_LENGTH}
              value={code}
              aria-invalid={message?.key === 'codeRequired' || message?.key === 'invalid_code'}
              onChange={(event) => setCode(formatVoucherCode(event.target.value))}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-control-ui bg-brand px-5 py-3 font-semibold text-surface disabled:opacity-60"
            >
              {t('check')}
            </button>
            <button
              type="button"
              onClick={() => setScanning((on) => !on)}
              className="rounded-control-ui border border-border px-5 py-3 font-semibold"
            >
              {scanning ? t('stopScan') : t('scan')}
            </button>
          </div>
        </form>
        {scanning && (
          <video
            ref={videoRef}
            className="aspect-square w-full rounded-card-ui bg-ink object-cover"
            muted
            playsInline
          />
        )}
      </section>

      {message && (
        <p
          role="alert"
          className="flex max-w-xl items-start gap-2 rounded-control-ui bg-error-tint p-3 text-error"
        >
          <span aria-hidden="true">!</span>
          <span>
            {message.key === 'scanner_blocked'
              ? t('scanner_blocked', { time: message.time ?? '' })
              : t(message.key)}
            {message.key === 'sessionExpired' && (
              <>
                {' '}
                <Link
                  href={`/login?next=${encodeURIComponent('/merchant/redeem')}`}
                  className="font-semibold underline"
                >
                  {t('signInAgain')}
                </Link>
              </>
            )}
          </span>
        </p>
      )}

      {voucher && (
        <section
          aria-labelledby="voucher-result"
          className="grid max-w-xl gap-3 rounded-card-ui border border-border bg-surface p-5"
        >
          <h2 id="voucher-result" className="font-semibold">
            {pickText(voucher.deal.title, locale)}
          </h2>
          <p className="text-sm text-ink-muted">{pickText(voucher.option.title, locale)}</p>
          <p className="text-sm">
            {t('code')}: <span className="font-semibold">{voucher.code}</span>
          </p>
          <p role="status" className="font-semibold">
            {done ? t('redeemedNow') : t(`status_${status}` as 'status_active')}
          </p>
          {status === 'active' && !done && (
            <button
              type="button"
              onClick={confirm}
              disabled={!locationId || busy}
              className="rounded-control-ui bg-brand px-5 py-4 text-lead font-semibold text-surface disabled:opacity-60"
            >
              {t('confirm')}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
