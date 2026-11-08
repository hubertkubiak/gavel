import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/rate-limiter.js';

describe('RateLimiter', () => {
  it('forgets keys whose hits have all expired', () => {
    const clock = { now: 1_000_000 };
    const limiter = new RateLimiter(5, 1000, () => clock.now);
    for (let i = 0; i < 100; i++) limiter.tryAcquire(`user${i}`);
    expect(limiter.size).toBe(100);

    clock.now += 1000;
    limiter.tryAcquire('fresh');
    expect(limiter.size).toBe(1);
  });
});
