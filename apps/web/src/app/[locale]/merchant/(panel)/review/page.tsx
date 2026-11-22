import type { components } from '@dealo/api-client';
import { getTranslations } from 'next-intl/server';

import { MerchantReviewForm } from '@/components/merchant-review-form';
import {
  PageHeader,
  Panel,
  REVIEW_TONES,
  StatusBadge,
  type ReviewStatus,
} from '@/components/merchant-ui';
import { accountGet, accountGetOrNull } from '@/lib/account-api';
import { requirePanelPermission } from '@/lib/merchant-session';

type Merchant = components['schemas']['Merchant'];
type DocumentList = components['schemas']['MerchantDocumentList'];

/** Where the business stands in platform review, and the documents still needed to submit it. */
export default async function MerchantReviewPage() {
  // Documents and submission are business.manage (the owner); the API refuses everyone else.
  await requirePanelPermission('business.manage', '/merchant/review');
  const [t, ui] = await Promise.all([
    getTranslations('MerchantReview'),
    getTranslations('MerchantUI'),
  ]);
  const [business, documents] = await Promise.all([
    accountGet<Merchant>('/merchant/business'),
    accountGetOrNull<DocumentList>('/merchant/documents').then((list) => list ?? { items: [] }),
  ]);
  const uploaded = {
    certificate: documents.items.some((doc) => doc.kind === 'certificate'),
    bank_letter: documents.items.some((doc) => doc.kind === 'bank_letter'),
    price_proof: documents.items.some((doc) => doc.kind === 'price_proof'),
  };
  const status = (business.review_status ?? 'draft') as ReviewStatus;

  return (
    <>
      <PageHeader title={t('title')} description={ui('reviewSubtitle')} />
      <div className="grid gap-3 rounded-card-ui border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-ink">{business.display_name}</span>
          <StatusBadge tone={REVIEW_TONES[status]}>{ui(`status.${status}`)}</StatusBadge>
        </div>
        <p role="status" className="text-ink">
          {t(`status.${status}`)}
        </p>
      </div>
      {status === 'draft' && (
        <Panel title={ui('stepDocuments')} description={t('draftHint')} titleId="documents-title">
          <MerchantReviewForm uploaded={uploaded} />
        </Panel>
      )}
    </>
  );
}
