import type { components } from '@dealo/api-client';
import type { Locale } from '@dealo/config';
import { TIYIN_PER_SOM } from '@dealo/ui';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { DealWizard, type DealDraft } from '@/components/deal-wizard';
import type { MediaAsset } from '@/components/merchant-media-library';
import { PageHeader } from '@/components/merchant-ui';
import { accountGet, accountGetOrNull, loadForVisitor } from '@/lib/account-api';
import { categoryLabel, subcategoryLabel } from '@/lib/catalog-labels';
import { toTashkentInput } from '@/lib/dates';
import { EDITABLE_DEAL_STATUSES } from '@/lib/deal-status';
import { pickText } from '@/lib/localized';
import { requirePanelPermission } from '@/lib/merchant-session';

type Config = components['schemas']['PublicConfig'];
type LocationList = components['schemas']['LocationList'];
type Deal = components['schemas']['Deal'];
type Text = components['schemas']['LocalizedText'];

const text = (value: Text | undefined) => ({
  uz: value?.uz ?? '',
  ru: value?.ru ?? '',
  en: value?.en ?? '',
});

/** The saved deal as wizard fields. Each saved photo gets a picker id of its own. */
function toDraft(deal: Deal): DealDraft {
  return {
    slug: deal.slug,
    categoryId: deal.category.id,
    subcategoryId: deal.subcategory.id,
    title: text(deal.title),
    shortDescription: text(deal.short_description),
    description: text(deal.description),
    highlights: deal.highlights.map(text),
    terms: text(deal.terms),
    redemptionMethod: deal.redemption_method,
    redemptionInstructions: text(deal.redemption_instructions),
    maxPerUser: deal.max_per_user,
    options: deal.options.map((option) => ({
      id: option.id,
      title: text(option.title),
      originalPrice: String(Math.round(option.original_price.amount / TIYIN_PER_SOM)),
      dealPrice: String(Math.round(option.deal_price.amount / TIYIN_PER_SOM)),
      stock: String(option.stock_total),
    })),
    mediaIds: deal.media.map((media) => `deal-${media.id}`),
    locationIds: deal.locations.map((location) => location.id),
    startsAt: deal.starts_at ? toTashkentInput(deal.starts_at) : '',
    endsAt: toTashkentInput(deal.ends_at),
    validDays: deal.voucher_valid_days ?? 30,
  };
}

export default async function EditDealPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const href = `/merchant/deals/${id}/edit`;
  await requirePanelPermission('workspace.edit', href);
  const [t, catalog] = await Promise.all([getTranslations('Deals'), getTranslations('Catalog')]);
  const [deal, config, locations, media] = await loadForVisitor(locale, href, () =>
    Promise.all([
      accountGetOrNull<Deal>(`/merchant/deals/${id}`),
      accountGet<Config>('/config'),
      accountGet<LocationList>('/merchant/locations'),
      accountGet<{ items: MediaAsset[] }>('/merchant/media'),
    ]),
  );
  if (!deal || !EDITABLE_DEAL_STATUSES.has(deal.status)) notFound();

  const categories = config.categories.map((category) => ({
    id: category.id,
    label: categoryLabel(catalog, category, locale as Locale),
    subcategories: category.subcategories.map((sub) => ({
      id: sub.id,
      label: subcategoryLabel(catalog, category.slug, sub, locale as Locale),
    })),
  }));
  // A deal in a category that no longer takes new deals still shows its own category.
  if (!categories.some((category) => category.id === deal.category.id)) {
    categories.push({
      id: deal.category.id,
      label: pickText(deal.category.name, locale),
      subcategories: [{ id: deal.subcategory.id, label: pickText(deal.subcategory.name, locale) }],
    });
  }
  const options = locations.items.map((location) => ({
    id: location.id,
    label: `${pickText(location.city.name, locale)} — ${location.address}`,
  }));
  const photos: MediaAsset[] = deal.media.map((item) => ({
    id: `deal-${item.id}`,
    url: item.url,
    content_type: '',
    size: 0,
    width: item.width,
    height: item.height,
  }));

  return (
    <>
      <PageHeader title={t('editTitle')} description={t('editSubtitle')} />
      <DealWizard
        categories={categories}
        locations={options}
        media={media.items}
        existing={{ id: deal.id, status: deal.status, draft: toDraft(deal), photos }}
      />
    </>
  );
}
