import { createTranslator } from 'next-intl';
import en from '@grupon/i18n/messages/en';
import ru from '@grupon/i18n/messages/ru';
import { describe, expect, it } from 'vitest';

import { categoryLabel, subcategoryLabel, type CatalogTranslator } from './catalog-labels';

const catalog = (messages: typeof en, locale: 'en' | 'ru') =>
  createTranslator({ locale, messages, namespace: 'Catalog' }) as unknown as CatalogTranslator;

describe('catalog labels', () => {
  it('translates seeded subcategories whose stored name is only the slug', () => {
    const sub = {
      slug: 'beauty-and-spas-salons',
      name: { uz: 'salons', ru: 'salons', en: 'salons' },
    };
    expect(subcategoryLabel(catalog(ru, 'ru'), 'beauty-and-spas', sub, 'ru')).toBe(
      'Салоны красоты',
    );
    expect(
      subcategoryLabel(catalog(en, 'en'), 'food-and-drink', { ...sub, slug: 'set-menus' }, 'en'),
    ).toBe('Set menus');
  });

  it('falls back to the stored name for unknown slugs', () => {
    const sub = { slug: 'beauty-and-spas-nails', name: { uz: 'Tirnoq', ru: 'Ногти', en: 'Nails' } };
    expect(subcategoryLabel(catalog(en, 'en'), 'beauty-and-spas', sub, 'en')).toBe('Nails');
  });

  it('uses the reviewed category translation over the stored one', () => {
    const category = {
      slug: 'beauty-and-spas',
      name: { uz: 'x', ru: 'Красота и wellness', en: 'x' },
    };
    expect(categoryLabel(catalog(ru, 'ru'), category, 'ru')).toBe('Красота и спа');
  });
});
