# Auditoría de HeartGuard (versión original)

Alcance: el commit `97e755b` de la rama original (Django 5.1 + plantillas, MySQL, red neuronal
PyTorch), sus datos (`backup.sql`, CSV, `Material Red neuronal.zip`) y sus artefactos de modelo.
Al final (§8) se revisa el estado del trabajo de modernización en la rama
`modernizacion/angular-drf` (backend DRF en `HeartGuard/api/`, frontend Angular en
`frontend/`, servicio de IA en `HeartGuard/ml/`) y se marca cada hallazgo como
**Resuelto**, **Parcial** o **Pendiente**.

Las referencias `archivo:línea` apuntan a la versión original (`git show 97e755b:<archivo>`).
Las comprobaciones sobre datos se hicieron contra la base `heartguarddb` restaurada de
`backup.sql` (10 002 usuarios, 10 000 pacientes, 10 001 informes).

## Resumen ejecutivo

| Severidad | Nº | Resueltos | Parciales | Pendientes | N/A |
|---|---|---|---|---|---|
| Crítica | 7 | 5 | 1 | 1 | 0 |
| Alta | 11 | 7 | 2 | 2 | 0 |
| Media | 26 | 10 | 5 | 11 | 0 |
| Baja / Info | 11 | 7 | 1 | 2 | 1 |
| **Total** | **55** | **29** | **9** | **16** | **1** |

Incluye 6 hallazgos nuevos (NEW-01…06) detectados al revisar la modernización.

Los hallazgos más graves:

1. **Secretos publicados** (SEC-01, SEC-02): contraseña de aplicación de Gmail y `SECRET_KEY`
   en `settings.py`, en un repositorio público. Deben **revocarse/rotarse**: quitarlos del código no
   los borra del historial de git.
2. **Contraseña por defecto conocida en 10 000 cuentas** (SEC-11): `load_user` crea los pacientes
   con `password123` (en texto plano en `backup.sql`) y `encrypt_passwords` la convierte en su
   hash, así que todas las cuentas importadas tienen la misma contraseña conocida. Sigue vigente
   en los datos cargados.
3. **Datos clínicos accesibles sin autenticación** (SEC-05, SEC-06, SEC-07): historial por
   cédula, listado de pacientes y detalle por id sin `login_required` (en un caso por un
   decorador escrito sin `@` y una vista duplicada que sustituye a la protegida).
4. **El modelo predecía al revés** (ML-01): se entrenó con la columna `output` de Kaggle, que
   está invertida (output=1 ≈ *sin* enfermedad), mientras que la app la mostraba como
   "Enfermedad Presente". Un paciente de alto riesgo obtenía 0,008 y uno de bajo riesgo 0,93.
5. **Reentrenamiento y correos masivos en cada guardado** (ML-02, ML-04, SEC-12): importar
   `signals.py` entrenaba un modelo nuevo y sobrescribía los artefactos al arrancar; cada
   `Informe` guardado reentrenaba en la petición y enviaba un correo a *todos* los pacientes con
   `output=1` (con la etiqueta invertida, a los pacientes sanos).
6. **Las etiquetas de la base de datos no son diagnósticos** (ML-05): el `output` de 9 698
   informes lo escribió el propio modelo (invertido); reentrenar con ellos es entrenar con sus
   propias predicciones erróneas.

## Leyenda

* **Severidad**: Crítica (explotable/daño grave ya), Alta, Media, Baja, Info.
* **Estado** (a fecha de esta revisión, en la rama de modernización): Resuelto, Parcial,
  Pendiente. "Parcial" indica que el código está corregido pero queda una acción (p. ej. rotar
  un secreto) o una parte.

---

## 1. Seguridad

### SEC-01 · Contraseña de aplicación de Gmail en el repositorio
* **Severidad**: Crítica
* **Ubicación**: `HeartGuard/settings.py:137-143` (`EMAIL_HOST_USER = 'heartguardapp@gmail.com'`, `EMAIL_HOST_PASSWORD = '<contraseña de aplicación en claro>'`)
* **Descripción**: credencial SMTP real en texto plano en un repositorio público.
* **Impacto**: cualquiera puede enviar correo como `heartguardapp@gmail.com` (phishing a
  pacientes con la identidad del servicio, spam, bloqueo de la cuenta).
* **Recomendación**: **revocar la contraseña de aplicación** en la cuenta de Google *ya*,
  generar otra y leerla de variables de entorno. Opcional: purgar el historial
  (`git filter-repo`) — no sustituye a la revocación.
* **Estado**: **Parcial** — el código lee el correo de `.env` (`.env.example` con backend de
  consola); falta la revocación, que es manual.

### SEC-02 · `SECRET_KEY` fija y publicada
* **Severidad**: Alta
* **Ubicación**: `HeartGuard/settings.py:24`
* **Descripción/Impacto**: con la clave se pueden falsificar cookies de sesión firmadas, tokens
  de restablecimiento de contraseña y, ahora, JWT (simplejwt firma con `SECRET_KEY`).
* **Recomendación**: generar una clave nueva por entorno, nunca reutilizar la publicada.
* **Estado**: **Parcial** — se lee de `DJANGO_SECRET_KEY` y falla en producción si falta; la clave
  antigua sigue en el historial y no debe usarse en ningún despliegue.

### SEC-03 · `DEBUG = True` y `ALLOWED_HOSTS = []`
* **Severidad**: Alta · **Ubicación**: `settings.py:27,29`
* **Impacto**: páginas de error con trazas, variables y configuración; no apto para despliegue.
* **Recomendación**: `DEBUG` desde el entorno, `False` por defecto. · **Estado**: **Resuelto**.

### SEC-04 · Base de datos con `root`/`root`
* **Severidad**: Media · **Ubicación**: `settings.py:79-88`
* **Impacto**: la app opera con privilegios totales sobre el servidor MySQL; credencial trivial.
* **Recomendación**: usuario dedicado con permisos solo sobre su base, credenciales en `.env`.
* **Estado**: **Resuelto** (usuario `heartguard`, variables `DB_*`).

### SEC-05 · Historial clínico por cédula sin autenticación
* **Severidad**: Crítica · **Ubicación**: `views.py:389-410` (`filtrar_por_cedula`), `urls.py:43`
* **Descripción**: la vista no tiene `login_required` ni comprobación de rol; devuelve todos los
  informes de un paciente a partir de su número de documento.
* **Impacto**: cualquier anónimo que conozca (o enumere) una cédula obtiene datos de salud.
* **Recomendación**: autenticación + rol médico; registrar accesos.
* **Estado**: **Resuelto** — vistas eliminadas; `GET /api/v1/pacientes?documento=` exige rol
  médico/admin (`EsMedicoOAdmin`).

### SEC-06 · Listado de todos los pacientes accesible sin sesión (decorador sin `@`)
* **Severidad**: Crítica · **Ubicación**: `views.py:312-342` (segunda `visualizacion_analisis`)
* **Descripción**: la línea 312 dice `login_required` (expresión suelta, no decorador) y esta
  segunda definición **sustituye** a la protegida de `views.py:181-184`. El listado pagina a todos
  los pacientes con su usuario.
* **Impacto**: exposición de datos personales de todos los pacientes a usuarios anónimos.
* **Estado**: **Resuelto** (API con permisos por rol; ver BUG-01 para las definiciones duplicadas).

### SEC-07 · IDOR en `detalle_paciente` y `detalles_resultados`
* **Severidad**: Alta · **Ubicación**: `views.py:215-217`, `views.py:113-116`
* **Descripción**: obtienen el objeto por id sin autenticación ni comprobación de propiedad.
  (La segunda además queda anulada por otra definición, BUG-01.)
* **Impacto**: enumeración de pacientes e informes por id.
* **Estado**: **Resuelto** — `InformeViewSet.get_queryset` limita al paciente sus propios
  informes; pacientes y detalle solo para médico/admin.

### SEC-08 · Un paciente ve los informes de todos
* **Severidad**: Alta · **Ubicación**: `views.py:118-132` (`visualizacion_paciente`: `Informe.objects.all()`)
* **Impacto**: cualquier paciente autenticado ve los resultados clínicos de los 10 000 pacientes.
* **Estado**: **Resuelto** (filtrado por `paciente=request.user.paciente`).

### SEC-09 · Cualquier usuario puede enviar correos "oficiales" a cualquier paciente
* **Severidad**: Alta · **Ubicación**: `views.py:350-387` (`enviar_alerta_personalizada`, solo `login_required`)
* **Impacto**: un paciente puede mandar mensajes arbitrarios desde la cuenta del servicio a otro
  paciente conociendo su cédula (phishing, suplantación del médico).
* **Estado**: **Resuelto** — `POST /notificaciones` exige rol médico y registra el médico emisor.

### SEC-10 · Vistas sin `login_required` o sin control de rol
* **Severidad**: Media · **Ubicación**: `views.py:101-106` (dashboards), `135-137`
  (`configuracion_paciente`), `345-348` (segunda `notificaciones` sin `medico_required`: un
  paciente ve el listado de pacientes), `urls.py:29` (`medico_required` sin `login_required`).
* **Estado**: **Resuelto** (permisos DRF por defecto autenticados + permisos por rol).

### SEC-11 · Contraseña por defecto `password123` en todas las cuentas importadas
* **Severidad**: Crítica · **Ubicación**: `management/commands/load_user.py:13,33`;
  `management/commands/encrypt_passwords.py:12-15`; `backup.sql`
* **Descripción**: `load_user` asigna `password="password123"` directamente al campo (con
  `bulk_create`, sin `set_password`): queda en **texto plano**. `encrypt_passwords` "cifra" ese
  texto, es decir, fija `password123` como contraseña real. En `backup.sql` hay 7 484 cuentas con
  `password123` en claro y 2 518 con hash; se verificó con `check_password` que los hashes de
  pacientes también corresponden a `password123`.
* **Impacto**: acceso a cualquier cuenta de paciente con un usuario predecible (su correo).
  Los datos cargados en la nueva versión siguen teniendo estas credenciales.
* **Recomendación**: en la carga de datos/migración, `set_unusable_password()` para todas las
  cuentas importadas (o contraseñas aleatorias + restablecimiento por correo); eliminar
  `load_user`/`encrypt_passwords` o reescribirlos con `set_password(secrets.token_urlsafe())`.
* **Estado**: **Pendiente** (Agente A). `crear_usuarios_demo` solo cambia 3 cuentas.

### SEC-12 · Correos masivos en cada guardado de un informe
* **Severidad**: Alta · **Ubicación**: `HeartGuard/signals.py:21-44`
* **Descripción**: el `post_save` de `Informe` crea una notificación y envía un correo a **todos**
  los pacientes con algún informe `output=1`, en cada guardado, de forma síncrona y con
  `fail_silently=False`. Con la etiqueta invertida (ML-01), los destinatarios eran
  mayoritariamente pacientes **sin** riesgo.
* **Impacto**: spam y alarma injustificada a miles de pacientes; una caída del SMTP rompe la
  creación de informes (500); duplicación indefinida de notificaciones.
* **Estado**: **Resuelto** — `signals.py` ya no registra receptores; las alertas son explícitas
  (`HeartGuard/api/services.py`, riesgo alto del modelo corregido, errores de correo capturados).

### SEC-13 · Autorregistro: validación de contraseñas y "secuestro" de cédula
* **Severidad**: Media · **Ubicación**: `views.py:48-99`
* **Descripción**: no aplica `AUTH_PASSWORD_VALIDATORS`; muestra `str(e)` de excepciones internas
  (`:97`); cualquiera puede registrarse con la cédula de otra persona y, como los informes se
  asocian por número de documento (`Informe.clean`), recibiría los informes de esa persona.
* **Recomendación**: validar contraseña; verificar identidad (alta por el médico o confirmación
  por correo antes de vincular informes); mensajes de error genéricos.
* **Estado**: **Parcial** — el serializer valida contraseña y unicidad de cédula/correo; sigue
  sin verificación de identidad.

### SEC-14 · Clickjacking: `X_FRAME_OPTIONS = 'ALLOWALL'`
* **Severidad**: Media · **Ubicación**: `settings.py:134`
* **Descripción**: valor no estándar que los navegadores ignoran: la app se puede embeber en
  cualquier sitio. · **Estado**: **Resuelto** (eliminado; `DENY` por defecto de Django).

### SEC-15 · Formularios sin token CSRF / formularios rotos
* **Severidad**: Baja · **Ubicación**: `templates/html/configuracion_paciente.html:27` (POST a
  `/cambiar_contraseña`, ruta inexistente, sin `{% csrf_token %}`), `perfil_paciente.html:72`
* **Descripción**: el middleware CSRF estaba activo, así que no era explotable, pero los
  formularios no funcionaban (403/404). · **Estado**: **Resuelto** (plantillas sustituidas por
  la SPA; la API usa JWT en cabecera, sin cookies de sesión).

### SEC-16 · Login sin limitación de intentos; sesión abierta a usuarios sin rol
* **Severidad**: Media · **Ubicación**: `views.py:20-45` (hace `login()` antes de comprobar el rol)
* **Estado**: **Resuelto** (throttling `auth` 20/min; usuarios sin rol no acceden a la API).

### SEC-17 · Contraseña inicial = número de documento
* **Severidad**: Alta · **Ubicación**: `forms.py:23` (primer `PacienteForm`)
* **Impacto**: la contraseña de un paciente es un dato que conocen terceros (cédula).
* **Estado**: **Pendiente** — el backend nuevo mantiene la regla
  (`HeartGuard/api/serializers.py:159-172`: si no se da contraseña se usa `numero_documento`).
  Recomendación: contraseña aleatoria + enlace de activación, o `set_unusable_password`.

### SEC-18 · Deserialización insegura de artefactos
* **Severidad**: Media · **Ubicación**: `utils/retrain_model.py:28-34`,
  `management/commands/load_informe.py:38,42` (`torch.load` sin `weights_only`, `pickle`)
* **Impacto**: un `.pth`/`.pkl` manipulado ejecuta código al cargarse.
* **Estado**: **Resuelto** — `heart_nn` usa `torch.load(weights_only=True)`; el preprocesador
  sigue siendo `joblib` (pickle): los artefactos solo los escribe el servidor
  (`HeartGuard/ml/artifacts`), nunca se aceptan subidos por usuarios.

### SEC-19 · Subida de archivos
* **Severidad**: Info · No hay `FileField`/`ImageField` ni uso de `request.FILES` en el original ni
  en la versión nueva. Sin hallazgos. · **Estado**: N/A.

## 2. Privacidad y datos

### PRIV-01 · Volcado completo de la base de datos en el repositorio
* **Severidad**: Alta · **Ubicación**: `backup.sql` (4,2 MB)
* **Descripción**: 10 002 usuarios (correos, hashes de `admin` y del médico, 7 484 contraseñas en
  claro), 10 000 pacientes (nombre, documento, dirección, teléfono, fecha de nacimiento) y 10 001
  informes clínicos.
* **¿Son datos reales?** Todo indica que son **sintéticos**: el 100 % de los correos son
  `@example.com`; direcciones generadas con Faker `es_ES` (Huelva, Zamora…) combinadas con
  departamentos colombianos; teléfonos `+34`; el médico vive en "calle falsa 123" y nació en
  2002; las variables clínicas salen de un generador SDV (PRIV-02).
* **Impacto**: aun siendo sintéticos, publica credenciales válidas (SEC-11) y normaliza subir
  volcados de datos de salud; si alguna vez se regenera con datos reales, quedarían expuestos.
* **Recomendación**: retirar `backup.sql` del repo; sustituirlo por fixtures/semillas de demo
  generadas por script y documentadas como ficticias, sin contraseñas.
* **Estado**: **Pendiente**.

### PRIV-02 · CSV de pacientes e informes en el repositorio
* **Severidad**: Media · **Ubicación**: `pacientes_data.csv`, `heartConexion.csv`
* **Descripción**: mismo origen sintético. `heartConexion.csv` (10 303 filas) se generó con SDV
  `GaussianCopulaSynthesizer` a partir de `heart.csv` (`Material Red neuronal.zip` →
  `SDV_Generator_Data.zip/GanSDV.py`; sus primeras filas coinciden con `output/dataGAN.csv`).
* **Recomendación**: moverlos a una carpeta `demo/` con aviso "datos ficticios" o generarlos con
  un script; no mezclarlos con datos reales. · **Estado**: **Pendiente**.

### PRIV-03 · La predicción se presentaba como diagnóstico
* **Severidad**: Media · **Ubicación**: `templates/html/historial_medico.html:78`
  (`get_output_display` → "Enfermedad Presente/Ausente" sobre la salida del modelo)
* **Impacto**: el paciente veía como diagnóstico una predicción (invertida, ML-01).
* **Recomendación**: separar predicción (probabilidad, nivel de riesgo, versión del modelo) y
  diagnóstico confirmado; aviso visible de que la herramienta no sustituye al médico.
* **Estado**: **Parcial** — el modelo de datos ya separa `probabilidad/prediccion/nivel_riesgo`
  del `output` confirmado y la API expone `nota_etiqueta`; el frontend no muestra un aviso
  médico fuera de los mocks (ver NEW-03).

## 3. Red neuronal / ML

### ML-01 · Etiqueta invertida: el modelo predecía "sin enfermedad"
* **Severidad**: Crítica · **Ubicación**: `utils/prediction_base.py:11-15`; `models.py:77`
* **Descripción**: el `heart.csv` de Kaggle tiene `output` invertido respecto a UCI Cleveland
  (los `output=1` son más jóvenes, con mayor FC máxima, menos depresión ST, menos vasos y menos
  angina; 164 casos = pacientes `num=0` de UCI). El modelo se entrenó con `output` crudo y la app
  lo mostraba con las opciones `1 = Enfermedad Presente`.
* **Evidencia** (modelo y escalador originales, `model_heart_attack.pth`/`scaler.pkl`):
  ROC-AUC 0,934 frente a `output` y **0,066** frente a `enfermedad = 1 − output`; paciente de
  perfil de alto riesgo (67 años, varón, asintomático, angina de esfuerzo, 3 vasos, FC 108):
  **0,008**; paciente de bajo riesgo (41 años, mujer, FC 172, 0 vasos): **0,93**.
* **Impacto**: cada predicción mostrada era la contraria; las alertas automáticas se enviaban a
  los pacientes sanos (SEC-12).
* **Estado**: **Resuelto** — modelo 2.0.0 de `heart_nn` entrenado con `enfermedad = 1 − output`
  (mismos pacientes: 0,85 "alto" y 0,13 "bajo"; ROC-AUC 0,92 en test). Test
  `test_semantica_enfermedad_alto_mayor_que_bajo`.

### ML-02 · Entrenamiento al importar un módulo
* **Severidad**: Crítica · **Ubicación**: `utils/prediction_base.py:11-147` (todo el script a nivel
  de módulo), importado por `utils/retrain_model.py:9`, importado por `signals.py:6`, importado
  por `apps.py` en `ready()`
* **Descripción**: cada arranque de Django (incluido `manage.py migrate`, tests, cada worker)
  entrenaba un modelo nuevo con `heart.csv` relativo al directorio de trabajo y **sobrescribía**
  `model_heart_attack.pth` y `scaler.pkl`.
* **Impacto**: modelo no reproducible que cambia en cada arranque; fallo de arranque si no existe
  `heart.csv` en el CWD; condiciones de carrera entre workers escribiendo el mismo archivo.
* **Estado**: **Resuelto** — `HeartGuard/utils/` eliminado; `HeartGuard/ml` no tiene efectos al
  importar y carga el modelo de forma perezosa.

### ML-03 · Errores metodológicos del entrenamiento original
* **Severidad**: Alta · **Ubicación**: `utils/prediction_base.py`
* **Descripción**: `StandardScaler` ajustado con todo el dataset antes de partir (`:18-19`, fuga);
  early stopping con el conjunto de test (`:66-85`) y sin validación; se guardan los pesos de la
  última época; partición no estratificada y sin semilla; fila duplicada en el CSV; Focal Loss
  aplicada a la BCE media del lote (`:54-58`); `Sigmoid` + `BCELoss`; métricas en test optimistas.
* **Estado**: **Resuelto** con el pipeline de `heart_nn` (partición train/val/test estratificada,
  preprocesador ajustado solo con train, CV 5 folds, umbral de Youden out-of-fold, mejores pesos,
  baseline logístico; ver `heart_nn` `docs/AUDIT.md`).

### ML-04 · Reentrenamiento en cada guardado de un informe
* **Severidad**: Crítica · **Ubicación**: `signals.py:8-19`, `utils/retrain_model.py:11-119`
* **Descripción**: cada `post_save` de `Informe` reentrena **dentro de la petición**: 100 épocas
  solo con los informes no usados (olvido catastrófico del dataset base), sin validación, sin
  comparar con el modelo anterior, sobrescribiendo el modelo en su sitio; imputa `None` con 0 en
  las variables y en la etiqueta (`:47-63`); traga las excepciones con `print` (`:115-116`);
  usa rutas relativas al CWD; `instance.save()` dentro del `post_save` vuelve a disparar la señal.
* **Impacto**: peticiones de segundos/minutos, degradación silenciosa del modelo, informes sin
  diagnóstico usados como "sin enfermedad".
* **Estado**: **Resuelto** — reentrenamiento explícito (`service.retrain`, comando
  `reentrenar_modelo`, `POST /api/v1/ml/reentrenar`): dataset base con etiqueta corregida +
  informes con diagnóstico confirmado, holdout común estable, CV, promoción solo si el ROC-AUC no
  empeora, versiones en `HeartGuard/ml/artifacts/<versión>/`, bitácora `registry.json`. Ver
  `HeartGuard/ml/README.md`.

### ML-05 · El `output` de los informes de la base no es un diagnóstico
* **Severidad**: Alta · **Ubicación**: `management/commands/load_informe.py:83-106`; tabla
  `heartguard_informe`
* **Descripción**: `load_informe` guarda en `output` la **predicción del modelo original**
  (invertida). Comprobación sobre los 10 001 informes:
  * ids 1-303 (`is_used_for_training=1`): idénticos a las 303 filas de `heart.csv` con su
    `output` de Kaggle (100 % coincidente) → etiquetas reales pero en semántica **invertida**;
  * los 9 698 restantes (sin médico): variables de `heartConexion.csv`; su `output` coincide en un
    **93,7 %** con la predicción del modelo original y solo en un 61,8 % con el `output` del CSV.
  * En ambos grupos, `output=1` corresponde al perfil sano (FC máx. 158 vs 141, oldpeak 1,0 vs
    1,9, vasos 0,42 vs 1,12): semántica de Kaggle, contraria a las opciones del modelo.
* **Impacto**: reentrenar con estos informes es entrenar con las propias predicciones erróneas
  (bucle de retroalimentación) y con la etiqueta al revés; dashboards y análisis por clase
  muestran las clases invertidas.
* **Recomendación**: no usarlos para entrenar; invertir el `output` de las 303 filas Kaggle;
  anular (`NULL`) el `output` de los 9 698 informes cuyo valor es una predicción; recalcular las
  predicciones con el modelo corregido.
* **Estado**: **Parcial** — `retrain` solo usa informes con `output` **y médico** (los heredados
  no tienen médico); `python manage.py sanear_informes_legado` (`HeartGuard/ml/legacy.py`) hace
  las tres correcciones en una transacción (dry-run: 303 invertidos, 9 698 anulados). Falta
  ejecutarlo (o llamarlo desde una migración de datos) en la base cargada.

### ML-06 · Datos sintéticos SDV con relación variable-etiqueta debilitada
* **Severidad**: Media · **Ubicación**: `heartConexion.csv`, `Material Red neuronal.zip`
* **Descripción**: GaussianCopula conserva marginales pero atenúa las dependencias: correlación
  con `output` de `thalachh` 0,24 (0,42 en Kaggle), `exng` −0,14 (−0,44), `oldpeak` −0,18 (−0,43),
  `caa` −0,13 (−0,39). Son datos con mucho ruido de etiqueta.
* **Recomendación**: no usarlos para entrenar ni evaluar; solo como datos de demostración.
* **Estado**: **Resuelto** en el pipeline (no se usan); los archivos siguen en el repo (PRIV-02).

### ML-07 · Sin trazabilidad de qué modelo produjo cada predicción
* **Severidad**: Media · **Descripción**: un solo `.pth` sobrescrito; sin versión, métricas ni
  umbral guardados. · **Estado**: **Resuelto** (`Informe.modelo_version`, `metadata.json`,
  `metrics.json`, puntero `ACTIVE`, `GET /api/v1/ml/modelo`).

### ML-08 · Rango de validez del modelo frente a la validación de la API
* **Severidad**: Media · **Ubicación (nueva)**: `HeartGuard/api/serializers.py:243-255` (edad 1-120,
  colesterol 50-1000…) frente a los rangos de entrenamiento (`heart_nn.features.FEATURES`: edad
  29-77, colesterol 126-564…); `HeartGuard/api/ml_client.py:26-32`
* **Descripción**: el servicio rechaza (con `ValueError` en español) valores fuera del rango de
  entrenamiento, pero `ml_client` convierte cualquier excepción en `ServicioIANoDisponible`: un
  paciente de 80 años obtiene "IA no disponible" (503) en vez de un 400 explicativo, y el informe
  se guarda sin predicción sin decir por qué.
* **Recomendación**: capturar `ValueError` aparte y responder 400 / devolver el motivo en
  `POST /informes` (`prediccion_disponible=false`, `motivo`); el frontend debe usar `min`/`max` de
  `/api/v1/ml/features`.
* **Estado**: **Pendiente** (Agente A).

### ML-09 · Umbral de decisión y bandas de riesgo
* **Severidad**: Info · El umbral de `prediccion` (0,345, Youden) no coincide con las bandas
  (0,33/0,66): un caso "moderado" puede tener `prediccion=1`. Es intencionado (sensibilidad) y está
  documentado en `HeartGuard/ml/README.md`. · **Estado**: Resuelto (documentado).

## 4. Modelo de datos

### DM-01 · `Historial.__str__` usa un campo inexistente
* **Severidad**: Media · **Ubicación**: `models.py:101` (`self.paciente.nombre`) → `AttributeError`
  en el admin y en cualquier `str()`. · **Estado**: **Resuelto**.

### DM-02 · `Informe.documento` duplica la FK `paciente`
* **Severidad**: Media · **Ubicación**: `models.py:56` y `clean()` (`:84-91`)
* **Descripción**: dos fuentes de verdad; `clean()` solo se ejecuta en ModelForms/admin, así que
  `objects.create` puede dejar `documento` y `paciente` inconsistentes; si cambia la cédula del
  paciente, los informes quedan desalineados.
* **Recomendación**: eliminar `documento` (exponer `paciente.numero_documento`) o mantenerlo solo
  como dato de entrada del serializer. · **Estado**: **Parcial** (el serializer resuelve el
  paciente por documento; el campo duplicado sigue en el modelo).

### DM-03 · `output` mezcla predicción y diagnóstico
* **Severidad**: Media · **Ubicación**: `models.py:77`, migración `0012_alter_informe_output`
* **Descripción**: un único campo anulable sin saber quién lo fijó ni cuándo.
* **Recomendación**: campos separados de predicción (hecho) y metadatos de confirmación
  (`diagnostico_confirmado_por`, `diagnostico_confirmado_en`).
* **Estado**: **Parcial** — ver NEW-02.

### DM-04 · Tipos inconsistentes de `fbs`/`exng`
* **Severidad**: Baja · `BooleanField` frente a 0/1 en datos y modelo. · **Estado**: **Resuelto**
  (`Informe.features()` y el servicio convierten bool → int).

### DM-05 · Código muerto con campos inexistentes
* **Severidad**: Baja · **Ubicación**: `views.py:199-213` (`fecha_registro`), `:220-241`
  (`Paciente.output`, `paciente.user`), `:243-266` (`enviar_notificaciones_automaticas`, nunca
  invocada). · **Estado**: **Resuelto** (eliminado; alertas automáticas en `services.py`).

### DM-06 · Sin índices para las consultas habituales
* **Severidad**: Baja · **Estado**: **Resuelto** (índice `paciente, -fecha` y `nivel_riesgo`).

## 5. Calidad de código y errores

### BUG-01 · Vistas definidas dos veces
* **Severidad**: Alta · **Ubicación**: `views.py` — `detalles_resultados` (`:113` y `:140`, la
  segunda sin `id`: la ruta `detalles_resultados/<int:id>/` lanza `TypeError` → 500),
  `perfil_medico` (`:144`, `:164`), `visualizacion_analisis` (`:181`, `:312`, origen de SEC-06),
  `notificaciones` (`:186`, `:345`); `forms.py` — `PacienteForm` (`:6`, `:52`, con reglas de usuario
  distintas). · **Estado**: **Resuelto** (vistas y formularios sustituidos por la API).

### BUG-02 · Correo síncrono con `fail_silently=False` en peticiones
* **Severidad**: Media · **Ubicación**: `views.py:232-238,254-260,366-372`, `signals.py:38-44`
* **Impacto**: un fallo SMTP convierte la acción en un 500 (y en la señal, impide guardar el
  informe). · **Estado**: **Resuelto** (`services.enviar_alerta` captura y registra el error).

### BUG-03 · Reglas de contraseña propias en `cambiar_contrasena`
* **Severidad**: Baja · **Ubicación**: `views.py:288-291` ignora `AUTH_PASSWORD_VALIDATORS`.
* **Estado**: **Resuelto** (`validate_password` en la API; revoca los refresh tokens).

### BUG-04 · `management/` sin `__init__.py`
* **Severidad**: Baja · Funciona como *namespace package*, pero es frágil con algunas
  herramientas. · **Estado**: **Pendiente**.

## 6. Higiene del repositorio

### REPO-01 · `__pycache__/*.pyc` versionados
* **Severidad**: Media · 27 `.pyc` (cpython-312 y 313) en git pese a estar en `.gitignore`; los
  mensajes de commit los enumeran. · **Recomendación**: `git rm -r --cached '**/__pycache__'`.
* **Estado**: **Pendiente**.

### REPO-02 · Binarios del modelo en la raíz, modificados por la propia app
* **Severidad**: Media · `model_heart_attack.pth`, `scaler.pkl` (sobrescritos en cada arranque,
  ML-02). · **Estado**: **Resuelto** — eliminados; artefactos versionados en
  `HeartGuard/ml/artifacts/2.0.0/` (las versiones generadas al reentrenar se ignoran en git).

### REPO-03 · `Material Red neuronal.zip`
* **Severidad**: Media · 1,1 MB con zips anidados: una copia de otro repositorio (incluido otro
  `.pth` y un notebook) y el proyecto SDV con su copia de `heart.csv`.
* **Recomendación**: eliminar; enlazar los repositorios de origen. · **Estado**: **Pendiente**.

### REPO-04 · `requirements.txt` en UTF-16 y con dependencias ajenas
* **Severidad**: Media · Codificado en UTF-16 LE con BOM (`pip` falla o lo interpreta mal en
  muchos entornos); incluye TensorFlow, Keras, Celery, Redis, APScheduler, django-q… que no se
  usan, y omite otras necesarias.
* **Recomendación**: UTF-8, solo dependencias directas, y la del modelo:
  `heart-nn @ git+https://github.com/JulianMediina/heart-disease-prediction-neural-network@refactor/auditoria-y-angular`.
* **Estado**: **Pendiente** (Agente A).

### REPO-05 · Datos sueltos en la raíz
* **Severidad**: Baja · `heart.csv`, `heartConexion.csv`, `pacientes_data.csv`, `backup.sql`.
* **Estado**: **Parcial** — `heart.csv` movido a `HeartGuard/ml/data/heart.csv` (dataset base del
  reentrenamiento); el resto, ver PRIV-01/02.

### REPO-06 · Sin tests ni CI
* **Severidad**: Media · **Estado**: **Parcial** — 35 tests del servicio de IA
  (`HeartGuard/ml/tests`, sin base de datos); falta CI y la batería de la API.

## 7. Documentación

### DOC-01 · README desactualizado e incorrecto
* **Severidad**: Media · Restos de "Copiar código" en los bloques, nombre de base distinto del de
  `settings.py` (`heartguard_db` vs `HeartGuardDB`), indica editar credenciales en
  `settings.py`, describe el modelo como predictor de "presencia" (estaba invertido), sin aviso
  médico ni instrucciones de datos de demo.
* **Estado**: **Pendiente** en el momento de esta revisión (Agente A lo está reescribiendo).
  `HeartGuard/ml/README.md` documenta la herramienta de IA.

### DOC-02 · Sin documentación de API
* **Severidad**: Baja · **Estado**: **Resuelto** (OpenAPI en `/api/schema/`, Swagger `/api/docs/`).

---

## 8. Revisión del trabajo de modernización (estado actual)

Revisados `HeartGuard/settings.py`, `HeartGuard/models.py`, `HeartGuard/api/*`,
`HeartGuard/management/commands/*` y `frontend/src` tal como están en la rama. El estado de cada
hallazgo original se indica arriba. Dos problemas originales siguen vivos en el código nuevo y se
mantienen con su ID original: SEC-11 (las cuentas cargadas de `backup.sql` aceptan `password123`
en `POST /api/v1/auth/login`) y SEC-17 (contraseña inicial = cédula en
`HeartGuard/api/serializers.py:159-172`). Problemas nuevos detectados:

### NEW-01 · Reentrenamiento síncrono abierto a cualquier médico
* **Severidad**: Media · `HeartGuard/api/views_ml.py` (`PuedeReentrenar`, `ReentrenarView`)
* **Descripción**: `POST /ml/reentrenar` bloquea la petición ~12 s (más con muchos informes) y
  cualquier médico puede lanzarlo repetidamente; un segundo reentrenamiento concurrente lanza
  `RuntimeError("Ya hay un reentrenamiento en curso.")`, que `ml_client` convierte en 503.
* **Recomendación**: solo admin (o throttle específico), responder 409 ante `RuntimeError`,
  ejecutarlo en segundo plano/tarea programada (`manage.py reentrenar_modelo`).
* **Estado**: **Pendiente** (Agente A).

### NEW-02 · Diagnósticos confirmados sin trazabilidad de quién los confirma
* **Severidad**: Media · `InformeUpdateSerializer` (`serializers.py:324-335`) permite fijar
  `output` a médicos **y administradores** y no registra quién/cuándo. El servicio de IA solo
  entrena con informes que tienen `medico` asignado (para excluir los heredados), así que un
  `output` fijado por un admin o sobre un informe sin médico no se usará.
* **Recomendación**: añadir `diagnostico_confirmado_por` (FK médico) y
  `diagnostico_confirmado_en`; al hacer PATCH de `output`, rellenarlos (y asignar `medico` si es
  nulo); limitar la confirmación a médicos. Cuando exista el campo, `informes_elegibles` en
  `HeartGuard/ml/service.py` debe filtrar por él.
* **Estado**: **Pendiente** (Agente A; ajuste de una línea en ML después).

### NEW-03 · Sin aviso médico visible en el frontend
* **Severidad**: Media · No hay un aviso "herramienta de apoyo, no sustituye el diagnóstico"
  fuera de los mocks (`frontend/src/app/mocks/ml-fixtures.ts`).
* **Recomendación**: mostrar `nota_etiqueta`/aviso junto a cada predicción y en la vista del
  paciente. · **Estado**: **Pendiente** (Agente C).

### NEW-04 · Refresh token en `localStorage`
* **Severidad**: Media · `frontend/src/app/core/auth/auth.service.ts:15-23`
* **Impacto**: un XSS permitiría robar un token de larga duración (1 día).
* **Recomendación**: cookie `HttpOnly; Secure; SameSite=Strict` para el refresh (con CSRF en ese
  endpoint) o, al menos, CSP estricta y rotación/blacklist de refresh (ya activa).
* **Estado**: **Pendiente** (Agentes A/C; aceptable en local).

### NEW-05 · Análisis y dashboards sobre `output` heredado invertido
* **Severidad**: Media · `HeartGuard/api/views_dashboard.py:130-150` (medias por clase) y
  `pendientes_diagnostico` usan `output`; mientras no se ejecute `sanear_informes_legado`
  (ML-05) las clases salen invertidas. · **Estado**: **Pendiente** (ejecutar el saneamiento).

### NEW-06 · `is_used_for_training` expuesto a pacientes
* **Severidad**: Baja · `InformeSerializer` (`serializers.py:284-285`) lo incluye para todos los
  roles. Dato interno sin valor para el paciente. · **Estado**: **Pendiente**.

---

## Anexo A · Evidencia sobre la semántica de `output`

| Conjunto | n | % output=1 | corr(thalachh, output) | corr(oldpeak, output) | corr(exng, output) | corr(caa, output) |
|---|---|---|---|---|---|---|
| `heart.csv` (Kaggle) | 303 | 54,5 | +0,42 | −0,43 | −0,44 | −0,39 |
| `heartConexion.csv` (SDV) | 10 303 | 54,8 | +0,24 | −0,18 | −0,14 | −0,13 |
| Informes en la BD | 10 001 | 48,1 | +0,38 | −0,39 | −0,36 | −0,34 |

En los tres, `output=1` se asocia a mayor FC máxima y menos isquemia: es la semántica de Kaggle
(output=1 ≈ **sin** enfermedad), opuesta a `Informe.output` (1 = Enfermedad Presente).

| Comprobación | Resultado |
|---|---|
| Informes idénticos a filas de `heart.csv` | 303 (ids 1-303), `output` igual al de Kaggle en el 100 % |
| `output` de los 9 698 informes restantes = predicción del modelo original | 93,7 % |
| `output` de esos informes = `output` de `heartConexion.csv` | 61,8 % |
| ROC-AUC del modelo original frente a `output` / frente a `1 − output` | 0,934 / 0,066 |
| Contraseñas `password123` (en claro / hash verificado) | 7 484 / 2 518 |

## Anexo B · Comandos de verificación

```bash
pytest HeartGuard/ml/tests                         # contrato, validación, semántica, reentrenamiento
python manage.py sanear_informes_legado --dry-run  # {"invertidos_kaggle": 303, "output_anulado_prediccion_heredada": 9698, ...}
python manage.py reentrenar_modelo                 # sin informes confirmados: no entrena
```
