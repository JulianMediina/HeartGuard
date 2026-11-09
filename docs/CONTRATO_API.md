# Contrato de integración HeartGuard (backend Django/DRF ↔ ML ↔ frontend Angular)

Documento de coordinación entre los tres frentes. Si un agente necesita cambiarlo, lo amplía
(campos nuevos opcionales) pero no rompe lo existente.

## Entorno local
- MySQL 8.4 portátil en `.local/` (ignorado por git), `127.0.0.1:3306`.
  Base `heartguarddb`, usuario `heartguard` / `heartguard_local` (también tiene permisos sobre `test_heartguarddb`).
  Arranque: `.local\mysql\bin\mysqld --defaults-file=.local\my.ini --console`.
- Python: `.venv` en la raíz (Django 5.1, DRF, simplejwt, cors-headers, drf-spectacular, django-filter,
  mysqlclient, python-dotenv, pytest-django, ruff, torch CPU y `heart_nn` editable desde
  `../heart-disease-prediction-neural-network`).
- Django en `http://localhost:8000`, Angular en `http://localhost:4200` (proxy `/api` → 8000).
- La app Django conserva la etiqueta `HeartGuard` y las tablas `heartguard_*` (los datos cargados de `backup.sql` deben seguir funcionando).

## Autenticación
JWT (simplejwt). Cabecera `Authorization: Bearer <access>`. Roles: `medico`, `paciente`, `admin` (is_staff).

| Método | Ruta | Cuerpo / respuesta |
|---|---|---|
| POST | `/api/v1/auth/login` | `{username, password}` → `{access, refresh, user}` |
| POST | `/api/v1/auth/refresh` | `{refresh}` → `{access}` |
| POST | `/api/v1/auth/logout` | `{refresh}` → 205 (blacklist) |
| GET | `/api/v1/auth/me` | `user` |
| POST | `/api/v1/auth/change-password` | `{old_password, new_password}` → 204 |
| POST | `/api/v1/auth/register` | registro de usuario (mismas reglas de negocio que `registrar_usuario` original) |

`user` = `{id, username, email, role, profile_id, nombres, apellidos}`.

## Recursos (paginación DRF: `{count, next, previous, results}`, `?page=`, `?page_size=`)

| Método | Ruta | Rol | Notas |
|---|---|---|---|
| GET/PATCH | `/api/v1/medicos/me` | medico | perfil |
| GET | `/api/v1/pacientes` | medico, admin | `?search=` (nombre/apellido), `?documento=` (filtrar por cédula), `?riesgo=bajo|moderado|alto`, `?ordering=` |
| POST | `/api/v1/pacientes` | medico, admin | crea paciente (+ usuario) |
| GET/PATCH | `/api/v1/pacientes/{id}` | medico, admin | detalle |
| GET/PATCH | `/api/v1/pacientes/me` | paciente | perfil / configuración propia |
| GET | `/api/v1/informes` | medico (todos), paciente (solo propios) | `?paciente=`, `?riesgo=`, `?desde=`, `?hasta=` |
| POST | `/api/v1/informes` | medico | `{documento, 13 variables, observaciones?, output?}` → crea y **predice automáticamente** |
| GET/PATCH | `/api/v1/informes/{id}` | medico; paciente solo lectura del propio | PATCH: `observaciones`, `output` (diagnóstico confirmado) |
| GET/POST | `/api/v1/pacientes/{id}/historial` | medico | `{fecha, observacion}` |
| GET | `/api/v1/notificaciones` | paciente (propias), medico (enviadas/todas) | |
| POST | `/api/v1/notificaciones` | medico | `{paciente_id, mensaje}` → guarda y envía email (backend de consola en local) |
| POST | `/api/v1/notificaciones/automaticas` | medico, admin | alerta a pacientes con último informe de riesgo alto; devuelve `{enviadas}` |
| GET | `/api/v1/dashboard/medico` | medico | `{total_pacientes, total_informes, alto_riesgo, distribucion_riesgo:{bajo,moderado,alto}, informes_por_mes:[{mes,total}], ultimos_informes:[informe resumido], notificaciones_recientes}` |
| GET | `/api/v1/dashboard/paciente` | paciente | `{paciente, ultimo_informe, evolucion:[{fecha, probabilidad}], notificaciones_recientes}` |
| GET | `/api/v1/analisis` | medico | agregados para la vista de análisis: distribución por riesgo, por sexo, por edad (rangos), por tipo de dolor (`cp`), medias de variables por clase |

### Informe (respuesta)
`{id, paciente:{id, nombres, apellidos, numero_documento}, medico:{id, nombres, apellidos}|null, fecha,
  age, sex, cp, trtbps, chol, fbs, restecg, thalachh, exng, oldpeak, slp, caa, thall,
  output|null, observaciones, probabilidad, prediccion, nivel_riesgo, modelo_version}`
`nivel_riesgo`: `bajo` (< 0.33), `moderado` (< 0.66), `alto` (≥ 0.66). `probabilidad` = P(enfermedad cardíaca).

## Herramienta de IA (servicio ML)
| Método | Ruta | Rol | Notas |
|---|---|---|---|
| POST | `/api/v1/ml/prediccion` | medico | 13 variables → `{probabilidad, prediccion, nivel_riesgo, modelo_version}` sin guardar |
| GET | `/api/v1/ml/modelo` | medico, admin | `{version, entrenado_en, threshold, metrics, features, history, nota_etiqueta}` |
| GET | `/api/v1/ml/features` | autenticado | lista FEATURES de `heart_nn.features` (etiquetas en español) |
| POST | `/api/v1/ml/reentrenar` | admin (y medico si el original lo permitía) | lanza reentrenamiento con informes con `output` confirmado; devuelve `{version, metrics, promovido}` |

Interfaz Python que expone el agente ML (`HeartGuard/ml/service.py`) y consume el backend:
```python
predict(features: dict) -> {"probabilidad": float, "prediccion": 0|1, "nivel_riesgo": str, "modelo_version": str}
predict_many(list[dict]) -> list[...]
model_info() -> dict      # lo que devuelve GET /api/v1/ml/modelo
retrain(informes_qs) -> {"version": str, "metrics": dict, "promovido": bool}
```

## Documentación
OpenAPI con drf-spectacular: `/api/schema/`, Swagger `/api/docs/`.
