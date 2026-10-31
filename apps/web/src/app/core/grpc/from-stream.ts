import { Observable } from 'rxjs';

/**
 * Bridges an AsyncIterable (e.g. a Connect server stream) to an Observable.
 *
 * Every subscription creates its own AbortController; unsubscribing calls `abort()`,
 * which cancels the underlying fetch — so `takeUntilDestroyed()` in a component
 * closes the stream on the server as well.
 */
export function fromStream<T>(factory: (signal: AbortSignal) => AsyncIterable<T>): Observable<T> {
  return new Observable<T>((subscriber) => {
    const controller = new AbortController();
    (async () => {
      try {
        for await (const value of factory(controller.signal)) {
          if (controller.signal.aborted) return;
          subscriber.next(value);
        }
        subscriber.complete();
      } catch (err) {
        if (!controller.signal.aborted) subscriber.error(err);
      }
    })();
    return () => controller.abort();
  });
}

/** Same idea for unary calls: a cold Observable that aborts the request on unsubscribe. */
export function fromUnary<T>(factory: (signal: AbortSignal) => Promise<T>): Observable<T> {
  return new Observable<T>((subscriber) => {
    const controller = new AbortController();
    factory(controller.signal).then(
      (value) => {
        subscriber.next(value);
        subscriber.complete();
      },
      (err: unknown) => {
        if (!controller.signal.aborted) subscriber.error(err);
      },
    );
    return () => controller.abort();
  });
}
