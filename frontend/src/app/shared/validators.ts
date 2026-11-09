import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Regla del sistema original: ≥ 8 caracteres, una mayúscula, una minúscula y un número. */
export const passwordStrength: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const v = String(c.value ?? '');
  if (!v) return null;
  const ok = v.length >= 8 && /\d/.test(v) && /[A-Z]/.test(v) && /[a-z]/.test(v);
  return ok ? null : { passwordStrength: true };
};

/** Error `mismatch` en el control de confirmación si no coincide con `source`. */
export function matches(source: string, confirm: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const a = group.get(source);
    const b = group.get(confirm);
    if (!a || !b) return null;
    const errors = { ...(b.errors ?? {}) };
    if (b.value && a.value !== b.value) errors['mismatch'] = true;
    else delete errors['mismatch'];
    b.setErrors(Object.keys(errors).length ? errors : null);
    return null;
  };
}

/** La fecha (AAAA-MM-DD) no puede ser posterior a hoy. */
export const notFuture: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const v = c.value as string | null;
  if (!v) return null;
  return v > new Date().toISOString().slice(0, 10) ? { futureDate: true } : null;
};

/** Requisitos de contraseña para la lista de comprobación visual. */
export function passwordChecks(v: string): { label: string; ok: boolean }[] {
  return [
    { label: '8 caracteres o más', ok: v.length >= 8 },
    { label: 'Una mayúscula', ok: /[A-Z]/.test(v) },
    { label: 'Una minúscula', ok: /[a-z]/.test(v) },
    { label: 'Un número', ok: /\d/.test(v) },
  ];
}
