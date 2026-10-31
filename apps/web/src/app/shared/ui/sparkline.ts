import { Component, computed, input } from '@angular/core';

const W = 240;
const H = 56;
const PAD = 4;

/** Tiny price-over-time chart drawn from the bid history. */
@Component({
  selector: 'gv-sparkline',
  template: `
    @if (geometry(); as g) {
      <svg
        [attr.viewBox]="'0 0 ' + W + ' ' + H"
        class="h-14 w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        [attr.aria-label]="label()"
      >
        <defs>
          <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.35" />
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path [attr.d]="g.area" fill="url(#spark-fill)" />
        <path
          [attr.d]="g.line"
          fill="none"
          stroke="var(--accent)"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
        <circle [attr.cx]="g.last[0]" [attr.cy]="g.last[1]" r="3.5" fill="var(--accent)" />
      </svg>
    } @else {
      <p class="text-sm text-muted">Wykres pojawi się po pierwszej ofercie.</p>
    }
  `,
  host: { class: 'block' },
})
export class Sparkline {
  readonly points = input.required<bigint[]>();
  readonly label = input('Przebieg ceny');
  protected readonly W = W;
  protected readonly H = H;

  protected readonly geometry = computed(() => {
    const values = this.points().map(Number);
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const xy = values.map((v, i): [number, number] => [
      PAD + (i / (values.length - 1)) * (W - PAD * 2),
      H - PAD - ((v - min) / span) * (H - PAD * 2),
    ]);
    const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const last = xy[xy.length - 1]!;
    const area = `${line} L${last[0].toFixed(1)},${H} L${PAD},${H} Z`;
    return { line, area, last };
  });
}
