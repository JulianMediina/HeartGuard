import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { RiskLevel } from '../../core/models/api.models';
import { PacientesService } from '../../core/services/api';
import { loadable } from '../../core/services/loadable';
import { EmptyState } from '../../shared/components/empty-state';
import { ErrorBanner } from '../../shared/components/error-banner';
import { Icon } from '../../shared/components/icon';
import { PageHeader } from '../../shared/components/page-header';
import { Pagination } from '../../shared/components/pagination';
import { RiskBadge } from '../../shared/components/risk-badge';
import { Skeleton } from '../../shared/components/skeleton';

export const PAGE_SIZE = 20;

/** `historial_medico.html`: listado de pacientes con búsqueda, filtro de riesgo y orden. */
@Component({
  selector: 'app-pacientes',
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink, PageHeader, Pagination, RiskBadge, ErrorBanner, Skeleton, EmptyState, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header channel="Historial médico" title="Historial médico de pacientes" subtitle="Busca por nombre o documento, filtra por el riesgo del último informe y abre la ficha completa.">
      <a routerLink="/medico/cedula" class="btn btn-ghost"><app-icon name="id" [size]="16" /> Filtrar por cédula</a>
      <a routerLink="/medico/pacientes/nuevo" class="btn btn-primary"><app-icon name="plus" [size]="16" /> Nuevo paciente</a>
    </app-page-header>

    <section class="panel stagger-in" style="--i: 1" aria-label="Filtros">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="sm:col-span-2">
          <label class="label" for="q">Buscar paciente</label>
          <div class="relative">
            <app-icon name="search" [size]="16" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input id="q" type="search" class="field !pl-9" placeholder="Nombre, apellido o documento" [ngModel]="search()" (ngModelChange)="onSearch($event)" />
          </div>
        </div>
        <div>
          <label class="label" for="riesgo">Riesgo (último informe)</label>
          <select id="riesgo" class="field" [ngModel]="riesgo()" (ngModelChange)="set(riesgo, $event)">
            <option value="">Todos</option>
            <option value="bajo">Bajo</option>
            <option value="moderado">Moderado</option>
            <option value="alto">Alto</option>
          </select>
        </div>
        <div>
          <label class="label" for="orden">Ordenar por</label>
          <select id="orden" class="field" [ngModel]="ordering()" (ngModelChange)="set(ordering, $event)">
            <option value="apellidos">Apellidos (A-Z)</option>
            <option value="nombres">Nombres (A-Z)</option>
            <option value="-ultimo_informe_fecha">Último informe (reciente)</option>
            <option value="-ultima_probabilidad">Probabilidad (mayor)</option>
            <option value="-usuario__date_joined">Fecha de registro (reciente)</option>
          </select>
        </div>
      </div>
    </section>

    <section class="panel stagger-in mt-5" style="--i: 2" aria-labelledby="lista-t" [attr.aria-busy]="data.state().status === 'loading'">
      <header class="flex items-baseline justify-between gap-2">
        <h2 id="lista-t" class="panel-title">Pacientes</h2>
        <span class="channel-label" aria-live="polite">{{ page()?.count ?? 0 }} resultados</span>
      </header>
      @if (data.state().status === 'error') {
        <div class="mt-4"><app-error-banner [message]="errorMsg()" (retry)="data.reload()" /></div>
      } @else if (!page()) {
        <app-skeleton class="mt-4" shape="h-96 w-full" />
      } @else if (!page()!.results.length) {
        <app-empty-state title="No se encontraron pacientes" text="Prueba con otro nombre, documento o nivel de riesgo." />
      } @else {
        <div class="table-wrap mt-3" [class.opacity-60]="data.state().status === 'loading'">
          <table class="data-table">
            <caption class="sr-only">Listado de pacientes</caption>
            <thead>
              <tr>
                <th scope="col">Paciente</th>
                <th scope="col" class="hidden sm:table-cell">Documento</th>
                <th scope="col" class="hidden md:table-cell">Ciudad</th>
                <th scope="col" class="hidden sm:table-cell">Último informe</th>
                <th scope="col" class="text-right">P(enf.)</th>
                <th scope="col">Riesgo</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (p of page()!.results; track p.id; let i = $index) {
                <tr class="stagger-in" [style.--i]="i" [class.row-alarm]="p.ultimo_riesgo === 'alto'">
                  <td>
                    <a [routerLink]="['/medico/pacientes', p.id]" class="link">{{ p.nombres }} {{ p.apellidos }}</a>
                    <span class="block text-xs text-muted">{{ p.email }}</span>
                    <span class="vital block text-xs text-muted sm:hidden">{{ p.tipo_documento }} {{ p.numero_documento }}</span>
                  </td>
                  <td class="vital hidden text-xs sm:table-cell">{{ p.tipo_documento }} {{ p.numero_documento }}</td>
                  <td class="hidden text-muted md:table-cell">{{ p.ciudad || '—' }}</td>
                  <td class="hidden font-mono text-xs text-muted sm:table-cell">{{ p.ultimo_informe_fecha ? (p.ultimo_informe_fecha | date: 'dd/MM/yyyy') : 'Sin informes' }}</td>
                  <td class="vital text-right">{{ p.ultima_probabilidad != null ? (p.ultima_probabilidad * 100 | number: '1.1-1') + ' %' : '—' }}</td>
                  <td>@if (p.ultimo_riesgo) { <app-risk-badge [level]="p.ultimo_riesgo" /> } @else { <span class="text-muted">—</span> }</td>
                  <td class="text-right whitespace-nowrap">
                    <a [routerLink]="['/medico/pacientes', p.id]" class="btn btn-ghost btn-sm" [attr.aria-label]="'Ver ficha de ' + p.nombres + ' ' + p.apellidos">Ver</a>
                  </td>
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
export class Pacientes {
  private readonly api = inject(PacientesService);
  protected readonly pageSize = PAGE_SIZE;

  protected readonly search = signal('');
  private readonly debounced = signal('');
  protected readonly riesgo = signal<RiskLevel | ''>('');
  protected readonly ordering = signal('apellidos');
  protected readonly pageNum = signal(1);
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly data = loadable(
    () =>
      this.api.list({
        search: this.debounced(),
        riesgo: this.riesgo(),
        ordering: this.ordering(),
        page: this.pageNum(),
        page_size: PAGE_SIZE,
      }),
    () => [this.debounced(), this.riesgo(), this.ordering(), this.pageNum()],
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
    this.timer = setTimeout(() => {
      this.pageNum.set(1);
      this.debounced.set(v.trim());
    }, 300);
  }

  protected set<T>(sig: { set: (v: T) => void }, v: T): void {
    sig.set(v);
    this.pageNum.set(1);
  }
}
