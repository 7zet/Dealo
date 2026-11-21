'use client';
import type { components } from '@grupon/api-client';
import useEmblaCarousel from 'embla-carousel-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
type Media = components['schemas']['DealMedia'];
/** Deal photos. Alt text names the deal, because merchant-supplied alt text is often generic. */
export function DealGallery({ media, title }: { media: Media[]; title: string }) {
  const t = useTranslations('Deal');
  const [ref, api] = useEmblaCarousel({ loop: true });
  const scroll = useCallback((index: number) => api?.scrollTo(index), [api]);
  return (
    <div className="w-full max-w-[38rem]">
      <div ref={ref} className="overflow-hidden rounded-panel-ui bg-brand-tint">
        <div className="flex">
          {media.map((image, index) => (
            <div className="relative aspect-square min-w-0 flex-[0_0_100%]" key={image.id}>
              <Image
                src={image.url}
                alt={t('photoAlt', { title, index: index + 1 })}
                fill
                priority={index === 0}
                className="object-cover"
                sizes="(max-width: 640px) 100vw, 38rem"
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {media.slice(0, 5).map((image, index) => (
          <button
            className="relative aspect-square overflow-hidden rounded-control-ui border transition hover:border-brand"
            onClick={() => scroll(index)}
            key={image.id}
            type="button"
            aria-label={t('showPhoto', { index: index + 1 })}
          >
            <Image src={image.url} alt="" fill className="object-cover" sizes="10vw" />
          </button>
        ))}
      </div>
    </div>
  );
}
