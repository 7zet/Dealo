'use client';

import type { CircleMarker, Map as LeafletMap } from 'leaflet';
import { MapPin, Star } from 'lucide-react';
import { useEffect, useRef } from 'react';

/** One branch on the public map; labels and links are prepared by the server page. */
export type MerchantMapItem = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: string;
  hasDeals: boolean;
  dealsLabel: string;
  href: string;
};

type Props = {
  items: MerchantMapItem[];
  center: [number, number];
  listLabel: string;
  linkLabel: string;
};

/** Full-height map of every merchant branch, with a list that flies to a branch on click. */
export function MerchantMap({ items, center, listLabel, linkLabel }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef(new Map<string, CircleMarker>());

  useEffect(() => {
    let cancelled = false;
    const markerIndex = markers.current;
    void Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([L]) => {
      if (cancelled || !container.current) return;
      const instance = L.map(container.current).setView(center, 12);
      map.current = instance;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(instance);
      const style = getComputedStyle(document.documentElement);
      const brand = style.getPropertyValue('--brand').trim();
      const faint = style.getPropertyValue('--ink-faint').trim();
      for (const item of items) {
        const color = item.hasDeals ? brand : faint;
        const marker = L.circleMarker([item.lat, item.lng], {
          color: '#fff',
          weight: 2,
          fillColor: color,
          fillOpacity: 1,
          radius: item.hasDeals ? 9 : 7,
        })
          .bindPopup(popupContent(item, linkLabel))
          .addTo(instance);
        markerIndex.set(item.id, marker);
      }
      if (items.length > 1) {
        instance.fitBounds(L.latLngBounds(items.map((item) => [item.lat, item.lng])), {
          padding: [40, 40],
          maxZoom: 15,
        });
      }
    });
    return () => {
      cancelled = true;
      markerIndex.clear();
      map.current?.remove();
      map.current = null;
    };
  }, [items, center, linkLabel]);

  const focus = (item: MerchantMapItem) => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    map.current?.flyTo([item.lat, item.lng], 16, { animate: !reduceMotion, duration: 0.6 });
    markers.current.get(item.id)?.openPopup();
  };

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] lg:grid-cols-[22rem_1fr] lg:grid-rows-1">
      <aside
        aria-label={listLabel}
        className="order-2 max-h-[40dvh] overflow-auto border-t bg-surface lg:order-1 lg:max-h-none lg:border-r lg:border-t-0"
      >
        <ul>
          {items.map((item) => (
            <li key={item.id} className="border-b">
              <button
                type="button"
                onClick={() => focus(item)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-page"
              >
                <MapPin
                  className={`mt-0.5 size-5 shrink-0 ${item.hasDeals ? 'text-brand' : 'text-ink-faint'}`}
                />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{item.name}</span>
                  <span className="block truncate text-small text-ink-muted">{item.address}</span>
                  <span className="mt-1 flex items-center gap-2 text-label text-ink-muted">
                    <Star className="size-3.5 fill-rating text-rating" />
                    {item.rating}
                    <span className={item.hasDeals ? 'font-semibold text-brand' : ''}>
                      {item.dealsLabel}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div ref={container} className="order-1 z-0 min-h-[50dvh] lg:order-2" />
    </div>
  );
}

/** Builds the popup with DOM text nodes so merchant-supplied text is never parsed as HTML. */
function popupContent(item: MerchantMapItem, linkLabel: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'min-w-44';
  const name = document.createElement('p');
  name.className = '!m-0 font-bold text-ink';
  name.textContent = item.name;
  const address = document.createElement('p');
  address.className = '!m-0 !mt-1 text-ink-muted';
  address.textContent = item.address;
  const meta = document.createElement('p');
  meta.className = '!m-0 !mt-1 text-ink-muted';
  meta.textContent = `★ ${item.rating} · ${item.dealsLabel}`;
  const link = document.createElement('a');
  link.className = 'mt-2 inline-block font-semibold !text-brand';
  link.href = item.href;
  link.textContent = linkLabel;
  root.append(name, address, meta, link);
  return root;
}
