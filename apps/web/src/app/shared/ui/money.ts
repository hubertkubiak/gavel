import { Pipe, type PipeTransform } from '@angular/core';
import type { Money } from '@gavel/proto';

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, fractions: boolean): Intl.NumberFormat {
  const key = `${currency}:${fractions}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency,
      minimumFractionDigits: fractions ? 2 : 0,
      maximumFractionDigits: 2,
    });
    formatters.set(key, f);
  }
  return f;
}

/** Minor units (grosze, bigint from protobuf-es) → major units as a JS number. */
export function toMajor(amountMinor: bigint): number {
  return Number(amountMinor) / 100;
}

export function toMinor(major: number): bigint {
  return BigInt(Math.round(major * 100));
}

export function formatMinor(amountMinor: bigint, currency = 'PLN'): string {
  return formatter(currency, amountMinor % 100n !== 0n).format(toMajor(amountMinor));
}

export function formatMoney(money: Money | undefined): string {
  return money ? formatMinor(money.amountMinor, money.currency || 'PLN') : '—';
}

/** `{{ item.currentPrice | money }}` → „1 250 zł”. */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: Money | undefined): string {
    return formatMoney(value);
  }
}
