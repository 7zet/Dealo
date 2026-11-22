import { publicApi } from '@dealo/api-client';
import type { Locale } from '@dealo/config';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MerchantMap, type MerchantMapItem } from '@/components/merchant-map';
import { getPathname } from '@/i18n/navigation';

/** Fallback centre (Toshkent) when the city list has no coordinates. */
const TASHKENT: [number, number] = [41.2995, 69.2401];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Map' });
  return { title: t('title') };
}

export default async function MapPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const [t, { items: locations }, config] = await Promise.all([
    getTranslations('Map'),
    publicApi.mapLocations(),
    publicApi.config(),
  ]);
  const city = config.cities.find((item) => item.slug === 'tashkent');
  const center: [number, number] = city ? [city.lat, city.lng] : TASHKENT;

  const items: MerchantMapItem[] = locations.map((location) => ({
    id: location.id,
    name: location.merchant_name,
    address: location.address,
    lat: location.lat,
    lng: location.lng,
    rating: location.rating_avg.toFixed(1),
    hasDeals: location.active_deal_count > 0,
    dealsLabel: t('activeDeals', { count: location.active_deal_count }),
    href: getPathname({ href: `/business/${location.merchant_slug}`, locale }),
  }));

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      <div className="border-b bg-surface px-4 py-3 sm:px-6 lg:px-8">
        <h1 className="text-subtitle font-bold">{t('title')}</h1>
        <p className="text-small text-ink-muted">
          {items.length > 0 ? t('subtitle', { count: items.length }) : t('empty')}
        </p>
      </div>
      <MerchantMap
        items={items}
        center={center}
        listLabel={t('list')}
        linkLabel={t('viewBusiness')}
      />
    </div>
  );
}
