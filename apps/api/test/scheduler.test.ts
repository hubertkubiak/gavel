import { timestampFromMs } from '@bufbuild/protobuf/wkt';
import { ItemStatus } from '@gavel/proto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuctionScheduler } from '../src/scheduler.js';
import { fixture } from './helpers.js';

describe('AuctionScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('closes the auction at ends_at and emits auction_ended', () => {
    vi.useFakeTimers();
    const { store, events, clock } = fixture(Date.now());
    const emitted = vi.spyOn(events, 'emitEnded');

    const scheduler = new AuctionScheduler(store, events);
    scheduler.start();
    clock.now += 59_999;
    vi.advanceTimersByTime(59_999);
    expect(store.get('lamp')?.status).toBe(ItemStatus.ACTIVE);
    vi.advanceTimersByTime(1);
    expect(store.get('lamp')?.status).toBe(ItemStatus.ENDED);
    expect(emitted).toHaveBeenCalledOnce();
  });

  it('handles ends_at beyond the 24.8-day setTimeout limit', () => {
    vi.useFakeTimers();
    const { store, events, clock } = fixture(Date.now());
    const day = 24 * 60 * 60_000;
    store.get('lamp')!.endsAt = timestampFromMs(clock.now + 30 * day);

    const scheduler = new AuctionScheduler(store, events);
    scheduler.start();
    // Node clamps an overflowing delay to 1 ms — the auction must not end now.
    clock.now += 60_000;
    vi.advanceTimersByTime(60_000);
    expect(store.get('lamp')?.status).toBe(ItemStatus.ACTIVE);

    // Past the first timer chunk it re-arms for the remainder…
    clock.now += 25 * day;
    vi.advanceTimersByTime(25 * day);
    expect(store.get('lamp')?.status).toBe(ItemStatus.ACTIVE);

    // …and closes exactly at ends_at.
    clock.now += 5 * day - 60_000;
    vi.advanceTimersByTime(5 * day - 60_000);
    expect(store.get('lamp')?.status).toBe(ItemStatus.ENDED);
    scheduler.stop();
  });

  it('is idempotent', () => {
    const { store, events } = fixture();
    const scheduler = new AuctionScheduler(store, events);
    const emitted = vi.spyOn(events, 'emitEnded');
    scheduler.close('lamp');
    scheduler.close('lamp');
    expect(emitted).toHaveBeenCalledOnce();
  });
});
