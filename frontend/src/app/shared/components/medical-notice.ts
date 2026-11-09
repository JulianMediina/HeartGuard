import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Icon } from './icon';

export const AVISO_MEDICO = 'Herramienta de apoyo; no sustituye el diagnóstico médico.';

/** Aviso médico visible junto a toda predicción y en las vistas del paciente. */
@Component({
  selector: 'app-medical-notice',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <aside class="flex gap-3 rounded-md border border-border-strong/60 bg-surface-2/70 p-3 text-sm text-fg" aria-label="Aviso médico">
      <app-icon name="info" [size]="18" class="mt-0.5 text-hg-sage" />
      <div>
        <p><strong>{{ title() }}</strong></p>
        @if (detail()) {
          <p class="mt-1 text-xs text-muted">{{ detail() }}</p>
        }
      </div>
    </aside>
  `,
})
export class MedicalNotice {
  readonly title = input(AVISO_MEDICO);
  /** Nota del modelo (`nota_etiqueta` de /ml/modelo) u otro detalle. */
  readonly detail = input<string | null>('');
}
