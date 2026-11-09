# Herramienta de IA de HeartGuard (`HeartGuard.ml`)

Integra la red neuronal del paquete [`heart_nn`](https://github.com/JulianMediina/heart-disease-prediction-neural-network)
(MLP en PyTorch entrenado sobre el dataset Cleveland/Kaggle) como una herramienta más del
sistema de gestión. **Es un apoyo a la decisión clínica, no un diagnóstico.**

## Dependencia

```
heart-nn @ git+https://github.com/JulianMediina/heart-disease-prediction-neural-network@refactor/auditoria-y-angular
```

En desarrollo local puede instalarse en modo editable desde el repositorio hermano:
`pip install -e ../heart-disease-prediction-neural-network`.

## Interfaz (`HeartGuard/ml/service.py`)

```python
from HeartGuard.ml import service

service.predict({"age": 67, "sex": 1, "cp": 0, "trtbps": 160, "chol": 286, "fbs": 0, "restecg": 0,
                 "thalachh": 108, "exng": 1, "oldpeak": 1.5, "slp": 1, "caa": 3, "thall": 2})
# {'probabilidad': 0.8504, 'prediccion': 1, 'nivel_riesgo': 'alto', 'modelo_version': '2.0.0'}
service.predict_many([...])          # lista en el mismo orden
service.model_info()                 # versión, umbral, métricas, variables, historial, nota de la etiqueta
service.retrain(Informe.objects.all())  # {'version', 'metrics', 'promovido', 'motivo', ...}
service.predict_informe(informe, save=True)  # rellena los 4 campos de predicción del informe
```

* `probabilidad` = P(enfermedad cardíaca). `prediccion` = 1 si `probabilidad >= threshold`
  del modelo (umbral de Youden elegido por validación cruzada, 0,345 en la 2.0.0).
* `nivel_riesgo`: `bajo` (< 0,33), `moderado` (< 0,66), `alto` (≥ 0,66). Son independientes
  del umbral de decisión: un caso puede ser `moderado` con `prediccion = 1`.
* Las variables deben estar dentro de los rangos/categorías del dataset de entrenamiento
  (`heart_nn.features.FEATURES`, p. ej. edad 29–77). Si no, `ValueError` con mensaje en
  español: el backend debe responder 400 (o guardar el informe sin predicción), no 503.
* `fbs`/`exng` pueden llegar como `bool` (BooleanField); se convierten a 0/1.

## Artefactos y versiones

```
HeartGuard/ml/artifacts/          # settings.HEARTGUARD_MODEL_DIR
├── ACTIVE                        # versión activa ("2.0.0"); se escribe de forma atómica
├── 2.0.0/                        # semilla, copiada de heart_nn (único versionado en git)
├── 2.1.0/ …                      # versiones promovidas por el reentrenamiento (ignoradas por git)
├── rechazados/                   # candidatos no promovidos (trazabilidad)
└── registry.json                 # bitácora de reentrenamientos
```

El modelo se carga una vez por proceso (singleton perezoso con lock) y se recarga solo si
cambia `ACTIVE`, así que una promoción hecha por el comando o por otro worker se aplica
sin reiniciar. Si `HEARTGUARD_MODEL_DIR` apunta directamente a una carpeta con
`metadata.json`, se usa ese modelo fijo (sin promociones).

## Semántica de la etiqueta (importante)

* En el `heart.csv` de Kaggle la columna `output` está **invertida** respecto a UCI
  (`output = 1` ≈ sin enfermedad). `heart_nn` entrena con `enfermedad = 1 - output`.
* El modelo original de HeartGuard se entrenó con `output` crudo: devolvía la probabilidad de
  **no** tener enfermedad (para un paciente de alto riesgo daba 0,008; el actual da 0,85).
* En `Informe.output` HeartGuard usa 1 = Enfermedad Presente. Los informes nuevos con
  diagnóstico confirmado se usan **tal cual** (sin invertir).
* Los informes heredados de `backup.sql` no son diagnósticos válidos: ver
  `HeartGuard/ml/legacy.py` y `python manage.py sanear_informes_legado`.

## Reentrenamiento

Ya no hay reentrenamiento en señales `post_save`. Se lanza explícitamente:

```bash
python manage.py reentrenar_modelo [--tolerancia 0.0] [--forzar] [--epocas N] [--folds K]
```

o con `POST /api/v1/ml/reentrenar` (que llama a `service.retrain`). Flujo:

1. **Elegibles**: informes con `output` no nulo **y** con médico (`medico` no nulo). Solo se
   entrena si hay alguno con `is_used_for_training = False` (salvo `--forzar`).
2. **Datos**: dataset base (`HeartGuard/ml/data/heart.csv`, etiqueta corregida) + todos los
   informes elegibles validados (los inválidos se descartan y se informan).
3. **Holdout común**: test fijo del dataset base (semilla 42, el mismo que nunca vio la
   2.0.0) + ~20 % de los pacientes de los informes por hash estable de `paciente_id`
   (sin fuga entre informes del mismo paciente; nunca se usa para entrenar).
4. **Candidato** con el pipeline de `heart_nn`: CV estratificada (métricas y umbral de
   Youden out-of-fold), preprocesador ajustado solo con train, early stopping con val.
5. **Promoción** solo si su ROC-AUC en el holdout no es peor que el del activo
   (`tolerancia` 0 por defecto). Si se promueve: nueva carpeta `x.y.0`, `ACTIVE`
   actualizado y los informes nuevos se marcan `is_used_for_training = True`. Si no, el
   candidato queda en `rechazados/` y los informes siguen pendientes.
6. Un lock impide dos reentrenamientos simultáneos en el mismo proceso
   (`RuntimeError("Ya hay un reentrenamiento en curso.")`).

Con el dataset base solo tarda ~12 s en CPU. Al ser síncrono, en producción conviene
ejecutarlo como tarea programada o en segundo plano y no dentro de una petición HTTP.

## Tests

```bash
pytest HeartGuard/ml/tests        # no necesitan base de datos
```
