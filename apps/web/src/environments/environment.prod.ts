import type { Environment } from './environment.model';

export type { Environment, RpcProtocol } from './environment.model';

/**
 * Production build (Docker): the API is reached on the same origin — nginx proxies
 * `/auction.v1.AuctionService/*` to @gavel/api, so no CORS and no hard-coded host.
 */
export const environment: Environment = {
  apiUrl: '/',
  useBinaryFormat: true,
  protocol: 'connect',
};
