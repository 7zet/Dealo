import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { SectionNav } from '@/components/section-nav';
import { getMe } from '@/lib/account-api';
import { adminAreas, type AdminArea } from '@/lib/admin-access';

async function areasForVisitor(): Promise<AdminArea[]> {
  try {
    const user = await getMe();
    return user ? adminAreas(user.roles) : [];
  } catch {
    // Signed-out visitors are sent to sign in by the page itself.
    return [];
  }
}

/** Frame of the admin tools: links to the areas the visitor's roles admit. Each page guards itself. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [areas, moderation, merchants, reports, finance, profile] = await Promise.all([
    areasForVisitor(),
    getTranslations('Moderation'),
    getTranslations('AdminMerchants'),
    getTranslations('Reports'),
    getTranslations('AdminFinance'),
    getTranslations('Profile'),
  ]);
  const titles: Record<AdminArea, string> = {
    moderation: moderation('title'),
    merchants: merchants('title'),
    reports: reports('title'),
    finance: finance('title'),
    audit: reports('auditTitle'),
  };
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {areas.length > 0 && (
        <SectionNav
          label={profile('staffTitle')}
          items={areas.map((area) => ({ href: `/admin/${area}`, label: titles[area] }))}
        />
      )}
      <div className="mt-8">{children}</div>
    </div>
  );
}
