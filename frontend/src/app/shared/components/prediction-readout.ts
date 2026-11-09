import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { RiskLevel } from '../../core/models/api.models';
import { CountUp } from './count-up';
import { RiskBadge } from './risk-badge';
import { RiskGauge } from './risk-gauge';

export const NOTA_DIAGNOSTICO =
  'La predicción es la probabilidad de enfermedad cardíaca estimada por un modelo educativo; no sustituye el criterio clínico ni un diagnóstico médico.';

/** Lectura del monitor: P(enfermedad) grande, medidor, banda de riesgo y alarma si es alto. */
@Component({
  selector: 'app-prediction-readout',
  imports: [CountUp, RiskGauge, RiskBadge, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <article class="panel result-enter" [class.alarm]="level() === 'alto'" [style.--glow]="color()" aria-labelledby="readout-title">
      <header class="flex items-center justify-between gap-2">
        <h2 id="readout-title" class="channel-label !text-fg">{{ title() }}</h2>
        @if (busy()) {
          <span class="channel-label animate-blink">Recalculando…</span>
        } @else if (level() === 'alto') {
          <span class="animate-blink rounded-sm bg-hg-alert px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-white uppercase">Alarma</span>
        }
      </header>
      <p class="vital mt-2 text-center text-6xl leading-none font-bold" [style.color]="color()" data-testid="readout">
        <app-count-up [value]="probability() * 100" [decimals]="1" /><span class="text-2xl">%</span>
      </p>
      <app-risk-gauge class="mt-2" [probability]="probability()" />
      <div class="mt-2 flex justify-center"><app-risk-badge [level]="level()" /></div>
      <dl class="mt-4 grid grid-cols-3 divide-x divide-border rounded-sm border border-border text-center font-mono">
        <div class="p-2">
          <dt class="text-[10px] tracking-widest text-muted uppercase">Clase</dt>
          <dd class="vital text-2xl font-bold text-fg">{{ prediction() ?? '—' }}</dd>
        </div>
        <div class="p-2">
          <dt class="text-[10px] tracking-widest text-muted uppercase">Umbral</dt>
          <dd class="vital text-sm font-bold text-fg">{{ threshold() !== null ? (threshold() | number: '1.3-3') : '—' }}</dd>
        </div>
        <div class="p-2">
          <dt class="text-[10px] tracking-widest text-muted uppercase">Modelo</dt>
          <dd class="text-sm font-bold break-all text-fg">{{ version() || '—' }}</dd>
        </div>
      </dl>
      <p class="mt-3 text-xs text-muted">
        La <strong class="text-fg">clase</strong> aplica el umbral de decisión del modelo; la
        <strong class="text-fg">banda</strong> resume la probabilidad en tramos fijos (33 % y 66 %).
      </p>
      <p class="mt-3 border-l-2 border-hg-sage bg-surface-2 p-3 text-xs text-muted">
        <strong class="text-fg">No constituye un diagnóstico.</strong> {{ note() }}
      </p>
      <ng-content />
    </article>
  `,
})
export class PredictionReadout {
  readonly probability = input.required<number>();
  readonly level = input.required<RiskLevel>();
  readonly prediction = input<0 | 1 | null>(null);
  readonly threshold = input<number | null>(null);
  readonly version = input<string | null>(null);
  readonly title = input('Lectura · P(enfermedad)');
  readonly busy = input(false);
  readonly note = input(NOTA_DIAGNOSTICO);
  protected readonly color = computed(() => `var(--risk-${this.level()})`);
}
