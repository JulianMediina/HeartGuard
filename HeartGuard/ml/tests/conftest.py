"""Fixtures de los tests del servicio de IA (no necesitan base de datos)."""

import shutil
from pathlib import Path

import pytest
import torch

ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts"
SEED_VERSION = "2.0.0"

# Paciente con perfil de alto riesgo (Cleveland: varón mayor, asintomático, angina de
# esfuerzo, 3 vasos, FC máxima baja) y otro de bajo riesgo.
ALTO = dict(age=67, sex=1, cp=0, trtbps=160, chol=286, fbs=0, restecg=0, thalachh=108,
            exng=1, oldpeak=1.5, slp=1, caa=3, thall=2)
BAJO = dict(age=41, sex=0, cp=1, trtbps=130, chol=204, fbs=0, restecg=0, thalachh=172,
            exng=0, oldpeak=1.4, slp=2, caa=0, thall=2)


@pytest.fixture
def registry_dir(tmp_path: Path) -> Path:
    """Registro temporal con la versión semilla 2.0.0 activa."""
    root = tmp_path / "artifacts"
    shutil.copytree(ARTIFACTS / SEED_VERSION, root / SEED_VERSION)
    (root / "ACTIVE").write_text(SEED_VERSION + "\n", encoding="utf-8")
    return root


@pytest.fixture
def inverted_registry_dir(registry_dir: Path) -> Path:
    """Registro cuyo modelo activo predice al revés (como el HeartGuard original)."""
    model_path = registry_dir / SEED_VERSION / "model.pt"
    state = torch.load(model_path, map_location="cpu", weights_only=True)
    last = max({k.rsplit(".", 1)[0] for k in state}, key=lambda name: int(name.split(".")[-1]))
    state[f"{last}.weight"] = -state[f"{last}.weight"]
    state[f"{last}.bias"] = -state[f"{last}.bias"]
    torch.save(state, model_path)
    return registry_dir
