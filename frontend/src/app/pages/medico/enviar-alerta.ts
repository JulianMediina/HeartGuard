import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Paciente } from '../../core/models/api.models';
import { NotificacionesService, PacientesService } from '../../core/services/api';
import { applyServerErrors } from '../../core/services/errors';
import { ToastService } from '../../core/services/toast.service';
import { FieldError } from '../../shared/components/field-error';
import { Icon } from '../../shared/components/icon';
import { PageHeader } from '../../shared/components/page-header';
import { RiskBadge } from '../../shared/components/risk-badge';

/** `enviar_alerta.html`: seleccionar paciente (búsqueda) y escribir el mensaje de alerta. */
@Component({
  selector: 'app-enviar-alerta',
  imports: [ReactiveFormsModule, RouterLink, PageHeader, FieldError, RiskBadge, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header channel="Notificaciones · Alerta" title="Enviar alerta personalizada" subtitle="Completa los datos para enviar una alerta personalizada.">
      <a routerLink="/medico/notificaciones" class="btn btn-ghost"><app-icon name="arrowLeft" [size]="16" /> Notificaciones</a>
    </app-page-header>

    <form class="panel stagger-in max-w-2xl" style="--i: 1" [formGroup]="form" (ngSubmit)="enviar()" novalidate>
      @if (errors().length) {
        <p class="mb-4 rounded-sm border border-alert-border bg-alert-bg px-3 py-2 text-sm text-alert-fg" role="alert">{{ errors().join(' ') }}</p>
      }
      <div class="relative">
        <label class="label" for="buscar">Seleccionar paciente</label>
        <input
          id="buscar"
          class="field"
          role="combobox"
          autocomplete="off"
          [attr.aria-expanded]="opciones().length > 0"
          aria-controls="opciones"
          aria-autocomplete="list"
          [attr.aria-activedescendant]="activo() >= 0 ? 'op-' + activo() : null"
          placeholder="Escribe nombre, apellido o documento"
          [value]="texto()"
          (input)="onInput($event)"
          (keydown)="onKey($event)"
          aria-describedby="pac-e"
        />
        @if (opciones().length) {
          <ul id="opciones" role="listbox" class="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-border-strong bg-surface shadow-xl">
            @for (p of opciones(); track p.id; let i = $index) {
              <li
                [id]="'op-' + i"
                role="option"
                [attr.aria-selected]="i === activo()"
                class="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-surface-2"
                [class.bg-surface-2]="i === activo()"
                (mousedown)="elegir(p)"
              >
                <span><span class="font-semibold text-fg">{{ p.nombres }} {{ p.apellidos }}</span> <span class="vital text-xs text-muted">{{ p.numero_documento }}</span></span>
                @if (p.ultimo_riesgo) {
                  <app-risk-badge [level]="p.ultimo_riesgo" />
                }
              </li>
            }
          </ul>
        }
        <app-field-error [control]="form.controls.paciente_id" id="pac-e" [tick]="tick()" />
      </div>
      @if (elegido(); as p) {
        <p class="mt-2 flex items-center gap-2 text-sm text-fg" aria-live="polite"><span class="led" aria-hidden="true"></span> Destinatario: {{ p.nombres }} {{ p.apellidos }} ({{ p.email || 'sin correo' }})</p>
      }
      <div class="mt-4">
        <label class="label" for="mensaje">Mensaje de alerta</label>
        <textarea id="mensaje" class="field" rows="5" formControlName="mensaje" aria-describedby="m-e"></textarea>
        <app-field-error [control]="form.controls.mensaje" id="m-e" [tick]="tick()" />
      </div>
      <button type="submit" class="btn btn-danger mt-5" [disabled]="busy()"><app-icon name="send" [size]="16" /> {{ busy() ? 'Enviando…' : 'Enviar alerta' }}</button>
    </form>
  `,
})
export class EnviarAlerta {
  private readonly pacientes = inject(PacientesService);
  private readonly notifs = inject(NotificacionesService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly texto = signal('');
  protected readonly opciones = signal<Paciente[]>([]);
  protected readonly activo = signal(-1);
  protected readonly elegido = signal<Paciente | null>(null);
  protected readonly busy = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly tick = signal(0);
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly form = new FormGroup({
    paciente_id: new FormControl<number | null>(null, [Validators.required]),
    mensaje: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(2000)] }),
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected onInput(e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.texto.set(v);
    this.elegido.set(null);
    this.form.controls.paciente_id.setValue(null);
    clearTimeout(this.timer);
    if (v.trim().length < 2) {
      this.opciones.set([]);
      return;
    }
    this.timer = setTimeout(() => {
      this.pacientes.list({ search: v.trim(), page_size: 8 }).subscribe({
        next: (p) => {
          this.opciones.set(p.results);
          this.activo.set(p.results.length ? 0 : -1);
        },
        error: () => this.opciones.set([]),
      });
    }, 250);
  }

  protected onKey(e: KeyboardEvent): void {
    const n = this.opciones().length;
    if (!n) return;
    if (e.key === 'ArrowDown') this.activo.set((this.activo() + 1) % n);
    else if (e.key === 'ArrowUp') this.activo.set((this.activo() - 1 + n) % n);
    else if (e.key === 'Enter') this.elegir(this.opciones()[Math.max(0, this.activo())]);
    else if (e.key === 'Escape') this.opciones.set([]);
    else return;
    e.preventDefault();
  }

  protected elegir(p: Paciente): void {
    this.elegido.set(p);
    this.texto.set(`${p.nombres} ${p.apellidos} · ${p.numero_documento}`);
    this.form.controls.paciente_id.setValue(p.id);
    this.opciones.set([]);
  }

  enviar(): void {
    this.form.markAllAsTouched();
    this.tick.update((t) => t + 1);
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    const v = this.form.getRawValue();
    this.notifs.send({ paciente_id: v.paciente_id!, mensaje: v.mensaje.trim() }).subscribe({
      next: () => {
        this.toast.success('Alerta enviada correctamente.');
        void this.router.navigate(['/medico/notificaciones']);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.errors.set(applyServerErrors(this.form, err, { paciente: 'paciente_id' }));
        this.tick.update((t) => t + 1);
      },
    });
  }
}
