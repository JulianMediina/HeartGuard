import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '../../core/auth/auth.service';
import { applyServerErrors } from '../../core/services/errors';
import { ToastService } from '../../core/services/toast.service';
import { FieldError } from '../../shared/components/field-error';
import { Icon } from '../../shared/components/icon';
import { PageHeader } from '../../shared/components/page-header';
import { matches, passwordChecks, passwordStrength } from '../../shared/validators';

/** `cambiar_contrasena.html` (médico) y `configuracion_paciente.html` (paciente). */
@Component({
  selector: 'app-cambiar-contrasena',
  imports: [ReactiveFormsModule, FieldError, Icon, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header channel="Configuración · Seguridad" title="Cambiar contraseña" subtitle="Actualiza la contraseña con la que accedes a HeartGuard." />

    <div class="grid gap-5 lg:grid-cols-5">
      <form class="panel stagger-in lg:col-span-3" style="--i: 1" [formGroup]="form" (ngSubmit)="submit()" novalidate aria-labelledby="cp-title">
        <h2 id="cp-title" class="panel-title">Cambiar su contraseña</h2>
        @if (errors().length) {
          <div class="mt-4 rounded-sm border border-alert-border bg-alert-bg px-3 py-2 text-sm text-alert-fg" role="alert">
            @for (e of errors(); track e) {
              <p>{{ e }}</p>
            }
          </div>
        }
        <div class="mt-5 space-y-4">
          <div>
            <label class="label" for="old">Contraseña actual</label>
            <input id="old" type="password" class="field" formControlName="old_password" autocomplete="current-password" placeholder="Ingrese su contraseña actual" [attr.aria-invalid]="bad('old_password')" aria-describedby="old-e" />
            <app-field-error [control]="form.controls.old_password" id="old-e" [tick]="tick()" />
          </div>
          <div>
            <label class="label" for="new">Nueva contraseña</label>
            <input id="new" type="password" class="field" formControlName="new_password" autocomplete="new-password" placeholder="Ingrese la nueva contraseña" [attr.aria-invalid]="bad('new_password')" aria-describedby="new-help new-e" />
            <p id="new-help" class="hint">La contraseña debe tener al menos 8 caracteres, una letra mayúscula, una minúscula y un número.</p>
            <app-field-error [control]="form.controls.new_password" id="new-e" [tick]="tick()" />
          </div>
          <div>
            <label class="label" for="confirm">Confirmar nueva contraseña</label>
            <input id="confirm" type="password" class="field" formControlName="new_password_confirmation" autocomplete="new-password" placeholder="Confirme la nueva contraseña" [attr.aria-invalid]="bad('new_password_confirmation')" aria-describedby="conf-e" />
            <app-field-error [control]="form.controls.new_password_confirmation" id="conf-e" [tick]="tick()" />
          </div>
        </div>
        <button type="submit" class="btn btn-primary mt-6 w-full" [disabled]="busy()">
          <app-icon name="lock" [size]="16" /> {{ busy() ? 'Guardando…' : 'Cambiar contraseña' }}
        </button>
      </form>

      <aside class="panel stagger-in lg:col-span-2" style="--i: 2" aria-label="Requisitos de seguridad">
        <p class="channel-label">Requisitos</p>
        <ul class="mt-3 space-y-2">
          @for (r of checks(); track r.label) {
            <li class="flex items-center gap-3 text-sm" [class]="r.ok ? 'text-fg' : 'text-muted'">
              <span class="led" [style.--led]="r.ok ? 'var(--color-hg-sage)' : 'var(--app-border)'" aria-hidden="true"></span>
              {{ r.label }}<span class="sr-only">{{ r.ok ? ': cumplido' : ': pendiente' }}</span>
            </li>
          }
        </ul>
        <p class="mt-5 text-xs text-muted">Tras el cambio, tu sesión actual sigue activa.</p>
      </aside>
    </div>
  `,
})
export class CambiarContrasena {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly busy = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly tick = signal(0);

  readonly form = new FormGroup(
    {
      old_password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      new_password: new FormControl('', { nonNullable: true, validators: [Validators.required, passwordStrength] }),
      new_password_confirmation: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: matches('new_password', 'new_password_confirmation') },
  );

  private readonly pw = toSignal(this.form.controls.new_password.valueChanges, { initialValue: '' });
  protected readonly checks = () => passwordChecks(this.pw());

  protected bad(name: keyof typeof this.form.controls): boolean {
    this.tick();
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  submit(): void {
    this.form.markAllAsTouched();
    this.tick.update((t) => t + 1);
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.errors.set([]);
    const { old_password, new_password } = this.form.getRawValue();
    this.auth.changePassword(old_password, new_password).subscribe({
      next: () => {
        this.busy.set(false);
        this.form.reset();
        this.toast.success('Contraseña cambiada exitosamente.');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.errors.set(applyServerErrors(this.form, err));
        this.tick.update((t) => t + 1);
      },
    });
  }
}
