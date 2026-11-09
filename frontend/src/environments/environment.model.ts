export interface Environment {
  production: boolean;
  /** URL base de la API (relativa: en desarrollo el proxy redirige /api → :8000). */
  apiBaseUrl: string;
  /** Si es true, las peticiones se responden con los fixtures de `app/mocks`. */
  useMocks: boolean;
}
