import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AbstractControl } from '@angular/forms';

const MESSAGES: Record<string, (e: unknown) => string> = {
  required: () => 'Este campo es obligatorio.',
  email: () => 'Introduce un correo electrónico válido.',
  minlength: (e) => `Debe tener al menos ${(e as { requiredLength: number }).requiredLength} caracteres.`,
  maxlength: (e) => `No puede superar ${(e as { requiredLength: number }).requiredLength} caracteres.`,
  min: (e) => `El valor mínimo es ${(e as { min: number }).min}.`,
  max: (e) => `El valor máximo es ${(e as { max: number }).max}.`,
  pattern: () => 'El formato no es válido.',
  passwordStrength: () => 'Debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.',
  mismatch: () => 'Las contraseñas no coinciden.',
  futureDate: () => 'La fecha no puede ser futura.',
  server: (e) => String(e),
};

/** Mensaje del primer error de un control (incluidos los `server` mapeados desde un 400). */
export function controlError(c: AbstractControl | null | undefined): string {
  if (!c?.errors) return '';
  const [key, val] = Object.entries(c.errors)[0];
  return (MESSAGES[key] ?? (() => 'Valor no válido.'))(val);
}

@Component({
  selector: 'app-field-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show()) {
      <p [id]="id()" class="mt-1 flex items-center gap-1.5 text-xs font-semibold text-alert-fg" role="alert">
        <span class="inline-block size-1.5 rounded-full bg-hg-alert" aria-hidden="true"></span>
        {{ message() }}
      </p>
    }
  `,
})
export class FieldError {
  readonly control = input.required<AbstractControl | null>();
  readonly id = input('');
  /** Señal externa para recalcular (los controles no son reactivos por sí mismos). */
  readonly tick = input<unknown>(0);
  protected readonly show = computed(() => {
    this.tick();
    const c = this.control();
    return !!c && c.invalid && (c.touched || c.dirty);
  });
  protected readonly message = computed(() => {
    this.tick();
    return controlError(this.control());
  });
}
