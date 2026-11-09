"""Contrato, validación, niveles de riesgo, semántica de la etiqueta y carga de versiones."""

import json
import os
import shutil
import time

import numpy as np
import pytest
from heart_nn.data import load_dataset, split_data

from HeartGuard.ml import service
from HeartGuard.ml.registry import ModelRegistry
from HeartGuard.ml.service import ModelService, nivel_riesgo
from HeartGuard.ml.training import BASE_SPLIT, DEFAULT_BASE_DATA

from .conftest import ALTO, BAJO, SEED_VERSION


@pytest.fixture
def svc(registry_dir):
    return ModelService(registry_dir)


def test_predict_cumple_el_contrato(svc):
    r = svc.predict(ALTO)
    assert set(r) == {"probabilidad", "prediccion", "nivel_riesgo", "modelo_version"}
    assert isinstance(r["probabilidad"], float) and 0.0 <= r["probabilidad"] <= 1.0
    assert r["prediccion"] in (0, 1)
    assert r["nivel_riesgo"] in ("bajo", "moderado", "alto")
    assert r["modelo_version"] == SEED_VERSION
    assert r["nivel_riesgo"] == nivel_riesgo(r["probabilidad"])


def test_predict_many_mantiene_orden(svc):
    out = svc.predict_many([ALTO, BAJO, ALTO])
    assert len(out) == 3
    assert out[0] == out[2]
    assert out[0]["probabilidad"] > out[1]["probabilidad"]


def test_api_de_modulo_usa_la_configuracion(registry_dir, monkeypatch):
    monkeypatch.setattr(service, "model_dir", lambda: registry_dir)
    monkeypatch.setattr(service, "_service", None)
    assert service.predict(BAJO)["modelo_version"] == SEED_VERSION
    assert len(service.predict_many([BAJO, ALTO])) == 2
    assert service.model_info()["version"] == SEED_VERSION


def test_predict_informe_rellena_campos(registry_dir, monkeypatch):
    monkeypatch.setattr(service, "model_dir", lambda: registry_dir)
    monkeypatch.setattr(service, "_service", None)

    class InformeFalso:
        pass

    inf = InformeFalso()
    for k, v in {**ALTO, "fbs": False, "exng": True}.items():
        setattr(inf, k, v)
    res = service.predict_informe(inf)
    assert inf.nivel_riesgo == res["nivel_riesgo"] and inf.modelo_version == SEED_VERSION


def test_semantica_enfermedad_alto_mayor_que_bajo(svc):
    """La probabilidad es de ENFERMEDAD (el HeartGuard original lo hacía al revés)."""
    alto, bajo = svc.predict(ALTO), svc.predict(BAJO)
    assert alto["probabilidad"] > 0.66 > 0.33 > bajo["probabilidad"]
    assert alto["prediccion"] == 1 and bajo["prediccion"] == 0
    assert alto["nivel_riesgo"] == "alto" and bajo["nivel_riesgo"] == "bajo"


def test_semantica_en_holdout_kaggle(svc):
    """En el test fijo del dataset base, la probabilidad ordena bien enfermedad = 1 - output."""
    from sklearn.metrics import roc_auc_score

    split = split_data(load_dataset(DEFAULT_BASE_DATA), **BASE_SPLIT)
    proba = svc.current().predictor.predict_proba_frame(split.X_test)
    assert roc_auc_score(split.y_test, proba) > 0.85  # y_test = enfermedad


def test_acepta_booleanos_de_booleanfield(svc):
    rec = {**BAJO, "fbs": False, "exng": True}
    assert svc.predict(rec)["prediccion"] in (0, 1)


@pytest.mark.parametrize(
    ("cambio", "mensaje"),
    [
        ({"age": 200}, "fuera de rango"),
        ({"cp": 7}, "no es válido"),
        ({"chol": "alto"}, "debe ser numérico"),
        ({"chol": float("nan")}, "finito"),
        ({"extra": 1}, "no reconocidas"),
    ],
)
def test_validacion_lanza_valueerror_en_espanol(svc, cambio, mensaje):
    with pytest.raises(ValueError, match=mensaje):
        svc.predict({**BAJO, **cambio})


def test_validacion_variable_faltante(svc):
    rec = dict(BAJO)
    rec.pop("thall")
    with pytest.raises(ValueError, match="Faltan variables"):
        svc.predict(rec)


@pytest.mark.parametrize("entrada", [[], None, "x", [None]])
def test_validacion_entrada_no_valida(svc, entrada):
    with pytest.raises(ValueError):
        svc.predict_many(entrada)


@pytest.mark.parametrize(
    ("p", "nivel"),
    [(0.0, "bajo"), (0.3299, "bajo"), (0.33, "moderado"), (0.6599, "moderado"),
     (0.66, "alto"), (1.0, "alto")],
)
def test_umbrales_de_riesgo(p, nivel):
    assert nivel_riesgo(p) == nivel


def test_model_info(svc):
    info = svc.model_info()
    for key in ("version", "entrenado_en", "threshold", "metrics", "features", "history",
                "nota_etiqueta"):
        assert key in info
    assert info["version"] == SEED_VERSION
    assert len(info["features"]) == 13
    assert "roc_curve" not in info["metrics"]
    assert "1 - output" in info["nota_etiqueta"]


def test_cambio_de_version_activa_se_recarga(registry_dir, svc):
    assert svc.predict(BAJO)["modelo_version"] == SEED_VERSION
    shutil.copytree(registry_dir / SEED_VERSION, registry_dir / "2.1.0")
    meta_path = registry_dir / "2.1.0" / "metadata.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["threshold"] = 0.99
    meta_path.write_text(json.dumps(meta), encoding="utf-8")
    reg = ModelRegistry(registry_dir)
    assert reg.next_version() == "2.2.0"
    reg.set_active("2.1.0")
    # Garantiza que cambia el mtime aunque el sistema de archivos tenga poca resolución.
    future = time.time() + 5
    os.utime(reg.active_file, (future, future))
    r = svc.predict(ALTO)
    assert r["modelo_version"] == "2.1.0"
    assert svc.current().predictor.threshold == pytest.approx(0.99)


def test_version_activa_inexistente(registry_dir):
    (registry_dir / "ACTIVE").write_text("9.9.9", encoding="utf-8")
    with pytest.raises(FileNotFoundError):
        ModelService(registry_dir).predict(BAJO)


def test_sin_puntero_usa_la_ultima_version(registry_dir):
    (registry_dir / "ACTIVE").unlink()
    assert ModelRegistry(registry_dir).active_version() == SEED_VERSION


def test_directorio_de_modelo_fijo(registry_dir):
    fixed = registry_dir / SEED_VERSION
    svc = ModelService(fixed)
    assert svc.predict(BAJO)["modelo_version"] == SEED_VERSION
    with pytest.raises(RuntimeError):
        ModelRegistry(fixed).set_active("2.0.0")


def test_artefactos_del_repo_son_la_version_activa():
    reg = ModelRegistry(service.DEFAULT_MODEL_DIR)
    assert reg.active_version() == SEED_VERSION
    meta = json.loads((reg.version_dir() / "metadata.json").read_text(encoding="utf-8"))
    assert meta["target"]["definition"] == "enfermedad = 1 - output"
    assert np.isfinite(meta["threshold"])
