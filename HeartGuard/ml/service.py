"""Servicio de IA de HeartGuard: interfaz estable que consume el backend.

Interfaz (ver ``docs/CONTRATO_API.md``)::

    predict(features)        -> {"probabilidad", "prediccion", "nivel_riesgo", "modelo_version"}
    predict_many(lista)      -> [ ...mismo formato... ]
    model_info()             -> {"version", "entrenado_en", "threshold", "metrics", "features",
                                 "history", "nota_etiqueta", ...}
    retrain(informes_qs)     -> {"version", "metrics", "promovido"}

* ``probabilidad`` = P(enfermedad cardíaca), en [0, 1].
* ``prediccion`` = 1 si ``probabilidad >= threshold`` del modelo (umbral de Youden), si no 0.
* ``nivel_riesgo``: ``bajo`` (< 0.33), ``moderado`` (< 0.66), ``alto`` (>= 0.66).

El modelo activo se carga una sola vez (singleton perezoso y seguro entre hilos) desde
``settings.HEARTGUARD_MODEL_DIR`` (por defecto ``HeartGuard/ml/artifacts``) y se recarga
automáticamente si cambia el puntero ``ACTIVE`` (promoción hecha por otro proceso).
Los errores de validación lanzan ``ValueError`` con mensajes en español.
"""

from __future__ import annotations

import logging
import os
import threading
from decimal import Decimal
from pathlib import Path
from typing import Any

from HeartGuard.ml.registry import ModelRegistry

logger = logging.getLogger("HeartGuard.ml")

DEFAULT_MODEL_DIR = Path(__file__).resolve().parent / "artifacts"
RIESGO_BAJO_MAX = 0.33
RIESGO_MODERADO_MAX = 0.66

FEATURE_NAMES: tuple[str, ...] = (
    "age", "sex", "cp", "trtbps", "chol", "fbs", "restecg",
    "thalachh", "exng", "oldpeak", "slp", "caa", "thall",
)


# --------------------------------------------------------------------------------------
# Configuración
# --------------------------------------------------------------------------------------
def model_dir() -> Path:
    """``settings.HEARTGUARD_MODEL_DIR`` si Django está configurado; si no, variable de
    entorno ``HEARTGUARD_MODEL_DIR``; si no, ``HeartGuard/ml/artifacts``."""
    try:
        from django.conf import settings

        if settings.configured and getattr(settings, "HEARTGUARD_MODEL_DIR", None):
            return Path(settings.HEARTGUARD_MODEL_DIR)
    except ImportError:  # pragma: no cover - Django siempre está instalado en la app
        pass
    return Path(os.environ.get("HEARTGUARD_MODEL_DIR") or DEFAULT_MODEL_DIR)


def nivel_riesgo(probabilidad: float) -> str:
    if probabilidad < RIESGO_BAJO_MAX:
        return "bajo"
    if probabilidad < RIESGO_MODERADO_MAX:
        return "moderado"
    return "alto"


# --------------------------------------------------------------------------------------
# Carga del modelo activo
# --------------------------------------------------------------------------------------
class _LoadedModel:
    def __init__(self, predictor: Any, version: str, directory: Path, stamp: float | None):
        self.predictor = predictor
        self.version = version
        self.directory = directory
        self.stamp = stamp


class ModelService:
    """Carga perezosa del modelo activo de un registro; segura entre hilos."""

    def __init__(self, root: str | Path):
        self.registry = ModelRegistry(root)
        self._lock = threading.Lock()
        self._retrain_lock = threading.Lock()
        self._loaded: _LoadedModel | None = None

    def _load(self) -> _LoadedModel:
        from heart_nn.predict import HeartPredictor

        stamp = self.registry.active_stamp()
        version = self.registry.active_version()
        directory = self.registry.version_dir(version)
        predictor = HeartPredictor.from_artifacts(directory)
        logger.info("Modelo de IA cargado: versión %s (%s)", version, directory)
        return _LoadedModel(predictor, version, directory, stamp)

    def current(self) -> _LoadedModel:
        loaded = self._loaded
        if loaded is not None and loaded.stamp == self.registry.active_stamp():
            return loaded
        with self._lock:
            loaded = self._loaded
            if loaded is None or loaded.stamp != self.registry.active_stamp():
                self._loaded = loaded = self._load()
        return loaded

    def reload(self) -> None:
        with self._lock:
            self._loaded = self._load()

    # --- Predicción -----------------------------------------------------------------
    def predict_many(self, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not isinstance(records, (list, tuple)) or not records:
            raise ValueError("Se espera una lista no vacía de registros con las 13 variables.")
        loaded = self.current()
        clean = [_normalize(r) for r in records]
        raw = loaded.predictor.predict_batch(clean)
        out = []
        for item in raw:
            p = float(item["probability"])
            out.append(
                {
                    "probabilidad": round(p, 4),
                    "prediccion": int(item["prediction"]),
                    "nivel_riesgo": nivel_riesgo(p),
                    "modelo_version": loaded.version,
                }
            )
        return out

    def predict(self, features: dict[str, Any]) -> dict[str, Any]:
        return self.predict_many([features])[0]

    # --- Información ----------------------------------------------------------------
    def model_info(self) -> dict[str, Any]:
        from heart_nn.features import FEATURES

        from HeartGuard.ml.training import NOTA_ETIQUETA, load_json

        loaded = self.current()
        meta = loaded.predictor.metadata
        metrics = load_json(loaded.directory / "metrics.json")
        metrics.pop("roc_curve", None)
        return {
            "version": loaded.version,
            "entrenado_en": meta.get("trained_at"),
            "threshold": loaded.predictor.threshold,
            "metrics": metrics,
            "features": FEATURES,
            "history": load_json(loaded.directory / "history.json"),
            "nota_etiqueta": NOTA_ETIQUETA,
            "umbrales_riesgo": {"bajo": f"< {RIESGO_BAJO_MAX}", "moderado": f"< {RIESGO_MODERADO_MAX}",
                                "alto": f">= {RIESGO_MODERADO_MAX}"},
            "arquitectura": meta.get("model_config"),
            "version_previa": meta.get("parent_version"),
            "versiones": self.registry.read_log(),
        }

    # --- Reentrenamiento ------------------------------------------------------------
    def retrain_frame(self, frame, **kwargs) -> Any:
        from HeartGuard.ml.training import retrain_from_frame

        if not self._retrain_lock.acquire(blocking=False):
            raise RuntimeError("Ya hay un reentrenamiento en curso.")
        try:
            result = retrain_from_frame(frame, self.registry, **kwargs)
        finally:
            self._retrain_lock.release()
        if result.promovido:
            self.reload()
        return result


def _normalize(record: Any) -> dict[str, Any]:
    """Acepta bool (BooleanField de fbs/exng) y Decimal; el resto lo valida heart_nn."""
    if not isinstance(record, dict):
        raise ValueError("El registro debe ser un diccionario {variable: valor}.")
    out = {}
    for key, value in record.items():
        if isinstance(value, bool):
            value = int(value)
        elif isinstance(value, Decimal):
            value = float(value)
        out[key] = value
    return out


# --------------------------------------------------------------------------------------
# Singleton y API de módulo
# --------------------------------------------------------------------------------------
_service: ModelService | None = None
_service_lock = threading.Lock()


def get_service() -> ModelService:
    global _service
    root = model_dir()
    svc = _service
    if svc is None or svc.registry.root != root:
        with _service_lock:
            if _service is None or _service.registry.root != root:
                _service = ModelService(root)
            svc = _service
    return svc


def predict(features: dict[str, Any]) -> dict[str, Any]:
    """Predice para un registro con las 13 variables. ``ValueError`` si no es válido."""
    return get_service().predict(features)


def predict_many(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return get_service().predict_many(records)


def model_info() -> dict[str, Any]:
    return get_service().model_info()


def features_from_informe(informe: Any) -> dict[str, Any]:
    """Extrae las 13 variables de un ``Informe`` (o cualquier objeto con esos atributos)."""
    return {name: getattr(informe, name) for name in FEATURE_NAMES}


def predict_informe(informe: Any, save: bool = False) -> dict[str, Any]:
    """Predice para un ``Informe`` y rellena ``probabilidad``, ``prediccion``,
    ``nivel_riesgo`` y ``modelo_version`` (los guarda si ``save=True``)."""
    result = predict(features_from_informe(informe))
    for key, value in result.items():
        setattr(informe, key, value)
    if save:
        informe.save(update_fields=list(result))
    return result


def informes_elegibles(informes_qs):
    """Informes válidos como datos de entrenamiento: diagnóstico (``output``) confirmado
    explícitamente por un médico. Se usa la trazabilidad ``diagnostico_confirmado_por``
    (migración 0014, la rellena la API al crear el informe con ``output`` o al editarlo);
    así quedan fuera los ``output`` heredados que escribió el modelo original
    (``load_informe``) aunque el informe tenga médico. [Cambio de Agent A, NEW-02]"""
    return informes_qs.filter(output__isnull=False, diagnostico_confirmado_por__isnull=False)


def retrain(informes_qs=None, **kwargs) -> dict[str, Any]:
    """Reentrena con el dataset base + informes con diagnóstico confirmado.

    Se ejecuta solo si hay informes elegibles aún no usados (``is_used_for_training=False``),
    salvo ``force=True``. El candidato se entrena con *todos* los informes elegibles (los
    usados antes también: el entrenamiento es desde cero) y se promueve solo si no es peor
    que el activo en el holdout común. Si se promueve, los informes nuevos se marcan
    ``is_used_for_training=True``. Devuelve ``{"version", "metrics", "promovido"}`` y,
    como información adicional, ``motivo``, ``informes_usados`` e ``informes_descartados``.
    """
    import pandas as pd
    from django.db import transaction

    if informes_qs is None:
        from HeartGuard.models import Informe

        informes_qs = Informe.objects.all()
    svc = get_service()
    elegibles = informes_elegibles(informes_qs)
    nuevos_ids = list(elegibles.filter(is_used_for_training=False).values_list("id", flat=True))
    force = kwargs.pop("force", False)
    if not nuevos_ids and not force:
        return {
            "version": svc.current().version,
            "metrics": {},
            "promovido": False,
            "motivo": "No hay informes nuevos con diagnóstico confirmado por un médico.",
            "informes_usados": 0,
            "informes_nuevos_marcados": 0,
            "informes_descartados": [],
        }
    frame = pd.DataFrame.from_records(
        elegibles.values("id", "paciente_id", "output", *FEATURE_NAMES)
    )
    if frame.empty:
        frame = pd.DataFrame(columns=["id", "paciente_id", "output", *FEATURE_NAMES])
    result = svc.retrain_frame(frame, force=force, **kwargs)
    marcados = 0
    if result.promovido:
        validos = set(result.used_ids)
        with transaction.atomic():
            marcados = informes_qs.model.objects.filter(
                id__in=[i for i in nuevos_ids if i in validos]
            ).update(is_used_for_training=True)
    logger.info("%s Informes nuevos marcados como usados: %d", result.motivo, marcados)
    payload = result.as_contract()
    payload.update(
        motivo=result.motivo,
        informes_usados=len(result.used_ids),
        informes_nuevos_marcados=marcados,
        informes_descartados=result.descartados,
    )
    return payload
