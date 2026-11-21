import { StaticPage, staticPageMetadata } from '@/components/static-page';

export const generateMetadata = staticPageMetadata('helpTitle', 'helpText');

export default function Page() {
  return <StaticPage titleKey="helpTitle" textKey="helpText" />;
}
