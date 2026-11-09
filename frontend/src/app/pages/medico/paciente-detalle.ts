import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { HistorialEntrada, Informe, Notificacion, Paciente, PacienteUpdate, TIPOS_DOCUMENTO } from '../../core/models/api.models';
import { InformesService, NotificacionesService, PacientesService } from '../../core/services/api';
import { applyServerErrors } from '../../core/services/errors';
import { loadable } from '../../core/services/loadable';
import { ToastService } from '../../core/services/toast.service';
import { EmptyState } from '../../shared/components/empty-state';
import { ErrorBanner } from '../../shared/components/error-banner';
import { EvolutionChart } from '../../shared/components/evolution-chart';
import { FieldError } from '../../shared/components/field-error';
import { Icon } from '../../shared/components/icon';
import { InformesTable } from '../../shared/components/informes-table';
import { Modal } from '../../shared/components/modal';
import { MonitorChannel } from '../../shared/components/monitor-channel';
import { PageHeader } from '../../shared/components/page-header';
import { perfilForm, perfilPayload, ProfileFields } from '../../shared/components/profile-fields';
import { Skeleton } from '../../shared/components/skeleton';
import { notFuture } from '../../shared/validators';

interface Ficha {
  paciente: Paciente;
  informes: Informe[];
  historial: HistorialEntrada[] | null;
  notificaciones: Notificacion[];
}

/** `detalle_paciente.html` ampliado: ficha, evolución del riesgo, informes, historial y alertas. */
@Component({
  selector: 'app-paciente-detalle',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    PageHeader,
    MonitorChannel,
    EvolutionChart,
    InformesTable,
    Modal,
    ProfileFields,
    FieldError,
    ErrorBanner,
    Skeleton,
    EmptyState,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.state().status === 'error') {
      <app-error-banner title="No pudimos cargar la ficha del paciente" [message]="errorMsg()" (retry)="data.reload()" />
      <a routerLink="/medico/pacientes" class="btn btn-ghost mt-4"><app-icon name="arrowLeft" [size]="16" /> Volver</a>
    } @else if (!f()) {
      <app-skeleton shape="h-12 w-80" />
      <div class="mt-6 grid gap-4 md:grid-cols-3">
        <app-skeleton shape="h-48 w-full" /><app-skeleton shape="h-48 w-full" /><app-skeleton shape="h-48 w-full" />
      </div>
    }

    @if (f(); as f) {
      <app-page-header [channel]="'Paciente #' + f.paciente.id + ' · ' + tipoDoc(f.paciente.tipo_documento)" [title]="f.paciente.nombres + ' ' + f.paciente.apellidos" [subtitle]="'Documento ' + f.paciente.numero_documento">
        <a routerLink="/medico/pacientes" class="btn btn-ghost"><app-icon name="arrowLeft" [size]="16" /> Volver</a>
        <button type="button" class="btn btn-ghost" (click)="abrirEdicion(f.paciente)"><app-icon name="edit" [size]="16" /> Actualizar información</button>
        @if (esMedico()) {
          <a routerLink="/medico/notificaciones" [queryParams]="{ cedula: f.paciente.numero_documento }" class="btn btn-ghost"><app-icon name="send" [size]="16" /> Enviar alerta</a>
          <a routerLink="/medico/informes/nuevo" [queryParams]="{ documento: f.paciente.numero_documento }" class="btn btn-primary"><app-icon name="filePlus" [size]="16" /> Nuevo informe</a>
        }
      </app-page-header>

      <div class="grid gap-4 md:grid-cols-3">
        <section class="panel stagger-in md:col-span-2" style="--i: 1" aria-labelledby="datos-t">
          <h2 id="datos-t" class="panel-title">Información personal</h2>
          <dl class="dl-grid mt-4">
            <div><dt>Correo</dt><dd>{{ f.paciente.email || '—' }}</dd></div>
            <div><dt>Teléfono</dt><dd class="vital">{{ f.paciente.telefono || '—' }}</dd></div>
            <div><dt>Fecha de nacimiento</dt><dd>{{ f.paciente.fecha_nacimiento ? (f.paciente.fecha_nacimiento | date: 'dd/MM/yyyy') : '—' }}{{ edad() !== null ? ' · ' + edad() + ' años' : '' }}</dd></div>
            <div><dt>Dirección</dt><dd>{{ f.paciente.direccion || '—' }}</dd></div>
            <div><dt>Departamento</dt><dd>{{ f.paciente.departamento || '—' }}</dd></div>
            <div><dt>Ciudad</dt><dd>{{ f.paciente.ciudad || '—' }}</dd></div>
            <div><dt>Fecha de registro</dt><dd>{{ f.paciente.fecha_registro ? (f.paciente.fecha_registro | date: 'dd/MM/yyyy') : '—' }}</dd></div>
            <div><dt>Informes</dt><dd class="vital">{{ f.informes.length }}</dd></div>
          </dl>
        </section>
        @if (ultimo(); as u) {
          <app-monitor-channel
            class="stagger-in"
            style="--i: 2"
            code="P(ENF)"
            label="Último informe"
            [value]="(u.probabilidad ?? 0) * 100"
            [decimals]="1"
            unit="%"
            [tone]="u.nivel_riesgo ?? 'trace'"
            [alarm]="u.nivel_riesgo === 'alto'"
            [series]="serie()"
            [hint]="(u.fecha | date: 'dd/MM/yyyy') + ' · ' + (u.nivel_riesgo ? 'riesgo ' + u.nivel_riesgo : 'sin predicción')"
          />
        } @else {
          <div class="panel stagger-in" style="--i: 2"><app-empty-state title="Sin informes" text="Registra un informe para obtener la predicción de riesgo." /></div>
        }
      </div>

      <section class="panel stagger-in mt-5" style="--i: 3" aria-labelledby="evo-t">
        <header class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="evo-t" class="panel-title">Evolución del riesgo</h2>
          <span class="channel-label">Probabilidad por informe</span>
        </header>
        <app-evolution-chart class="mt-4" [data]="f.informes" />
      </section>

      <section class="panel stagger-in mt-5" style="--i: 4" aria-labelledby="inf-t">
        <header class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="inf-t" class="panel-title">Informes</h2>
          <span class="channel-label">{{ f.informes.length }} registros</span>
        </header>
        @if (f.informes.length) {
          <app-informes-table class="mt-3" [informes]="f.informes" />
        } @else {
          <p class="mt-3 text-sm text-flare-2">No se encontraron informes médicos para este paciente.</p>
        }
      </section>

      <div class="mt-5 grid gap-5 lg:grid-cols-2">
        <section class="panel stagger-in" style="--i: 5" aria-labelledby="his-t">
          <h2 id="his-t" class="panel-title">Historial clínico</h2>
          @if (f.historial === null) {
            <p class="mt-3 text-sm text-muted">El historial clínico sólo está disponible para médicos.</p>
          } @else {
            @if (esMedico()) {
              <form class="mt-4 grid gap-3 sm:grid-cols-[10rem_1fr]" [formGroup]="hForm" (ngSubmit)="agregarEntrada(f.paciente.id)" novalidate>
                <div>
                  <label class="label" for="h-fecha">Fecha</label>
                  <input id="h-fecha" type="date" class="field" formControlName="fecha" aria-describedby="h-fecha-e" />
                  <app-field-error [control]="hForm.controls.fecha" id="h-fecha-e" [tick]="tick()" />
                </div>
                <div>
                  <label class="label" for="h-obs">Observación</label>
                  <textarea id="h-obs" class="field !min-h-11" rows="2" formControlName="observacion" aria-describedby="h-obs-e"></textarea>
                  <app-field-error [control]="hForm.controls.observacion" id="h-obs-e" [tick]="tick()" />
                </div>
                <button type="submit" class="btn btn-primary btn-sm sm:col-span-2 sm:justify-self-end" [disabled]="savingH()"><app-icon name="plus" [size]="14" /> Añadir al historial</button>
              </form>
            }
            @if (f.historial.length) {
              <ol class="mt-5 space-y-4 border-l border-border-strong/60 pl-4">
                @for (h of f.historial; track h.id) {
                  <li class="relative">
                    <span class="led absolute top-1.5 -left-[21px]" aria-hidden="true"></span>
                    <p class="font-mono text-xs text-muted">{{ h.fecha | date: 'dd/MM/yyyy' }}{{ h.medico ? ' · Dr(a). ' + h.medico.nombres + ' ' + h.medico.apellidos : '' }}</p>
                    <p class="text-sm text-fg">{{ h.observacion }}</p>
                  </li>
                }
              </ol>
            } @else {
              <p class="mt-4 text-sm text-muted">Sin entradas en el historial.</p>
            }
          }
        </section>

        <section class="panel stagger-in" style="--i: 6" aria-labelledby="not-t">
          <h2 id="not-t" class="panel-title">Notificaciones enviadas</h2>
          @if (f.notificaciones.length) {
            <ul class="mt-4 space-y-3">
              @for (n of f.notificaciones; track n.id) {
                <li class="rounded-sm border border-border bg-surface-2/60 p-3">
                  <p class="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-muted">
                    <span>{{ n.fecha_envio | date: 'dd/MM/yyyy HH:mm' }}</span>
                    <span class="chip" [class.!border-hg-alert]="n.tipo === 'automatica'">{{ n.tipo === 'automatica' ? 'Automática' : 'Manual' }}{{ n.leida ? ' · leída' : '' }}</span>
                  </p>
                  <p class="mt-1 text-sm whitespace-pre-line text-fg">{{ n.mensaje }}</p>
                </li>
              }
            </ul>
          } @else {
            <p class="mt-4 text-sm text-muted">No se han enviado notificaciones a este paciente.</p>
          }
        </section>
      </div>

      <app-modal [open]="editing()" title="Actualizar información" (closed)="editing.set(false)">
        <form (ngSubmit)="guardar(f.paciente.id)" novalidate>
          @if (editErrors().length) {
            <p class="mb-3 text-sm text-alert-fg" role="alert">{{ editErrors().join(' ') }}</p>
          }
          <app-profile-fields [form]="editForm" [tick]="tick()" prefix="ep-" />
          <div class="mt-6 flex justify-end gap-3">
            <button type="button" class="btn btn-ghost" (click)="editing.set(false)">Cancelar</button>
            <button type="submit" class="btn btn-primary" [disabled]="savingE()">{{ savingE() ? 'Guardando…' : 'Guardar cambios' }}</button>
          </div>
        </form>
      </app-modal>
    }
  `,
})
export class PacienteDetalle {
  private readonly pacientes = inject(PacientesService);
  private readonly informes = inject(InformesService);
  private readonly notifs = inject(NotificacionesService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  protected readonly esMedico = computed(() => this.auth.role() === 'medico');
  readonly id = input.required<string>();

  protected readonly data = loadable<Ficha>(() => {
    const id = Number(this.id());
    return forkJoin({
      paciente: this.pacientes.get(id),
      informes: this.informes.list({ paciente: id, page_size: 200, ordering: '-fecha' }).pipe(map((p) => p.results)),
      historial: this.pacientes.historial(id).pipe(catchError(() => of(null))),
      notificaciones: this.notifs.list({ paciente: id, page_size: 50 }).pipe(
        map((p) => p.results),
        catchError(() => of([] as Notificacion[])),
      ),
    });
  }, () => this.id());

  protected readonly f = this.data.data;
  protected readonly errorMsg = computed(() => {
    const s = this.data.state();
    return s.status === 'error' ? s.message : '';
  });
  protected readonly ultimo = computed(() => this.f()?.informes[0] ?? null);
  protected readonly serie = computed(() =>
    [...(this.f()?.informes ?? [])].reverse().map((i) => (i.probabilidad ?? 0) * 100),
  );
  protected readonly edad = computed(() => {
    const fn = this.f()?.paciente.fecha_nacimiento;
    if (!fn) return null;
    const d = new Date(fn);
    const now = new Date();
    let e = now.getFullYear() - d.getFullYear();
    if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) e--;
    return e;
  });

  protected readonly tick = signal(0);
  protected readonly editing = signal(false);
  protected readonly savingE = signal(false);
  protected readonly savingH = signal(false);
  protected readonly editErrors = signal<string[]>([]);
  readonly editForm = perfilForm(['email']);
  readonly hForm = new FormGroup({
    fecha: new FormControl(new Date().toISOString().slice(0, 10), { nonNullable: true, validators: [Validators.required, notFuture] }),
    observacion: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(5000)] }),
  });

  protected tipoDoc(t: string): string {
    return TIPOS_DOCUMENTO.find((x) => x.value === t)?.label ?? t;
  }

  protected abrirEdicion(p: Paciente): void {
    this.editForm.reset();
    this.editForm.patchValue(
      Object.fromEntries(Object.keys(this.editForm.controls).map((k) => [k, ((p as unknown as Record<string, string | null>)[k] ?? '') as string])),
    );
    this.editErrors.set([]);
    this.editing.set(true);
  }

  protected guardar(id: number): void {
    this.editForm.markAllAsTouched();
    this.tick.update((t) => t + 1);
    if (this.editForm.invalid) return;
    this.savingE.set(true);
    this.pacientes.update(id, perfilPayload(this.editForm.getRawValue()) as PacienteUpdate).subscribe({
      next: () => {
        this.savingE.set(false);
        this.editing.set(false);
        this.toast.success('Información actualizada correctamente.');
        this.data.reload();
      },
      error: (err: unknown) => {
        this.savingE.set(false);
        this.editErrors.set(applyServerErrors(this.editForm, err));
        this.tick.update((t) => t + 1);
      },
    });
  }

  protected agregarEntrada(id: number): void {
    this.hForm.markAllAsTouched();
    this.tick.update((t) => t + 1);
    if (this.hForm.invalid) return;
    this.savingH.set(true);
    this.pacientes.addHistorial(id, this.hForm.getRawValue()).subscribe({
      next: () => {
        this.savingH.set(false);
        this.hForm.reset({ fecha: new Date().toISOString().slice(0, 10), observacion: '' });
        this.toast.success('Entrada añadida al historial.');
        this.data.reload();
      },
      error: (err: unknown) => {
        this.savingH.set(false);
        const msgs = applyServerErrors(this.hForm, err);
        if (msgs.length) this.toast.error(msgs.join(' '));
        this.tick.update((t) => t + 1);
      },
    });
  }
}
