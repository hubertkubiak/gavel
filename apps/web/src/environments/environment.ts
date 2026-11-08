import type { Environment } from './environment.model';

export type { Environment, RpcProtocol } from './environment.model';

/** Development (`ng serve`): the API runs separately on :8080, CORS allows :4200. */
export const environment: Environment = {
  apiUrl: 'http://localhost:8080',
  useBinaryFormat: true,
  protocol: 'connect',
};
