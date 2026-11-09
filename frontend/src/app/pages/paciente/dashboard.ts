import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { DashboardService } from '../../core/services/api';
import { loadable } from '../../core/services/loadable';
import { EmptyState } from '../../shared/components/empty-state';
import { ErrorBanner } from '../../shared/components/error-banner';
import { EvolutionChart } from '../../shared/components/evolution-chart';
import { Icon } from '../../shared/components/icon';
import { MedicalNotice } from '../../shared/components/medical-notice';
import { MonitorChannel } from '../../shared/components/monitor-channel';
import { PageHeader } from '../../shared/components/page-header';
import { RiskBadge } from '../../shared/components/risk-badge';
import { RiskGauge } from '../../shared/components/risk-gauge';
import { Skeleton } from '../../shared/components/skeleton';
import { RECOMENDACION } from '../comun/informe-detalle';

/** `paciente_dashboard.html`: panel con el último resultado, evolución y avisos. */
@Component({
  selector: 'app-paciente-dashboard',
  imports: [DatePipe, RouterLink, PageHeader, MonitorChannel, RiskGauge, RiskBadge, EvolutionChart, MedicalNotice, ErrorBanner, Skeleton, EmptyState, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.state().status === 'error') {
      <app-error-banner [message]="errorMsg()" (retry)="data.reload()" />
    } @else if (!d()) {
      <app-skeleton shape="h-10 w-72" />
      <div class="mt-6 grid gap-4 md:grid-cols-3"><app-skeleton shape="h-56 w-full" /><app-skeleton shape="h-56 w-full" /><app-skeleton shape="h-56 w-full" /></div>
    }

    @if (d(); as d) {
      <app-page-header channel="Mi monitor cardíaco" [title]="'Hola, ' + d.paciente.nombres" subtitle="Aquí ves tu último resultado y cómo ha evolucionado tu riesgo cardíaco." />
      <app-medical-notice class="stagger-in mb-5" style="--i: 1" />

      <div class="grid gap-4 md:grid-cols-3">
        @if (d.ultimo_informe; as u) {
          <section class="panel stagger-in md:col-span-2" style="--i: 2" [class.alarm]="u.nivel_riesgo === 'alto'" aria-labelledby="ult-t">
            <header class="flex flex-wrap items-center justify-between gap-2">
              <h2 id="ult-t" class="channel-label !text-fg">Último resultado · {{ u.fecha | date: 'dd/MM/yyyy' }}</h2>
              @if (u.nivel_riesgo) {
                <app-risk-badge [level]="u.nivel_riesgo" />
              }
            </header>
            <div class="mt-3 grid items-center gap-4 sm:grid-cols-2">
              @if (u.probabilidad !== null) {
                <app-risk-gauge [probability]="u.probabilidad" />
              }
              <div>
                @if (u.nivel_riesgo) {
                  <p class="text-fg">{{ recomendacion[u.nivel_riesgo] }}</p>
                }
                @if (u.observaciones) {
                  <p class="mt-3 border-l-2 border-hg-sage pl-3 text-sm text-muted">«{{ u.observaciones }}»</p>
                }
                <a [routerLink]="['/paciente/resultados', u.id]" class="btn btn-ghost mt-4">Ver detalles <app-icon name="arrowRight" [size]="14" /></a>
              </div>
            </div>
          </section>
        } @else {
          <section class="panel stagger-in md:col-span-2" style="--i: 2"><app-empty-state title="Aún no tienes resultados" text="Cuando tu médico registre un informe aparecerá aquí." /></section>
        }
        <div class="grid gap-4">
          <app-monitor-channel class="stagger-in" style="--i: 3" code="INF" label="Mis informes" [value]="d.total_informes ?? d.evolucion.length" unit="registros" [series]="serie()" />
          <app-monitor-channel class="stagger-in" style="--i: 4" code="AVS" label="Avisos sin leer" [value]="d.notificaciones_no_leidas ?? 0" unit="avisos" [tone]="(d.notificaciones_no_leidas ?? 0) > 0 ? 'alert' : 'trace'" [index]="1" />
        </div>
      </div>

      <section class="panel stagger-in mt-5" style="--i: 5" aria-labelledby="evo-t">
        <header class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="evo-t" class="panel-title">Evolución de mi riesgo</h2>
          <a routerLink="/paciente/resultados" class="link text-xs">Historial de resultados →</a>
        </header>
        <app-evolution-chart class="mt-4" [data]="d.evolucion" />
      </section>

      <section class="panel stagger-in mt-5" style="--i: 6" aria-labelledby="not-t">
        <header class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="not-t" class="panel-title">Avisos recientes de tu médico</h2>
          <a routerLink="/paciente/notificaciones" class="link text-xs">Ver todos →</a>
        </header>
        @if (d.notificaciones_recientes.length) {
          <ul class="mt-3 space-y-3">
            @for (n of d.notificaciones_recientes; track n.id) {
              <li class="border-l-2 pl-3" [class]="n.leida ? 'border-border-strong' : 'border-hg-alert'">
                <p class="font-mono text-[11px] text-muted">{{ n.fecha_envio | date: 'dd/MM/yyyy HH:mm' }}{{ n.leida ? '' : ' · nuevo' }}</p>
                <p class="text-sm whitespace-pre-line text-fg">{{ n.mensaje }}</p>
              </li>
            }
          </ul>
        } @else {
          <p class="mt-3 text-sm text-muted">No tienes avisos.</p>
        }
      </section>
    }
  `,
})
export class PacienteDashboard {
  private readonly api = inject(DashboardService);
  protected readonly data = loadable(() => this.api.paciente());
  protected readonly d = this.data.data;
  protected readonly recomendacion = RECOMENDACION;
  protected readonly errorMsg = computed(() => {
    const s = this.data.state();
    return s.status === 'error' ? s.message : '';
  });
  protected readonly serie = computed(() => (this.d()?.evolucion ?? []).map((e) => (e.probabilidad ?? 0) * 100));
}
