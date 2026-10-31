import { Code, ConnectError, createContextKey, type Interceptor } from '@connectrpc/connect';

/** Nick of the caller, taken from `Authorization: Bearer <nick>`. Demo only — no passwords. */
export const kNickname = createContextKey<string | undefined>(undefined, {
  description: 'nickname from the Authorization header',
});

/** RPCs that require an identity. Reading the catalogue stays anonymous. */
const PROTECTED = new Set(['PlaceBid']);

const NICK = /^[\p{L}\p{N}_.-]{3,20}$/u;

export function parseNickname(header: string | null): string | undefined {
  const match = /^Bearer\s+(.+)$/i.exec(header?.trim() ?? '');
  const nick = match?.[1] ? decodeURIComponent(match[1]).trim() : undefined;
  return nick && NICK.test(nick) ? nick : undefined;
}

export const authInterceptor: Interceptor = (next) => async (req) => {
  const nick = parseNickname(req.header.get('authorization'));
  if (nick) req.contextValues.set(kNickname, nick);
  else if (PROTECTED.has(req.method.name)) {
    throw new ConnectError('Missing or invalid Authorization header', Code.Unauthenticated);
  }
  return next(req);
};

/** LATENCY_MS: artificial delay for unary calls, to show skeletons and busy buttons. */
export function latencyInterceptor(ms: number): Interceptor {
  return (next) => async (req) => {
    if (ms > 0 && !req.stream) await new Promise((r) => setTimeout(r, ms));
    return next(req);
  };
}

export const loggingInterceptor: Interceptor = (next) => async (req) => {
  const started = performance.now();
  try {
    return await next(req);
  } finally {
    const ms = (performance.now() - started).toFixed(1);
    console.info(`[rpc] ${req.method.name} ${ms}ms`);
  }
};
