import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';

import { Paginated, Paciente } from '../core/models/api.models';
import { loginAs, setup } from '../testing/setup';

describe('API simulada', () => {
  beforeEach(async () => {
    await setup();
  });
  afterEach(() => vi.useRealTimers());

  /** Resuelve con el valor o rechaza con el error, sin rechazos sin manejar mientras avanzan los timers. */
  async function call<T>(obs: import('rxjs').Observable<T>): Promise<T> {
    const settled = firstValueFrom(obs).then(
      (v) => ({ ok: true as const, v }),
      (e: unknown) => ({ ok: false as const, e }),
    );
    await vi.advanceTimersByTimeAsync(400);
    const r = await settled;
    if (r.ok) return r.v;
    throw r.e;
  }

  it('exige token (401) en endpoints protegidos', async () => {
    const http = TestBed.inject(HttpClient);
    const err = await call(http.get('/api/v1/pacientes')).catch((e) => e);
    expect(err.status).toBe(401);
  });

  it('pagina al estilo DRF y filtra por documento', async () => {
    await loginAs('medico');
    const http = TestBed.inject(HttpClient);
    const page = await call(http.get<Paginated<Paciente>>('/api/v1/pacientes?page_size=10'));
    expect(page.results).toHaveLength(10);
    expect(page.count).toBe(46);
    expect(page.next).toContain('page=2');
    const one = await call(http.get<Paginated<Paciente>>('/api/v1/pacientes?documento=1020304050'));
    expect(one.results[0].nombres).toBe('Ana María');
  });

  it('aplica permisos por rol (403)', async () => {
    await loginAs('paciente');
    const err = await call(TestBed.inject(HttpClient).get('/api/v1/pacientes')).catch((e) => e);
    expect(err.status).toBe(403);
  });

  it('el paciente sólo ve sus informes', async () => {
    await loginAs('paciente');
    const page = await call(TestBed.inject(HttpClient).get<Paginated<{ paciente: { id: number } }>>('/api/v1/informes?page_size=200'));
    expect(page.results.length).toBe(7);
    expect(page.results.every((i) => i.paciente.id === 1)).toBe(true);
  });
});
