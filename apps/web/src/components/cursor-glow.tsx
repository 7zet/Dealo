'use client';

import { useEffect, useRef } from 'react';

/** A soft orange light that follows the cursor (with easing) behind the deal feed. Mouse only. */
export function CursorGlow({ children }: { children: React.ReactNode }) {
  const area = useRef<HTMLDivElement>(null);
  const light = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const container = area.current;
    const glow = light.current;
    if (!container || !glow) return;
    if (!matchMedia('(pointer: fine)').matches) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let frame = 0;
    let started = false;
    const step = () => {
      x += (targetX - x) * 0.12;
      y += (targetY - y) * 0.12;
      glow.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      frame = Math.abs(targetX - x) + Math.abs(targetY - y) > 0.5 ? requestAnimationFrame(step) : 0;
    };
    const onMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      targetX = event.clientX - rect.left;
      targetY = event.clientY - rect.top;
      if (!started) {
        x = targetX;
        y = targetY;
        started = true;
      }
      glow.style.opacity = '1';
      if (!frame) frame = requestAnimationFrame(step);
    };
    const onLeave = () => {
      glow.style.opacity = '0';
    };
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerleave', onLeave);
    return () => {
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div ref={area} className="relative">
      <div className="cursor-glow" aria-hidden>
        <span ref={light} />
      </div>
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
