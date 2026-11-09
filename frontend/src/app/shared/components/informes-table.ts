import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { diagnosticoLabel, featureValue } from '../../core/features';
import { Informe } from '../../core/models/api.models';
import { RiskBadge } from './risk-badge';

/** Tabla completa de informes: las 16 columnas de `historial_medico.html` + la predicción de la IA. */
@Component({
  selector: 'app-informes-table',
  imports: [DatePipe, DecimalPipe, RouterLink, RiskBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="table-wrap">
      <table class="data-table min-w-[72rem] text-xs">
        <caption class="sr-only">{{ caption() }}</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">P(enf.)</th>
            <th scope="col">Riesgo IA</th>
            <th scope="col">Edad</th>
            <th scope="col">Sexo</th>
            <th scope="col">Tipo de dolor</th>
            <th scope="col">Presión arterial</th>
            <th scope="col">Colesterol</th>
            <th scope="col">Azúcar ayunas</th>
            <th scope="col">ECG</th>
            <th scope="col">FC máx</th>
            <th scope="col">Angina</th>
            <th scope="col">Depresión ST</th>
            <th scope="col">Pendiente ST</th>
            <th scope="col">Vasos coloreados</th>
            <th scope="col">Talasemia</th>
            <th scope="col">Diagnóstico</th>
            <th scope="col">Observaciones</th>
          </tr>
        </thead>
        <tbody>
          @for (i of informes(); track i.id; let k = $index) {
            <tr class="stagger-in" [style.--i]="k" [class.row-alarm]="i.nivel_riesgo === 'alto'">
              <td class="whitespace-nowrap">
                <a [routerLink]="[linkBase(), i.id]" class="link">{{ i.fecha | date: 'dd/MM/yyyy HH:mm' }}</a>
              </td>
              <td class="vital">{{ i.probabilidad !== null ? (i.probabilidad * 100 | number: '1.1-1') + ' %' : '—' }}</td>
              <td>@if (i.nivel_riesgo) { <app-risk-badge [level]="i.nivel_riesgo" /> } @else { — }</td>
              <td class="vital">{{ i.age }}</td>
              <td>{{ v('sex', i.sex) }}</td>
              <td>{{ v('cp', i.cp) }}</td>
              <td class="vital">{{ i.trtbps }}</td>
              <td class="vital">{{ i.chol }}</td>
              <td>{{ i.fbs ? 'Sí' : 'No' }}</td>
              <td>{{ v('restecg', i.restecg) }}</td>
              <td class="vital">{{ i.thalachh }}</td>
              <td>{{ i.exng ? 'Sí' : 'No' }}</td>
              <td class="vital">{{ i.oldpeak }}</td>
              <td>{{ v('slp', i.slp) }}</td>
              <td class="vital">{{ i.caa }}</td>
              <td>{{ v('thall', i.thall) }}</td>
              <td class="whitespace-nowrap">{{ dx(i.output) }}</td>
              <td class="max-w-56 truncate" [attr.title]="i.observaciones">{{ i.observaciones || 'Sin observaciones' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class InformesTable {
  readonly informes = input.required<Informe[]>();
  readonly caption = input('Informes del paciente');
  readonly linkBase = input('/medico/informes');
  protected readonly v = featureValue;
  protected readonly dx = diagnosticoLabel;
}
