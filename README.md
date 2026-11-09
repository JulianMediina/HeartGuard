# HeartGuard

Sistema de gestión médica para el seguimiento del riesgo cardíaco. Lo usan dos roles, **médicos** y **pacientes**, además de los **administradores**. Gestiona pacientes, informes clínicos, historial médico y notificaciones o alertas por correo. Incluye una **herramienta de IA** (red neuronal) que estima la probabilidad de enfermedad cardíaca de cada informe como apoyo a la decisión del médico, sin reemplazar su criterio.

## Arquitectura

```
┌──────────────────────┐   /api (proxy)   ┌────────────────────────────────┐      ┌──────────────┐
│ frontend/ (Angular)  │ ───────────────▶ │ Django 5.1 + DRF (API REST v1) │ ───▶ │ MySQL 8      │
│ http://localhost:4200│   JWT Bearer     │ http://localhost:8000          │      │ heartguarddb │
└──────────────────────┘                  │  HeartGuard/api  → endpoints   │      └──────────────┘
                                          │  HeartGuard/ml   → servicio IA │
                                          │  (heart_nn + artefactos)       │
                                          └────────────────────────────────┘
```

| Carpeta | Contenido |
|---|---|
| `HeartGuard/models.py` | Modelos `Medico`, `Paciente`, `Informe` (13 variables clínicas, diagnóstico `output` y resultado de la IA), `Historial` y `Notificacion`. Se conservan la etiqueta de app `HeartGuard` y las tablas `heartguard_*`. |
| `HeartGuard/api/` | API REST: serializers, vistas, permisos por rol, filtros, servicios (alertas y predicción). |
| `HeartGuard/ml/` | Servicio de IA (`predict`, `predict_many`, `model_info`, `retrain`) y registro versionado de modelos. Ver `HeartGuard/ml/README.md`. |
| `HeartGuard/management/commands/` | Comandos de gestión (usuarios demo, predicción masiva, reentrenamiento y cargas CSV). |
| `HeartGuard/tests/` | Pruebas del backend (pytest-django). |
| `frontend/` | Aplicación Angular. |
| `docs/CONTRATO_API.md` | Contrato de integración entre backend, servicio de IA y frontend. |

Seguridad: autenticación JWT (access de 30 min y refresh rotativo con lista negra), permisos por rol y por objeto (un paciente solo accede a sus propios datos), CORS limitado al frontend y secretos en variables de entorno (`.env`, nunca en el código).

## Puesta en marcha local (Windows)

### 1. Base de datos: MySQL portátil

El MySQL 8.4 portátil vive en `.local/`, una carpeta que git ignora. Para arrancarlo, en una terminal aparte:

```powershell
.local\mysql\bin\mysqld --defaults-file=.local\my.ini --console
```

Queda escuchando en `127.0.0.1:3306`, con la base `heartguarddb` y el usuario `heartguard` / `heartguard_local`. Ese usuario también tiene permisos sobre `test_heartguarddb`, la base que usan las pruebas. Si la base no existe, créala y carga los datos de ejemplo:

```powershell
.local\mysql\bin\mysql -uroot -e "CREATE DATABASE heartguarddb CHARACTER SET utf8mb4; CREATE USER IF NOT EXISTS 'heartguard'@'localhost' IDENTIFIED BY 'heartguard_local'; GRANT ALL ON heartguarddb.* TO 'heartguard'@'localhost'; GRANT ALL ON test_heartguarddb.* TO 'heartguard'@'localhost';"
.local\mysql\bin\mysql -uheartguard -pheartguard_local heartguarddb < backup.sql
```

### 2. Backend (Django)

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env            # edite DJANGO_SECRET_KEY y, si hace falta, DB_*
python manage.py migrate
```

Si cargó `backup.sql`, prepare los datos heredados **una sola vez** con estos pasos explícitos. Se dejaron como comandos y no como migración porque modifican datos y en una base real serían destructivos:

```powershell
python manage.py bloquear_passwords_legado --dry-run   # cuántas cuentas se bloquearían
python manage.py bloquear_passwords_legado             # inutiliza las contraseñas compartidas "password123"
python manage.py crear_usuarios_demo                   # solo local (DEBUG=True): contraseñas conocidas
python manage.py sanear_informes_legado --dry-run      # revisa qué se va a corregir
python manage.py sanear_informes_legado                # corrige la semántica de `output` y recalcula predicciones
python manage.py predecir_informes                     # predice los informes que aún no tengan predicción
python manage.py runserver 8000
```

`sanear_informes_legado` (ver `HeartGuard/ml/README.md` y `docs/AUDIT.md`) hace dos correcciones. Primero, invierte el `output` de las 303 filas que vienen del CSV de Kaggle, que usa la etiqueta al revés. Segundo, anula el `output` de los informes sintéticos, porque ahí lo había escrito el modelo original y no un médico. Solo se marca como hecho cuando el informe tiene `modelo_version`, así que **ejecútelo antes de `predecir_informes`**.

- API: `http://localhost:8000/api/v1/`
- Documentación OpenAPI (Swagger): `http://localhost:8000/api/docs/` (esquema en `/api/schema/`)
- Admin de Django: `http://localhost:8000/admin/`

En local los correos (alertas) **se imprimen en la consola** del servidor (`EMAIL_BACKEND` de consola). Para enviarlos de verdad, configure `EMAIL_*` en `.env` con un servidor SMTP.

### 3. Frontend (Angular)

```powershell
cd frontend
npm install
npm start        # http://localhost:4200 (proxy /api -> http://localhost:8000)
```

### Usuarios de demostración

`python manage.py crear_usuarios_demo` las asigna (y las imprime) **solo cuando DEBUG=True**:

| Rol | Usuario | Contraseña |
|---|---|---|
| Médico | `medico@test.com` | `Medico123!` |
| Administrador | `admin` | `Admin123!` |
| Paciente | `felipe.luque4182@example.com` (documento 4742196300) | `Paciente123!` |

Otro paciente de demostración: `python manage.py crear_usuarios_demo --documento <cédula>`. Las demás cuentas importadas quedan bloqueadas por `bloquear_passwords_legado` y no pueden iniciar sesión.

### Datos de ejemplo

`backup.sql` (10 000 pacientes y 10 001 informes), `pacientes_data.csv`, `heartConexion.csv` y `Material Red neuronal.zip` son **datos sintéticos o de ejemplo**: personas ficticias y variables clínicas generadas a partir del dataset público Cleveland/Kaggle. No contienen datos reales de pacientes. El dataset base del modelo está en `HeartGuard/ml/data/heart.csv`.

## Variables de entorno

La lista completa está en `.env.example`. Las principales:

| Variable | Uso |
|---|---|
| `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS` | Seguridad de Django. Sin `DJANGO_SECRET_KEY` y con DEBUG apagado, la aplicación no arranca. |
| `DB_ENGINE`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_TEST_NAME` | Conexión a MySQL. |
| `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` | Correo de alertas. |
| `CORS_ALLOWED_ORIGINS` | Orígenes del frontend (por defecto `http://localhost:4200`). |
| `JWT_ACCESS_MINUTES`, `JWT_REFRESH_DAYS` | Duración de los tokens. |
| `HEARTGUARD_MODEL_DIR` | Carpeta de artefactos del modelo (por defecto `HeartGuard/ml/artifacts`). |
| `HEARTGUARD_ALERTA_AUTOMATICA` | Si vale `True`, crear un informe de riesgo **alto** envía una alerta automática al paciente. |

## Endpoints (API v1)

El contrato completo está en `docs/CONTRATO_API.md` y el detalle interactivo en `/api/docs/`. Todas las rutas funcionan con y sin barra final. Los listados se paginan con `?page=` y `?page_size=` (máximo 200).

| Ruta | Rol | Descripción |
|---|---|---|
| `POST auth/login`, `auth/refresh`, `auth/logout` | público / autenticado | JWT: login devuelve `{access, refresh, user}`; logout pone el refresh en lista negra. |
| `GET auth/me` · `POST auth/change-password` | autenticado | Usuario actual; cambio de contraseña (mínimo 8 caracteres con número, mayúscula y minúscula). Al cambiarla se invalidan los refresh tokens existentes. |
| `POST auth/register` | público | Autorregistro de paciente. El correo es el usuario y se verifica que correo y documento no estén repetidos. |
| `GET/PATCH medicos/me` | médico | Perfil del médico. |
| `GET/POST pacientes` · `GET/PATCH pacientes/{id}` | médico, admin | Filtros: `search`, `documento`, `riesgo` (según el último informe), `registrado_desde/hasta`, `ciudad`, `departamento`, `tipo_documento`, `ordering`. Al crear un paciente también se crea su usuario. Si no se envía `password`, se genera una aleatoria que la respuesta devuelve **una sola vez** en `password_temporal`. |
| `GET/PATCH pacientes/me` | paciente | Perfil propio. |
| `GET/POST pacientes/{id}/historial` | médico (admin solo lectura) | Historial médico. |
| `GET/POST informes` · `GET/PATCH informes/{id}` | médico; paciente solo lectura de los propios | Al crearlo, el informe **se predice automáticamente**. Si sus valores están fuera del dominio del modelo, el informe se guarda igual, sin predicción, con `advertencia_ia`. Con PATCH se editan `observaciones` y `output` (diagnóstico confirmado), y queda registrado `diagnostico_confirmado_por` y `diagnostico_confirmado_en`. Filtros: `paciente`, `documento`, `riesgo`, `desde`, `hasta`, `output`, `prediccion`, `sin_diagnostico`. |
| `POST informes/{id}/predecir` | médico | Recalcula la predicción con el modelo activo. |
| `GET/POST notificaciones` · `PATCH notificaciones/{id}` | paciente (las propias, puede marcarlas como leídas); médico (todas, y las envía) | Alerta manual por `paciente_id` o `documento`: queda registrada y se envía por correo. |
| `POST notificaciones/automaticas` | médico, admin | Alerta a los pacientes cuyo último informe es de riesgo alto. Es idempotente: no repite alertas ya enviadas. |
| `POST notificaciones/marcar-todas-leidas` | paciente | Marca todas sus notificaciones como leídas. |
| `GET dashboard/medico` · `GET dashboard/paciente` | médico · paciente | Paneles de resumen. |
| `GET analisis` | médico, admin | Agregados por riesgo, sexo, edad, tipo de dolor y medias por clase (`?desde`, `?hasta`). |
| `POST ml/prediccion` · `GET ml/modelo` · `GET ml/features` · `POST ml/reentrenar` | médico / médico y admin / autenticado / admin (máximo 3 por hora) | Herramienta de IA (ver `HeartGuard/ml/README.md`). Devuelve 400 si los datos están fuera del rango del modelo, 409 si ya hay un reentrenamiento en curso y 503 si el servicio no está disponible. |

## Comandos de gestión

| Comando | Descripción |
|---|---|
| `crear_usuarios_demo [--documento X]` | Asigna contraseñas conocidas a los usuarios de demostración. Solo funciona con DEBUG=True. |
| `predecir_informes [--todos] [--batch N]` | Calcula `probabilidad`, `prediccion`, `nivel_riesgo` y `modelo_version` por lotes. |
| `reentrenar_modelo` | Reentrena el modelo con los informes que tienen diagnóstico confirmado (ver `HeartGuard/ml/README.md`). |
| `bloquear_passwords_legado [--excluir u1 u2] [--dry-run]` | Inutiliza las contraseñas de todas las cuentas, salvo las de demostración. |
| `sanear_informes_legado [--dry-run]` | Corrige el `output` de los informes heredados y recalcula sus predicciones. |
| `load_pacientes <csv>`, `load_informe <csv>` | Cargas masivas. Los usuarios nuevos se crean con contraseña inutilizable. Se eliminaron `load_user` y `encrypt_passwords`, que dejaban contraseñas por defecto. |

## Pruebas y calidad

```powershell
.venv\Scripts\python -m pytest       # usa la base MySQL test_heartguarddb
.venv\Scripts\ruff check .
```
