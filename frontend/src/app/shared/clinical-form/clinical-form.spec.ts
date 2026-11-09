import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { loginAs, settle, setup } from '../../testing/setup';
import { ClinicalForm, EXAMPLES } from './clinical-form';

describe('ClinicalForm (13 variables)', () => {
  let fixture: ComponentFixture<ClinicalForm>;
  let el: HTMLElement;
  const legend = () => el.querySelector('legend')?.textContent ?? '';
  const submit = () => (el.querySelector('button[type="submit"]') as HTMLButtonElement).click();

  beforeEach(async () => {
    await setup([ClinicalForm]);
    await loginAs('medico');
    fixture = TestBed.createComponent(ClinicalForm);
    el = fixture.nativeElement;
    fixture.detectChanges();
    await settle(fixture);
  });
  afterEach(() => vi.useRealTimers());

  it('genera el primer paso desde /ml/features', () => {
    expect(legend()).toContain('Datos personales');
    expect(el.querySelector('#f-age')).not.toBeNull();
    expect(el.querySelectorAll('input[type="radio"][name="sex"]')).toHaveLength(2);
  });

  it('los límites vienen de /ml/features (rango del modelo), no del cliente', () => {
    const age = fixture.componentInstance.control('age');
    age.setValue(78);
    expect(age.hasError('max')).toBe(true);
    age.setValue(28);
    expect(age.hasError('min')).toBe(true);
    age.setValue(29);
    expect(age.valid).toBe(true);
    fixture.componentInstance.control('oldpeak').setValue(2.5);
    expect(fixture.componentInstance.control('oldpeak').valid).toBe(true);
  });

  it('no avanza si faltan campos y muestra el error accesible', async () => {
    submit();
    await settle(fixture, 50);
    expect(legend()).toContain('Datos personales');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Selecciona una opción.');
    expect(el.querySelector('[aria-invalid="true"]')).not.toBeNull();
  });

  it('regresión: el deslizador y la caja numérica se mantienen sincronizados', async () => {
    const slider = el.querySelector('[data-slider="age"]') as HTMLInputElement;
    const box = el.querySelector('#f-age') as HTMLInputElement;
    // Deslizador → número
    slider.value = '61';
    slider.dispatchEvent(new Event('input'));
    await settle(fixture, 0);
    expect(box.value).toBe('61');
    expect(fixture.componentInstance.control('age').value).toBe(61);
    // Número → deslizador
    box.value = '44';
    box.dispatchEvent(new Event('input'));
    await settle(fixture, 0);
    expect(slider.value).toBe('44');
    // Y otra vez deslizador (el fallo original aparecía en la segunda ida y vuelta)
    slider.value = '70';
    slider.dispatchEvent(new Event('input'));
    await settle(fixture, 0);
    expect(box.value).toBe('70');
  });

  it('emite el payload numérico al completar los tres pasos', async () => {
    const spy = vi.fn();
    fixture.componentInstance.submitted.subscribe(spy);
    fixture.componentInstance.patch(EXAMPLES.enfermo.patient);
    for (let i = 0; i < 3; i++) {
      submit();
      await settle(fixture, 50);
    }
    expect(spy).toHaveBeenCalledWith(EXAMPLES.enfermo.patient);
    expect(Object.values(spy.mock.calls[0][0]).every((v) => typeof v === 'number')).toBe(true);
  });
});
