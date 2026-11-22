import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { AuthForm } from '@/components/auth-form';
import { getMe } from '@/lib/account-api';
import { postLoginPath } from '@/lib/landing';
import { safeNextPath } from '@/lib/safe-next';

/** The visitor's account when they already hold a valid session, else null. */
async function currentUser() {
  try {
    return await getMe();
  } catch {
    return null;
  }
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const [{ locale }, { next }, t] = await Promise.all([
    params,
    searchParams,
    getTranslations('Auth'),
  ]);
  // Already signed in: skip the form and go where the visitor was heading, or to their role's start
  // page (buyers, whose start page is the homepage, to their account).
  const user = await currentUser();
  if (user) {
    const target = postLoginPath(next, user);
    redirect(`/${locale}${target === '/' && !next ? '/account' : target === '/' ? '' : target}`);
  }
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-title font-bold">{t('loginTitle')}</h1>
      <p className="mt-4 text-lead text-ink-muted">
        {t(next?.startsWith('/checkout') ? 'loginSubtitle' : 'loginSubtitleGeneric')}
      </p>
      <AuthForm mode="login" next={next ? safeNextPath(next) : undefined} />
    </div>
  );
}
