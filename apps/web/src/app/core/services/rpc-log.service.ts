import { Service, signal } from '@angular/core';

export interface RpcLogEntry {
  id: number;
  at: number;
  method: string;
  kind: 'unary' | 'stream' | 'event';
  status: string;
  ms?: number;
  bytes?: number;
  /** For stream events: which `oneof` case arrived. */
  detail?: string;
}

const MAX = 60;

/** Ring buffer behind the dev panel (Ctrl+.). Filled by the timing interceptor. */
@Service()
export class RpcLog {
  private seq = 0;
  readonly entries = signal<RpcLogEntry[]>([]);

  add(entry: Omit<RpcLogEntry, 'id' | 'at'>): void {
    const next = { ...entry, id: ++this.seq, at: Date.now() };
    this.entries.update((list) => [next, ...list].slice(0, MAX));
  }

  clear(): void {
    this.entries.set([]);
  }
}
