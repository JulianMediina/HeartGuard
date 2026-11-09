import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { EcgLine } from '../../layout/ecg-line';
import { CountUp } from './count-up';

/**
 * «Canal» de monitor para una métrica: código + nombre, valor grande con brillo,
 * unidad, traza viva y una mini escala 0-100 con la banda de CV (media ± desv.)
 * y la marca del valor de test.
 */
@Component({
  selector: 'app-kpi-card',
  imports: [CountUp, EcgLine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <article class="panel h-full overflow-hidden" [attr.aria-label]="label() + ': ' + pct() + ' por ciento'">
      <header class="flex items-baseline justify-between gap-2">
        <span class="channel-label !text-fg">{{ code() }}</span>
        <span class="truncate text-xs text-muted">{{ label() }}</span>
      </header>
      <p class="vital mt-2 flex items-baseline gap-1 text-4xl leading-none font-bold text-fg">
        <app-count-up [value]="pct()" [decimals]="1" />
        <span class="text-base font-medium text-muted">%</span>
      </p>
      <app-ecg-line class="mt-2 h-6 opacity-80" [beats]="2" [speed]="2 + index() * 0.37" />
      <!-- Mini escala: banda CV (flare) + marca de test -->
      <div class="relative mt-2 h-2 rounded-sm bg-surface-2" aria-hidden="true">
        @if (cv(); as c) {
          <span
            class="absolute inset-y-0 rounded-sm bg-flare-2/70 transition-all duration-700"
            [style.left.%]="(c.mean - c.std) * 100"
            [style.width.%]="c.std * 200"
          ></span>
        }
        <span
          class="absolute -inset-y-1 w-0.5 rounded bg-fg transition-[left] duration-700"
          [style.left.%]="pct()"
        ></span>
      </div>
      <p class="mt-2 font-mono text-[11px] text-muted">{{ hint() }}</p>
      @if (cv(); as c) {
        <p class="font-mono text-[11px] text-muted">
          CV <span class="text-fg">{{ fmt(c.mean * 100) }} ± {{ fmt(c.std * 100) }}</span>
        </p>
      }
    </article>
  `,
})
export class KpiCard {
  readonly label = input.required<string>();
  readonly code = input('');
  /** Valor 0-1. */
  readonly value = input.required<number>();
  readonly cv = input<{ mean: number; std: number } | null>(null);
  readonly hint = input('Conjunto de test');
  readonly index = input(0);

  protected readonly pct = computed(() => Math.round(this.value() * 1000) / 10);

  protected fmt(v: number): string {
    return v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
}
