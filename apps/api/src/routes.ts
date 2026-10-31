import type { ConnectRouter } from '@connectrpc/connect';
import { AuctionService } from '@gavel/proto';
import { type AuctionServiceDeps, createAuctionService } from './auction.service.js';

export function createRoutes(deps: AuctionServiceDeps) {
  return (router: ConnectRouter) => {
    router.service(AuctionService, createAuctionService(deps));
  };
}
