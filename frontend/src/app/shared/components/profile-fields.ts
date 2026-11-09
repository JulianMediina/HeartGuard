import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';

import { TIPOS_DOCUMENTO } from '../../core/models/api.models';
import { notFuture } from '../validators';
import { FieldError } from './field-error';
import { Icon } from './icon';

/** Campos del perfil (los de `MedicoUpdateForm` / `PacienteUpdateForm` del original). */
export const PERFIL_CAMPOS = ['nombres', 'apellidos', 'telefono', 'fecha_nacimiento', 'direccion', 'departamento', 'ciudad'] as const;
export type PerfilCampo = (typeof PERFIL_CAMPOS)[number];

const META: Record<string, { label: string; icon: string; type?: string; list?: string; autocomplete?: string; wide?: boolean }> = {
  email: { label: 'Correo electrónico', icon: 'mail', type: 'email', autocomplete: 'email', wide: true },
  tipo_documento: { label: 'Tipo de documento', icon: 'id' },
  numero_documento: { label: 'Número de documento', icon: 'id' },
  nombres: { label: 'Nombres', icon: 'user', autocomplete: 'given-name' },
  apellidos: { label: 'Apellidos', icon: 'user', autocomplete: 'family-name' },
  telefono: { label: 'Teléfono', icon: 'phone', type: 'tel', autocomplete: 'tel' },
  fecha_nacimiento: { label: 'Fecha de nacimiento', icon: 'calendar', type: 'date' },
  direccion: { label: 'Dirección', icon: 'pin', autocomplete: 'street-address', wide: true },
  departamento: { label: 'Departamento', icon: 'globe', list: 'hg-departamentos' },
  ciudad: { label: 'Ciudad', icon: 'city', list: 'hg-ciudades' },
  password: { label: 'Contraseña inicial (opcional)', icon: 'lock', type: 'password', autocomplete: 'new-password', wide: true },
};

const REQUIRED = new Set(['email', 'nombres', 'apellidos', 'numero_documento', 'tipo_documento']);

/** Construye el FormGroup del perfil con las validaciones del backend (longitudes y obligatorios). */
export function perfilForm(extra: string[] = []): FormGroup<Record<string, FormControl<string>>> {
  const controls: Record<string, FormControl<string>> = {};
  for (const name of [...extra, ...PERFIL_CAMPOS]) {
    const v: ValidatorFn[] = [];
    if (REQUIRED.has(name)) v.push(Validators.required);
    if (name === 'email') v.push(Validators.email);
    if (name === 'telefono') v.push(Validators.maxLength(20), Validators.pattern(/^[0-9+\s()-]*$/));
    if (name === 'numero_documento') v.push(Validators.maxLength(20));
    if (['nombres', 'apellidos', 'departamento', 'ciudad'].includes(name)) v.push(Validators.maxLength(255));
    if (name === 'fecha_nacimiento') v.push(notFuture);
    controls[name] = new FormControl(name === 'tipo_documento' ? 'CC' : '', { nonNullable: true, validators: v });
  }
  return new FormGroup(controls);
}

/** Valores del formulario → payload (cadenas vacías opcionales → null). */
export function perfilPayload(raw: Record<string, string>): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v === '' && !REQUIRED.has(k) && k !== 'password' ? null : v]),
  );
}

@Component({
  selector: 'app-profile-fields',
  imports: [ReactiveFormsModule, FieldError, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="grid gap-4 sm:grid-cols-2" [formGroup]="form()">
      @for (f of items(); track f.name) {
        <div [class.sm:col-span-2]="f.wide">
          <label class="label flex items-center gap-1.5" [for]="prefix() + f.name">
            <app-icon [name]="f.icon" [size]="14" class="text-muted" /> {{ f.label }}{{ f.required ? ' *' : '' }}
          </label>
          @if (f.name === 'tipo_documento') {
            <select class="field" [id]="prefix() + f.name" [formControlName]="f.name">
              @for (t of tipos; track t.value) {
                <option [value]="t.value">{{ t.label }}</option>
              }
            </select>
          } @else {
            <input
              class="field"
              [id]="prefix() + f.name"
              [type]="f.type ?? 'text'"
              [formControlName]="f.name"
              [attr.list]="f.list ?? null"
              [attr.autocomplete]="f.autocomplete ?? 'off'"
              [attr.aria-invalid]="bad(f.name)"
              [attr.aria-describedby]="prefix() + f.name + '-e'"
            />
          }
          <app-field-error [control]="form().controls[f.name]" [id]="prefix() + f.name + '-e'" [tick]="tick()" />
        </div>
      }
    </div>
    <datalist id="hg-departamentos">
      @for (d of departamentos; track d) {
        <option [value]="d"></option>
      }
    </datalist>
    <datalist id="hg-ciudades">
      @for (c of ciudades; track c) {
        <option [value]="c"></option>
      }
    </datalist>
  `,
})
export class ProfileFields {
  readonly form = input.required<FormGroup<Record<string, FormControl<string>>>>();
  readonly tick = input<unknown>(0);
  readonly prefix = input('pf-');

  protected readonly tipos = TIPOS_DOCUMENTO;
  protected readonly departamentos = ['Cundinamarca', 'Antioquia', 'Valle del Cauca', 'Boyacá', 'Santander', 'Atlántico'];
  protected readonly ciudades = ['Bogotá', 'Medellín', 'Cali', 'Tunja', 'Bucaramanga', 'Barranquilla'];

  protected readonly items = computed(() =>
    Object.keys(this.form().controls).map((name) => ({ name, required: REQUIRED.has(name), ...META[name] })),
  );

  protected bad(name: string): boolean {
    this.tick();
    const c = this.form().controls[name];
    return !!c && c.invalid && c.touched;
  }
}
