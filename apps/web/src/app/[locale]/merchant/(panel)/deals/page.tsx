import type { components } from '@grupon/api-client';
import { PlusCircle, Tag } from 'lucide-react';
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
import { pickText } from '@/lib/localized';
import { requirePanelPermission } from '@/lib/merchant-session';

type DealPage = components['schemas']['DealPage'];

/** Owned deals, 20 per page, newest first. Next and previous pages keep the list short for large catalogues. */
export default async function MyDealsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  const access = await requirePanelPermission('workspace.view', '/merchant/deals');
  const { page: rawPage } = await searchParams;
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
      {list.items.length === 0 ? (
        <EmptyState
          icon={Tag}
          title={t('dealsEmpty')}
          text={canEdit ? ui('dealsEmptyHint') : undefined}
          action={createLink}
        />
      ) : (
        <TableCard minWidth={560}>
          <thead>
            <tr>
              <Th>{t('colDeal')}</Th>
              <Th>{t('colStatus')}</Th>
              <Th align="right">{t('colSold')}</Th>
              <Th>{t('colEnds')}</Th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((deal) => (
              <tr key={deal.id}>
                <Td className="font-medium">{pickText(deal.title, locale)}</Td>
                <Td>
                  <StatusBadge tone={dealTone(deal.status)}>
                    {t(`status_${deal.status}` as 'status_active')}
                  </StatusBadge>
                </Td>
                <Td align="right">{format.number(deal.sold_count)}</Td>
                <Td className="whitespace-nowrap text-ink-muted">
                  {format.dateTime(new Date(deal.ends_at), { dateStyle: 'medium' })}
                </Td>
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
