import { provideRouter, Router } from '@angular/router';
import { Code, ConnectError } from '@connectrpc/connect';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Subject, throwError } from 'rxjs';
import { NicknameService } from '../../core/services/nickname.service';
import { AuctionApi } from '../../data-access/auction.api';
import { BidForm } from './bid-form';

const pln = (zl: number) => ({
  $typeName: 'auction.v1.Money' as const,
  amountMinor: BigInt(zl * 100),
  currency: 'PLN',
});

async function setup(placeBid: AuctionApi['placeBid'], nick: string | null = 'alice') {
  const result = await render(BidForm, {
    inputs: { itemId: 'lamp', minimum: pln(160), increment: pln(10) },
    providers: [provideRouter([]), { provide: AuctionApi, useValue: { placeBid } }],
    configureTestBed: (tb) => {
      const nicknames = tb.inject(NicknameService);
      if (nick) nicknames.set(nick);
      else nicknames.clear();
    },
  });
  return { ...result, user: userEvent.setup() };
}

describe('BidForm', () => {
  afterEach(() => localStorage.clear());

  it('prefills the amount with the minimum bid', async () => {
    await setup(vi.fn());
    expect(screen.getByLabelText('Twoja oferta')).toHaveProperty('value', '160');
  });

  it('disables the button while PlaceBid is in flight', async () => {
    const pending = new Subject<never>();
    const placeBid = vi.fn(() => pending.asObservable());
    const { user } = await setup(placeBid as unknown as AuctionApi['placeBid']);

    await user.click(screen.getByRole('button', { name: /licytuj/i }));

    const busy = await screen.findByRole('button', { name: /wysyłam/i });
    expect(busy).toHaveProperty('disabled', true);
    expect(placeBid).toHaveBeenCalledWith('lamp', { amountMinor: 16_000n, currency: 'PLN' });
  });

  it('shows the gRPC error message from the contract table', async () => {
    const placeBid = vi.fn(() =>
      throwError(() => new ConnectError('slow down', Code.ResourceExhausted)),
    );
    const { user } = await setup(placeBid as unknown as AuctionApi['placeBid']);

    await user.click(screen.getByRole('button', { name: /licytuj/i }));

    expect(await screen.findByText('Zwolnij — za dużo ofert')).toBeTruthy();
    expect(screen.getByRole('button', { name: /licytuj/i })).toHaveProperty('disabled', false);
  });

  it('sends users without a nick to the nickname form', async () => {
    const placeBid = vi.fn();
    const { user, fixture } = await setup(placeBid, null);
    const router = fixture.debugElement.injector.get(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await user.click(screen.getByRole('button', { name: /licytuj/i }));

    expect(placeBid).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/nickname'], expect.anything());
  });

  it('quick buttons bump the amount', async () => {
    const { user } = await setup(vi.fn());
    await user.click(screen.getByRole('button', { name: '+50 zł' }));
    expect(screen.getByLabelText('Twoja oferta')).toHaveProperty('value', '210');
  });
});
