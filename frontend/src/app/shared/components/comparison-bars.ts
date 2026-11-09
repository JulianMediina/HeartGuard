import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { CountUp } from './count-up';

export interface ComparisonRow {
  label: string;
  a: number;
  b: number;
}

/**
 * Barras horizontales agrupadas (0-1) para comparar dos modelos. Las cifras usan
 * <app-count-up> y el ancho tiene transición, así que ambos se actualizan si cambian las filas.
 */
@Component({
  selector: 'app-comparison-bars',
  imports: [CountUp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
      <li class="flex items-center gap-2">
        <span class="inline-block h-2.5 w-4 rounded-sm bg-series-1"></span>{{ labelA() }}
      </li>
      <li class="flex items-center gap-2">
        <span class="hatch inline-block h-2.5 w-4 rounded-sm bg-series-2"></span>{{ labelB() }}
      </li>
    </ul>
    <dl class="space-y-3.5">
      @for (r of rows(); track r.label; let i = $index) {
        <div class="stagger-in" [style.--i]="i">
          <dt class="channel-label mb-1">{{ r.label }}</dt>
          <dd class="space-y-1">
            <div class="flex items-center gap-2">
              <div class="h-2.5 flex-1 overflow-hidden rounded-sm bg-surface-2">
                <div
                  class="animate-grow h-full origin-left rounded-sm bg-series-1 transition-[width] duration-700 ease-out"
                  [style.width.%]="r.a * 100"
                  [style.animation-delay.ms]="i * 80"
                ></div>
              </div>
              <span class="w-16 text-right font-mono text-xs font-semibold text-fg" data-testid="value-a">
                <span class="sr-only">{{ labelA() }}: </span
                ><app-count-up [value]="r.a * 100" [decimals]="1" suffix="%" />
              </span>
            </div>
            <div class="flex items-center gap-2">
              <div class="h-2.5 flex-1 overflow-hidden rounded-sm bg-surface-2">
                <div
                  class="hatch animate-grow h-full origin-left rounded-sm bg-series-2 transition-[width] duration-700 ease-out"
                  [style.width.%]="r.b * 100"
                  [style.animation-delay.ms]="i * 80 + 60"
                ></div>
              </div>
              <span class="w-16 text-right font-mono text-xs text-muted" data-testid="value-b">
                <span class="sr-only">{{ labelB() }}: </span
                ><app-count-up [value]="r.b * 100" [decimals]="1" suffix="%" />
              </span>
            </div>
          </dd>
        </div>
      }
    </dl>
  `,
  styles: `
    .hatch {
      background-image: repeating-linear-gradient(
        135deg,
        transparent 0 3px,
        rgb(0 0 0 / 0.28) 3px 5px
      );
    }
  `,
})
export class ComparisonBars {
  readonly rows = input.required<ComparisonRow[]>();
  readonly labelA = input('Red neuronal');
  readonly labelB = input('Regresión logística');
}
