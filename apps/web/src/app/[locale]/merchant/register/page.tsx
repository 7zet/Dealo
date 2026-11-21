import type { components } from '@grupon/api-client';
import { publicApi } from '@grupon/api-client';
import { Check } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { AuthForm } from '@/components/auth-form';
import { MerchantRegisterForm } from '@/components/merchant-register-form';
import { getMe, SessionRequiredError } from '@/lib/account-api';
import { pickText } from '@/lib/localized';
import { merchantEntryFor } from '@/lib/merchant-access';
import { formatPhone, membershipHref } from '@/lib/profile';

type User = components['schemas']['User'];

const REGISTER_PATH = '/merchant/register';

/** The visitor's account, or null when signed out or the session was rejected. */
async function currentUser(): Promise<User | null> {
  try {
    return await getMe();
  } catch (error) {
    if (error instanceof SessionRequiredError) return null;
    throw error;
  }
}

/**
 * Business sign-up in three steps: confirm the phone (OTP sign-in, inline for signed-out visitors),
 * fill in the business details, then upload documents on the review page. Members of a business are
 * sent to their workspace instead of seeing an empty form again.
 */
export default async function MerchantRegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await currentUser();
  if (user && merchantEntryFor(user)) {
    const membership = user.memberships?.[0];
    const target = membership
      ? membershipHref(membership.review_status, membership.permissions ?? [])
      : merchantEntryFor(user);
    redirect(`/${locale}${target}`);
  }

  const [t, ui] = await Promise.all([
    getTranslations('MerchantRegister'),
    getTranslations('MerchantUI'),
  ]);
  const steps = [ui('stepPhone'), ui('stepDetails'), ui('stepDocuments')];
  const current = user ? 2 : 1;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
      <p className="text-small font-semibold uppercase tracking-wider text-brand">
        {ui('stepOf', { step: current, total: steps.length })}
      </p>
      <h1 className="mt-2 text-title-small font-bold sm:text-title">{t('title')}</h1>
      <p className="mt-3 max-w-2xl text-lead text-ink-muted">{t('subtitle')}</p>

      <ol className="mt-8 grid gap-2 sm:grid-cols-3">
        {steps.map((label, index) => {
          const step = index + 1;
          const done = step < current;
          const active = step === current;
          return (
            <li
              key={label}
              aria-current={active ? 'step' : undefined}
              className={`flex items-center gap-3 rounded-control-ui border px-3 py-2.5 text-small ${
                active
                  ? 'border-brand bg-brand-tint font-semibold text-ink'
                  : 'border-border bg-surface text-ink-muted'
              }`}
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-round-ui text-label font-bold ${
                  done || active ? 'bg-brand text-surface' : 'bg-page text-ink-muted'
                }`}
              >
                {done ? <Check aria-hidden="true" className="size-3.5" /> : step}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      {user ? (
        <RegisterDetails
          locale={locale}
          phone={user.phone ?? ''}
          signedInAs={ui('signedInAs', {
            phone: formatPhone(user.phone) ?? '',
          })}
        />
      ) : (
        <section
          aria-labelledby="phone-step"
          className="mt-8 rounded-card-ui border border-border bg-surface p-6 sm:p-8"
        >
          <h2 id="phone-step" className="text-subtitle font-bold">
            {ui('signInTitle')}
          </h2>
          <p className="mt-2 max-w-xl text-ink-muted">{ui('signInText')}</p>
          {/* After the code is verified the form returns here, now signed in, at step 2. */}
          <AuthForm mode="login" next={REGISTER_PATH} />
        </section>
      )}
    </div>
  );
}

async function RegisterDetails({
  locale,
  phone,
  signedInAs,
}: {
  locale: string;
  phone: string;
  signedInAs: string;
}) {
  const config = await publicApi.config();
  const cities = config.cities.map((city) => ({
    id: city.id,
    label: pickText(city.name, locale),
    lat: city.lat,
    lng: city.lng,
  }));
  const categories = config.categories.map((category) => ({
    id: category.id,
    label: pickText(category.name, locale),
  }));
  return (
    <>
      <p className="mt-6 text-small text-ink-muted">{signedInAs}</p>
      <MerchantRegisterForm categories={categories} cities={cities} defaultPhone={phone} />
    </>
  );
}
