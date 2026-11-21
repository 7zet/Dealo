'use client';

import { useEffect, useRef } from 'react';

/** Brand neon shades, from deep orange to warm gold. */
const STREAM_COLORS = ['255,106,0', '255,138,31', '255,179,71', '255,210,122', '255,122,26'];

type Particle = {
  x: number;
  y: number;
  radius: number;
  depth: number;
  speed: number;
  phase: number;
  hue: number;
};

/**
 * Animated hero background drawn on a canvas: flowing neon light streams with travelling sparks,
 * drifting bokeh lights with cursor parallax, and a soft glow that follows the cursor.
 * It pauses when off screen or in a hidden tab and draws a single still frame for reduced motion.
 */
export function HeroCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ctx = context;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let frame = 0;
    let visible = true;
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, targetActive: 0 };

    // One pre-rendered soft dot, scaled for every bokeh light (far cheaper than per-frame gradients).
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 64;
    const spriteCtx = sprite.getContext('2d');
    if (spriteCtx) {
      const gradient = spriteCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      spriteCtx.fillStyle = gradient;
      spriteCtx.fillRect(0, 0, 64, 64);
    }
    const tinted = STREAM_COLORS.map((rgb) => {
      const layer = document.createElement('canvas');
      layer.width = layer.height = 64;
      const layerCtx = layer.getContext('2d');
      if (layerCtx) {
        layerCtx.drawImage(sprite, 0, 0);
        layerCtx.globalCompositeOperation = 'source-in';
        layerCtx.fillStyle = `rgb(${rgb})`;
        layerCtx.fillRect(0, 0, 64, 64);
      }
      return layer;
    });

    const seeded = (seed: number) => {
      const value = Math.sin(seed * 9301 + 49297) * 233280;
      return value - Math.floor(value);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.round(Math.min(70, Math.max(18, (width * height) / 9000)));
      particles = Array.from({ length: count }, (_, index) => ({
        x: seeded(index + 1) * width,
        y: seeded(index + 101) * height,
        radius: 3 + seeded(index + 201) * 16,
        depth: 0.2 + seeded(index + 301) * 0.8,
        speed: 4 + seeded(index + 401) * 10,
        phase: seeded(index + 501) * Math.PI * 2,
        hue: Math.floor(seeded(index + 601) * tinted.length),
      }));
    };

    /** Phones: the text spans the full width, so the streams run low along the bottom instead. */
    const narrow = () => width < 640;
    /** Where the streams begin, as a share of the width. */
    const streamStart = () => (narrow() ? 0 : 0.32);

    /** Vertical position of stream `index` at horizontal position `x` and time `t` (seconds). */
    const streamY = (x: number, index: number, t: number) => {
      const u = x / width;
      const progress = Math.max(0, (u - streamStart()) / (1 - streamStart()));
      const base = narrow()
        ? height * 0.99 - height * 0.3 * Math.pow(progress, 1.8)
        : height * 1.08 - height * 1.22 * Math.pow(progress, 1.35);
      const wave =
        Math.sin(u * 7 + t * 0.6 + index * 0.7) * height * 0.035 +
        Math.sin(u * 13 - t * 0.9 + index) * height * 0.012;
      const spread = narrow() ? 4 : height * 0.028;
      const swing = narrow() ? 0.35 : 1;
      return base + index * spread + wave * swing * Math.min(1, progress * 3);
    };

    const drawStreams = (t: number) => {
      const startX = width * (streamStart() - 0.02);
      const step = Math.max(6, width / 180);
      ctx.globalCompositeOperation = 'lighter';
      STREAM_COLORS.forEach((rgb, index) => {
        ctx.beginPath();
        for (let x = startX; x <= width + step; x += step) {
          const y = streamY(x, index, t);
          if (x === startX) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        // Wide faint pass for the glow, then a thin bright core.
        ctx.setLineDash([]);
        ctx.lineWidth = 12;
        ctx.strokeStyle = `rgba(${rgb},0.10)`;
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.strokeStyle = `rgba(${rgb},0.55)`;
        ctx.stroke();
        // Sparks travelling along the stream.
        ctx.setLineDash([46, 420 + index * 60]);
        ctx.lineDashOffset = -(t * (140 + index * 25));
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = 'rgba(255,243,224,0.95)';
        ctx.stroke();
      });
      ctx.setLineDash([]);
    };

    const drawParticles = (t: number, dt: number) => {
      const offsetX = (pointer.x - 0.5) * 40;
      const offsetY = (pointer.y - 0.5) * 24;
      for (const particle of particles) {
        particle.y -= particle.speed * particle.depth * dt;
        if (particle.y < -20) {
          particle.y = height + 20;
          particle.x = Math.random() * width;
        }
        const x = particle.x + offsetX * particle.depth;
        const y = particle.y + offsetY * particle.depth;
        // Lights fade towards the left so the brand text stays readable.
        const side = 0.25 + 0.75 * Math.min(1, x / (width * 0.75));
        const twinkle = 0.55 + 0.45 * Math.sin(t * 1.4 + particle.phase);
        const size = particle.radius * 2 * (0.6 + particle.depth * 0.6);
        ctx.globalAlpha = 0.8 * particle.depth * twinkle * side;
        ctx.drawImage(tinted[particle.hue]!, x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    };

    const drawPointerGlow = () => {
      if (pointer.active < 0.01) return;
      const x = pointer.x * width;
      const y = pointer.y * height;
      const radius = Math.max(width, height) * 0.22;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(255,122,26,${0.22 * pointer.active})`);
      gradient.addColorStop(1, 'rgba(255,122,26,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };

    let last = performance.now();
    const render = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;
      pointer.active += (pointer.targetActive - pointer.active) * 0.05;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';
      drawPointerGlow();
      drawParticles(t, dt);
      drawStreams(t);
      ctx.globalCompositeOperation = 'source-over';
    };

    const loop = (now: number) => {
      render(now);
      frame = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const start = () => {
      if (reduced || frame) return;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };

    resize();
    render(performance.now());
    start();

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reduced || !frame) render(performance.now());
    });
    resizeObserver.observe(canvas);
    const visibility = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) start();
    });
    visibility.observe(canvas);
    const onVisibility = () => !document.hidden && start();
    document.addEventListener('visibilitychange', onVisibility);

    // The canvas sits behind the hero content, so track the pointer on the hero section itself.
    const area = canvas.closest('section') ?? canvas;
    const onMove = (event: Event) => {
      const { clientX, clientY } = event as PointerEvent;
      const rect = canvas.getBoundingClientRect();
      pointer.tx = (clientX - rect.left) / rect.width;
      pointer.ty = (clientY - rect.top) / rect.height;
      pointer.targetActive = 1;
    };
    const onLeave = () => {
      pointer.tx = 0.5;
      pointer.ty = 0.5;
      pointer.targetActive = 0;
    };
    area.addEventListener('pointermove', onMove);
    area.addEventListener('pointerleave', onLeave);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibility.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      area.removeEventListener('pointermove', onMove);
      area.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="absolute inset-0 size-full" />;
}
