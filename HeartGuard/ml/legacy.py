"""Saneamiento de los informes heredados de la versión original (ver docs/AUDIT.md, ML-06).

Hallazgos sobre los 10 001 informes de ``backup.sql``:

* Ids 1-303 (``is_used_for_training=True``): son exactamente las 303 filas de ``heart.csv``
  (Kaggle) con su ``output`` original, es decir, en la semántica **invertida** de Kaggle
  (output=1 ≈ sin enfermedad). Son etiquetas reales (Cleveland) pero al revés respecto a
  las opciones del modelo ``Informe`` (1 = Enfermedad Presente).
* Resto (``medico`` nulo, ``is_used_for_training=False``): variables sintéticas
  (SDV GaussianCopula sobre heart.csv, ``heartConexion.csv``) cuyo ``output`` **no** es un
  diagnóstico: lo escribió ``load_informe`` con la predicción del modelo original
  (coincidencia 93,7 % con ese modelo; solo 61,8 % con el ``output`` sintético del CSV).
  Además ese modelo predecía al revés.

``sanear_informes_legado`` deja los datos coherentes con la semántica actual:

1. Informes idénticos a filas del dataset base marcados como usados: ``output = 1 - output``.
2. Informes sin médico, no usados y sin ``modelo_version`` (predicción heredada): ``output``
   pasa a ``NULL`` (no hay diagnóstico confirmado) para que nunca se usen para reentrenar.
3. Recalcula ``probabilidad``/``prediccion``/``nivel_riesgo``/``modelo_version``
   con el modelo activo para todos los informes sin predicción.

Pensado para llamarse desde una migración de datos (``apps.get_model``) o desde el comando
``python manage.py sanear_informes_legado``. Es idempotente: tras ejecutarse, los informes
corregidos tienen ``modelo_version`` y ya no cumplen los criterios.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("HeartGuard.ml")

LEGACY_TAG = "legado"


def sanear_informes_legado(Informe, *, dry_run: bool = False, batch_size: int = 500) -> dict[str, Any]:
    import pandas as pd
    from django.db import transaction
    from heart_nn.features import validate_record

    from HeartGuard.ml.service import FEATURE_NAMES, predict_many
    from HeartGuard.ml.training import DEFAULT_BASE_DATA

    base = pd.read_csv(DEFAULT_BASE_DATA).drop_duplicates(subset=list(FEATURE_NAMES))
    base_keys = {tuple(float(v) for v in row) for row in base[list(FEATURE_NAMES)].to_numpy()}

    sin_version = Informe.objects.filter(modelo_version__isnull=True)
    invertir, anular = [], []
    for inf in sin_version.filter(is_used_for_training=True, output__isnull=False).iterator():
        key = tuple(float(getattr(inf, n)) for n in FEATURE_NAMES)
        if key in base_keys:
            invertir.append(inf.id)
    anular_qs = sin_version.filter(
        medico__isnull=True, is_used_for_training=False, output__isnull=False
    )
    anular = list(anular_qs.values_list("id", flat=True))

    resumen: dict[str, Any] = {
        "invertidos_kaggle": len(invertir),
        "output_anulado_prediccion_heredada": len(anular),
        "recalculados": 0,
        "sin_prediccion_fuera_de_rango": 0,
        "dry_run": dry_run,
    }
    if dry_run:
        return resumen

    # Todo en una transacción: ``modelo_version`` (que fija el recálculo) es lo que hace
    # idempotente la inversión; si algo falla no queda ningún informe invertido a medias.
    with transaction.atomic():
        for start in range(0, len(invertir), batch_size):
            ids = invertir[start:start + batch_size]
            for inf in Informe.objects.filter(id__in=ids):
                inf.output = 1 - int(inf.output)
                inf.save(update_fields=["output"])
        for start in range(0, len(anular), batch_size):
            Informe.objects.filter(id__in=anular[start:start + batch_size]).update(output=None)

        ids = list(
            Informe.objects.filter(probabilidad__isnull=True).order_by("id").values_list("id", flat=True)
        )
        for start in range(0, len(ids), batch_size):
            chunk = list(Informe.objects.filter(id__in=ids[start:start + batch_size]))
            validos, registros = [], []
            for inf in chunk:
                rec = {n: getattr(inf, n) for n in FEATURE_NAMES}
                try:
                    validate_record({k: int(v) if isinstance(v, bool) else v for k, v in rec.items()})
                except ValueError:
                    resumen["sin_prediccion_fuera_de_rango"] += 1
                    continue
                validos.append(inf)
                registros.append(rec)
            if not validos:
                continue
            for inf, res in zip(validos, predict_many(registros), strict=True):
                for k, v in res.items():
                    setattr(inf, k, v)
            Informe.objects.bulk_update(
                validos, ["probabilidad", "prediccion", "nivel_riesgo", "modelo_version"]
            )
            resumen["recalculados"] += len(validos)
    logger.info("Saneamiento de informes heredados: %s", resumen)
    return resumen
