"""Reentrenamiento controlado del modelo (sin Django: opera sobre DataFrames).

Diseño (ver ``HeartGuard/ml/README.md``):

1. **Datos base**: dataset Kaggle/Cleveland (``data/heart.csv``) con la etiqueta corregida
   ``enfermedad = 1 - output`` (``heart_nn.data.split_xy``), validado y deduplicado.
2. **Datos nuevos**: informes con diagnóstico confirmado por un médico; su ``output`` ya
   está en la semántica de HeartGuard (1 = Enfermedad Presente), así que **no** se invierte.
3. **Holdout común y estable**: el test del dataset base (misma partición, semilla y
   tamaños con los que se entrenó la versión 2.0.0, que nunca lo vio) más ~20 % de los
   pacientes de los informes, asignados por un hash estable del ``paciente_id`` (todos los
   informes de un paciente caen del mismo lado: sin fuga entre informes del mismo paciente).
   Ninguna versión entrena con el holdout, así que la comparación es justa.
4. **Candidato**: pipeline de ``heart_nn`` (preprocesador ajustado solo con train, CV
   estratificada para métricas y umbral de Youden out-of-fold, early stopping con val).
5. **Comparación**: candidato y modelo activo se evalúan sobre el mismo holdout. Se
   promueve solo si el ROC-AUC del candidato no es peor que el del activo (con una
   tolerancia configurable, 0 por defecto).
6. **Artefactos**: el candidato promovido se escribe en ``<root>/<versión>/`` y se
   actualiza el puntero ``ACTIVE``; un candidato rechazado se guarda en
   ``<root>/rechazados/`` para trazabilidad. Todo queda en ``registry.json``.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import torch
from heart_nn import __version__ as heart_nn_version
from heart_nn.config import TrainConfig
from heart_nn.data import load_dataset, split_data
from heart_nn.evaluate import compute_metrics, confusion, summarize_folds, youden_threshold
from heart_nn.features import FEATURE_NAMES, LABEL, TARGET, validate_record
from heart_nn.predict import HeartPredictor
from heart_nn.train import (
    cross_validate,
    inner_val_fraction,
    model_config_dict,
    train_pipeline,
    write_json,
)
from sklearn.model_selection import train_test_split

from HeartGuard.ml.registry import ModelRegistry

logger = logging.getLogger("HeartGuard.ml")

DEFAULT_BASE_DATA = Path(__file__).resolve().parent / "data" / "heart.csv"

# Partición del dataset base: debe coincidir con la usada para entrenar la versión 2.0.0
# (heart_nn.TrainConfig por defecto) para que su test sea un holdout que nadie ha visto.
BASE_SPLIT = {"test_size": 0.15, "val_size": 0.15, "seed": 42}
INFORMES_HOLDOUT_FRACTION = 0.2

NOTA_ETIQUETA = (
    "El modelo devuelve la probabilidad de enfermedad cardíaca (1 = Enfermedad Presente). "
    "La columna 'output' del CSV de Kaggle está invertida respecto al dataset UCI original "
    "(output=1 ≈ sin enfermedad), por lo que el dataset base se usa con "
    "enfermedad = 1 - output. Los informes de HeartGuard usan output=1 = Enfermedad Presente "
    "y se usan tal cual, solo si el diagnóstico lo confirmó un médico. Herramienta de apoyo: "
    "no sustituye el criterio médico."
)


@dataclass
class RetrainResult:
    version: str
    promovido: bool
    metrics: dict[str, Any]
    motivo: str
    used_ids: list[int] = field(default_factory=list)
    descartados: list[dict[str, Any]] = field(default_factory=list)
    artifacts_dir: str | None = None

    def as_contract(self) -> dict[str, Any]:
        return {"version": self.version, "metrics": self.metrics, "promovido": self.promovido}


def in_holdout(group_key: Any, fraction: float = INFORMES_HOLDOUT_FRACTION) -> bool:
    """Asignación estable (independiente del orden y de la ejecución) al holdout."""
    digest = hashlib.sha256(f"heartguard-holdout:{group_key}".encode()).digest()
    return int.from_bytes(digest[:8], "big") / 2**64 < fraction


def prepare_informes(frame: pd.DataFrame) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    """Valida los informes (13 variables + ``output`` + ``id`` [+ ``paciente_id``]).

    Devuelve un DataFrame limpio con columnas ``FEATURE_NAMES + [LABEL, id, grupo]`` y la
    lista de informes descartados con su motivo (no se interrumpe por un dato inválido).
    """
    rows, rejected = [], []
    for rec in frame.to_dict("records"):
        rid = rec.get("id")
        try:
            values = {n: rec[n] for n in FEATURE_NAMES}
            values = {k: int(v) if isinstance(v, (bool, np.bool_)) else v for k, v in values.items()}
            clean = validate_record(values)
            label = rec.get("output")
            if label is None or (isinstance(label, float) and np.isnan(label)) or int(label) not in (0, 1):
                raise ValueError("El diagnóstico confirmado (output) debe ser 0 o 1.")
        except (ValueError, KeyError, TypeError) as exc:
            rejected.append({"id": rid, "motivo": str(exc)})
            continue
        clean[LABEL] = int(label)
        clean["id"] = rid
        clean["grupo"] = rec.get("paciente_id", rid)
        rows.append(clean)
    cols = [*FEATURE_NAMES, LABEL, "id", "grupo"]
    return pd.DataFrame(rows, columns=cols), rejected


def _evaluate(y: np.ndarray, proba: np.ndarray, threshold: float) -> dict[str, Any]:
    out: dict[str, Any] = compute_metrics(y, proba, threshold)
    out["threshold"] = float(threshold)
    out["confusion_matrix"] = confusion(y, proba, threshold)
    out["n"] = int(len(y))
    return out


def retrain_from_frame(
    informes: pd.DataFrame,
    registry: ModelRegistry,
    *,
    base_data: str | Path = DEFAULT_BASE_DATA,
    config: TrainConfig | None = None,
    tolerance: float = 0.0,
    force: bool = False,
) -> RetrainResult:
    """Entrena un candidato con base + informes confirmados y lo promueve si no es peor.

    ``informes``: DataFrame con las 13 variables, ``output`` (1 = enfermedad, confirmado
    por un médico), ``id`` y opcionalmente ``paciente_id``. ``force=True`` entrena aunque no
    haya informes (útil para regenerar la versión con una configuración nueva).
    """
    cfg = config or TrainConfig()
    clean, rejected = prepare_informes(informes)
    if clean.empty and not force:
        return RetrainResult(
            version=registry.active_version(),
            promovido=False,
            metrics={},
            motivo="No hay informes nuevos con diagnóstico confirmado válidos.",
            descartados=rejected,
        )

    active_version = registry.active_version()
    active = HeartPredictor.from_artifacts(registry.version_dir(active_version))

    # 1. Dataset base con etiqueta corregida y su holdout fijo.
    base = split_data(load_dataset(base_data), **BASE_SPLIT)
    base_dev_X = pd.concat([base.X_train, base.X_val])
    base_dev_y = pd.concat([base.y_train, base.y_val])

    # 2. Informes: holdout estable por paciente.
    mask_hold = clean["grupo"].map(in_holdout).astype(bool) if not clean.empty else pd.Series(dtype=bool)
    inf_train, inf_hold = clean[~mask_hold], clean[mask_hold]

    X_dev = pd.concat([base_dev_X, inf_train[FEATURE_NAMES]], ignore_index=True)
    y_dev = pd.concat([base_dev_y, inf_train[LABEL]], ignore_index=True).astype(int).rename(LABEL)
    X_hold = pd.concat([base.X_test, inf_hold[FEATURE_NAMES]], ignore_index=True)
    y_hold = pd.concat([base.y_test, inf_hold[LABEL]], ignore_index=True).astype(int).to_numpy()

    logger.info(
        "Reentrenamiento: base dev=%d + informes train=%d; holdout base=%d + informes=%d",
        len(base_dev_y), len(inf_train), len(base.y_test), len(inf_hold),
    )

    # 3. Candidato: CV (métricas + umbral) y entrenamiento final con early stopping.
    fold_metrics, oof = cross_validate(X_dev, y_dev, cfg)
    threshold = youden_threshold(y_dev.to_numpy(), oof)
    X_tr, X_val, y_tr, y_val = train_test_split(
        X_dev, y_dev, test_size=inner_val_fraction(cfg), stratify=y_dev, random_state=cfg.seed
    )
    pipe = train_pipeline(X_tr, y_tr, X_val, y_val, cfg)

    # 4. Comparación sobre el mismo holdout.
    cand_proba = pipe.predict_proba(X_hold)
    act_proba = active.predict_proba_frame(X_hold)
    cand_eval = _evaluate(y_hold, cand_proba, threshold)
    act_eval = _evaluate(y_hold, act_proba, active.threshold)
    promote = cand_eval["roc_auc"] >= act_eval["roc_auc"] - tolerance

    subsets: dict[str, Any] = {}
    n_base = len(base.y_test)
    for name, sl in (("base", slice(0, n_base)), ("informes", slice(n_base, None))):
        ys = y_hold[sl]
        if len(ys) and len(set(ys.tolist())) == 2:
            subsets[name] = {
                "candidato": compute_metrics(ys, cand_proba[sl], threshold),
                "activo": compute_metrics(ys, act_proba[sl], active.threshold),
                "n": int(len(ys)),
            }

    now = datetime.now(UTC).isoformat(timespec="seconds")
    new_version = registry.next_version()
    metrics = {
        "holdout": {"candidato": cand_eval, "activo": act_eval, "por_origen": subsets},
        "criterio": "roc_auc_holdout",
        "tolerancia": tolerance,
        "version_activa_previa": active_version,
        "cv": summarize_folds(fold_metrics),
        "cv_folds": cfg.cv_folds,
        "n_samples": {
            "base_dev": int(len(base_dev_y)),
            "informes_train": int(len(inf_train)),
            "holdout_base": int(n_base),
            "holdout_informes": int(len(inf_hold)),
            "train": int(len(y_tr)),
            "val": int(len(y_val)),
        },
        "informes_descartados": len(rejected),
        "threshold": threshold,
    }

    if promote:
        out_dir = registry.root / new_version
        label = new_version
        motivo = (
            f"Promovido: ROC-AUC holdout {cand_eval['roc_auc']:.4f} >= "
            f"{act_eval['roc_auc']:.4f} (activo {active_version})."
        )
    else:
        stamp = now.replace(":", "").replace("-", "").replace("+0000", "Z")
        label = f"{new_version}-rechazado-{stamp}"
        out_dir = registry.root / "rechazados" / label
        motivo = (
            f"No promovido: ROC-AUC holdout {cand_eval['roc_auc']:.4f} < "
            f"{act_eval['roc_auc']:.4f} (activo {active_version})."
        )

    input_dim = int(pipe.preprocessor.transform(X_tr.iloc[:1][FEATURE_NAMES]).shape[1])
    metadata = {
        "feature_names": list(FEATURE_NAMES),
        "threshold": threshold,
        "threshold_strategy": "youden_oof_cv",
        "model_config": model_config_dict(cfg, input_dim),
        "train_config": cfg.to_dict(),
        "target": {
            "name": LABEL,
            "source_column": TARGET,
            "definition": f"base: {LABEL} = 1 - {TARGET}; informes: {LABEL} = output confirmado",
            "positive_class": 1,
            "note_es": NOTA_ETIQUETA,
        },
        "trained_at": now,
        "seed": cfg.seed,
        "version": heart_nn_version,
        "model_version": label,
        "parent_version": active_version,
        "promovido": promote,
        "data": {
            "base": Path(base_data).name,
            "base_split": BASE_SPLIT,
            "informes_ids": [int(i) for i in clean["id"].tolist() if i is not None],
            "informes_holdout_fraction": INFORMES_HOLDOUT_FRACTION,
        },
    }
    out_dir.mkdir(parents=True, exist_ok=False)
    torch.save(pipe.model.state_dict(), out_dir / "model.pt")
    joblib.dump(pipe.preprocessor, out_dir / "preprocessor.joblib")
    write_json(out_dir / "metadata.json", metadata)
    write_json(out_dir / "metrics.json", metrics)
    write_json(out_dir / "history.json", pipe.history)

    # Verificación de que los artefactos escritos cargan antes de activarlos.
    HeartPredictor.from_artifacts(out_dir)
    if promote:
        registry.set_active(new_version)

    used_ids = [int(i) for i in clean["id"].tolist() if i is not None]
    registry.append_log(
        {
            "fecha": now,
            "version": label,
            "version_previa": active_version,
            "promovido": promote,
            "motivo": motivo,
            "roc_auc_candidato": cand_eval["roc_auc"],
            "roc_auc_activo": act_eval["roc_auc"],
            "n_informes": len(used_ids),
            "n_descartados": len(rejected),
        }
    )
    logger.info(motivo)
    return RetrainResult(
        version=label,
        promovido=promote,
        metrics=metrics,
        motivo=motivo,
        used_ids=used_ids,
        descartados=rejected,
        artifacts_dir=str(out_dir),
    )


def quick_config(**overrides: Any) -> TrainConfig:
    """Configuración reducida (útil en tests)."""
    return replace(TrainConfig(), **overrides)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
