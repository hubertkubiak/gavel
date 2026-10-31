import { DatePipe } from '@angular/common';
import { Component, inject, output } from '@angular/core';
import { LucideTrash2, LucideX } from '@lucide/angular';
import { environment } from '../../../environments/environment';
import { saveWireSettings, wireSettings } from '../../core/grpc/transport';
import { RpcLog } from '../../core/services/rpc-log.service';

/** gRPC "from the inside": recent calls, timings, sizes and the active wire format. Toggle: Ctrl+. */
@Component({
  selector: 'gv-dev-panel',
  imports: [DatePipe, LucideX, LucideTrash2],
  template: `
    <section
      aria-label="Panel deweloperski gRPC"
      animate.enter="fade-up"
      class="card fixed bottom-4 right-4 z-[55] flex max-h-[70dvh] w-[min(34rem,calc(100vw-2rem))] flex-col overflow-hidden shadow-2xl"
    >
      <header class="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 class="text-sm font-semibold">gRPC inspector</h2>
        <span class="badge bg-accent-soft text-accent font-mono">{{ wire.protocol }}</span>
        <span class="badge bg-surface-2 text-muted font-mono">{{
          wire.useBinaryFormat ? 'binary' : 'json'
        }}</span>
        <div class="ml-auto flex gap-1">
          <button
            type="button"
            class="btn btn-ghost btn-icon size-8"
            (click)="log.clear()"
            aria-label="Wyczyść log"
          >
            <svg lucideTrash2 [size]="15" aria-hidden="true"></svg>
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-icon size-8"
            (click)="closed.emit()"
            aria-label="Zamknij panel"
          >
            <svg lucideX [size]="15" aria-hidden="true"></svg>
          </button>
        </div>
      </header>

      <div class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 text-xs">
        <span class="text-muted">Protokół</span>
        @for (p of protocols; track p) {
          <button
            type="button"
            class="btn btn-ghost h-7 px-2.5 text-xs"
            [attr.aria-pressed]="wire.protocol === p"
            [class.!border-accent]="wire.protocol === p"
            (click)="apply({ protocol: p })"
          >
            {{ p }}
          </button>
        }
        <span class="ml-2 text-muted">Format</span>
        @for (b of [true, false]; track b) {
          <button
            type="button"
            class="btn btn-ghost h-7 px-2.5 text-xs"
            [attr.aria-pressed]="wire.useBinaryFormat === b"
            [class.!border-accent]="wire.useBinaryFormat === b"
            (click)="apply({ useBinaryFormat: b })"
          >
            {{ b ? 'binary' : 'json' }}
          </button>
        }
      </div>

      <div class="overflow-auto">
        <table class="w-full text-left font-mono text-xs">
          <thead class="sticky top-0 bg-surface text-muted">
            <tr>
              <th scope="col" class="px-4 py-2 font-medium">czas</th>
              <th scope="col" class="py-2 font-medium">rpc</th>
              <th scope="col" class="py-2 font-medium">status</th>
              <th scope="col" class="py-2 text-right font-medium">ms</th>
              <th scope="col" class="px-4 py-2 text-right font-medium">bajty</th>
            </tr>
          </thead>
          <tbody>
            @for (e of log.entries(); track e.id) {
              <tr class="border-t border-border/60">
                <td class="px-4 py-1.5 text-muted">{{ e.at | date: 'HH:mm:ss' }}</td>
                <td class="py-1.5">
                  {{ e.method }}
                  @if (e.kind !== 'unary') {
                    <span class="text-accent">{{
                      e.kind === 'event' ? '↳ ' + e.detail : '⇶'
                    }}</span>
                  }
                </td>
                <td
                  class="py-1.5"
                  [class.text-success]="e.status === 'OK' || e.status === 'OPEN'"
                  [class.text-danger]="
                    e.status !== 'OK' && e.status !== 'OPEN' && e.status !== 'CLOSED'
                  "
                >
                  {{ e.status }}
                </td>
                <td class="py-1.5 text-right">{{ e.ms ?? '' }}</td>
                <td class="px-4 py-1.5 text-right">{{ e.bytes ?? '' }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="px-4 py-6 text-center font-sans text-muted">
                  Brak wywołań — przejdź do aukcji.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <footer class="border-t border-border px-4 py-2 text-[11px] text-muted">
        API: <span class="font-mono">{{ apiUrl }}</span> · zmiana formatu przeładowuje stronę
      </footer>
    </section>
  `,
})
export class DevPanel {
  protected readonly log = inject(RpcLog);
  protected readonly wire = wireSettings();
  protected readonly apiUrl = environment.apiUrl;
  protected readonly protocols = ['connect', 'grpc-web'] as const;
  readonly closed = output();

  protected apply(change: Partial<typeof this.wire>): void {
    saveWireSettings({ ...this.wire, ...change });
    location.reload();
  }
}
