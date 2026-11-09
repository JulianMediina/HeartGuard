import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';

import { CountUp } from './count-up';

/**
 * Medidor semicircular 0-100 % con la escala de riesgo flare (bajo < 33 ≤ moderado < 66 ≤ alto).
 * La aguja arranca en 0 y gira hasta la probabilidad; si la probabilidad cambia
 * (otra predicción), aguja, arco y cifra se mueven al nuevo valor.
 */
@Component({
  selector: 'app-risk-gauge',
  imports: [CountUp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <figure class="mx-auto w-full max-w-xs">
      <svg
        viewBox="0 0 200 118"
        class="w-full overflow-visible"
        role="img"
        [attr.aria-label]="'Probabilidad estimada de enfermedad cardíaca: ' + percent() + ' por ciento'"
      >
        <!-- Zonas de la escala -->
        @for (z of zones; track z.cls) {
          <path
            [attr.d]="arc(z.from, z.to)"
            fill="none"
            [attr.stroke]="z.color"
            stroke-width="14"
            stroke-opacity="0.22"
          />
        }
        <!-- Valor -->
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          [attr.stroke]="color()"
          stroke-width="14"
          pathLength="100"
          stroke-dasharray="100"
          [attr.stroke-dashoffset]="armed() ? 100 - percent() : 100"
          class="glow transition-[stroke-dashoffset,stroke] duration-[1300ms] ease-out"
          [style.--glow]="color()"
          data-testid="gauge-arc"
        />
        @for (t of ticks; track t) {
          <line
            x1="100"
            y1="13"
            x2="100"
            y2="22"
            stroke="var(--app-muted)"
            stroke-width="1"
            [attr.transform]="'rotate(' + (t * 1.8 - 90) + ' 100 100)'"
          />
        }
        <g
          class="transition-transform duration-[1300ms] ease-[cubic-bezier(0.34,1.45,0.64,1)]"
          style="transform-origin: 100px 100px"
          [style.transform]="'rotate(' + angle() + 'deg)'"
          data-testid="needle"
        >
          <path d="M98.5 100 L100 28 L101.5 100 Z" fill="var(--app-fg)" class="glow" />
        </g>
        <circle cx="100" cy="100" r="6" fill="var(--app-fg)" />
        <circle cx="100" cy="100" r="2.5" fill="var(--app-surface)" />
        <text x="20" y="116" text-anchor="middle" class="fill-muted font-mono text-[8px]">0</text>
        <text x="100" y="9" text-anchor="middle" class="fill-muted font-mono text-[8px]">50</text>
        <text x="180" y="116" text-anchor="middle" class="fill-muted font-mono text-[8px]">100</text>
      </svg>
      <figcaption class="sr-only">
        <app-count-up [value]="percent()" [decimals]="1" suffix="%" />
      </figcaption>
    </figure>
  `,
})
export class RiskGauge {
  /** Probabilidad 0-1. */
  readonly probability = input.required<number>();
  protected readonly ticks = [0, 10, 20, 30, 33, 40, 50, 60, 66, 70, 80, 90, 100];
  protected readonly zones = [
    { cls: 'bajo', from: 0, to: 33, color: 'var(--risk-bajo)' },
    { cls: 'moderado', from: 33, to: 66, color: 'var(--risk-moderado)' },
    { cls: 'alto', from: 66, to: 100, color: 'var(--risk-alto)' },
  ];
  protected readonly percent = computed(
    () => Math.round(Math.min(1, Math.max(0, this.probability())) * 1000) / 10,
  );
  protected readonly color = computed(() => {
    const p = this.percent();
    return p < 33 ? 'var(--risk-bajo)' : p < 66 ? 'var(--risk-moderado)' : 'var(--risk-alto)';
  });
  /** -90° (0 %) … +90° (100 %). */
  protected readonly angle = computed(() => (this.armed() ? -90 + this.percent() * 1.8 : -90));
  /** Arranca en 0 y tras el primer render se mueve al valor real (anima la aguja). */
  protected readonly armed = signal(false);

  constructor() {
    afterNextRender(() => setTimeout(() => this.armed.set(true), 40));
  }

  protected arc(from: number, to: number): string {
    const pt = (p: number) => {
      const a = Math.PI * (1 - p / 100);
      return `${(100 + 80 * Math.cos(a)).toFixed(2)} ${(100 - 80 * Math.sin(a)).toFixed(2)}`;
    };
    return `M${pt(from)} A80 80 0 0 1 ${pt(to)}`;
  }
}
