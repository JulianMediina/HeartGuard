import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { Notificacion } from '../../core/models/api.models';
import { NotificacionesService } from '../../core/services/api';
import { describeApiError } from '../../core/services/errors';
import { loadable } from '../../core/services/loadable';
import { ToastService } from '../../core/services/toast.service';
import { EmptyState } from '../../shared/components/empty-state';
import { ErrorBanner } from '../../shared/components/error-banner';
import { Icon } from '../../shared/components/icon';
import { PageHeader } from '../../shared/components/page-header';
import { Pagination } from '../../shared/components/pagination';
import { Skeleton } from '../../shared/components/skeleton';

/** Notificaciones del paciente (alertas que le envía su médico o el sistema). */
@Component({
  selector: 'app-notificaciones-paciente',
  imports: [DatePipe, PageHeader, Pagination, ErrorBanner, Skeleton, EmptyState, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header channel="Avisos" title="Mis notificaciones" subtitle="Alertas y mensajes de tu médico. También las recibes por correo.">
      <button type="button" class="btn btn-ghost" (click)="todasLeidas()" [disabled]="!noLeidas()"><app-icon name="check" [size]="16" /> Marcar todas como leídas</button>
    </app-page-header>
    <section class="panel stagger-in" style="--i: 1" aria-labelledby="t" [attr.aria-busy]="data.state().status === 'loading'">
      <h2 id="t" class="sr-only">Listado de notificaciones</h2>
      @if (data.state().status === 'error') {
        <app-error-banner [message]="errorMsg()" (retry)="data.reload()" />
      } @else if (!page()) {
        <app-skeleton shape="h-72 w-full" />
      } @else if (!page()!.results.length) {
        <app-empty-state title="No tienes notificaciones" />
      } @else {
        <ul class="space-y-3">
          @for (n of page()!.results; track n.id; let i = $index) {
            <li class="stagger-in rounded-sm border bg-surface-2/50 p-4" [style.--i]="i" [class]="leida(n) ? 'border-border' : 'border-hg-alert'">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="flex items-center gap-2 font-mono text-[11px] text-muted">
                  @if (!leida(n)) {
                    <span class="led animate-blink" style="--led: var(--color-hg-alert)" aria-hidden="true"></span>
                    <span class="font-bold text-alert-fg">NUEVA</span>
                  }
                  {{ n.fecha_envio | date: 'dd/MM/yyyy HH:mm' }} · {{ n.tipo === 'automatica' ? 'Alerta automática' : 'Mensaje del médico' }}
                </p>
                @if (!leida(n)) {
                  <button type="button" class="btn btn-ghost btn-sm" (click)="marcar(n)">Marcar como leída</button>
                }
              </div>
              <p class="mt-2 text-sm whitespace-pre-line text-fg">{{ n.mensaje }}</p>
              @if (n.medico) {
                <p class="mt-1 text-xs text-muted">Dr(a). {{ n.medico.nombres }} {{ n.medico.apellidos }}</p>
              }
            </li>
          }
        </ul>
        <app-pagination [page]="pageNum()" [count]="page()!.count" [pageSize]="20" (pageChange)="pageNum.set($event)" />
      }
    </section>
  `,
})
export class NotificacionesPaciente {
  private readonly api = inject(NotificacionesService);
  private readonly toast = inject(ToastService);
  protected readonly pageNum = signal(1);
  private readonly leidas = signal<Set<number>>(new Set());
  protected readonly data = loadable(() => this.api.list({ page: this.pageNum(), page_size: 20 }), () => this.pageNum());
  protected readonly page = this.data.data;
  protected readonly errorMsg = computed(() => {
    const s = this.data.state();
    return s.status === 'error' ? s.message : '';
  });
  protected readonly noLeidas = computed(() => (this.page()?.results ?? []).some((n) => !this.leida(n)));

  protected leida(n: Notificacion): boolean {
    return !!n.leida || this.leidas().has(n.id);
  }

  protected marcar(n: Notificacion): void {
    this.leidas.update((s) => new Set(s).add(n.id));
    this.api.marcarLeida(n.id).subscribe({
      error: (err: unknown) => {
        this.leidas.update((s) => {
          const c = new Set(s);
          c.delete(n.id);
          return c;
        });
        this.toast.error(describeApiError(err));
      },
    });
  }

  protected todasLeidas(): void {
    this.api.marcarTodasLeidas().subscribe({
      next: () => {
        this.toast.success('Notificaciones marcadas como leídas.');
        this.data.reload();
      },
      error: (err: unknown) => this.toast.error(describeApiError(err)),
    });
  }
}
