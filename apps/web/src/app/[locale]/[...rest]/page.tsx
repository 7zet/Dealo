import type { Locale } from '@dealo/config';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { notFoundMetadata } from '@/lib/page-metadata';

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return notFoundMetadata((await params).locale);
}

/** Any deeper URL no route matches (/uz/a/b/c) shows the localized 404 inside the site layout. */
export default function UnknownPage(): never {
  notFound();
}
