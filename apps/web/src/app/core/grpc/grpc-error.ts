import { Code, ConnectError } from '@connectrpc/connect';
import { BidRejectedDetailSchema, type Money } from '@gavel/proto';
import { formatMoney } from '../../shared/ui/money';

export interface UiError {
  code: Code;
  /** Upper-snake gRPC code name, e.g. `FAILED_PRECONDITION`. */
  codeName: string;
  message: string;
  /** Minimum acceptable bid, when the server attached a `BidRejectedDetail`. */
  minimumBid?: Money;
}

export function codeName(code: Code): string {
  return Code[code].replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
}

/** Maps any error thrown by a Connect client to a message from the contract's error table. */
export function toUiError(err: unknown): UiError {
  const e = ConnectError.from(err);
  const base = { code: e.code, codeName: codeName(e.code) };
  switch (e.code) {
    case Code.InvalidArgument:
      return { ...base, message: 'Nieprawidłowa kwota' };
    case Code.NotFound:
      return { ...base, message: 'Ta aukcja nie istnieje' };
    case Code.FailedPrecondition: {
      const [detail] = e.findDetails(BidRejectedDetailSchema);
      const minimumBid = detail?.minimumBid;
      return minimumBid
        ? { ...base, minimumBid, message: `Oferta za niska — minimum ${formatMoney(minimumBid)}` }
        : { ...base, message: 'Aukcja zakończona' };
    }
    case Code.Unauthenticated:
      return { ...base, message: 'Wybierz nick, żeby licytować' };
    case Code.ResourceExhausted:
      return { ...base, message: 'Zwolnij — za dużo ofert' };
    case Code.Unavailable:
    case Code.Unknown:
      return { ...base, message: 'Łączę ponownie…' };
    default:
      return { ...base, message: 'Coś poszło nie tak. Spróbuj ponownie.' };
  }
}

/** Only transport-level failures are worth retrying. */
export function isRetryable(err: unknown): boolean {
  const { code } = ConnectError.from(err);
  return code === Code.Unavailable || code === Code.Unknown;
}
