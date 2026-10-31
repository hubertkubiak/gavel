import { type DescMessage, type MessageShape, toBinary, toJsonString } from '@bufbuild/protobuf';
import { ConnectError, type Interceptor } from '@connectrpc/connect';
import type { RpcLog } from '../../services/rpc-log.service';
import { codeName } from '../grpc-error';

/** Approximate payload size of a message in the active wire format (excludes framing). */
function sizeOf<T extends DescMessage>(
  schema: T,
  message: MessageShape<T>,
  binary: boolean,
): number {
  return binary ? toBinary(schema, message).byteLength : toJsonString(schema, message).length;
}

/**
 * Logs each RPC name and duration via `console.debug` and feeds the dev panel.
 * For server streams every received message is logged as an `event`.
 */
export function timingInterceptor(log: RpcLog, binary: boolean): Interceptor {
  return (next) => async (req) => {
    const method = req.method.name;
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    try {
      const res = await next(req);
      if (!res.stream) {
        const ms = elapsed();
        console.debug(`[gRPC] ${method} ${ms}ms`);
        log.add({
          method,
          kind: 'unary',
          status: 'OK',
          ms,
          bytes: sizeOf(res.method.output, res.message, binary),
        });
        return res;
      }
      log.add({ method, kind: 'stream', status: 'OPEN', ms: elapsed() });
      const output = res.method.output;
      async function* tap(source: AsyncIterable<MessageShape<typeof output>>) {
        try {
          for await (const message of source) {
            const event = (message as { event?: { case?: string } }).event?.case ?? 'viewers';
            log.add({
              method,
              kind: 'event',
              status: 'OK',
              detail: event,
              bytes: sizeOf(output, message, binary),
            });
            yield message;
          }
          log.add({ method, kind: 'stream', status: 'CLOSED', ms: elapsed() });
        } catch (err) {
          log.add({
            method,
            kind: 'stream',
            status: codeName(ConnectError.from(err).code),
            ms: elapsed(),
          });
          throw err;
        }
      }
      return { ...res, message: tap(res.message) };
    } catch (err) {
      const status = codeName(ConnectError.from(err).code);
      console.debug(`[gRPC] ${method} ${status} ${elapsed()}ms`);
      log.add({ method, kind: req.stream ? 'stream' : 'unary', status, ms: elapsed() });
      throw err;
    }
  };
}
