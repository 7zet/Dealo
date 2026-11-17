import { ArrowRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
export async function SectionHeading({ title, href }: { title: string; href?: string }) {
  const t = await getTranslations('Common');
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <h2 className="text-subtitle font-extrabold tracking-tight sm:text-title-small">{title}</h2>
      {href && (
        <Link
          className="flex shrink-0 items-center gap-1 text-small font-semibold text-brand"
          href={href}
        >
          {t('viewAll')}
          <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}
