import { StaticPage, staticPageMetadata } from '@/components/static-page';

export const generateMetadata = staticPageMetadata('privacyTitle', 'privacyText');

export default function Page() {
  return <StaticPage titleKey="privacyTitle" textKey="privacyText" />;
}
