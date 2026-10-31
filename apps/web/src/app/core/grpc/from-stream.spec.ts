import { firstValueFrom, take, toArray } from 'rxjs';
import { fromStream, fromUnary } from './from-stream';

describe('fromStream', () => {
  it('emits every value and completes', async () => {
    async function* source() {
      yield 1;
      yield 2;
      yield 3;
    }
    const values = await firstValueFrom(fromStream(() => source()).pipe(toArray()));
    expect(values).toEqual([1, 2, 3]);
  });

  it('forwards errors', async () => {
    async function* source(): AsyncGenerator<number> {
      yield 1;
      throw new Error('boom');
    }
    await expect(firstValueFrom(fromStream(() => source()).pipe(toArray()))).rejects.toThrow(
      'boom',
    );
  });

  it('aborts the signal on unsubscribe', async () => {
    let signal: AbortSignal | undefined;
    async function* forever(s: AbortSignal) {
      signal = s;
      let i = 0;
      while (!s.aborted) {
        yield i++;
        await new Promise((r) => setTimeout(r, 1));
      }
    }
    const values = await firstValueFrom(fromStream(forever).pipe(take(2), toArray()));
    expect(values).toEqual([0, 1]);
    expect(signal?.aborted).toBe(true);
  });

  it('does not error after unsubscribe', async () => {
    const errors: unknown[] = [];
    async function* source(s: AbortSignal): AsyncGenerator<number> {
      await new Promise((r) => setTimeout(r, 5));
      if (s.aborted) throw new DOMException('aborted', 'AbortError');
      yield 1;
    }
    const sub = fromStream(source).subscribe({ error: (e) => errors.push(e) });
    sub.unsubscribe();
    await new Promise((r) => setTimeout(r, 10));
    expect(errors).toEqual([]);
  });
});

describe('fromUnary', () => {
  it('emits the resolved value', async () => {
    expect(await firstValueFrom(fromUnary(async () => 42))).toBe(42);
  });

  it('aborts on unsubscribe', () => {
    let signal: AbortSignal | undefined;
    const sub = fromUnary((s) => {
      signal = s;
      return new Promise(() => undefined);
    }).subscribe();
    sub.unsubscribe();
    expect(signal?.aborted).toBe(true);
  });
});
