import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { User } from '../models/api.models';
import { authInterceptor } from './auth.interceptor';
import { AuthService, homeFor } from './auth.service';
import { authGuard, guestGuard, roleGuard } from './guards';

@Component({ template: '' })
class Dummy {}

const MEDICO: User = { id: 1, username: 'medico@test.com', email: 'medico@test.com', role: 'medico', profile_id: 1, nombres: 'Elena', apellidos: 'Restrepo' };
const PACIENTE: User = { ...MEDICO, id: 2, role: 'paciente', username: 'p@test.com' };

describe('Autenticación', () => {
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: Dummy },
          { path: 'medico', component: Dummy },
          { path: 'paciente', component: Dummy },
          { path: 'medico/pacientes', component: Dummy },
        ]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => http.verify());

  function login(user = MEDICO): void {
    auth.login('u', 'p').subscribe();
    http.expectOne('/api/v1/auth/login').flush({ access: 'A1', refresh: 'R1', user });
  }

  describe('AuthService', () => {
    it('guarda el access en memoria y el refresh en sessionStorage (no en localStorage)', () => {
      login();
      expect(auth.accessToken()).toBe('A1');
      expect(auth.user()?.role).toBe('medico');
      expect(sessionStorage.getItem('heartguard.refresh')).toBe('R1');
      expect(localStorage.getItem('heartguard.refresh')).toBeNull();
    });

    it('envía el login sin cabecera Authorization', () => {
      auth.login('u', 'p').subscribe();
      const req = http.expectOne('/api/v1/auth/login');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({ access: 'A', refresh: 'R', user: MEDICO });
    });

    it('restaura la sesión con el refresh guardado (refresh → me)', async () => {
      sessionStorage.setItem('heartguard.refresh', 'R9');
      const p = auth.restore();
      http.expectOne('/api/v1/auth/refresh').flush({ access: 'A9' });
      const me = http.expectOne('/api/v1/auth/me');
      expect(me.request.headers.get('Authorization')).toBe('Bearer A9');
      me.flush(PACIENTE);
      await p;
      expect(auth.user()?.role).toBe('paciente');
    });

    it('si el refresh es inválido al restaurar, limpia la sesión', async () => {
      sessionStorage.setItem('heartguard.refresh', 'malo');
      const p = auth.restore();
      http.expectOne('/api/v1/auth/refresh').flush({ detail: 'x' }, { status: 401, statusText: 'Unauthorized' });
      await p;
      expect(auth.isAuthenticated()).toBe(false);
      expect(sessionStorage.getItem('heartguard.refresh')).toBeNull();
    });

    it('logout invalida el refresh en el servidor y vuelve al login', async () => {
      login();
      const router = TestBed.inject(Router);
      auth.logout();
      const req = http.expectOne('/api/v1/auth/logout');
      expect(req.request.body).toEqual({ refresh: 'R1' });
      req.flush(null, { status: 205, statusText: 'Reset Content' });
      await Promise.resolve();
      expect(auth.isAuthenticated()).toBe(false);
      expect(router.url === '/login' || router.url === '/').toBe(true);
    });

    it('homeFor redirige por rol', () => {
      expect(homeFor('medico')).toBe('/medico');
      expect(homeFor('paciente')).toBe('/paciente');
      expect(homeFor('admin')).toBe('/medico/modelo');
      expect(homeFor(null)).toBe('/login');
    });
  });

  describe('authInterceptor', () => {
    it('añade el Bearer a las peticiones de la API', () => {
      login();
      TestBed.inject(HttpClient).get('/api/v1/pacientes').subscribe();
      const req = http.expectOne('/api/v1/pacientes');
      expect(req.request.headers.get('Authorization')).toBe('Bearer A1');
      req.flush({ count: 0, next: null, previous: null, results: [] });
    });

    it('no toca peticiones fuera de /api', () => {
      login();
      TestBed.inject(HttpClient).get('/assets/x.json').subscribe();
      const req = http.expectOne('/assets/x.json');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    });

    it('ante un 401 renueva el access una sola vez para peticiones concurrentes y repite', async () => {
      login();
      const client = TestBed.inject(HttpClient);
      const a = firstValueFrom(client.get<{ ok: number }>('/api/v1/a'));
      const b = firstValueFrom(client.get<{ ok: number }>('/api/v1/b'));
      http.expectOne('/api/v1/a').flush({}, { status: 401, statusText: 'Unauthorized' });
      http.expectOne('/api/v1/b').flush({}, { status: 401, statusText: 'Unauthorized' });
      const refresh = http.match('/api/v1/auth/refresh');
      expect(refresh).toHaveLength(1);
      expect(refresh[0].request.body).toEqual({ refresh: 'R1' });
      refresh[0].flush({ access: 'A2' });
      const ra = http.expectOne('/api/v1/a');
      const rb = http.expectOne('/api/v1/b');
      expect(ra.request.headers.get('Authorization')).toBe('Bearer A2');
      ra.flush({ ok: 1 });
      rb.flush({ ok: 2 });
      expect((await a).ok).toBe(1);
      expect((await b).ok).toBe(2);
      expect(auth.accessToken()).toBe('A2');
    });

    it('si el refresh falla, cierra la sesión y propaga el 401', async () => {
      login();
      const p = firstValueFrom(TestBed.inject(HttpClient).get('/api/v1/a')).catch((e) => e);
      http.expectOne('/api/v1/a').flush({}, { status: 401, statusText: 'Unauthorized' });
      http.expectOne('/api/v1/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
      const err = await p;
      expect(err.status).toBe(401);
      expect(auth.isAuthenticated()).toBe(false);
      expect(auth.expiredReason()).toContain('caducado');
    });

    it('no intenta renovar en otros errores (p. ej. 403)', async () => {
      login();
      const p = firstValueFrom(TestBed.inject(HttpClient).get('/api/v1/a')).catch((e) => e);
      http.expectOne('/api/v1/a').flush({}, { status: 403, statusText: 'Forbidden' });
      expect((await p).status).toBe(403);
      http.expectNone('/api/v1/auth/refresh');
      expect(auth.isAuthenticated()).toBe(true);
    });
  });

  describe('guards', () => {
    const run = (guard: ReturnType<typeof roleGuard>, url = '/medico') =>
      TestBed.runInInjectionContext(() => guard({} as never, { url } as never));
    const path = (r: unknown) => TestBed.inject(Router).serializeUrl(r as UrlTree);

    it('authGuard manda al login con returnUrl si no hay sesión', () => {
      expect(path(run(authGuard, '/medico/pacientes'))).toBe('/login?returnUrl=%2Fmedico%2Fpacientes');
    });

    it('authGuard deja pasar con sesión', () => {
      login();
      expect(run(authGuard)).toBe(true);
    });

    it('roleGuard redirige al inicio del rol si no corresponde', () => {
      login(PACIENTE);
      expect(path(run(roleGuard('medico', 'admin')))).toBe('/paciente');
      expect(run(roleGuard('paciente'))).toBe(true);
    });

    it('guestGuard saca del login a quien ya tiene sesión', () => {
      expect(run(guestGuard)).toBe(true);
      login();
      expect(path(run(guestGuard))).toBe('/medico');
    });
  });
});

describe('Restauración ante errores transitorios', () => {
  it('un 429 al renovar no borra el refresh guardado', async () => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    sessionStorage.setItem('heartguard.refresh', 'R1');
    const p = TestBed.inject(AuthService).restore();
    http.expectOne('/api/v1/auth/refresh').flush({ detail: 'Throttled' }, { status: 429, statusText: 'Too Many Requests' });
    await p;
    expect(sessionStorage.getItem('heartguard.refresh')).toBe('R1');
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
  });
});
