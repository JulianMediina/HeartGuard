# HeartGuard · Frontend (Angular)

Interfaz completa del sistema HeartGuard para médicos y pacientes, reconstruida en Angular a partir
de las plantillas Django originales (`HeartGuard/templates/html`). La predicción de riesgo con la red
neuronal es **una herramienta dentro del sistema** (Nuevo informe, Predicción rápida y Modelo IA), no
el producto.

- Angular 21.2.26 (standalone, signals, sin zone.js), Tailwind CSS 4.3.5, Vitest 4.
- Consume la API REST de Django/DRF descrita en [`docs/CONTRATO_API.md`](../docs/CONTRATO_API.md).
- Requiere Node 22.12+ (Angular 22 exigiría Node ≥ 22.22.3, por eso se fija la 21.2.26).

## Puesta en marcha

```powershell
cd frontend
npm install
npm start              # http://localhost:4200, proxy /api -> http://localhost:8000 (Django)
npm run start:mocks    # sin backend: API simulada en el navegador con datos de ejemplo
npm run build          # compilación de producción en dist/heartguard
npm test               # pruebas unitarias (Vitest)
```

Con backend real, arranque Django como indica el README raíz y ejecute
`python manage.py crear_usuarios_demo` para obtener las credenciales:

| Rol | Usuario | Contraseña |
|---|---|---|
| Médico | `medico@test.com` | `Medico123!` |
| Administrador | `admin` | `Admin123!` |
| Paciente | `felipe.luque4182@example.com` | `Paciente123!` |

En modo mocks las cuentas son las mismas para médico y administrador, y el paciente es
`paciente@test.com` / `Paciente123!`. La pantalla de login ofrece botones para rellenarlas.

## Pantallas (equivalencia con el sistema original)

| Plantilla original | Ruta Angular | Notas |
|---|---|---|
| `login.html` | `/login` | Redirige por rol (médico → `/medico`, paciente → `/paciente`, admin → `/medico/modelo`). |
| `registrar_usuario.html` | `/registro` | Alta de paciente con las mismas reglas (correo único, documento único, contraseña segura). |
| `cambiar_contrasena.html` / `configuracion_paciente.html` | `/medico/configuracion`, `/paciente/configuracion` | Requisitos de contraseña del original con comprobación en vivo. |
| `medico_dashboard.html` | `/medico` | El marco con iframe se sustituye por un *shell* con menú «rack» y un panel de monitorización real. |
| `historial_medico.html` | `/medico/pacientes` | Búsqueda, filtro por riesgo, orden y paginación. |
| `filtrar_por_cedula` | `/medico/cedula?cedula=…` | Datos del paciente y tabla completa de informes (las 16 columnas originales + IA). |
| `detalle_paciente.html` | `/medico/pacientes/:id` | Ficha, evolución del riesgo, informes, historial clínico, notificaciones y edición. |
| `visualizacion_analisis.html` | `/medico/analisis` | Filtro día/mes/año, agregados de `/analisis` y listado de pacientes (50 por página). |
| `notificaciones.html` | `/medico/notificaciones` | Alerta personalizada por cédula, alertas automáticas y registro de envíos. |
| `enviar_alerta.html` | `/medico/notificaciones/enviar` | Selección de paciente con buscador accesible (combobox). |
| `perfil_medico.html` | `/medico/perfil` | Tarjeta de perfil y modal «Actualizar información». |
| `paciente_dashboard.html` | `/paciente` | Último resultado con medidor, evolución y avisos. |
| `visualizacion_paciente.html` | `/paciente/resultados` | Historial de resultados con filtro por fecha. |
| `detalles_resultados.html` | `/paciente/resultados/:id` | Resultado completo con recomendación (sólo lectura). |
| `perfil_paciente.html` | `/paciente/perfil` | Datos personales y modal de actualización. |
| — (nuevo) | `/paciente/notificaciones` | Avisos del médico, marcar como leídos. |
| — (herramienta IA) | `/medico/informes/nuevo` | Documento + 13 variables → se guarda y se predice automáticamente. |
| — (herramienta IA) | `/medico/prediccion` | Predicción rápida sin guardar. |
| — (herramienta IA) | `/medico/modelo` | Métricas, curvas de pérdida, matriz de confusión, ROC, versiones; reentrenar (sólo admin). |
| — | `/medico/informes`, `/medico/informes/:id`, `/medico/pacientes/nuevo` | Listado/detalle de informes (diagnóstico confirmado, volver a predecir) y alta de pacientes. |

## Arquitectura

```
src/app/
  core/
    auth/        AuthService, authInterceptor, authGuard / roleGuard / guestGuard
    models/      tipos del contrato de la API
    services/    servicios por recurso (api.ts), errores, loadable, tema, avisos
  layout/        shell del médico (rack lateral), shell del paciente, traza ECG, marca
  shared/        componentes (medidor de riesgo, canales de monitor, gráficos SVG, tablas,
                 paginación, modal…) y el formulario por pasos de las 13 variables
  pages/         auth, medico, paciente, comun, ia
  mocks/         API simulada completa (interceptor + base de datos en memoria)
  testing/       utilidades de pruebas
```

### Autenticación

- **Access token sólo en memoria**; **refresh token en `sessionStorage`** (no `localStorage`): sobrevive
  a recargar la pestaña pero se borra al cerrarla y no se comparte entre pestañas, lo que reduce la
  exposición ante XSS. Decisión tomada a petición de la auditoría.
- Al arrancar (`provideAppInitializer`) se restaura la sesión: refresh → access → `/auth/me`.
- El interceptor añade `Authorization: Bearer …`; ante un **401** renueva el access una sola vez
  (compartido entre peticiones concurrentes, con rotación de refresh) y repite la petición. Si la
  renovación falla, cierra la sesión y vuelve al login con `returnUrl`. Un 429/5xx al restaurar no
  borra el refresh guardado.
- `logout` invalida el refresh en el servidor (blacklist).
- Guards: `authGuard`, `roleGuard('medico' | 'paciente' | 'admin')` y `guestGuard` (login/registro).

### Formularios y errores

Formularios reactivos con las reglas del backend (obligatorios, longitudes, correo, contraseña con
mayúscula, minúscula, número y 8+ caracteres, fechas no futuras). Los errores **400 de DRF** se
asignan a cada campo (`applyServerErrors`) y los generales se muestran como aviso.

En la herramienta de IA los límites de las variables vienen de `GET /ml/features` (dominio del
modelo). «Predicción rápida» los exige; «Nuevo informe» admite los límites clínicos del backend y, si
un valor queda fuera del dominio del modelo, avisa de que el informe se guardará sin predicción
(el backend responde `advertencia_ia`). El **umbral de decisión** del modelo (≈ 0,345) y las
**bandas de riesgo** (0,33 / 0,66) se muestran como conceptos distintos.

## Diseño

Estilo «monitor médico»: oscuro por defecto (modo claro disponible y recordado), turquesa original de
HeartGuard para la interfaz (`#4D869C #7AB2B2 #CDE8E5 #EEF7FF`, alertas `#D9534F #C9302C #FFD1D1`) y la
paleta *flare* de seaborn sólo para gráficos y la escala de riesgo. Chakra Petch para la interfaz y
JetBrains Mono para las cifras vitales. Paneles con bisel, métricas como canales de monitor con traza,
trazas ECG animadas, rejilla y líneas de barrido tenues, borde de alarma parpadeante para riesgo alto.
Transiciones de ruta con View Transitions, entradas escalonadas, cifras que cuentan y gráficos que se
dibujan; **todo se desactiva con `prefers-reduced-motion`**. Accesible (etiquetas, foco visible,
`aria-live` en resultados, tablas con `caption`, el riesgo nunca se comunica sólo con color) y usable
desde 360 px.

Reutilizado (copiado y adaptado) de la app anterior de la red neuronal: tokens de `styles.css`, fuentes,
`risk-gauge`, `count-up` (versión corregida), `line-chart`, `confusion-matrix`, `comparison-bars`,
`class-distribution`, `risk-badge`, `kpi-card`, `error-banner`, `skeleton`, `ecg-line`, `loadable`,
`motion`, `theme.service` y el formulario por pasos con la sincronización deslizador ↔ número.

## Mocks

`environment.useMocks` (configuración `mocks`, `npm run start:mocks`) registra un interceptor que
simula todos los endpoints del contrato con una base de datos en memoria determinista: JWT con
caducidad y refresh, permisos por rol (403), validación 400 por campo, paginación DRF, filtros
(`search`, `documento`, `riesgo`, `desde/hasta`, `registrado_desde/hasta`, `sin_diagnostico`…),
contraseña temporal en el alta, informes fuera de dominio, alertas automáticas, reentrenamiento
(409 si ya hay uno en curso).

## Pruebas

`npm test` (Vitest): servicio de autenticación, interceptor (Bearer, refresco único ante 401 con
peticiones concurrentes, cierre de sesión si falla), guards, mapeo de errores 400, normalización de
`/analisis`, API simulada, componentes (incluida la regresión de `count-up`), formulario de 13
variables (regresión de sincronización deslizador ↔ número, límites desde `/ml/features`) y páginas
clave (login por rol, registro, cambio de contraseña, listado de pacientes, nuevo informe, alertas,
Modelo IA con 409, panel del paciente, contraseña temporal, informe fuera de dominio).
