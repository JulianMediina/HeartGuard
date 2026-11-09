"""Reentrenamiento: promoción, no promoción, holdout estable y validación de informes."""

import numpy as np
import pandas as pd
import pytest
from heart_nn.data import load_dataset

from HeartGuard.ml.registry import ModelRegistry
from HeartGuard.ml.service import ModelService
from HeartGuard.ml.training import (
    DEFAULT_BASE_DATA,
    in_holdout,
    prepare_informes,
    quick_config,
    retrain_from_frame,
)

from .conftest import BAJO, SEED_VERSION

FAST = dict(max_epochs=40, patience=10, cv_folds=2)


def informes_sinteticos(n: int = 60, seed: int = 0) -> pd.DataFrame:
    """Informes con diagnóstico en semántica HeartGuard (1 = enfermedad), muestreados del
    dataset base con la etiqueta ya corregida (1 - output) y algo de ruido."""
    rng = np.random.default_rng(seed)
    base = load_dataset(DEFAULT_BASE_DATA).sample(n, random_state=seed).reset_index(drop=True)
    base["age"] = np.clip(base["age"] + rng.integers(-2, 3, n), 29, 77)
    base["output"] = 1 - base["output"]
    base["id"] = np.arange(1, n + 1)
    base["paciente_id"] = (np.arange(n) // 2) + 1000  # dos informes por paciente
    return base


def test_holdout_estable_y_por_paciente():
    keys = list(range(2000))
    first = [in_holdout(k) for k in keys]
    assert first == [in_holdout(k) for k in keys]
    assert 0.15 < np.mean(first) < 0.25


def test_prepare_informes_descarta_invalidos():
    df = pd.DataFrame([
        {**BAJO, "output": 1, "id": 1, "paciente_id": 1},
        {**BAJO, "output": None, "id": 2, "paciente_id": 1},
        {**BAJO, "age": 150, "output": 0, "id": 3, "paciente_id": 2},
        {**BAJO, "fbs": True, "output": 0, "id": 4, "paciente_id": 3},
    ])
    clean, rejected = prepare_informes(df)
    assert clean["id"].tolist() == [1, 4]
    assert {r["id"] for r in rejected} == {2, 3}
    assert clean["enfermedad"].tolist() == [1, 0]  # sin invertir: ya es semántica HeartGuard


def test_sin_informes_no_entrena(registry_dir):
    reg = ModelRegistry(registry_dir)
    res = retrain_from_frame(pd.DataFrame(columns=["id", "output", *BAJO]), reg)
    assert res.promovido is False and res.version == SEED_VERSION
    assert reg.versions() == [SEED_VERSION]


def test_promueve_si_mejora_al_activo(inverted_registry_dir):
    """El activo predice al revés (AUC ~0,1): un candidato correcto debe promoverse."""
    svc = ModelService(inverted_registry_dir)
    assert svc.predict(BAJO)["probabilidad"] > 0.5  # activo invertido
    res = svc.retrain_frame(informes_sinteticos(), config=quick_config(**FAST))
    assert res.promovido is True, res.motivo
    assert res.version == "2.1.0"
    hold = res.metrics["holdout"]
    assert hold["candidato"]["roc_auc"] > 0.8 > 0.3 > hold["activo"]["roc_auc"]
    reg = ModelRegistry(inverted_registry_dir)
    assert reg.active_version() == "2.1.0"
    assert reg.read_log()[-1]["promovido"] is True
    # El servicio recarga la nueva versión y vuelve a la semántica correcta.
    r = svc.predict(BAJO)
    assert r["modelo_version"] == "2.1.0" and r["probabilidad"] < 0.5
    assert len(res.used_ids) == 60


def test_no_promueve_si_empeora(registry_dir):
    """Candidato sin entrenar (lr ínfimo, 1 época) frente al 2.0.0: no se promueve."""
    reg = ModelRegistry(registry_dir)
    cfg = quick_config(max_epochs=1, patience=1, cv_folds=2, lr=1e-9)
    res = retrain_from_frame(informes_sinteticos(30), reg, config=cfg)
    assert res.promovido is False, res.motivo
    assert reg.active_version() == SEED_VERSION
    assert "rechazado" in res.version
    assert (registry_dir / "rechazados" / res.version / "model.pt").is_file()
    assert reg.versions() == [SEED_VERSION]
    assert reg.read_log()[-1]["promovido"] is False


def test_reentrenamiento_concurrente_rechazado(registry_dir):
    svc = ModelService(registry_dir)
    svc._retrain_lock.acquire()
    try:
        with pytest.raises(RuntimeError, match="en curso"):
            svc.retrain_frame(informes_sinteticos(10))
    finally:
        svc._retrain_lock.release()
