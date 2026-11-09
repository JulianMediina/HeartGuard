import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { Role } from '../models/api.models';
import { AuthService, homeFor } from './auth.service';

/** Exige sesión iniciada; si no, al login conservando la ruta pedida. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isAuthenticated()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Exige uno de los roles indicados; si el rol no corresponde, a la pantalla de inicio de su rol. */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const role = auth.role();
    if (!role) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    if (roles.includes(role)) return true;
    return router.createUrlTree([homeFor(role)]);
  };
}

/** Las pantallas públicas (login, registro) redirigen al inicio si ya hay sesión. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).createUrlTree([homeFor(auth.role())]) : true;
};
