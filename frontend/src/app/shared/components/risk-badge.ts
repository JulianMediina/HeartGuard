import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { RiskLevel } from '../../core/models/api.models';

const LEVELS: Record<RiskLevel, { label: string; bg: string; fg: string }> = {
  // Fondos de la escala flare; texto elegido para contraste ≥ 5,8:1.
  bajo: { label: 'Riesgo bajo', bg: '#edb081', fg: '#150b18' },
  moderado: { label: 'Riesgo moderado', bg: '#e3685c', fg: '#150b18' },
  alto: { label: 'Riesgo alto', bg: '#8f3371', fg: '#ffffff' },
};

/** Insignia del nivel de riesgo: color + icono + texto (nunca sólo color). */
@Component({
  selector: 'app-risk-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 font-mono text-xs font-bold tracking-widest whitespace-nowrap uppercase"
      [style.background]="cfg().bg"
      [style.color]="cfg().fg"
      [attr.data-level]="level()"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        class="size-4"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        @switch (level()) {
          @case ('bajo') {
            <path d="M20 6 9 17l-5-5" />
          }
          @case ('moderado') {
            <path d="M12 8v5m0 3h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" />
          }
          @default {
            <path
              d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
            />
          }
        }
      </svg>
      {{ cfg().label }}
    </span>
  `,
})
export class RiskBadge {
  readonly level = input.required<RiskLevel>();
  protected readonly cfg = computed(() => LEVELS[this.level()]);
}
