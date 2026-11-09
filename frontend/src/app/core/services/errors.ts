import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormGroup } from '@angular/forms';

/** Convierte un error HTTP en un mensaje legible en español. */
export function describeApiError(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0 || err.status === 502 || err.status === 504) {
      return 'No se pudo conectar con el servidor de HeartGuard. Comprueba que el backend esté en marcha en http://localhost:8000.';
    }
    const body = err.error as Record<string, unknown> | string | null;
    const detail = typeof body === 'object' && body ? body['detail'] : null;
    if (err.status === 400) {
      const general = generalMessages(body);
      return general.length ? general.join(' ') : 'Revisa los datos del formulario.';
    }
    if (err.status === 401) return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
    if (err.status === 403)
      return typeof detail === 'string' ? detail : 'No tienes permiso para realizar esta acción.';
    if (err.status === 404)
      return typeof detail === 'string' ? detail : 'El recurso solicitado no existe.';
    if (err.status === 429) return 'Demasiadas solicitudes seguidas. Espera un minuto e inténtalo de nuevo.';
    if (err.status === 409)
      return typeof detail === 'string' ? detail : 'La operación entra en conflicto con otra en curso. Inténtalo más tarde.';
    if (err.status === 503)
      return typeof detail === 'string'
        ? detail
        : 'El servicio de IA no está disponible en este momento.';
    if (typeof detail === 'string') return detail;
    return `Error del servidor (${err.status}). Inténtalo de nuevo en unos segundos.`;
  }
  return 'Ha ocurrido un error inesperado.';
}

/** Mensajes no ligados a un campo (`detail`, `non_field_errors`). */
function generalMessages(body: unknown): string[] {
  if (!body) return [];
  if (typeof body === 'string') return [body];
  if (Array.isArray(body)) return body.map(String);
  const b = body as Record<string, unknown>;
  const out: string[] = [];
  for (const key of ['detail', 'non_field_errors', '__all__']) {
    const v = b[key];
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) out.push(...v.map(String));
  }
  return out;
}

/**
 * Traslada los errores 400 de DRF (`{campo: ["mensaje"]}`) a los controles del formulario
 * como error `server`. Devuelve los mensajes que no corresponden a ningún control
 * (incluidos los campos desconocidos) para mostrarlos como aviso general.
 */
export function applyServerErrors(
  form: FormGroup,
  err: unknown,
  aliases: Record<string, string> = {},
): string[] {
  if (!(err instanceof HttpErrorResponse) || err.status !== 400) {
    return [describeApiError(err)];
  }
  const body = err.error;
  const general = generalMessages(body);
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (['detail', 'non_field_errors', '__all__'].includes(key)) continue;
      const msgs = Array.isArray(value) ? value.map(String) : [String(value)];
      const control: AbstractControl | null = form.get(aliases[key] ?? key);
      if (control) {
        control.setErrors({ ...(control.errors ?? {}), server: msgs.join(' ') });
        control.markAsTouched();
      } else {
        general.push(`${key}: ${msgs.join(' ')}`);
      }
    }
  }
  return general.length ? general : [];
}

/**
 * Como `applyServerErrors`, pero reparte los errores de campo entre varios formularios
 * (p. ej. datos del paciente + variables clínicas). Devuelve sólo los mensajes generales
 * y los de campos que no existen en ninguno.
 */
export function applyServerErrorsMulti(forms: (FormGroup | null | undefined)[], err: unknown): string[] {
  if (!(err instanceof HttpErrorResponse) || err.status !== 400) return [describeApiError(err)];
  const body = err.error;
  const out = generalMessages(body);
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (['detail', 'non_field_errors', '__all__'].includes(key)) continue;
      const msgs = Array.isArray(value) ? value.map(String) : [String(value)];
      const control = forms.map((f) => f?.get(key)).find((c) => !!c);
      if (control) {
        control.setErrors({ ...(control.errors ?? {}), server: msgs.join(' ') });
        control.markAsTouched();
      } else {
        out.push(`${key}: ${msgs.join(' ')}`);
      }
    }
  }
  return out;
}
