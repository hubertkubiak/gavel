import type { Interceptor } from '@connectrpc/connect';

/**
 * Adds `Authorization: Bearer <nick>` to every call when a nick is set.
 * The nick is URI-encoded because header values must be ISO-8859-1 (think „Łukasz”).
 */
export function authInterceptor(nickname: () => string | null): Interceptor {
  return (next) => (req) => {
    const nick = nickname();
    if (nick) req.header.set('Authorization', `Bearer ${encodeURIComponent(nick)}`);
    return next(req);
  };
}
