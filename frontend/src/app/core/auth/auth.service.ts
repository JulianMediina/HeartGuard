import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, firstValueFrom, map, Observable, of, shareReplay, switchMap, tap, throwError } from 'rxjs';

import { LoginResponse, RegistroPayload, Role, User } from '../models/api.models';
import { API_URL } from '../services/api-url';

const REFRESH_KEY = 'heartguard.refresh';

/**
 * Almacenamiento del refresh token. El access token vive sólo en memoria; el refresh va a
 * `sessionStorage` (no `localStorage`): sobrevive a recargar la pestaña pero se borra al
 * cerrarla y no se comparte entre pestañas, lo que reduce la ventana de exposición ante XSS.
 */
export class TokenStorage {
  get(): string | null {
    try {
      return sessionStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  }
  set(token: string | null): void {
    try {
      if (token) sessionStorage.setItem(REFRESH_KEY, token);
      else sessionStorage.removeItem(REFRESH_KEY);
    } catch {
      /* almacenamiento no disponible: la sesión dura lo que la pestaña */
    }
  }
}

/** Pantalla de inicio de cada rol (equivalente a las redirecciones del login original). */
export function homeFor(role: Role | null | undefined): string {
  switch (role) {
    case 'medico':
      return '/medico';
    case 'paciente':
      return '/paciente';
    case 'admin':
      return '/medico/modelo';
    default:
      return '/login';
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly api = inject(API_URL);
  private readonly storage = new TokenStorage();

  private readonly _user = signal<User | null>(null);
  private access: string | null = null;
  private refreshing$: Observable<string> | null = null;

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly role = computed(() => this._user()?.role ?? null);
  /** Motivo del último cierre de sesión forzado (p. ej. caducidad), para el login. */
  readonly expiredReason = signal<string | null>(null);

  accessToken(): string | null {
    return this.access;
  }

  hasRefreshToken(): boolean {
    return !!this.storage.get();
  }

  login(username: string, password: string): Observable<User> {
    return this.http.post<LoginResponse>(`${this.api}/v1/auth/login`, { username, password }).pipe(
      tap((r) => {
        this.access = r.access;
        this.storage.set(r.refresh);
        this._user.set(r.user);
        this.expiredReason.set(null);
      }),
      map((r) => r.user),
    );
  }

  register(payload: RegistroPayload): Observable<unknown> {
    return this.http.post(`${this.api}/v1/auth/register`, payload);
  }

  changePassword(old_password: string, new_password: string): Observable<unknown> {
    return this.http.post(`${this.api}/v1/auth/change-password`, { old_password, new_password });
  }

  me(): Observable<User> {
    return this.http.get<User>(`${this.api}/v1/auth/me`).pipe(tap((u) => this._user.set(u)));
  }

  /** Actualiza nombres/apellidos mostrados tras editar el perfil. */
  patchUser(patch: Partial<User>): void {
    const u = this._user();
    if (u) this._user.set({ ...u, ...patch });
  }

  /**
   * Pide un access token nuevo con el refresh guardado. Las peticiones concurrentes
   * comparten una única llamada a /auth/refresh.
   */
  refreshAccess(): Observable<string> {
    const refresh = this.storage.get();
    if (!refresh) return throwError(() => new Error('Sin refresh token'));
    if (!this.refreshing$) {
      this.refreshing$ = this.http
        .post<{ access: string; refresh?: string }>(`${this.api}/v1/auth/refresh`, { refresh })
        .pipe(
          map((r) => {
            this.access = r.access;
            if (r.refresh) this.storage.set(r.refresh); // rotación de refresh tokens
            return r.access;
          }),
          finalize(() => (this.refreshing$ = null)),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }
    return this.refreshing$;
  }

  /** Restaura la sesión al arrancar la app (refresh guardado → access → /me). */
  restore(): Promise<void> {
    if (!this.storage.get()) return Promise.resolve();
    return firstValueFrom(
      this.refreshAccess().pipe(
        switchMap(() => this.me()),
        map(() => undefined),
        catchError((err: unknown) => {
          // Sólo un refresh rechazado (401/400) invalida la sesión guardada; ante errores
          // transitorios (red, 429, 5xx) se conserva para reintentar en la próxima carga.
          const status = err instanceof HttpErrorResponse ? err.status : 0;
          if (status === 401 || status === 400) this.clear();
          else this.access = null;
          return of(undefined);
        }),
      ),
    );
  }

  logout(): void {
    const refresh = this.storage.get();
    if (refresh && this.access) {
      // Invalida el refresh en el servidor (blacklist); el resultado no bloquea la salida.
      this.http.post(`${this.api}/v1/auth/logout`, { refresh }).subscribe({ error: () => undefined });
    }
    this.clear();
    void this.router.navigate(['/login']);
  }

  /** Sesión caducada o refresh inválido: limpia y vuelve al login conservando la ruta. */
  expire(): void {
    if (!this._user() && !this.storage.get()) return;
    const returnUrl = this.router.url;
    this.clear();
    this.expiredReason.set('Tu sesión ha caducado. Vuelve a iniciar sesión.');
    void this.router.navigate(['/login'], {
      queryParams: returnUrl && returnUrl !== '/' && !returnUrl.startsWith('/login') ? { returnUrl } : {},
    });
  }

  private clear(): void {
    this.access = null;
    this.refreshing$ = null;
    this.storage.set(null);
    this._user.set(null);
  }
}
