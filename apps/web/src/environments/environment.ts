export type RpcProtocol = 'connect' | 'grpc-web';

export interface Environment {
  /** Base URL of @gavel/api. */
  apiUrl: string;
  /** Binary Protobuf on the wire (true) or JSON (false) — compare both in the Network tab. */
  useBinaryFormat: boolean;
  /** Connect protocol (default) or gRPC-Web — swapping is a one-line change in transport.ts. */
  protocol: RpcProtocol;
}

export const environment: Environment = {
  apiUrl: 'http://localhost:8080',
  useBinaryFormat: true,
  protocol: 'connect',
};
