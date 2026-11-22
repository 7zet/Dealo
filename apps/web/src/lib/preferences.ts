import { isCurrency, type Currency } from '@dealo/config';
import { cookies } from 'next/headers';
export async function getCurrency(): Promise<Currency> {
  const value = (await cookies()).get('currency')?.value;
  return isCurrency(value) ? value : 'UZS';
}
