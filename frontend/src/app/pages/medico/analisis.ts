import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { featureLabel } from '../../core/features';
import { GrupoAnalisis } from '../../core/models/api.models';
import { DashboardService, PacientesService } from '../../core/services/api';
import { loadable } from '../../core/services/loadable';
import { BarChart, BarDatum } from '../../shared/components/bar-chart';
import { EmptyState } from '../../shared/components/empty-state';
import { ErrorBanner } from '../../shared/components/error-banner';
import { Icon } from '../../shared/components/icon';
import { MonitorChannel } from '../../shared/components/monitor-channel';
import { PageHeader } from '../../shared/components/page-header';
import { Pagination } from '../../shared/components/pagination';
import { RiskBadge } from '../../shared/components/risk-badge';
import { RiskDistribution } from '../../shared/components/risk-distribution';
import { Skeleton } from '../../shared/components/skeleton';

const FLARE = ['#edb081', '#e98d6b', '#e3685c', '#d14a61', '#b13c6c', '#8f3371', '#6c2b6d'];
const LISTADO_PAGE = 50;

/** Convierte día/mes/año (como el filtro del original) en AAAA-MM-DD, o '' si está incompleto/no es válido. */
export function fechaDesdePartes(dia: number | null, mes: number | null, anio: number | null): string | null {
  if (!dia && !mes && !anio) return '';
  if (!dia || !mes || !anio) return null;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * `visualizacion_analisis.html`: filtro por fecha (día/mes/año) y listado paginado (50 por página)
 * de pacientes, más los agregados de `/analisis` (riesgo, sexo, edad, tipo de dolor, medias por clase).
 */
@Component({
  selector: 'app-analisis',
  imports: [DatePipe, DecimalPipe, FormsModule, ReactiveFormsModule, RouterLink, PageHeader, MonitorChannel, RiskDistribution, BarChart, Pagination, RiskBadge, ErrorBanner, Skeleton, EmptyState, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './analisis.html',
})
export class AnalisisPage {
  private readonly dash = inject(DashboardService);
  private readonly pacientes = inject(PacientesService);

  readonly filtro = new FormGroup({
    dia: new FormControl<number | null>(null, [Validators.min(1), Validators.max(31)]),
    mes: new FormControl<number | null>(null, [Validators.min(1), Validators.max(12)]),
    anio: new FormControl<number | null>(null, [Validators.min(1900), Validators.max(2100)]),
  });
  protected readonly filtroError = signal('');
  /** Fecha de corte aplicada (AAAA-MM-DD) o ''. */
  protected readonly fecha = signal('');
  protected readonly pageNum = signal(1);
  protected readonly pageSize = LISTADO_PAGE;

  protected readonly data = loadable(() => this.dash.analisis({ hasta: this.fecha() }), () => this.fecha());
  protected readonly a = this.data.data;
  protected readonly lista = loadable(
    () =>
      this.pacientes.list({
        registrado_hasta: this.fecha(),
        ordering: '-usuario__date_joined',
        page: this.pageNum(),
        page_size: LISTADO_PAGE,
      }),
    () => [this.fecha(), this.pageNum()],
  );
  protected readonly page = this.lista.data;

  protected readonly errorMsg = computed(() => {
    const s = this.data.state();
    return s.status === 'error' ? s.message : '';
  });
  protected readonly listaError = computed(() => {
    const s = this.lista.state();
    return s.status === 'error' ? s.message : '';
  });

  private bars(gs: GrupoAnalisis[], prob = false): BarDatum[] {
    return gs.map((g, i) => ({
      label: g.etiqueta,
      value: prob ? Math.round((g.probabilidad_media ?? 0) * 100) : g.total,
      color: FLARE[(i * 2) % FLARE.length],
    }));
  }

  protected readonly porEdad = computed(() => this.bars(this.a()?.por_edad ?? []));
  protected readonly porEdadProb = computed(() => this.bars(this.a()?.por_edad ?? [], true));
  protected readonly porCp = computed(() => this.bars(this.a()?.por_cp ?? []));
  protected readonly porSexo = computed(() =>
    (this.a()?.por_sexo ?? []).map((g) => ({
      ...g,
      pctAlto: g.total ? ((g.alto_riesgo ?? 0) / g.total) * 100 : 0,
    })),
  );
  protected readonly medias = computed(() =>
    (this.a()?.medias_por_clase ?? []).map((m) => {
      const max = Math.max(Math.abs(m.sin ?? 0), Math.abs(m.con ?? 0), 1e-9);
      return { ...m, etiqueta: featureLabel(m.variable), wSin: ((m.sin ?? 0) / max) * 100, wCon: ((m.con ?? 0) / max) * 100 };
    }),
  );
  protected readonly totalAlto = computed(() => this.a()?.distribucion_riesgo.alto ?? 0);

  filtrar(): void {
    this.filtro.markAllAsTouched();
    const { dia, mes, anio } = this.filtro.getRawValue();
    const f = this.filtro.valid ? fechaDesdePartes(dia, mes, anio) : null;
    if (f === null) {
      this.filtroError.set('Fecha inválida. Asegúrese de ingresar una fecha válida (día, mes y año).');
      return;
    }
    this.filtroError.set('');
    this.pageNum.set(1);
    this.fecha.set(f);
  }

  limpiar(): void {
    this.filtro.reset();
    this.filtroError.set('');
    this.pageNum.set(1);
    this.fecha.set('');
  }
}
