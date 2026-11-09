import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { AuthService, homeFor } from '../../core/auth/auth.service';
import { describeApiError } from '../../core/services/errors';
import { ToastService } from '../../core/services/toast.service';
import { DEMO_CREDENTIALS } from '../../mocks/mock-db';
import { FieldError } from '../../shared/components/field-error';
import { Icon } from '../../shared/components/icon';
import { AuthFrame } from './auth-frame';

/** `login.html`: usuario + contraseña; redirige al panel según el rol. */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, AuthFrame, FieldError, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-frame>
      <section class="panel !p-6 sm:!p-8" aria-labelledby="login-title">
        <p class="channel-label">Acceso seguro · JWT</p>
        <h1 id="login-title" class="mt-1 text-3xl font-bold tracking-wide text-fg">Inicio de sesión</h1>
        <p class="mt-1 text-sm text-muted">Médicos y pacientes acceden con su usuario de HeartGuard.</p>

        @if (auth.expiredReason(); as reason) {
          <p class="mt-4 rounded-sm border border-border-strong bg-surface-2 px-3 py-2 text-sm text-fg" role="status">{{ reason }}</p>
        }
        @if (error()) {
          <p class="mt-4 flex items-start gap-2 rounded-sm border border-alert-border bg-alert-bg px-3 py-2 text-sm text-alert-fg" role="alert">
            <app-icon name="alert" [size]="16" class="mt-0.5" /> {{ error() }}
          </p>
        }

        <form class="mt-6 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div>
            <label class="label" for="username">Usuario</label>
            <input id="username" class="field" formControlName="username" autocomplete="username" autofocus
              [attr.aria-invalid]="invalid('username')" aria-describedby="username-err" />
            <app-field-error [control]="form.controls.username" id="username-err" [tick]="tick()" />
          </div>
          <div>
            <label class="label" for="password">Contraseña</label>
            <div class="relative">
              <input id="password" class="field pr-10" [type]="show() ? 'text' : 'password'" formControlName="password"
                autocomplete="current-password" [attr.aria-invalid]="invalid('password')" aria-describedby="password-err" />
              <button type="button" class="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-muted hover:text-fg"
                (click)="show.set(!show())" [attr.aria-pressed]="show()" aria-label="Mostrar contraseña">
                {{ show() ? 'Ocultar' : 'Ver' }}
              </button>
            </div>
            <app-field-error [control]="form.controls.password" id="password-err" [tick]="tick()" />
          </div>
          <button type="submit" class="btn btn-primary w-full" [disabled]="busy()">
            @if (busy()) {
              <span class="animate-blink">Verificando credenciales…</span>
            } @else {
              Ingresar <app-icon name="arrowRight" [size]="16" />
            }
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-muted">
          ¿No tienes una cuenta? <a routerLink="/registro" class="link">Regístrate aquí</a>
        </p>

        @if (mocks) {
          <div class="mt-6 border-t border-border pt-4">
            <p class="channel-label mb-2">Modo demostración (sin backend)</p>
            <div class="flex flex-wrap gap-2">
              @for (d of demos; track d.role) {
                <button type="button" class="btn btn-ghost btn-sm" (click)="fill(d.username, d.password)">{{ d.role }}</button>
              }
            </div>
          </div>
        }
      </section>
    </app-auth-frame>
  `,
})
export class Login {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly returnUrl = input<string>();

  protected readonly mocks = environment.useMocks;
  protected readonly demos = [
    { role: 'Médico', ...DEMO_CREDENTIALS.medico },
    { role: 'Paciente', ...DEMO_CREDENTIALS.paciente },
    { role: 'Administrador', ...DEMO_CREDENTIALS.admin },
  ];
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly show = signal(false);
  protected readonly tick = signal(0);

  protected readonly form = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(255)] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected invalid(name: 'username' | 'password'): boolean {
    this.tick();
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  protected fill(username: string, password: string): void {
    this.form.setValue({ username, password });
  }

  submit(): void {
    this.form.markAllAsTouched();
    this.tick.update((t) => t + 1);
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const { username, password } = this.form.getRawValue();
    this.auth.login(username.trim(), password).subscribe({
      next: (user) => {
        this.busy.set(false);
        if (!user.role) {
          this.error.set('El usuario no está asignado a un rol válido.');
          return;
        }
        this.toast.success(
          user.role === 'medico' ? 'Inicio de sesión exitoso como Médico' : user.role === 'paciente' ? 'Inicio de sesión exitoso como Paciente' : 'Inicio de sesión exitoso como Administrador',
        );
        const target = this.returnUrl();
        const allowed = target && target.startsWith('/' + (user.role === 'admin' ? 'medico' : user.role));
        void this.router.navigateByUrl(allowed ? target : homeFor(user.role));
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(
          err instanceof HttpErrorResponse && (err.status === 401 || (err.status === 400 && !(err.error as { detail?: string })?.detail?.includes('inactiv')))
            ? 'Usuario o contraseña incorrectos.'
            : describeApiError(err),
        );
      },
    });
  }
}
