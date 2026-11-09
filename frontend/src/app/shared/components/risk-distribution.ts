import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { RiskLevel } from '../../core/models/api.models';
import { CountUp } from './count-up';

const META: { key: RiskLevel; label: string }[] = [
  { key: 'bajo', label: 'Bajo' },
  { key: 'moderado', label: 'Moderado' },
  { key: 'alto', label: 'Alto' },
];

/** Distribución por nivel de riesgo: tira apilada + filas con recuento y porcentaje (escala flare). */
@Component({
  selector: 'app-risk-distribution',
  imports: [CountUp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex h-3 overflow-hidden rounded-sm bg-surface-2" aria-hidden="true">
      @for (r of rows(); track r.key; let i = $index) {
        <span class="grow-x h-full" [style.width.%]="r.pct" [style.background]="'var(--risk-' + r.key + ')'" [style.animation-delay.ms]="i * 120"></span>
      }
    </div>
    <dl class="mt-4 space-y-2.5">
      @for (r of rows(); track r.key; let i = $index) {
        <div class="stagger-in flex items-center gap-3" [style.--i]="i">
          <dt class="flex w-24 items-center gap-2 text-sm text-fg">
            <span class="inline-block size-2.5 rounded-sm" [style.background]="'var(--risk-' + r.key + ')'" aria-hidden="true"></span>
            {{ r.label }}
          </dt>
          <dd class="flex flex-1 items-center gap-3">
            <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span class="grow-x block h-full rounded-full" [style.width.%]="r.pct" [style.background]="'var(--risk-' + r.key + ')'"></span>
            </span>
            <span class="vital w-10 text-right text-sm font-semibold text-fg"><app-count-up [value]="r.n" /></span>
            <span class="w-14 text-right font-mono text-xs text-muted"><app-count-up [value]="r.pct" [decimals]="1" suffix="%" /></span>
          </dd>
        </div>
      }
    </dl>
  `,
  styles: `
    .grow-x {
      display: block;
      transform-origin: left;
      animation: grow-x 1s cubic-bezier(0.22, 1, 0.36, 1) both;
      transition: width 0.7s ease;
    }
    @keyframes grow-x {
      from {
        transform: scaleX(0);
      }
    }
  `,
})
export class RiskDistribution {
  readonly data = input.required<Record<RiskLevel, number>>();
  protected readonly rows = computed(() => {
    const d = this.data();
    const total = META.reduce((s, m) => s + (d[m.key] ?? 0), 0) || 1;
    return META.map((m) => ({ ...m, n: d[m.key] ?? 0, pct: ((d[m.key] ?? 0) / total) * 100 }));
  });
}
