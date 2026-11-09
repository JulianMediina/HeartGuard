import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { Paciente, PacienteCreate } from '../../core/models/api.models';
import { Modal } from '../../shared/components/modal';
import { PacientesService } from '../../core/services/api';
import { applyServerErrors } from '../../core/services/errors';
import { ToastService } from '../../core/services/toast.service';
import { Icon } from '../../shared/components/icon';
import { PageHeader } from '../../shared/components/page-header';
import { perfilForm, perfilPayload, ProfileFields } from '../../shared/components/profile-fields';

/** Alta de paciente por el médico; sin contraseña, el backend genera una temporal (se muestra una vez). */
@Component({
  selector: 'app-paciente-nuevo',
  imports: [RouterLink, PageHeader, ProfileFields, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header channel="Historial médico · Alta" title="Nuevo paciente" subtitle="Crea la ficha y la cuenta del paciente. Si no indicas contraseña, el sistema generará una temporal que verás una sola vez.">
      <a routerLink="/medico/pacientes" class="btn btn-ghost"><app-icon name="arrowLeft" [size]="16" /> Volver</a>
    </app-page-header>
    <form class="panel stagger-in max-w-3xl" style="--i: 1" (ngSubmit)="submit()" novalidate>
      @if (errors().length) {
        <div class="mb-4 rounded-sm border border-alert-border bg-alert-bg px-3 py-2 text-sm text-alert-fg" role="alert">
          @for (e of errors(); track e) {
            <p>{{ e }}</p>
          }
        </div>
      }
      <app-profile-fields [form]="form" [tick]="tick()" prefix="np-" />
      <div class="mt-6 flex justify-end gap-3 border-t border-border pt-4">
        <a routerLink="/medico/pacientes" class="btn btn-ghost">Cancelar</a>
        <button type="submit" class="btn btn-primary" [disabled]="busy()"><app-icon name="check" [size]="16" /> {{ busy() ? 'Guardando…' : 'Crear paciente' }}</button>
      </div>
    </form>

    <app-modal [open]="!!creado()" title="Contraseña temporal del paciente" (closed)="continuar()">
      @if (creado(); as p) {
        <p class="text-sm text-fg">Se creó la cuenta de <strong>{{ p.nombres }} {{ p.apellidos }}</strong> (usuario <span class="vital">{{ p.username || p.email }}</span>).</p>
        <p class="mt-4 rounded-sm border border-alert-border bg-alert-bg px-3 py-2 text-sm text-alert-fg" role="alert">
          Esta contraseña temporal <strong>sólo se muestra una vez</strong>. Entrégala al paciente por un canal seguro y pídele que la cambie en «Configuración».
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <code class="vital min-w-0 flex-1 rounded-sm border border-border-strong bg-surface-2 px-3 py-2 text-lg font-bold tracking-wider break-all text-fg" aria-label="Contraseña temporal">{{ p.password_temporal }}</code>
          <button type="button" class="btn btn-ghost" (click)="copiar(p.password_temporal!)"><app-icon [name]="copiado() ? 'check' : 'file'" [size]="16" /> {{ copiado() ? 'Copiada' : 'Copiar' }}</button>
        </div>
        <div class="mt-6 flex justify-end">
          <button type="button" class="btn btn-primary" (click)="continuar()">He guardado la contraseña</button>
        </div>
      }
    </app-modal>
  `,
})
export class PacienteNuevo {
  private readonly api = inject(PacientesService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly form = perfilForm(['email', 'tipo_documento', 'numero_documento', 'password']);
  protected readonly busy = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly tick = signal(0);

  protected readonly creado = signal<Paciente | null>(null);
  protected readonly copiado = signal(false);

  protected copiar(texto: string): void {
    const ok = () => this.copiado.set(true);
    const fail = () => this.toast.error('No se pudo copiar: selecciona el texto y cópialo manualmente.');
    if (navigator.clipboard) navigator.clipboard.writeText(texto).then(ok, fail);
    else fail();
  }

  protected continuar(): void {
    const p = this.creado();
    this.creado.set(null);
    if (p) void this.router.navigate(['/medico/pacientes', p.id]);
  }

  submit(): void {
    this.form.markAllAsTouched();
    this.tick.update((t) => t + 1);
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.errors.set([]);
    const body = perfilPayload(this.form.getRawValue()) as unknown as PacienteCreate;
    if (!body.password) delete body.password;
    this.api.create(body).subscribe({
      next: (p) => {
        this.toast.success(`Paciente ${p.nombres} ${p.apellidos} registrado.`);
        if (p.password_temporal) {
          this.busy.set(false);
          this.creado.set(p);
        } else {
          void this.router.navigate(['/medico/pacientes', p.id]);
        }
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.errors.set(applyServerErrors(this.form, err));
        this.tick.update((t) => t + 1);
      },
    });
  }
}
