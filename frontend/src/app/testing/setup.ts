import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeEs from '@angular/common/locales/es';
import { Component, LOCALE_ID, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';

import { authInterceptor } from '../core/auth/auth.interceptor';
import { AuthService } from '../core/auth/auth.service';
import { DEMO_CREDENTIALS } from '../mocks/mock-db';
import { mockApiInterceptor, resetMockDb } from '../mocks/mock-api.interceptor';

registerLocaleData(localeEs);

@Component({ template: '' })
export class Blank {}

/** TestBed con router, interceptores reales (auth + mocks) y temporizadores falsos. */
export async function setup(extraImports: Type<unknown>[] = []): Promise<void> {
  vi.useFakeTimers();
  sessionStorage.clear();
  resetMockDb();
  await TestBed.configureTestingModule({
    imports: extraImports,
    providers: [
      provideRouter([
        { path: 'login', component: Blank },
        { path: 'medico', component: Blank },
        { path: 'medico/**', component: Blank },
        { path: 'paciente', component: Blank },
        { path: '**', component: Blank },
      ]),
      provideHttpClient(withInterceptors([authInterceptor, mockApiInterceptor])),
      { provide: LOCALE_ID, useValue: 'es' },
    ],
  }).compileComponents();
}

/** Inicia sesión contra la API simulada con un usuario de demostración. */
export async function loginAs(role: keyof typeof DEMO_CREDENTIALS): Promise<void> {
  const { username, password } = DEMO_CREDENTIALS[role];
  const p = firstValueFrom(TestBed.inject(AuthService).login(username, password));
  await vi.advanceTimersByTimeAsync(400);
  await p;
}

export async function settle<T>(fixture: ComponentFixture<T>, ms = 400): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  fixture.detectChanges();
  await vi.advanceTimersByTimeAsync(0);
  fixture.detectChanges();
}

export function routerUrl(): string {
  return TestBed.inject(Router).url;
}

export function type(el: HTMLElement, selector: string, value: string): void {
  const input = el.querySelector(selector) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new Event('blur'));
}
