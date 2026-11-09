import { formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { AuthService } from '../../core/auth/auth.service';
import { Medico, MedicoUpdate } from '../../core/models/api.models';
import { MedicosService } from '../../core/services/api';
import { applyServerErrors } from '../../core/services/errors';
import { loadable } from '../../core/services/loadable';
import { ToastService } from '../../core/services/toast.service';
import { ErrorBanner } from '../../shared/components/error-banner';
import { Modal } from '../../shared/components/modal';
import { PageHeader } from '../../shared/components/page-header';
import { ProfileCard, ProfileItem } from '../../shared/components/profile-card';
import { perfilForm, perfilPayload, ProfileFields } from '../../shared/components/profile-fields';
import { Skeleton } from '../../shared/components/skeleton';

export function fechaCorta(v: string | null | undefined): string {
  return v ? formatDate(v, 'dd/MM/yyyy', 'es') : '';
}

/** Abre el modal de edición con los valores actuales del perfil. */
export function cargarPerfil(form: ReturnType<typeof perfilForm>, src: object): void {
  form.reset();
  const s = src as Record<string, string | null>;
  form.patchValue(Object.fromEntries(Object.keys(form.controls).map((k) => [k, s[k] ?? ''])));
}

/** `perfil_medico.html`: datos del médico y modal «Actualizar información» (`MedicoUpdateForm`). */
@Component({
  selector: 'app-perfil-medico',
  imports: [PageHeader, ProfileCard, ProfileFields, Modal, ErrorBanner, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header channel="Perfil médico" title="Mi perfil" subtitle="Datos personales y de contacto." />
    @switch (data.state().status) {
      @case ('loading') {
        @if (!m()) {
          <app-skeleton shape="h-96 w-full" />
        }
      }
      @case ('error') {
        <app-error-banner [message]="errorMsg()" (retry)="data.reload()" />
      }
    }
    @if (m(); as m) {
      <app-profile-card class="max-w-4xl" [name]="'Dr(a). ' + m.nombres + ' ' + m.apellidos" [role]="m.especialidad || 'Médico General'" [items]="items()" (edit)="abrir(m)" />
      <app-modal [open]="editing()" title="Actualizar información" (closed)="editing.set(false)">
        <form (ngSubmit)="guardar()" novalidate>
          @if (errors().length) {
            <p class="mb-3 text-sm text-alert-fg" role="alert">{{ errors().join(' ') }}</p>
          }
          <app-profile-fields [form]="form" [tick]="tick()" prefix="pm-" />
          <div class="mt-6 flex justify-end gap-3">
            <button type="button" class="btn btn-ghost" (click)="editing.set(false)">Cancelar</button>
            <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar cambios' }}</button>
          </div>
        </form>
      </app-modal>
    }
  `,
})
export class PerfilMedico {
  private readonly api = inject(MedicosService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly data = loadable(() => this.api.me());
  private readonly updated = signal<Medico | null>(null);
  protected readonly m = computed(() => this.updated() ?? this.data.data());
  protected readonly errorMsg = computed(() => {
    const s = this.data.state();
    return s.status === 'error' ? s.message : '';
  });
  protected readonly items = computed<ProfileItem[]>(() => {
    const m = this.m();
    if (!m) return [];
    return [
      { icon: 'user', label: 'Nombres', value: m.nombres },
      { icon: 'user', label: 'Apellidos', value: m.apellidos },
      { icon: 'mail', label: 'Correo', value: m.email },
      { icon: 'phone', label: 'Teléfono', value: m.telefono },
      { icon: 'calendar', label: 'Fecha de nacimiento', value: fechaCorta(m.fecha_nacimiento) },
      { icon: 'pin', label: 'Dirección', value: m.direccion },
      { icon: 'globe', label: 'Departamento', value: m.departamento },
      { icon: 'city', label: 'Ciudad', value: m.ciudad },
    ];
  });

  readonly form = perfilForm();
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly tick = signal(0);

  protected abrir(m: Medico): void {
    cargarPerfil(this.form, m);
    this.errors.set([]);
    this.editing.set(true);
  }

  guardar(): void {
    this.form.markAllAsTouched();
    this.tick.update((t) => t + 1);
    if (this.form.invalid) return;
    this.saving.set(true);
    this.api.updateMe(perfilPayload(this.form.getRawValue()) as MedicoUpdate).subscribe({
      next: (m) => {
        this.saving.set(false);
        this.updated.set(m);
        this.auth.patchUser({ nombres: m.nombres, apellidos: m.apellidos });
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
