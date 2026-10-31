import { type EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import { createClient, type Transport } from '@connectrpc/connect';
import { createConnectTransport, createGrpcWebTransport } from '@connectrpc/connect-web';
import { AuctionService } from '@gavel/proto';
import { environment, type RpcProtocol } from '../../../environments/environment';
import { NicknameService } from '../services/nickname.service';
import { RpcLog } from '../services/rpc-log.service';
import { AUCTION_CLIENT } from './grpc-client.token';
import { authInterceptor } from './interceptors/auth.interceptor';
import { timingInterceptor } from './interceptors/timing.interceptor';

export interface WireSettings {
  protocol: RpcProtocol;
  useBinaryFormat: boolean;
}

const WIRE_KEY = 'gavel.wire';

/** Environment defaults, optionally overridden from the dev panel (persisted per browser). */
export function wireSettings(): WireSettings {
  const defaults = { protocol: environment.protocol, useBinaryFormat: environment.useBinaryFormat };
  try {
    const saved = JSON.parse(localStorage.getItem(WIRE_KEY) ?? '{}') as Partial<WireSettings>;
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

export function saveWireSettings(settings: WireSettings): void {
  try {
    localStorage.setItem(WIRE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function createTransport(): Transport {
  const nickname = inject(NicknameService);
  const log = inject(RpcLog);
  const { protocol, useBinaryFormat } = wireSettings();
  const options = {
    baseUrl: environment.apiUrl,
    useBinaryFormat,
    interceptors: [authInterceptor(nickname.nickname), timingInterceptor(log, useBinaryFormat)],
  };
  // Connect vs gRPC-Web: literally one line of difference.
  return protocol === 'grpc-web'
    ? createGrpcWebTransport(options)
    : createConnectTransport(options);
}

export function provideGrpc(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: AUCTION_CLIENT, useFactory: () => createClient(AuctionService, createTransport()) },
  ]);
}
