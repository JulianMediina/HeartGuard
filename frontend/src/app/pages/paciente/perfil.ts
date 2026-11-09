import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { AuthService } from '../../core/auth/auth.service';
import { Paciente, PacienteUpdate, TIPOS_DOCUMENTO } from '../../core/models/api.models';
import { PacientesService } from '../../core/services/api';
import { applyServerErrors } from '../../core/services/errors';
import { loadable } from '../../core/services/loadable';
import { ToastService } from '../../core/services/toast.service';
import { ErrorBanner } from '../../shared/components/error-banner';
import { Modal } from '../../shared/components/modal';
import { PageHeader } from '../../shared/components/page-header';
import { ProfileCard, ProfileItem } from '../../shared/components/profile-card';
import { perfilForm, perfilPayload, ProfileFields } from '../../shared/components/profile-fields';
import { Skeleton } from '../../shared/components/skeleton';
import { cargarPerfil, fechaCorta } from '../medico/perfil';

/** `perfil_paciente.html`: datos del paciente y modal de actualización (`PacienteUpdateForm`). */
@Component({
  selector: 'app-perfil-paciente',
  imports: [PageHeader, ProfileCard, ProfileFields, Modal, ErrorBanner, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header channel="Perfil" title="Mi perfil" subtitle="Tus datos personales. El tipo y número de documento sólo puede cambiarlos el personal médico." />
    @switch (data.state().status) {
      @case ('loading') {
        @if (!p()) {
          <app-skeleton shape="h-96 w-full" />
        }
      }
      @case ('error') {
        <app-error-banner [message]="errorMsg()" (retry)="data.reload()" />
      }
    }
    @if (p(); as p) {
      <app-profile-card class="max-w-4xl" [name]="p.nombres + ' ' + p.apellidos" role="Paciente" [items]="items()" (edit)="abrir(p)" />
      <app-modal [open]="editing()" title="Actualizar información" (closed)="editing.set(false)">
        <form (ngSubmit)="guardar()" novalidate>
          @if (errors().length) {
            <p class="mb-3 text-sm text-alert-fg" role="alert">{{ errors().join(' ') }}</p>
          }
          <app-profile-fields [form]="form" [tick]="tick()" prefix="pp-" />
          <div class="mt-6 flex justify-end gap-3">
            <button type="button" class="btn btn-ghost" (click)="editing.set(false)">Cancelar</button>
            <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar cambios' }}</button>
          </div>
        </form>
      </app-modal>
    }
  `,
})
export class PerfilPaciente {
  private readonly api = inject(PacientesService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly data = loadable(() => this.api.me());
  private readonly updated = signal<Paciente | null>(null);
  protected readonly p = computed(() => this.updated() ?? this.data.data());
  protected readonly errorMsg = computed(() => {
    const s = this.data.state();
    return s.status === 'error' ? s.message : '';
  });
  protected readonly items = computed<ProfileItem[]>(() => {
    const p = this.p();
    if (!p) return [];
    return [
      { icon: 'user', label: 'Nombre', value: p.nombres },
      { icon: 'user', label: 'Apellido', value: p.apellidos },
      { icon: 'id', label: TIPOS_DOCUMENTO.find((t) => t.value === p.tipo_documento)?.label ?? 'Documento', value: p.numero_documento },
      { icon: 'mail', label: 'Correo', value: p.email },
      { icon: 'phone', label: 'Teléfono', value: p.telefono },
      { icon: 'calendar', label: 'Fecha de nacimiento', value: fechaCorta(p.fecha_nacimiento) },
      { icon: 'pin', label: 'Dirección', value: p.direccion },
      { icon: 'globe', label: 'Departamento', value: p.departamento },
      { icon: 'city', label: 'Ciudad', value: p.ciudad },
    ];
  });

  readonly form = perfilForm();
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly tick = signal(0);

  protected abrir(p: Paciente): void {
    cargarPerfil(this.form, p);
    this.errors.set([]);
    this.editing.set(true);
  }

  guardar(): void {
    this.form.markAllAsTouched();
    this.tick.update((t) => t + 1);
    if (this.form.invalid) return;
    this.saving.set(true);
    this.api.updateMe(perfilPayload(this.form.getRawValue()) as PacienteUpdate).subscribe({
      next: (p) => {
        this.saving.set(false);
        this.updated.set(p);
        this.auth.patchUser({ nombres: p.nombres, apellidos: p.apellidos });
        this.editing.set(false);
        this.toast.success('Información actualizada correctamente.');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.errors.set(applyServerErrors(this.form, err));
        this.tick.update((t) => t + 1);
      },
    });
  }
}
