import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { AuthService } from '../core/auth/auth.service';
import { mockFlags } from '../mocks/mock-api.interceptor';
import { DEMO_CREDENTIALS } from '../mocks/mock-db';
import { EXAMPLES } from '../shared/clinical-form/clinical-form';
import { loginAs, routerUrl, settle, setup, type } from '../testing/setup';
import { Login } from './auth/login';
import { Registro } from './auth/registro';
import { CambiarContrasena } from './comun/cambiar-contrasena';
import { InformeNuevo } from './ia/informe-nuevo';
import { Modelo } from './ia/modelo';
import { fechaDesdePartes } from './medico/analisis';
import { NotificacionesMedico } from './medico/notificaciones';
import { Pacientes } from './medico/pacientes';
import { PacienteDashboard } from './paciente/dashboard';

afterEach(() => vi.useRealTimers());

describe('Login', () => {
  let f: ComponentFixture<Login>;
  let el: HTMLElement;
  beforeEach(async () => {
    await setup([Login]);
    f = TestBed.createComponent(Login);
    el = f.nativeElement;
    f.detectChanges();
  });

  async function enter(u: string, p: string) {
    type(el, '#username', u);
    type(el, '#password', p);
    (el.querySelector('button[type=submit]') as HTMLButtonElement).click();
    await settle(f, 500);
  }

  it('valida campos obligatorios sin llamar a la API', async () => {
    (el.querySelector('button[type=submit]') as HTMLButtonElement).click();
    await settle(f, 50);
    expect(el.textContent).toContain('Este campo es obligatorio.');
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
  });

  it('muestra error con credenciales incorrectas', async () => {
    await enter('medico@test.com', 'mala');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Usuario o contraseña incorrectos');
  });

  it('redirige al panel del médico', async () => {
    await enter(DEMO_CREDENTIALS.medico.username, DEMO_CREDENTIALS.medico.password);
    expect(routerUrl()).toBe('/medico');
  });

  it('redirige al panel del paciente', async () => {
    await enter(DEMO_CREDENTIALS.paciente.username, DEMO_CREDENTIALS.paciente.password);
    expect(routerUrl()).toBe('/paciente');
  });

  it('respeta returnUrl sólo si pertenece al rol', async () => {
    f.componentRef.setInput('returnUrl', '/medico/pacientes');
    await enter(DEMO_CREDENTIALS.paciente.username, DEMO_CREDENTIALS.paciente.password);
    expect(routerUrl()).toBe('/paciente');
  });
});

describe('Registro', () => {
  let f: ComponentFixture<Registro>;
  beforeEach(async () => {
    await setup([Registro]);
    f = TestBed.createComponent(Registro);
    f.detectChanges();
  });

  it('aplica las reglas de contraseña del original y la confirmación', () => {
    const c = f.componentInstance.form.controls;
    c.password.setValue('abc');
    expect(c.password.hasError('passwordStrength')).toBe(true);
    c.password.setValue('Segura123');
    expect(c.password.valid).toBe(true);
    c.password_confirmation.setValue('Otra1234');
    f.componentInstance.form.updateValueAndValidity();
    expect(c.password_confirmation.hasError('mismatch')).toBe(true);
  });

  it('muestra en el campo el error 400 del servidor (correo duplicado)', async () => {
    f.componentInstance.form.patchValue({
      email: DEMO_CREDENTIALS.medico.username,
      password: 'Segura123',
      password_confirmation: 'Segura123',
      nombres: 'Ana',
      apellidos: 'Pérez',
      numero_documento: '99887766',
    });
    f.componentInstance.submit();
    await settle(f, 500);
    expect(f.componentInstance.form.controls.email.errors?.['server']).toContain('ya está registrado');
    expect(f.nativeElement.textContent).toContain('El correo electrónico ya está registrado.');
  });
});

describe('Cambiar contraseña', () => {
  it('marca la contraseña actual incorrecta con el error del servidor', async () => {
    await setup([CambiarContrasena]);
    await loginAs('paciente');
    const f = TestBed.createComponent(CambiarContrasena);
    f.detectChanges();
    f.componentInstance.form.setValue({ old_password: 'x', new_password: 'Nueva1234', new_password_confirmation: 'Nueva1234' });
    f.componentInstance.submit();
    await settle(f, 500);
    expect(f.componentInstance.form.controls.old_password.errors?.['server']).toContain('no es correcta');
  });

  it('cambia la contraseña con datos válidos', async () => {
    await setup([CambiarContrasena]);
    await loginAs('paciente');
    const f = TestBed.createComponent(CambiarContrasena);
    f.detectChanges();
    f.componentInstance.form.setValue({ old_password: DEMO_CREDENTIALS.paciente.password, new_password: 'Nueva1234', new_password_confirmation: 'Nueva1234' });
    f.componentInstance.submit();
    await settle(f, 500);
    expect(f.componentInstance.form.pristine).toBe(true);
    expect(f.componentInstance.form.controls.old_password.value).toBe('');
  });
});

describe('Pacientes (historial médico)', () => {
  it('lista pacientes paginados y filtra por riesgo', async () => {
    await setup([Pacientes]);
    await loginAs('medico');
    const f = TestBed.createComponent(Pacientes);
    f.detectChanges();
    await settle(f, 500);
    const rows = () => f.nativeElement.querySelectorAll('tbody tr').length;
    expect(rows()).toBe(20);
    expect(f.nativeElement.querySelector('nav[aria-label="Paginación"]')).not.toBeNull();
    const sel = f.nativeElement.querySelector('#riesgo') as HTMLSelectElement;
    sel.value = 'alto';
    sel.dispatchEvent(new Event('change'));
    await settle(f, 500);
    const badges = [...f.nativeElement.querySelectorAll('tbody app-risk-badge')].map((b) => (b as HTMLElement).textContent);
    expect(badges.length).toBeGreaterThan(0);
    expect(badges.every((t) => t?.includes('Riesgo alto'))).toBe(true);
    expect(f.nativeElement.querySelectorAll('tr.row-alarm').length).toBe(rows());
  });
});

describe('Nuevo informe', () => {
  it('guarda con predicción automática y muestra la lectura con alarma si el riesgo es alto', async () => {
    await setup([InformeNuevo]);
    await loginAs('medico');
    const f = TestBed.createComponent(InformeNuevo);
    f.componentRef.setInput('documento', '1020304050');
    f.detectChanges();
    await settle(f, 600);
    expect(f.nativeElement.textContent).toContain('Ana María Quintero Ríos');
    expect(f.nativeElement.textContent).toContain('no sustituye el diagnóstico médico');
    f.componentInstance.guardar(EXAMPLES.enfermo.patient);
    await settle(f, 600);
    const readout = f.nativeElement.querySelector('app-prediction-readout');
    expect(readout?.textContent).toContain('guardado');
    expect(readout?.textContent).toContain('0,345');
    expect(readout?.querySelector('.alarm')).not.toBeNull();
  });

  it('muestra en el campo el documento inexistente', async () => {
    await setup([InformeNuevo]);
    await loginAs('medico');
    const f = TestBed.createComponent(InformeNuevo);
    f.detectChanges();
    await settle(f, 500);
    f.componentInstance.pForm.controls.documento.setValue('000');
    f.componentInstance.guardar(EXAMPLES.sano.patient);
    await settle(f, 600);
    expect(f.componentInstance.pForm.controls.documento.errors?.['server']).toContain('No se encontró');
  });
});

describe('Notificaciones del médico', () => {
  it('envía una alerta por cédula y asigna al campo el «paciente no encontrado»', async () => {
    await setup([NotificacionesMedico]);
    await loginAs('medico');
    const f = TestBed.createComponent(NotificacionesMedico);
    f.detectChanges();
    await settle(f, 500);
    f.componentInstance.form.patchValue({ documento: '123', mensaje: 'Hola' });
    f.componentInstance.enviar();
    await settle(f, 500);
    expect(f.componentInstance.form.controls.documento.errors?.['server']).toContain('No se encontró');
    f.componentInstance.form.patchValue({ documento: '1020304050', mensaje: 'Control el lunes' });
    f.componentInstance.enviar();
    await settle(f, 800);
    expect(f.nativeElement.textContent).toContain('Control el lunes');
  });
});

describe('Modelo IA', () => {
  it('el médico ve métricas y versiones pero no el botón de reentrenar', async () => {
    await setup([Modelo]);
    await loginAs('medico');
    const f = TestBed.createComponent(Modelo);
    f.detectChanges();
    await settle(f, 600);
    expect(f.nativeElement.textContent).toContain('Historial de versiones');
    expect(f.nativeElement.textContent).toContain('umbral');
    expect(f.nativeElement.textContent).not.toContain('Reentrenar modelo');
  });

  it('el administrador reentrena y un 409 se muestra con claridad', async () => {
    await setup([Modelo]);
    await loginAs('admin');
    const f = TestBed.createComponent(Modelo);
    f.detectChanges();
    await settle(f, 600);
    expect(f.nativeElement.textContent).toContain('Reentrenar modelo');
    mockFlags.retraining = true;
    (f.componentInstance as unknown as { reentrenar(): void }).reentrenar();
    await settle(f, 600);
    expect(f.nativeElement.textContent).toContain('Ya hay un reentrenamiento en curso.');
    mockFlags.retraining = false;
    (f.componentInstance as unknown as { reentrenar(): void }).reentrenar();
    await settle(f, 1200);
    expect(f.nativeElement.textContent).toContain('2.1.0');
  });
});

describe('Panel del paciente', () => {
  it('muestra el último resultado, la evolución y el aviso médico', async () => {
    await setup([PacienteDashboard]);
    await loginAs('paciente');
    const f = TestBed.createComponent(PacienteDashboard);
    f.detectChanges();
    await settle(f, 600);
    const t = f.nativeElement.textContent;
    expect(t).toContain('Hola, Ana María');
    expect(t).toContain('no sustituye el diagnóstico médico');
    expect(f.nativeElement.querySelector('app-evolution-chart app-line-chart')).not.toBeNull();
    expect(f.nativeElement.querySelector('app-risk-gauge')).not.toBeNull();
  });
});

describe('fechaDesdePartes (filtro día/mes/año del original)', () => {
  it('valida fechas', () => {
    expect(fechaDesdePartes(15, 6, 2025)).toBe('2025-06-15');
    expect(fechaDesdePartes(31, 2, 2025)).toBeNull();
    expect(fechaDesdePartes(null, null, null)).toBe('');
    expect(fechaDesdePartes(1, null, 2025)).toBeNull();
  });
});

describe('Extensiones del contrato', () => {
  it('alta de paciente sin contraseña: muestra la contraseña temporal una sola vez', async () => {
    const { PacienteNuevo } = await import('./medico/paciente-nuevo');
    await setup([PacienteNuevo]);
    await loginAs('medico');
    const f = TestBed.createComponent(PacienteNuevo);
    f.detectChanges();
    f.componentInstance.form.patchValue({ email: 'nuevo@correo.co', nombres: 'Luz', apellidos: 'Mora', numero_documento: '55554444' });
    f.componentInstance.submit();
    await settle(f, 500);
    const dlg = f.nativeElement.querySelector('dialog');
    expect(dlg.textContent).toContain('sólo se muestra una vez');
    expect(dlg.querySelector('code').textContent).toMatch(/^Tmp-/);
  });

  it('informe fuera del dominio del modelo: se guarda sin predicción y muestra la advertencia', async () => {
    await setup([InformeNuevo]);
    await loginAs('medico');
    const f = TestBed.createComponent(InformeNuevo);
    f.componentRef.setInput('documento', '1020304050');
    f.detectChanges();
    await settle(f, 600);
    f.componentInstance.guardar({ ...EXAMPLES.sano.patient, age: 85 });
    await settle(f, 600);
    expect(f.nativeElement.textContent).toContain('Advertencia de la IA');
    expect(f.nativeElement.textContent).toContain('sin predicción');
    expect(f.nativeElement.querySelector('app-prediction-readout')).toBeNull();
  });

  it('informe de riesgo alto informa de la alerta automática enviada', async () => {
    await setup([InformeNuevo]);
    await loginAs('medico');
    const f = TestBed.createComponent(InformeNuevo);
    f.componentRef.setInput('documento', '1020304050');
    f.detectChanges();
    await settle(f, 600);
    f.componentInstance.guardar(EXAMPLES.enfermo.patient);
    await settle(f, 600);
    expect(f.nativeElement.textContent).toContain('se envió una alerta automática');
  });

  it('el médico puede volver a predecir un informe', async () => {
    const { InformeDetalle } = await import('./comun/informe-detalle');
    await setup([InformeDetalle]);
    await loginAs('medico');
    const f = TestBed.createComponent(InformeDetalle);
    f.componentRef.setInput('id', '1');
    f.detectChanges();
    await settle(f, 600);
    const btn = [...f.nativeElement.querySelectorAll('button')].find((b) => (b as HTMLElement).textContent!.includes('Volver a predecir')) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    await settle(f, 600);
    expect(f.nativeElement.textContent).toContain('Resultado de la red neuronal');
  });
});
