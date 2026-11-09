import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import localeEs from '@angular/common/locales/es';
import {
  ApplicationConfig,
  inject,
  LOCALE_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { prefersReducedMotion } from './core/services/motion';
import { mockApiInterceptor } from './mocks/mock-api.interceptor';

registerLocaleData(localeEs);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'es' },
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
      // Transiciones de ruta (View Transitions API); desactivadas con movimiento reducido.
      ...(prefersReducedMotion() ? [] : [withViewTransitions({ skipInitialTransition: true })]),
    ),
    provideHttpClient(
      withFetch(),
      // El de autenticación va primero: añade el Bearer y gestiona el refresco ante 401,
      // también cuando responden los mocks.
      withInterceptors(environment.useMocks ? [authInterceptor, mockApiInterceptor] : [authInterceptor]),
    ),
    // Restaura la sesión (refresh guardado → access en memoria) antes de evaluar los guards.
    provideAppInitializer(() => inject(AuthService).restore()),
  ],
};
