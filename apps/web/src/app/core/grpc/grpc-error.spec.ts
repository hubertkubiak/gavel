import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { BidRejectedDetailSchema } from '@gavel/proto';
import { codeName, isRetryable, toUiError } from './grpc-error';

describe('toUiError', () => {
  it.each([
    [Code.InvalidArgument, 'Nieprawidłowa kwota'],
    [Code.NotFound, 'Ta aukcja nie istnieje'],
    [Code.FailedPrecondition, 'Aukcja zakończona'],
    [Code.ResourceExhausted, 'Zwolnij — za dużo ofert'],
    [Code.Unavailable, 'Łączę ponownie…'],
  ])('maps code %s to a UI message', (code, message) => {
    expect(toUiError(new ConnectError('x', code)).message).toBe(message);
  });

  it('reads the typed BidRejectedDetail for low bids', () => {
    const err = new ConnectError('low', Code.FailedPrecondition, undefined, [
      {
        desc: BidRejectedDetailSchema,
        value: create(BidRejectedDetailSchema, {
          minimumBid: { amountMinor: 16_000n, currency: 'PLN' },
        }),
      },
    ]);
    const ui = toUiError(err);
    expect(ui.minimumBid?.amountMinor).toBe(16_000n);
    expect(ui.message).toMatch(/^Oferta za niska — minimum 160\s?zł$/);
  });

  it('wraps unknown errors', () => {
    expect(toUiError(new Error('network')).code).toBe(Code.Unknown);
  });
});

describe('helpers', () => {
  it('formats code names like the gRPC spec', () => {
    expect(codeName(Code.FailedPrecondition)).toBe('FAILED_PRECONDITION');
    expect(codeName(Code.Unavailable)).toBe('UNAVAILABLE');
  });

  it('retries only transport failures', () => {
    expect(isRetryable(new ConnectError('x', Code.Unavailable))).toBe(true);
    expect(isRetryable(new ConnectError('x', Code.Unknown))).toBe(true);
    expect(isRetryable(new ConnectError('x', Code.NotFound))).toBe(false);
  });
});
