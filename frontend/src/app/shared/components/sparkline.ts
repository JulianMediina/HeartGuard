import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Traza mínima (sin ejes) para los canales del monitor. Se dibuja al aparecer. */
@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'aria-hidden': 'true' },
  template: `
    @if (d()) {
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" class="block h-full w-full overflow-visible">
        <path [attr.d]="area()" [attr.fill]="color()" fill-opacity="0.12" class="animate-fade-up" />
        <path
          [attr.d]="d()"
          fill="none"
          [attr.stroke]="color()"
          stroke-width="1.8"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
          class="spark-in glow"
          [style.--glow]="color()"
        />
        <circle [attr.cx]="last().x" [attr.cy]="last().y" r="2.2" [attr.fill]="color()" class="animate-blink" vector-effect="non-scaling-stroke" />
      </svg>
    }
  `,
  styles: `
    /* Revelado de izquierda a derecha (pathLength no es compatible con non-scaling-stroke). */
    .spark-in {
      animation: spark-in 1.2s cubic-bezier(0.65, 0, 0.35, 1) both;
    }
    @keyframes spark-in {
      from {
        clip-path: inset(0 100% 0 0);
      }
      to {
        clip-path: inset(0 0 0 0);
      }
    }
  `,
})
export class Sparkline {
  readonly values = input.required<number[]>();
  readonly color = input('var(--app-trace)');
  /** Dominio fijo opcional (p. ej. [0, 1] para probabilidades). */
  readonly domain = input<[number, number] | null>(null);

  private readonly pts = computed(() => {
    const v = this.values().filter((x) => Number.isFinite(x));
    if (v.length < 2) return [];
    const [lo, hi] = this.domain() ?? [Math.min(...v), Math.max(...v)];
    const span = hi - lo || 1;
    return v.map((y, i) => ({ x: (i / (v.length - 1)) * 100, y: 28 - ((y - lo) / span) * 26 }));
  });
  protected readonly d = computed(() =>
    this.pts().length ? 'M' + this.pts().map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L') : '',
  );
  protected readonly area = computed(() => (this.d() ? `${this.d()}L100,30L0,30Z` : ''));
  protected readonly last = computed(() => this.pts().at(-1) ?? { x: 0, y: 0 });
}
