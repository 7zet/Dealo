import { StaticPage, staticPageMetadata } from '@/components/static-page';

export const generateMetadata = staticPageMetadata('termsTitle', 'termsText');

export default function Page() {
  return <StaticPage titleKey="termsTitle" textKey="termsText" />;
}
