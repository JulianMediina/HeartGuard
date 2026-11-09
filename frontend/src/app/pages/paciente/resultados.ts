import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { InformesService } from '../../core/services/api';
import { loadable } from '../../core/services/loadable';
import { EmptyState } from '../../shared/components/empty-state';
import { ErrorBanner } from '../../shared/components/error-banner';
import { Icon } from '../../shared/components/icon';
import { MedicalNotice } from '../../shared/components/medical-notice';
import { PageHeader } from '../../shared/components/page-header';
import { Pagination } from '../../shared/components/pagination';
import { RiskBadge } from '../../shared/components/risk-badge';
import { Skeleton } from '../../shared/components/skeleton';
import { fechaDesdePartes } from '../medico/analisis';

const PAGE = 20;

/** `visualizacion_paciente.html`: historial de resultados cardíacos con filtro por fecha (día/mes/año). */
@Component({
  selector: 'app-resultados',
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule, RouterLink, PageHeader, Pagination, RiskBadge, MedicalNotice, ErrorBanner, Skeleton, EmptyState, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header channel="Resultados" title="Visualización de resultados cardíacos" subtitle="Todos tus informes y la estimación de riesgo calculada en cada uno." />
    <app-medical-notice class="stagger-in mb-5" style="--i: 1" />

    <form class="panel stagger-in" style="--i: 2" [formGroup]="filtro" (ngSubmit)="filtrar()" novalidate aria-labelledby="f-t">
      <h2 id="f-t" class="channel-label !text-fg">Filtrar resultados por fecha</h2>
      <div class="mt-3 flex flex-wrap items-end gap-3">
        <div class="w-24"><label class="label" for="dia">Día</label><input id="dia" type="number" class="field vital" formControlName="dia" placeholder="Ej: 15" min="1" max="31" /></div>
        <div class="w-24"><label class="label" for="mes">Mes</label><input id="mes" type="number" class="field vital" formControlName="mes" placeholder="Ej: 6" min="1" max="12" /></div>
        <div class="w-28"><label class="label" for="anio">Año</label><input id="anio" type="number" class="field vital" formControlName="anio" placeholder="Ej: 2025" min="1900" /></div>
        <button type="submit" class="btn btn-primary"><app-icon name="filter" [size]="16" /> Filtrar</button>
        @if (fecha()) {
          <button type="button" class="btn btn-ghost" (click)="limpiar()">Ver todos</button>
        }
      </div>
      @if (filtroError()) {
        <p class="mt-2 text-sm font-semibold text-alert-fg" role="alert">{{ filtroError() }}</p>
      }
    </form>

    <section class="panel stagger-in mt-5" style="--i: 3" aria-labelledby="h-t" [attr.aria-busy]="data.state().status === 'loading'">
      <header class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="h-t" class="panel-title">Historial de resultados cardíacos</h2>
        <span class="channel-label" aria-live="polite">{{ page()?.count ?? 0 }} resultados{{ fecha() ? ' el ' + (fecha() | date: 'dd/MM/yyyy') : '' }}</span>
      </header>
      @if (data.state().status === 'error') {
        <div class="mt-4"><app-error-banner [message]="errorMsg()" (retry)="data.reload()" /></div>
      } @else if (!page()) {
        <app-skeleton class="mt-4" shape="h-72 w-full" />
      } @else if (!page()!.results.length) {
        <app-empty-state title="No se encontraron resultados." />
      } @else {
        <div class="table-wrap mt-3">
          <table class="data-table">
            <caption class="sr-only">Historial de resultados</caption>
            <thead><tr><th scope="col">#</th><th scope="col">Fecha de análisis</th><th scope="col" class="text-right">Probabilidad</th><th scope="col">Resultado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              @for (r of page()!.results; track r.id; let i = $index) {
                <tr class="stagger-in" [style.--i]="i" [class.row-alarm]="r.nivel_riesgo === 'alto'">
                  <td class="vital text-muted">{{ (pageNum() - 1) * 20 + i + 1 }}</td>
                  <td class="font-mono text-xs">{{ r.fecha | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td class="vital text-right">{{ r.probabilidad !== null ? (r.probabilidad * 100 | number: '1.1-1') + ' %' : '—' }}</td>
                  <td>@if (r.nivel_riesgo) { <app-risk-badge [level]="r.nivel_riesgo" /> } @else { Pendiente }</td>
                  <td class="text-right"><a [routerLink]="['/paciente/resultados', r.id]" class="btn btn-ghost btn-sm">Ver detalles</a></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <app-pagination [page]="pageNum()" [count]="page()!.count" [pageSize]="20" (pageChange)="pageNum.set($event)" />
      }
    </section>
  `,
})
export class Resultados {
  private readonly api = inject(InformesService);
  readonly filtro = new FormGroup({
    dia: new FormControl<number | null>(null, [Validators.min(1), Validators.max(31)]),
    mes: new FormControl<number | null>(null, [Validators.min(1), Validators.max(12)]),
    anio: new FormControl<number | null>(null, [Validators.min(1900)]),
  });
  protected readonly fecha = signal('');
  protected readonly filtroError = signal('');
  protected readonly pageNum = signal(1);
  protected readonly data = loadable(
    () => this.api.list({ desde: this.fecha(), hasta: this.fecha(), page: this.pageNum(), page_size: PAGE, ordering: '-fecha' }),
    () => [this.fecha(), this.pageNum()],
  );
  protected readonly page = this.data.data;
  protected readonly errorMsg = computed(() => {
    const s = this.data.state();
    return s.status === 'error' ? s.message : '';
  });

  filtrar(): void {
    const { dia, mes, anio } = this.filtro.getRawValue();
    const f = this.filtro.valid ? fechaDesdePartes(dia, mes, anio) : null;
    if (f === null) {
      this.filtroError.set('Fecha inválida: indica día, mes y año válidos.');
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
