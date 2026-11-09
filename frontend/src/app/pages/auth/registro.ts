import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { RegistroPayload, TIPOS_DOCUMENTO, TipoDocumento } from '../../core/models/api.models';
import { applyServerErrors } from '../../core/services/errors';
import { ToastService } from '../../core/services/toast.service';
import { FieldError } from '../../shared/components/field-error';
import { Icon } from '../../shared/components/icon';
import { matches, notFuture, passwordChecks, passwordStrength } from '../../shared/validators';
import { AuthFrame } from './auth-frame';

const c = (v = '', ...validators: ValidatorFn[]) => new FormControl(v, { nonNullable: true, validators });

/** `registrar_usuario.html`: alta de paciente (cuenta + datos personales). */
@Component({
  selector: 'app-registro',
  imports: [ReactiveFormsModule, RouterLink, AuthFrame, FieldError, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-frame [wide]="true">
      <section class="panel !p-6 sm:!p-8" aria-labelledby="reg-title">
        <p class="channel-label">Alta de paciente</p>
        <h1 id="reg-title" class="mt-1 text-3xl font-bold tracking-wide text-fg">Registrar usuario</h1>
        <p class="mt-1 text-sm text-muted">Tu correo electrónico será tu usuario para iniciar sesión.</p>

        @if (errors().length) {
          <div class="mt-4 rounded-sm border border-alert-border bg-alert-bg px-3 py-2 text-sm text-alert-fg" role="alert">
            @for (e of errors(); track e) {
              <p>{{ e }}</p>
            }
          </div>
        }

        <form class="mt-6" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <fieldset class="grid gap-4 sm:grid-cols-2">
            <legend class="channel-label mb-3 !text-fg">Cuenta</legend>
            <div class="sm:col-span-2">
              <label class="label" for="email">Correo electrónico *</label>
              <input id="email" type="email" class="field" formControlName="email" autocomplete="email" [attr.aria-invalid]="bad('email')" aria-describedby="email-e" />
              <app-field-error [control]="form.controls.email" id="email-e" [tick]="tick()" />
            </div>
            <div>
              <label class="label" for="password">Contraseña *</label>
              <input id="password" type="password" class="field" formControlName="password" autocomplete="new-password" [attr.aria-invalid]="bad('password')" aria-describedby="pw-help pw-e" />
              <app-field-error [control]="form.controls.password" id="pw-e" [tick]="tick()" />
            </div>
            <div>
              <label class="label" for="password_confirmation">Confirmar contraseña *</label>
              <input id="password_confirmation" type="password" class="field" formControlName="password_confirmation" autocomplete="new-password" [attr.aria-invalid]="bad('password_confirmation')" aria-describedby="pc-e" />
              <app-field-error [control]="form.controls.password_confirmation" id="pc-e" [tick]="tick()" />
            </div>
            <ul id="pw-help" class="flex flex-wrap gap-2 sm:col-span-2" aria-label="Requisitos de la contraseña">
              @for (r of checks(); track r.label) {
                <li class="chip" [class.!border-hg-sage]="r.ok" [class.!text-fg]="r.ok">
                  <app-icon [name]="r.ok ? 'check' : 'x'" [size]="12" /> {{ r.label }}
                </li>
              }
            </ul>
          </fieldset>

          <fieldset class="mt-8 grid gap-4 sm:grid-cols-2">
            <legend class="channel-label mb-3 !text-fg">Datos de paciente</legend>
            <div>
              <label class="label" for="nombres">Nombres del paciente *</label>
              <input id="nombres" class="field" formControlName="nombres" autocomplete="given-name" [attr.aria-invalid]="bad('nombres')" aria-describedby="n-e" />
              <app-field-error [control]="form.controls.nombres" id="n-e" [tick]="tick()" />
            </div>
            <div>
              <label class="label" for="apellidos">Apellidos del paciente *</label>
              <input id="apellidos" class="field" formControlName="apellidos" autocomplete="family-name" [attr.aria-invalid]="bad('apellidos')" aria-describedby="a-e" />
              <app-field-error [control]="form.controls.apellidos" id="a-e" [tick]="tick()" />
            </div>
            <div>
              <label class="label" for="tipo_documento">Tipo de documento *</label>
              <select id="tipo_documento" class="field" formControlName="tipo_documento">
                @for (t of tipos; track t.value) {
                  <option [value]="t.value">{{ t.label }}</option>
                }
              </select>
            </div>
            <div>
              <label class="label" for="numero_documento">Número de documento *</label>
              <input id="numero_documento" class="field vital" formControlName="numero_documento" inputmode="numeric" [attr.aria-invalid]="bad('numero_documento')" aria-describedby="d-e" />
              <app-field-error [control]="form.controls.numero_documento" id="d-e" [tick]="tick()" />
            </div>
            <div>
              <label class="label" for="direccion">Dirección</label>
              <input id="direccion" class="field" formControlName="direccion" autocomplete="street-address" />
            </div>
            <div>
              <label class="label" for="telefono">Teléfono</label>
              <input id="telefono" type="tel" class="field" formControlName="telefono" autocomplete="tel" [attr.aria-invalid]="bad('telefono')" aria-describedby="t-e" />
              <app-field-error [control]="form.controls.telefono" id="t-e" [tick]="tick()" />
            </div>
            <div>
              <label class="label" for="fecha_nacimiento">Fecha de nacimiento</label>
              <input id="fecha_nacimiento" type="date" class="field" formControlName="fecha_nacimiento" [attr.aria-invalid]="bad('fecha_nacimiento')" aria-describedby="f-e" />
              <app-field-error [control]="form.controls.fecha_nacimiento" id="f-e" [tick]="tick()" />
            </div>
            <div>
              <label class="label" for="departamento">Departamento</label>
              <input id="departamento" class="field" formControlName="departamento" list="departamentos" />
            </div>
            <div>
              <label class="label" for="ciudad">Ciudad</label>
              <input id="ciudad" class="field" formControlName="ciudad" list="ciudades" />
            </div>
          </fieldset>
          <datalist id="departamentos"><option value="Cundinamarca"></option><option value="Antioquia"></option><option value="Valle del Cauca"></option><option value="Boyacá"></option></datalist>
          <datalist id="ciudades"><option value="Bogotá"></option><option value="Medellín"></option><option value="Cali"></option><option value="Tunja"></option></datalist>

          <div class="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
            <a routerLink="/login" class="btn btn-ghost">Cancelar</a>
            <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Registrando…' : 'Registrar' }}</button>
          </div>
        </form>
        <p class="mt-6 text-center text-sm text-muted">¿Ya tienes una cuenta? <a routerLink="/login" class="link">Inicia sesión aquí</a></p>
      </section>
    </app-auth-frame>
  `,
})
export class Registro {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly tipos = TIPOS_DOCUMENTO;
  protected readonly busy = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly tick = signal(0);

  readonly form = new FormGroup(
    {
      email: c('', Validators.required, Validators.email),
      password: c('', Validators.required, passwordStrength),
      password_confirmation: c('', Validators.required),
      nombres: c('', Validators.required, Validators.maxLength(255)),
      apellidos: c('', Validators.required, Validators.maxLength(255)),
      tipo_documento: new FormControl<TipoDocumento>('CC', { nonNullable: true }),
      numero_documento: c('', Validators.required, Validators.maxLength(20)),
      direccion: c(''),
      telefono: c('', Validators.maxLength(20), Validators.pattern(/^[0-9+\s()-]*$/)),
      fecha_nacimiento: c('', notFuture),
      departamento: c('', Validators.maxLength(255)),
      ciudad: c('', Validators.maxLength(255)),
    },
    { validators: matches('password', 'password_confirmation') },
  );

  private readonly pw = toSignal(this.form.controls.password.valueChanges, { initialValue: '' });
  protected readonly checks = () => passwordChecks(this.pw());

  protected bad(name: keyof typeof this.form.controls): boolean {
    this.tick();
    const ctl = this.form.controls[name];
    return ctl.invalid && ctl.touched;
  }

  submit(): void {
    this.form.markAllAsTouched();
    this.tick.update((t) => t + 1);
    if (this.form.invalid || this.busy()) {
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    this.busy.set(true);
    this.errors.set([]);
    const v = this.form.getRawValue();
    const payload: RegistroPayload = { ...v, email: v.email.trim(), fecha_nacimiento: v.fecha_nacimiento || null };
    this.auth.register(payload).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success('El usuario ha sido registrado exitosamente. Ya puedes iniciar sesión.');
        void this.router.navigate(['/login']);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.errors.set(applyServerErrors(this.form, err));
        this.tick.update((t) => t + 1);
      },
    });
  }
}
