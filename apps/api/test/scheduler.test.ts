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

  it('is idempotent', () => {
    const { store, events } = fixture();
    const scheduler = new AuctionScheduler(store, events);
    const emitted = vi.spyOn(events, 'emitEnded');
    scheduler.close('lamp');
    scheduler.close('lamp');
    expect(emitted).toHaveBeenCalledOnce();
  });
});
