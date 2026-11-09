import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup } from '@angular/forms';

import { normalizeAnalisis } from './api';
import { applyServerErrors, applyServerErrorsMulti, describeApiError } from './errors';

const bad = (error: unknown) => new HttpErrorResponse({ status: 400, error });

describe('errores de la API', () => {
  it('describe errores comunes en español', () => {
    expect(describeApiError(new HttpErrorResponse({ status: 0 }))).toContain('No se pudo conectar');
    expect(describeApiError(new HttpErrorResponse({ status: 403 }))).toContain('permiso');
    expect(describeApiError(new HttpErrorResponse({ status: 409, error: { detail: 'Ya hay un reentrenamiento en curso.' } }))).toBe(
      'Ya hay un reentrenamiento en curso.',
    );
  });

  it('mapea los 400 de DRF a los controles y devuelve los generales', () => {
    const form = new FormGroup({ email: new FormControl(''), password: new FormControl('') });
    const general = applyServerErrors(form, bad({ email: ['El correo electrónico ya está registrado.'], non_field_errors: ['Revise el formulario.'], otro: 'x' }));
    expect(form.controls.email.errors?.['server']).toBe('El correo electrónico ya está registrado.');
    expect(form.controls.email.touched).toBe(true);
    expect(general).toEqual(['Revise el formulario.', 'otro: x']);
  });

  it('usa alias de campos (paciente → documento)', () => {
    const form = new FormGroup({ documento: new FormControl('') });
    applyServerErrors(form, bad({ paciente: 'No se encontró un paciente.' }), { paciente: 'documento' });
    expect(form.controls.documento.errors?.['server']).toContain('No se encontró');
  });

  it('reparte errores entre varios formularios', () => {
    const a = new FormGroup({ documento: new FormControl('') });
    const b = new FormGroup({ age: new FormControl(0) });
    const rest = applyServerErrorsMulti([a, b], bad({ documento: ['No existe'], age: ['Fuera del rango del modelo (29–77).'], detail: 'Error' }));
    expect(a.controls.documento.hasError('server')).toBe(true);
    expect(b.controls.age.errors?.['server']).toContain('29–77');
    expect(rest).toEqual(['Error']);
  });

  it('normaliza /analisis con el formato del backend', () => {
    const a = normalizeAnalisis({
      total_informes: 10,
      distribucion_riesgo: { bajo: 5, moderado: 3, alto: 2, sin_prediccion: 0 },
      por_sexo: [{ sexo: 0, etiqueta: 'Mujer', total: 4, alto_riesgo: 1, probabilidad_media: 0.3 }],
      por_edad: [{ rango: '<40', total: 2, alto_riesgo: 0, probabilidad_media: null }],
      por_tipo_dolor: [{ cp: 0, etiqueta: 'Asintomático', total: 6 }],
      medias_por_clase: [
        { clase: 0, etiqueta: 'Ausente', total: 3, medias: { age: 50, chol: 200 } },
        { clase: 1, etiqueta: 'Presente', total: 4, medias: { age: 60, chol: 250 } },
      ],
    });
    expect(a.por_edad[0].etiqueta).toBe('<40');
    expect(a.por_cp[0].etiqueta).toBe('Asintomático');
    expect(a.medias_por_clase.find((m) => m.variable === 'age')).toMatchObject({ sin: 50, con: 60 });
    expect(a.total_por_clase).toEqual({ sin: 3, con: 4 });
  });
});
