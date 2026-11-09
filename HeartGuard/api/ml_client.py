"""Puente entre la API y el servicio de IA (`HeartGuard.ml.service`).

El servicio se importa de forma diferida para que la API arranque aunque el modelo no esté
disponible, y para poder sustituirlo por un doble en las pruebas (`_service`).
"""

import logging

logger = logging.getLogger("HeartGuard.api")


class ServicioIANoDisponible(Exception):
    """El servicio de IA no pudo cargarse o falló (HTTP 503)."""


class DatosInvalidosIA(ValueError):
    """Los datos no son válidos para el modelo, p. ej. fuera de su rango (HTTP 400)."""


class ReentrenamientoEnCurso(RuntimeError):
    """Ya hay un reentrenamiento en ejecución (HTTP 409)."""


def _service():
    try:
        from HeartGuard.ml import service
    except Exception as exc:  # pragma: no cover - depende del entorno
        raise ServicioIANoDisponible(f"Servicio de IA no disponible: {exc}") from exc
    return service


def _llamar(nombre, *args):
    service = _service()
    try:
        return getattr(service, nombre)(*args)
    except (ServicioIANoDisponible, DatosInvalidosIA, ReentrenamientoEnCurso):
        raise
    except ValueError as exc:
        raise DatosInvalidosIA(str(exc)) from exc
    except RuntimeError as exc:
        if "en curso" in str(exc):
            raise ReentrenamientoEnCurso(str(exc)) from exc
        logger.exception("Error en el servicio de IA (%s)", nombre)
        raise ServicioIANoDisponible(str(exc)) from exc
    except Exception as exc:
        logger.exception("Error en el servicio de IA (%s)", nombre)
        raise ServicioIANoDisponible(str(exc)) from exc


def predict(features: dict) -> dict:
    return _llamar("predict", features)


def predict_many(lista: list[dict]) -> list[dict]:
    return _llamar("predict_many", lista)


def model_info() -> dict:
    return _llamar("model_info")


def retrain(informes_qs) -> dict:
    return _llamar("retrain", informes_qs)


def features_metadata() -> list[dict]:
    """Metadatos de las 13 variables (etiquetas en español) de `heart_nn.features.FEATURES`."""
    try:
        from heart_nn.features import FEATURES
    except Exception as exc:  # pragma: no cover
        raise ServicioIANoDisponible(f"heart_nn no disponible: {exc}") from exc
    return FEATURES
