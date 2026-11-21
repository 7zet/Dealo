import type { components } from '@grupon/api-client';
import { getFormatter, getTranslations } from 'next-intl/server';

import { accountGet } from '@/lib/account-api';
import { requireAdminArea } from '@/lib/admin-session';

type AuditPage = components['schemas']['AuditLogPage'];

// Only admins and superadmins may read the audit trail; the API enforces it as well.
export default async function AuditPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations('Reports');
  const format = await getFormatter();
  await requireAdminArea('audit', locale);
  const log = await accountGet<AuditPage>('/admin/audit-logs');

  return (
    <div className="grid gap-8">
      <h1 className="text-title font-bold">{t('auditTitle')}</h1>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-ink-muted">
            <tr>
              <th className="py-2 pr-4 font-semibold">{t('colTime')}</th>
              <th className="py-2 pr-4 font-semibold">{t('colRole')}</th>
              <th className="py-2 pr-4 font-semibold">{t('colAction')}</th>
              <th className="py-2 pr-4 font-semibold">{t('colEntity')}</th>
            </tr>
          </thead>
          <tbody>
            {log.items.map((entry) => (
              <tr key={entry.id} className="border-t border-border">
                <td className="py-2 pr-4">
                  {format.dateTime(new Date(entry.created_at), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </td>
                <td className="py-2 pr-4">{entry.actor_role}</td>
                <td className="py-2 pr-4 font-mono">{entry.action}</td>
                <td className="py-2 pr-4">{entry.entity_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
