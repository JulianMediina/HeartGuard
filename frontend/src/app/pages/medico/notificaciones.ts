import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { AutomaticasResultado, nombreCompleto } from '../../core/models/api.models';
import { NotificacionesService } from '../../core/services/api';
import { applyServerErrors, describeApiError } from '../../core/services/errors';
import { loadable } from '../../core/services/loadable';
import { ToastService } from '../../core/services/toast.service';
import { EmptyState } from '../../shared/components/empty-state';
import { ErrorBanner } from '../../shared/components/error-banner';
import { FieldError } from '../../shared/components/field-error';
import { Icon } from '../../shared/components/icon';
import { Modal } from '../../shared/components/modal';
import { PageHeader } from '../../shared/components/page-header';
import { Pagination } from '../../shared/components/pagination';
import { Skeleton } from '../../shared/components/skeleton';
import { PAGE_SIZE } from './pacientes';

/** `notificaciones.html`: alerta personalizada por cédula, alertas automáticas y registro de envíos. */
@Component({
  selector: 'app-notificaciones-medico',
  imports: [DatePipe, FormsModule, ReactiveFormsModule, RouterLink, PageHeader, Pagination, FieldError, ErrorBanner, Skeleton, EmptyState, Modal, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header channel="Notificaciones" title="Notificaciones médicas" subtitle="Envía alertas por correo a los pacientes y consulta el registro de notificaciones.">
      @if (esMedico()) {
        <a routerLink="/medico/notificaciones/enviar" class="btn btn-ghost"><app-icon name="users" [size]="16" /> Seleccionar paciente</a>
      }
      <button type="button" class="btn btn-danger" (click)="confirmAuto.set(true)" [disabled]="autoBusy()"><app-icon name="alert" [size]="16" /> Alertas automáticas</button>
    </app-page-header>

    <div class="grid items-start gap-5 lg:grid-cols-5">
      @if (esMedico()) {
        <form class="panel stagger-in lg:col-span-2" style="--i: 1" [formGroup]="form" (ngSubmit)="enviar()" novalidate aria-labelledby="alerta-t">
          <h2 id="alerta-t" class="panel-title">Enviar alerta personalizada</h2>
          @if (formErrors().length) {
            <p class="mt-3 rounded-sm border border-alert-border bg-alert-bg px-3 py-2 text-sm text-alert-fg" role="alert">{{ formErrors().join(' ') }}</p>
          }
          <div class="mt-4">
            <label class="label" for="cedula">Buscar paciente por número de identificación (cédula)</label>
            <input id="cedula" class="field vital" formControlName="documento" placeholder="Ingrese el número de cédula" inputmode="numeric" aria-describedby="ced-e" [attr.aria-invalid]="form.controls.documento.invalid && form.controls.documento.touched" />
            <app-field-error [control]="form.controls.documento" id="ced-e" [tick]="tick()" />
          </div>
          <div class="mt-4">
            <label class="label" for="asunto">Asunto (opcional)</label>
            <input id="asunto" class="field" formControlName="asunto" placeholder="Alerta Médica Personalizada" />
          </div>
          <div class="mt-4">
            <label class="label" for="mensaje">Mensaje de alerta</label>
            <textarea id="mensaje" class="field" rows="5" formControlName="mensaje" placeholder="Escriba la alerta personalizada para el paciente…" aria-describedby="msg-e msg-c" [attr.aria-invalid]="form.controls.mensaje.invalid && form.controls.mensaje.touched"></textarea>
            <div class="flex justify-between gap-2">
              <app-field-error [control]="form.controls.mensaje" id="msg-e" [tick]="tick()" />
              <span id="msg-c" class="mt-1 ml-auto font-mono text-[10px] text-muted">{{ form.controls.mensaje.value.length }}/2000</span>
            </div>
          </div>
          <button type="submit" class="btn btn-danger mt-5 w-full" [disabled]="busy()"><app-icon name="send" [size]="16" /> {{ busy() ? 'Enviando…' : 'Enviar notificación' }}</button>
        </form>
      }

      <section class="panel stagger-in" [class]="esMedico() ? 'lg:col-span-3' : 'lg:col-span-5'" style="--i: 2" aria-labelledby="reg-t" [attr.aria-busy]="data.state().status === 'loading'">
        <header class="flex flex-wrap items-center justify-between gap-3">
          <h2 id="reg-t" class="panel-title">Registro de notificaciones</h2>
          <div class="flex flex-wrap gap-2">
            <label class="sr-only" for="tipo">Tipo</label>
            <select id="tipo" class="field !w-auto !py-1.5" [ngModel]="tipo()" (ngModelChange)="tipo.set($event); pageNum.set(1)">
              <option value="">Todas</option><option value="manual">Manuales</option><option value="automatica">Automáticas</option>
            </select>
            @if (esMedico()) {
              <label class="flex items-center gap-2 text-sm text-fg">
                <input type="checkbox" class="size-4 accent-[var(--color-hg-sage)]" [ngModel]="mias()" (ngModelChange)="mias.set($event); pageNum.set(1)" /> Sólo mías
              </label>
            }
          </div>
        </header>
        @if (data.state().status === 'error') {
          <div class="mt-4"><app-error-banner [message]="errorMsg()" (retry)="data.reload()" /></div>
        } @else if (!page()) {
          <app-skeleton class="mt-4" shape="h-72 w-full" />
        } @else if (!page()!.results.length) {
          <app-empty-state title="No hay notificaciones" />
        } @else {
          <ul class="mt-4 space-y-3" [class.opacity-60]="data.state().status === 'loading'">
            @for (n of page()!.results; track n.id; let i = $index) {
              <li class="stagger-in rounded-sm border border-border bg-surface-2/50 p-3" [style.--i]="i" [class.!border-l-hg-alert]="n.tipo === 'automatica'" [class.border-l-2]="true">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <a [routerLink]="['/medico/pacientes', n.paciente.id]" class="link text-sm">{{ nombre(n.paciente) }}</a>
                  <span class="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted">
                    <span class="chip">{{ n.tipo === 'automatica' ? 'Automática' : 'Manual' }}</span>
                    <span class="chip">{{ n.leida ? 'Leída' : 'No leída' }}</span>
                    {{ n.fecha_envio | date: 'dd/MM/yyyy HH:mm' }}
                  </span>
                </div>
                <p class="mt-1.5 text-sm whitespace-pre-line text-fg">{{ n.mensaje }}</p>
                @if (n.medico) {
                  <p class="mt-1 text-xs text-muted">Enviada por Dr(a). {{ n.medico.nombres }} {{ n.medico.apellidos }}</p>
                }
              </li>
            }
          </ul>
          <app-pagination [page]="pageNum()" [count]="page()!.count" [pageSize]="pageSize" (pageChange)="pageNum.set($event)" />
        }
      </section>
    </div>

    <app-modal [open]="confirmAuto()" title="Enviar alertas automáticas" (closed)="confirmAuto.set(false)">
      <p class="text-sm text-fg">Se enviará un correo a todos los pacientes cuyo último informe tiene <strong>riesgo alto</strong>, recomendándoles agendar una consulta. Los pacientes que ya recibieron esta alerta se omiten.</p>
      <div class="mt-6 flex justify-end gap-3">
        <button type="button" class="btn btn-ghost" (click)="confirmAuto.set(false)">Cancelar</button>
        <button type="button" class="btn btn-danger" (click)="automaticas()">Enviar alertas</button>
      </div>
    </app-modal>
  `,
})
export class NotificacionesMedico {
  private readonly api = inject(NotificacionesService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  /** `?cedula=` desde la ficha del paciente. */
  readonly cedula = input<string>('');
  protected readonly esMedico = computed(() => this.auth.role() === 'medico');
  protected readonly nombre = nombreCompleto;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly tipo = signal('');
  protected readonly mias = signal(false);
  protected readonly pageNum = signal(1);
  protected readonly data = loadable(
    () => this.api.list({ tipo: this.tipo(), enviadas: this.mias() ? true : null, page: this.pageNum(), page_size: PAGE_SIZE }),
    () => [this.tipo(), this.mias(), this.pageNum()],
  );
  protected readonly page = this.data.data;
  protected readonly errorMsg = computed(() => {
    const s = this.data.state();
    return s.status === 'error' ? s.message : '';
  });

  protected readonly tick = signal(0);
  protected readonly busy = signal(false);
  protected readonly formErrors = signal<string[]>([]);
  protected readonly confirmAuto = signal(false);
  protected readonly autoBusy = signal(false);

  readonly form = new FormGroup({
    documento: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(20)] }),
    asunto: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(200)] }),
    mensaje: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(2000)] }),
  });

  constructor() {
    effect(() => {
      const c = this.cedula();
      if (c) this.form.controls.documento.setValue(c);
    });
  }

  enviar(): void {
    this.form.markAllAsTouched();
    this.tick.update((t) => t + 1);
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.formErrors.set([]);
    const v = this.form.getRawValue();
    this.api.send({ documento: v.documento.trim(), mensaje: v.mensaje.trim(), asunto: v.asunto.trim() || undefined }).subscribe({
      next: (n) => {
        this.busy.set(false);
        this.form.reset();
        this.toast.success(
          n.email_enviado === false
            ? 'Alerta registrada, pero no se pudo enviar el correo.'
            : `Alerta enviada correctamente a ${nombreCompleto(n.paciente)}.`,
        );
        this.pageNum.set(1);
        this.data.reload();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        // El backend informa «paciente no encontrado» en la clave `paciente`: va al campo de cédula.
        this.formErrors.set(applyServerErrors(this.form, err, { paciente: 'documento', paciente_id: 'documento' }));
        this.tick.update((t) => t + 1);
      },
    });
  }

  automaticas(): void {
    this.confirmAuto.set(false);
    this.autoBusy.set(true);
    this.api.automaticas().subscribe({
      next: (r: AutomaticasResultado) => {
        this.autoBusy.set(false);
        this.toast.success(
          `Alertas automáticas: ${r.enviadas} enviadas` + (r.omitidas ? `, ${r.omitidas} omitidas (ya avisados).` : '.'),
        );
        this.data.reload();
      },
      error: (err: unknown) => {
        this.autoBusy.set(false);
        this.toast.error(describeApiError(err));
      },
    });
  }
}
