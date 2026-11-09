import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from './auth.service';

/** Endpoints públicos: no llevan Bearer ni disparan el refresco automático. */
const PUBLIC = /\/v1\/auth\/(login|refresh|register)\/?$/;

function isApi(url: string): boolean {
  return /(^|\/)api\//.test(url);
}

function withBearer(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/**
 * Añade `Authorization: Bearer <access>` a las peticiones de la API. Ante un 401 intenta
 * una vez renovar el access token con el refresh (compartido entre peticiones
 * concurrentes) y repite la petición; si la renovación falla, cierra la sesión.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApi(req.url) || PUBLIC.test(req.url.split('?')[0])) return next(req);
  const auth = inject(AuthService);
  const token = auth.accessToken();

  // Sin access en memoria pero con refresh guardado: renovar antes de enviar.
  if (!token && auth.hasRefreshToken()) {
    return auth.refreshAccess().pipe(
      catchError((e) => {
        auth.expire();
        return throwError(() => e);
      }),
      switchMap((t) => next(withBearer(req, t))),
    );
  }

  return next(token ? withBearer(req, token) : req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) return throwError(() => err);
      if (!auth.hasRefreshToken()) {
        auth.expire();
        return throwError(() => err);
      }
      return auth.refreshAccess().pipe(
        catchError(() => {
          auth.expire();
          return throwError(() => err);
        }),
        switchMap((fresh) =>
          next(withBearer(req, fresh)).pipe(
            catchError((retryErr: unknown) => {
              if (retryErr instanceof HttpErrorResponse && retryErr.status === 401) auth.expire();
              return throwError(() => retryErr);
            }),
          ),
        ),
      );
    }),
  );
};
