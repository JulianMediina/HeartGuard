import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { LineChart, LineSeries } from './line-chart';

/** Evolución de P(enfermedad) en el tiempo, con bandas de riesgo de fondo (escala flare). */
@Component({
  selector: 'app-evolution-chart',
  imports: [LineChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (series().length && points().length > 1) {
      <div class="relative">
        <!-- Bandas de riesgo detrás del gráfico (alineadas con el área de trazado). -->
        <div class="pointer-events-none absolute top-4 right-4 left-[52px]" [style.height.px]="height() - 60" aria-hidden="true">
          <div class="absolute inset-x-0 top-0 h-[34%] bg-[var(--risk-alto)] opacity-[0.07]"></div>
          <div class="absolute inset-x-0 top-[34%] h-[33%] bg-[var(--risk-moderado)] opacity-[0.06]"></div>
          <div class="absolute inset-x-0 bottom-0 h-[33%] bg-[var(--risk-bajo)] opacity-[0.06]"></div>
        </div>
        <app-line-chart
          [series]="series()"
          [yDomain]="[0, 1]"
          [height]="height()"
          xLabel="Fecha del informe"
          yLabel="P(enfermedad)"
          [formatX]="fmtDate"
          [formatY]="fmtPct"
          [hoverTitle]="fmtLong"
          ariaLabel="Evolución de la probabilidad de enfermedad cardíaca en el tiempo. Usa las flechas para recorrer los puntos."
        />
      </div>
      <p class="sr-only">
        @for (p of points(); track p.x) {
          {{ fmtLong(p.x) }}: {{ fmtPct(p.y) }}.
        }
      </p>
    } @else {
      <p class="py-8 text-center text-sm text-muted">Se necesitan al menos dos informes con predicción para ver la evolución.</p>
    }
  `,
})
export class EvolutionChart {
  readonly data = input.required<{ fecha: string; probabilidad: number | null }[]>();
  readonly height = input(260);

  protected readonly points = computed(() =>
    this.data()
      .filter((d) => d.probabilidad !== null && Number.isFinite(d.probabilidad))
      .map((d) => ({ x: new Date(d.fecha).getTime(), y: d.probabilidad as number }))
      .sort((a, b) => a.x - b.x),
  );

  protected readonly series = computed<LineSeries[]>(() => [
    { id: 'p', label: 'P(enfermedad)', points: this.points(), color: 'var(--app-series-1)', area: true },
  ]);

  protected readonly fmtDate = (v: number) => new Date(v).toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
  protected readonly fmtLong = (v: number) => new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  protected readonly fmtPct = (v: number) => `${(v * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
}
