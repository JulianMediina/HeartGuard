import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { EcgLine } from '../../layout/ecg-line';
import { CountUp } from './count-up';
import { Sparkline } from './sparkline';

/**
 * «Canal» de monitor: etiqueta, valor grande monoespaciado con brillo, unidad
 * y traza (sparkline con datos o ECG decorativo). `alarm` activa el borde parpadeante.
 */
@Component({
  selector: 'app-monitor-channel',
  imports: [CountUp, Sparkline, EcgLine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <article class="panel h-full overflow-hidden" [class.alarm]="alarm()" [style.--glow]="color()" [attr.aria-label]="label() + ': ' + value() + ' ' + unit()">
      <header class="flex items-center justify-between gap-2">
        <span class="channel-label" [style.color]="color()">{{ code() }}</span>
        <span class="truncate text-xs text-muted">{{ label() }}</span>
      </header>
      <p class="vital mt-3 flex flex-wrap items-baseline gap-x-1.5 leading-none font-bold" [class]="size()" [style.color]="color()">
        <app-count-up [value]="value()" [decimals]="decimals()" />
        <span class="text-sm font-medium text-muted">{{ unit() }}</span>
      </p>
      @if (series().length > 1) {
        <app-sparkline class="mt-3 h-9" [values]="series()" [color]="color()" />
      } @else {
        <app-ecg-line class="mt-3 h-9 opacity-80" [beats]="2" [color]="color()" [speed]="2.2 + index() * 0.4" />
      }
      @if (hint()) {
        <p class="mt-2 font-mono text-[11px] text-muted">{{ hint() }}</p>
      }
    </article>
  `,
})
export class MonitorChannel {
  readonly code = input('');
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly unit = input('');
  readonly decimals = input(0);
  readonly series = input<number[]>([]);
  readonly hint = input('');
  readonly tone = input<'trace' | 'alert' | 'bajo' | 'moderado' | 'alto'>('trace');
  readonly alarm = input(false);
  readonly index = input(0);

  /** Cifras largas (p. ej. 10.000) con un tamaño menor para que no desborden el canal. */
  protected readonly size = computed(() => {
    const digits = String(Math.round(Math.abs(this.value()))).length + this.decimals();
    return digits > 5 ? 'text-3xl' : digits > 3 ? 'text-4xl' : 'text-4xl sm:text-5xl';
  });

  protected readonly color = computed(() => {
    switch (this.tone()) {
      case 'alert':
        return 'var(--color-hg-alert)';
      case 'bajo':
      case 'moderado':
      case 'alto':
        return `var(--risk-${this.tone()})`;
      default:
        return 'var(--app-trace)';
    }
  });
}
