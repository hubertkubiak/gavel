import { InjectionToken } from '@angular/core';
import type { Client } from '@connectrpc/connect';
import type { AuctionService } from '@gavel/proto';

export type AuctionClient = Client<typeof AuctionService>;

/** The generated, fully typed AuctionService client. Provided by `provideGrpc()`. */
export const AUCTION_CLIENT = new InjectionToken<AuctionClient>('AUCTION_CLIENT');
