import { Service, inject } from '@angular/core';
import type { MessageInitShape } from '@bufbuild/protobuf';
import type { ItemEvent, ItemStatus, MoneySchema } from '@gavel/proto';
import type { Observable } from 'rxjs';
import { fromStream, fromUnary } from '../core/grpc/from-stream';
import { AUCTION_CLIENT } from '../core/grpc/grpc-client.token';

/**
 * Thin wrapper over the generated client. Components only ever see Observables —
 * unsubscribing aborts the request (`CallOptions.signal`), e.g. on route change.
 */
@Service()
export class AuctionApi {
  private readonly client = inject(AUCTION_CLIENT);

  listItems(status: ItemStatus) {
    return fromUnary((signal) => this.client.listItems({ status }, { signal }));
  }

  getItem(itemId: string) {
    return fromUnary((signal) => this.client.getItem({ itemId }, { signal }));
  }

  placeBid(itemId: string, amount: MessageInitShape<typeof MoneySchema>) {
    return fromUnary((signal) => this.client.placeBid({ itemId, amount }, { signal }));
  }

  watchItem(itemId: string): Observable<ItemEvent> {
    return fromStream((signal) => this.client.watchItem({ itemId }, { signal }));
  }
}
