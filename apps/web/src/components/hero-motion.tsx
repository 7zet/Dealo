'use client';

import { useEffect, useRef } from 'react';

/**
 * Entrance animation for the hero, plus a scroll effect: as the visitor scrolls into the feed the hero
 * drifts up, shrinks slightly and fades, so attention moves to the deals.
 */
export function HeroMotion({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    void import('gsap').then(({ gsap }) => {
      gsap.fromTo(
        element.querySelectorAll('[data-hero]'),
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, stagger: 0.07, duration: 0.5, ease: 'power2.out' },
      );
    });
    let frame = 0;
    const update = () => {
      frame = 0;
      const height = element.offsetHeight || 1;
      const progress = Math.min(Math.max(window.scrollY / height, 0), 1);
      element.style.transform = `translate3d(0, ${progress * -48}px, 0) scale(${1 - progress * 0.05})`;
      element.style.opacity = String(1 - progress * 0.9);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div ref={ref} className="origin-top will-change-transform">
      {children}
    </div>
  );
}
