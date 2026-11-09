import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { nombreCompleto } from '../../core/models/api.models';
import { DashboardService } from '../../core/services/api';
import { loadable } from '../../core/services/loadable';
import { BarChart, BarDatum } from '../../shared/components/bar-chart';
import { EmptyState } from '../../shared/components/empty-state';
import { ErrorBanner } from '../../shared/components/error-banner';
import { Icon } from '../../shared/components/icon';
import { MonitorChannel } from '../../shared/components/monitor-channel';
import { PageHeader } from '../../shared/components/page-header';
import { RiskBadge } from '../../shared/components/risk-badge';
import { RiskDistribution } from '../../shared/components/risk-distribution';
import { Skeleton } from '../../shared/components/skeleton';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `medico_dashboard.html`: el original era un marco con iframe; aquí es un panel de monitor real. */
@Component({
  selector: 'app-medico-dashboard',
  imports: [DatePipe, DecimalPipe, RouterLink, PageHeader, MonitorChannel, RiskDistribution, BarChart, RiskBadge, ErrorBanner, Skeleton, EmptyState, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header channel="Central de monitorización" [title]="saludo()" subtitle="Resumen de pacientes, informes y alertas del sistema.">
      <a routerLink="/medico/informes/nuevo" class="btn btn-primary"><app-icon name="filePlus" [size]="16" /> Nuevo informe</a>
      <a routerLink="/medico/prediccion" class="btn btn-ghost"><app-icon name="zap" [size]="16" /> Predicción rápida</a>
    </app-page-header>

    @switch (data.state().status) {
      @case ('loading') {
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          @for (i of [1, 2, 3, 4]; track i) {
            <app-skeleton shape="h-40 w-full" />
          }
        </div>
        <app-skeleton class="mt-5" shape="h-72 w-full" />
      }
      @case ('error') {
        <app-error-banner [message]="errorMsg()" (retry)="data.reload()" />
      }
    }

    @if (d(); as d) {
      <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores principales">
        <app-monitor-channel class="stagger-in" style="--i: 0" code="PAC" label="Pacientes" [value]="d.total_pacientes" unit="registrados" [index]="0" />
        <app-monitor-channel class="stagger-in" style="--i: 1" code="INF" label="Informes" [value]="d.total_informes" unit="totales" [series]="serie()" [index]="1" />
        <app-monitor-channel
          class="stagger-in"
          style="--i: 2"
          code="ALR"
          label="Riesgo alto"
          [value]="d.alto_riesgo"
          unit="pacientes"
          tone="alert"
          [alarm]="d.alto_riesgo > 0"
          hint="Según su último informe"
          [index]="2"
        />
        <app-monitor-channel
          class="stagger-in"
          style="--i: 3"
          code="DX"
          label="Sin diagnóstico confirmado"
          [value]="d.pendientes_diagnostico ?? 0"
          unit="informes"
          tone="moderado"
          [hint]="d.mis_informes !== undefined ? 'Mis informes: ' + d.mis_informes : ''"
          [index]="3"
        />
      </section>

      <div class="mt-5 grid gap-5 lg:grid-cols-5">
        <section class="panel stagger-in lg:col-span-3" style="--i: 4" aria-labelledby="mes-t">
          <header class="flex items-baseline justify-between gap-2">
            <h2 id="mes-t" class="panel-title">Informes por mes</h2>
            <span class="channel-label">Últimos 12 meses</span>
          </header>
          @if (meses().length) {
            <app-bar-chart class="mt-5" [data]="meses()" ariaLabel="Informes registrados por mes" />
          } @else {
            <app-empty-state title="Sin informes todavía" />
          }
        </section>
        <section class="panel stagger-in lg:col-span-2" style="--i: 5" aria-labelledby="dist-t">
          <header class="flex items-baseline justify-between gap-2">
            <h2 id="dist-t" class="panel-title">Distribución de riesgo</h2>
            <a routerLink="/medico/analisis" class="link text-xs whitespace-nowrap">Análisis completo →</a>
          </header>
          <p class="mt-1 text-xs text-muted">Pacientes según el nivel de riesgo de su último informe.</p>
          <app-risk-distribution class="mt-4" [data]="d.distribucion_riesgo" />
          @if (d.distribucion_riesgo.sin_prediccion) {
            <p class="mt-3 font-mono text-[11px] text-muted">Sin informe / predicción: {{ d.distribucion_riesgo.sin_prediccion }}</p>
          }
        </section>
      </div>

      <div class="mt-5 grid gap-5 lg:grid-cols-5">
        <section class="panel stagger-in lg:col-span-3" style="--i: 6" aria-labelledby="ult-t">
          <header class="flex items-baseline justify-between gap-2">
            <h2 id="ult-t" class="panel-title">Últimos informes</h2>
            <a routerLink="/medico/informes" class="link text-xs">Ver todos →</a>
          </header>
          @if (d.ultimos_informes.length) {
            <div class="table-wrap mt-3">
              <table class="data-table">
                <caption class="sr-only">Últimos informes registrados</caption>
                <thead>
                  <tr><th scope="col">Paciente</th><th scope="col" class="hidden sm:table-cell">Fecha</th><th scope="col" class="text-right">P(enf.)</th><th scope="col">Riesgo</th></tr>
                </thead>
                <tbody>
                  @for (i of d.ultimos_informes; track i.id) {
                    <tr [class.row-alarm]="i.nivel_riesgo === 'alto'">
                      <td><a [routerLink]="['/medico/informes', i.id]" class="link">{{ nombre(i.paciente) }}</a></td>
                      <td class="hidden font-mono text-xs whitespace-nowrap text-muted sm:table-cell">{{ i.fecha | date: 'dd/MM/yy HH:mm' }}</td>
                      <td class="vital text-right">{{ i.probabilidad !== null ? (i.probabilidad * 100 | number: '1.1-1') + ' %' : '—' }}</td>
                      <td>@if (i.nivel_riesgo) { <app-risk-badge [level]="i.nivel_riesgo" /> } @else { <span class="text-muted">—</span> }</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <app-empty-state title="No hay informes" text="Crea el primero desde «Nuevo informe»." />
          }
        </section>
        <section class="panel stagger-in lg:col-span-2" style="--i: 7" aria-labelledby="not-t">
          <header class="flex items-baseline justify-between gap-2">
            <h2 id="not-t" class="panel-title">Alertas recientes</h2>
            <a routerLink="/medico/notificaciones" class="link text-xs">Notificaciones →</a>
          </header>
          @if (d.notificaciones_recientes.length) {
            <ul class="mt-3 space-y-3">
              @for (n of d.notificaciones_recientes; track n.id) {
                <li class="border-l-2 pl-3" [class]="n.tipo === 'automatica' ? 'border-hg-alert' : 'border-hg-sage'">
                  <p class="flex items-center justify-between gap-2 text-sm font-semibold text-fg">
                    {{ nombre(n.paciente) }}
                    <span class="font-mono text-[10px] font-normal text-muted">{{ n.fecha_envio | date: 'dd/MM HH:mm' }}</span>
                  </p>
                  <p class="line-clamp-2 text-xs text-muted">{{ n.mensaje }}</p>
                </li>
              }
            </ul>
          } @else {
            <app-empty-state title="Sin alertas" />
          }
        </section>
      </div>
    }
  `,
})
export class MedicoDashboard {
  private readonly api = inject(DashboardService);
  private readonly auth = inject(AuthService);
  protected readonly data = loadable(() => this.api.medico());
  protected readonly d = this.data.data;
  protected readonly nombre = nombreCompleto;

  protected readonly saludo = computed(() => {
    const u = this.auth.user();
    const h = new Date().getHours();
    const s = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    return u?.nombres ? `${s}, Dr(a). ${u.nombres}` : 'Panel del médico';
  });

  protected readonly errorMsg = computed(() => {
    const s = this.data.state();
    return s.status === 'error' ? s.message : '';
  });

  protected readonly meses = computed<BarDatum[]>(() =>
    (this.d()?.informes_por_mes ?? []).map((m) => {
      const [y, mm] = m.mes.split('-');
      const name = MESES[Number(mm) - 1] ?? m.mes;
      return { label: `${name} ${y}`, short: `${name} ${y.slice(2)}`, value: m.total };
    }),
  );

  protected readonly serie = computed(() => (this.d()?.informes_por_mes ?? []).map((m) => m.total));
}
