import type { components } from '@dealo/api-client';
import { getFormatter, getTranslations } from 'next-intl/server';

import { ReportActions } from '@/components/report-actions';
import { accountGet } from '@/lib/account-api';
import { requireAdminArea } from '@/lib/admin-session';

type ReportPage = components['schemas']['ReviewReportPage'];

export default async function ReportsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations('Reports');
  const format = await getFormatter();
  await requireAdminArea('reports', locale);
  const reports = await accountGet<ReportPage>('/admin/review-reports');

  return (
    <div className="grid gap-8">
      <h1 className="text-title font-bold">{t('title')}</h1>
      {reports.items.length === 0 ? (
        <p className="text-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="grid gap-4">
          {reports.items.map((report) => (
            <li
              key={report.id}
              className="grid gap-3 rounded-card border border-border bg-surface p-4"
            >
              <p className="text-sm text-ink-muted">
                {t('reason')}: {report.reason}
              </p>
              <p className="text-sm">
                {format.dateTime(new Date(report.created_at), { dateStyle: 'medium' })}
              </p>
              <blockquote className="border-l-2 border-border pl-3 text-ink">
                <span aria-label={`${report.review.rating}/5`}>
                  {'★'.repeat(report.review.rating)}
                </span>{' '}
                {report.review.text}
              </blockquote>
              <ReportActions reportId={report.id} reviewId={report.review.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
