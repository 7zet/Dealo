import { isLocale } from '@grupon/config';
import { getMessages } from '@grupon/i18n';
import { getRequestConfig } from 'next-intl/server';

import { APP_TIME_ZONE } from '@/lib/dates';

import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale;
  const locale =
    requestedLocale && isLocale(requestedLocale) ? requestedLocale : routing.defaultLocale;

  return {
    locale,
    messages: getMessages(locale),
    // Every date (voucher expiry, order dates) is shown in Tashkent time, not the server's zone.
    timeZone: APP_TIME_ZONE,
  };
});
