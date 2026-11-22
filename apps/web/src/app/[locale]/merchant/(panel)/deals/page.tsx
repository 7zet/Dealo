import type { components } from '@dealo/api-client';
import { CheckCircle2, Pencil, PlusCircle, Tag } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';

import {
  dealTone,
  EmptyState,
  PageHeader,
  primaryButtonClass,
  secondaryButtonClass,
  StatusBadge,
  TableCard,
  Td,
  Th,
} from '@/components/merchant-ui';
import { Link } from '@/i18n/navigation';
import { accountGet, loadForVisitor } from '@/lib/account-api';
import { EDITABLE_DEAL_STATUSES } from '@/lib/deal-status';
import { pickText } from '@/lib/localized';
import { requirePanelPermission } from '@/lib/merchant-session';

type DealPage = components['schemas']['DealPage'];

/** Outcome of the deal wizard, passed in the URL so it survives the redirect back to this list. */
const OUTCOMES = {
  submitted: 'submitted',
  saved: 'saved',
  updated: 'updated',
  review: 'updatedInReview',
} as const;

/** Owned deals, 20 per page, newest first. Next and previous pages keep the list short for large catalogues. */
export default async function MyDealsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; deal?: string }>;
}) {
  const { locale } = await params;
  const access = await requirePanelPermission('workspace.view', '/merchant/deals');
  const { page: rawPage, deal: outcome } = await searchParams;
  const outcomeKey =
    outcome && outcome in OUTCOMES ? OUTCOMES[outcome as keyof typeof OUTCOMES] : null;
  const page = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1);
  const [t, ui, format] = await Promise.all([
    getTranslations('Deals'),
    getTranslations('MerchantUI'),
    getFormatter(),
  ]);
  const list = await loadForVisitor(locale, `/merchant/deals?page=${page}`, () =>
    accountGet<DealPage>(`/merchant/deals?page=${page}`),
  );
  const pages = Math.max(1, Math.ceil(list.total / list.page_size));
  const canEdit = access.can('workspace.edit');
  const createLink = canEdit ? (
    <Link href="/merchant/deals/new" className={primaryButtonClass}>
      <PlusCircle aria-hidden="true" className="size-4" />
      {t('createTitle')}
    </Link>
  ) : undefined;

  return (
    <>
      <PageHeader
        title={t('myDealsTitle')}
        description={ui('dealsSubtitle')}
        actions={createLink}
      />
      {outcomeKey && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-control-ui bg-save-tint p-3 font-semibold text-save"
        >
          <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />
          {t(outcomeKey)}
        </p>
      )}
      {list.items.length === 0 ? (
        <EmptyState
          icon={Tag}
          title={t('dealsEmpty')}
          text={canEdit ? ui('dealsEmptyHint') : undefined}
          action={createLink}
        />
      ) : (
        <TableCard minWidth={640}>
          <thead>
            <tr>
              <Th>{t('colDeal')}</Th>
              <Th>{t('colStatus')}</Th>
              <Th align="right">{t('colSold')}</Th>
              <Th>{t('colEnds')}</Th>
              {canEdit && (
                <Th>
                  <span className="sr-only">{t('edit')}</span>
                </Th>
              )}
            </tr>
          </thead>
          <tbody>
            {list.items.map((deal) => (
              <tr key={deal.id}>
                <Td className="font-medium">
                  {canEdit && EDITABLE_DEAL_STATUSES.has(deal.status) ? (
                    <Link
                      href={`/merchant/deals/${deal.id}/edit`}
                      className="underline-offset-2 hover:text-brand hover:underline"
                    >
                      {pickText(deal.title, locale)}
                    </Link>
                  ) : (
                    pickText(deal.title, locale)
                  )}
                </Td>
                <Td>
                  <StatusBadge tone={dealTone(deal.status)}>
                    {t(`status_${deal.status}` as 'status_active')}
                  </StatusBadge>
                </Td>
                <Td align="right">{format.number(deal.sold_count)}</Td>
                <Td className="whitespace-nowrap text-ink-muted">
                  {format.dateTime(new Date(deal.ends_at), { dateStyle: 'medium' })}
                </Td>
                {canEdit && (
                  <Td align="right">
                    {EDITABLE_DEAL_STATUSES.has(deal.status) && (
                      <Link
                        href={`/merchant/deals/${deal.id}/edit`}
                        className="inline-flex items-center gap-1 font-semibold whitespace-nowrap text-brand underline-offset-2 hover:underline"
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                        {t('edit')}
                      </Link>
                    )}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
      {pages > 1 && (
        <nav aria-label={t('pagination')} className="flex items-center justify-between gap-4">
          {page > 1 ? (
            <Link href={`/merchant/deals?page=${page - 1}`} className={secondaryButtonClass}>
              {t('prevPage')}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-small text-ink-muted">{t('pageInfo', { page, pages })}</span>
          {page < pages ? (
            <Link href={`/merchant/deals?page=${page + 1}`} className={secondaryButtonClass}>
              {t('nextPage')}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
