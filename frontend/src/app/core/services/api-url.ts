import { InjectionToken } from '@angular/core';

import { environment } from '../../../environments/environment';

/** URL base de la API (`/api`; en desarrollo el proxy la redirige a Django en :8000). */
export const API_URL = new InjectionToken<string>('API_URL', {
  providedIn: 'root',
  factory: () => environment.apiBaseUrl.replace(/\/$/, ''),
});
