import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { diagnosticoLabel } from '../../core/features';
import { RiskLevel } from '../../core/models/api.models';
import { InformesService } from '../../core/services/api';
import { loadable } from '../../core/services/loadable';
import { EmptyState } from '../../shared/components/empty-state';
import { ErrorBanner } from '../../shared/components/error-banner';
import { Icon } from '../../shared/components/icon';
import { PageHeader } from '../../shared/components/page-header';
import { Pagination } from '../../shared/components/pagination';
import { RiskBadge } from '../../shared/components/risk-badge';
import { Skeleton } from '../../shared/components/skeleton';
import { PAGE_SIZE } from './pacientes';

/** Listado de informes con filtros por riesgo, rango de fechas, paciente y diagnóstico pendiente. */
@Component({
  selector: 'app-informes',
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink, PageHeader, Pagination, RiskBadge, ErrorBanner, Skeleton, EmptyState, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header channel="Informes" title="Informes cardiológicos" subtitle="Cada informe guarda las 13 variables clínicas y la predicción automática de la red neuronal.">
      <a routerLink="/medico/informes/nuevo" class="btn btn-primary"><app-icon name="filePlus" [size]="16" /> Nuevo informe</a>
    </app-page-header>

    <section class="panel stagger-in" style="--i: 1" aria-label="Filtros">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div class="lg:col-span-2">
          <label class="label" for="q">Paciente</label>
          <input id="q" type="search" class="field" placeholder="Nombre o documento" [ngModel]="search()" (ngModelChange)="onSearch($event)" />
        </div>
        <div>
          <label class="label" for="r">Riesgo</label>
          <select id="r" class="field" [ngModel]="riesgo()" (ngModelChange)="upd(riesgo, $event)">
            <option value="">Todos</option><option value="bajo">Bajo</option><option value="moderado">Moderado</option><option value="alto">Alto</option>
          </select>
        </div>
        <div>
          <label class="label" for="desde">Desde</label>
          <input id="desde" type="date" class="field" [ngModel]="desde()" (ngModelChange)="upd(desde, $event)" [max]="hasta() || null" />
        </div>
        <div>
          <label class="label" for="hasta">Hasta</label>
          <input id="hasta" type="date" class="field" [ngModel]="hasta()" (ngModelChange)="upd(hasta, $event)" [min]="desde() || null" />
        </div>
      </div>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label class="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" class="size-4 accent-[var(--color-hg-sage)]" [ngModel]="pendientes()" (ngModelChange)="upd(pendientes, $event)" />
          Sólo sin diagnóstico confirmado
        </label>
        <button type="button" class="btn btn-ghost btn-sm" (click)="limpiar()">Limpiar filtros</button>
      </div>
    </section>

    <section class="panel stagger-in mt-5" style="--i: 2" aria-labelledby="t" [attr.aria-busy]="data.state().status === 'loading'">
      <header class="flex items-baseline justify-between gap-2">
        <h2 id="t" class="panel-title">Resultados</h2>
        <span class="channel-label" aria-live="polite">{{ page()?.count ?? 0 }} informes</span>
      </header>
      @if (data.state().status === 'error') {
        <div class="mt-4"><app-error-banner [message]="errorMsg()" (retry)="data.reload()" /></div>
      } @else if (!page()) {
        <app-skeleton class="mt-4" shape="h-96 w-full" />
      } @else if (!page()!.results.length) {
        <app-empty-state title="No hay informes con esos filtros" />
      } @else {
        <div class="table-wrap mt-3" [class.opacity-60]="data.state().status === 'loading'">
          <table class="data-table">
            <caption class="sr-only">Informes</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Paciente</th>
                <th scope="col" class="hidden md:table-cell">Documento</th>
                <th scope="col" class="text-right">P(enf.)</th>
                <th scope="col">Riesgo</th>
                <th scope="col" class="hidden lg:table-cell">Diagnóstico</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (i of page()!.results; track i.id; let k = $index) {
                <tr class="stagger-in" [style.--i]="k" [class.row-alarm]="i.nivel_riesgo === 'alto'">
                  <td class="font-mono text-xs whitespace-nowrap">{{ i.fecha | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td><a [routerLink]="['/medico/pacientes', i.paciente.id]" class="link">{{ i.paciente.nombres }} {{ i.paciente.apellidos }}</a></td>
                  <td class="vital hidden text-xs md:table-cell">{{ i.paciente.numero_documento }}</td>
                  <td class="vital text-right">{{ i.probabilidad !== null ? (i.probabilidad * 100 | number: '1.1-1') + ' %' : '—' }}</td>
                  <td>@if (i.nivel_riesgo) { <app-risk-badge [level]="i.nivel_riesgo" /> } @else { — }</td>
                  <td class="hidden text-muted lg:table-cell">{{ dx(i.output) }}</td>
                  <td class="text-right"><a [routerLink]="['/medico/informes', i.id]" class="btn btn-ghost btn-sm">Ver detalles</a></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <app-pagination [page]="pageNum()" [count]="page()!.count" [pageSize]="pageSize" (pageChange)="pageNum.set($event)" />
      }
    </section>
  `,
})
export class Informes {
  private readonly api = inject(InformesService);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly dx = diagnosticoLabel;
  protected readonly search = signal('');
  private readonly debounced = signal('');
  protected readonly riesgo = signal<RiskLevel | ''>('');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly pendientes = signal(false);
  protected readonly pageNum = signal(1);
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly data = loadable(
    () =>
      this.api.list({
        search: this.debounced(),
        riesgo: this.riesgo(),
        desde: this.desde(),
        hasta: this.hasta(),
        sin_diagnostico: this.pendientes() ? true : null,
        page: this.pageNum(),
        page_size: PAGE_SIZE,
      }),
    () => [this.debounced(), this.riesgo(), this.desde(), this.hasta(), this.pendientes(), this.pageNum()],
  );
  protected readonly page = this.data.data;
  protected readonly errorMsg = computed(() => {
    const s = this.data.state();
    return s.status === 'error' ? s.message : '';
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected onSearch(v: string): void {
    this.search.set(v);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.upd(this.debounced, v.trim()), 300);
  }

  protected upd<T>(sig: { set: (v: T) => void }, v: T): void {
    sig.set(v);
    this.pageNum.set(1);
  }

  protected limpiar(): void {
    this.search.set('');
    this.debounced.set('');
    this.riesgo.set('');
    this.desde.set('');
    this.hasta.set('');
    this.pendientes.set(false);
    this.pageNum.set(1);
  }
}
