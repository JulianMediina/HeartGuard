"""Registro de versiones del modelo en disco (sin enlaces simbólicos, apto para Windows).

Estructura de ``root`` (``settings.HEARTGUARD_MODEL_DIR``)::

    artifacts/
    ├── ACTIVE            # texto con la versión activa, p. ej. "2.0.0"
    ├── registry.json     # bitácora de reentrenamientos (se crea al reentrenar)
    ├── 2.0.0/            # artefactos de heart_nn: model.pt, preprocessor.joblib,
    │                     #   metadata.json, metrics.json, history.json
    └── 2.1.0/            # versiones nuevas que escribe el reentrenamiento

Si ``root`` contiene directamente un ``metadata.json`` se trata como un único modelo fijo
(sin versiones ni promoción).

El puntero ``ACTIVE`` se escribe de forma atómica (``os.replace``) y los procesos que
sirven predicciones comprueban su fecha de modificación, de modo que una promoción hecha
por otro proceso (comando de gestión, otro worker) se recoge sin reiniciar.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any

ACTIVE_FILE = "ACTIVE"
REGISTRY_LOG = "registry.json"
_VERSION_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


def _parse_version(name: str) -> tuple[int, int, int] | None:
    m = _VERSION_RE.match(name)
    return tuple(int(x) for x in m.groups()) if m else None  # type: ignore[return-value]


def write_text_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


class ModelRegistry:
    """Acceso a las versiones de artefactos guardadas en ``root``."""

    def __init__(self, root: str | Path):
        self.root = Path(root)

    # --- Consulta -------------------------------------------------------------------
    @property
    def is_single_model(self) -> bool:
        return (self.root / "metadata.json").is_file()

    @property
    def active_file(self) -> Path:
        return self.root / ACTIVE_FILE

    def active_stamp(self) -> float | None:
        """Marca para detectar cambios del puntero (mtime de ``ACTIVE``)."""
        try:
            return self.active_file.stat().st_mtime_ns
        except FileNotFoundError:
            return None

    def versions(self) -> list[str]:
        if not self.root.is_dir():
            return []
        found = [
            p.name
            for p in self.root.iterdir()
            if p.is_dir() and _parse_version(p.name) and (p / "metadata.json").is_file()
        ]
        return sorted(found, key=lambda v: _parse_version(v))

    def active_version(self) -> str:
        if self.is_single_model:
            meta = json.loads((self.root / "metadata.json").read_text(encoding="utf-8"))
            return str(meta.get("model_version") or meta.get("version") or "desconocida")
        if self.active_file.is_file():
            version = self.active_file.read_text(encoding="utf-8").strip()
            if version:
                if not (self.root / version / "metadata.json").is_file():
                    raise FileNotFoundError(
                        f"La versión activa '{version}' no existe en {self.root}."
                    )
                return version
        versions = self.versions()
        if not versions:
            raise FileNotFoundError(f"No hay artefactos de modelo en {self.root}.")
        return versions[-1]

    def version_dir(self, version: str | None = None) -> Path:
        if self.is_single_model:
            return self.root
        return self.root / (version or self.active_version())

    def next_version(self) -> str:
        """Siguiente versión menor: 2.0.0 -> 2.1.0 -> 2.2.0 ..."""
        parsed = [_parse_version(v) for v in self.versions()] or [(2, 0, 0)]
        major, minor, _ = max(parsed)
        minor += 1
        while (self.root / f"{major}.{minor}.0").exists():  # directorio huérfano de un intento fallido
            minor += 1
        return f"{major}.{minor}.0"

    # --- Escritura ------------------------------------------------------------------
    def set_active(self, version: str) -> None:
        if self.is_single_model:
            raise RuntimeError("HEARTGUARD_MODEL_DIR apunta a un modelo fijo; no admite promoción.")
        if not (self.root / version / "metadata.json").is_file():
            raise FileNotFoundError(f"No existe la versión {version} en {self.root}.")
        write_text_atomic(self.active_file, version + "\n")

    def read_log(self) -> list[dict[str, Any]]:
        path = self.root / REGISTRY_LOG
        if not path.is_file():
            return []
        return json.loads(path.read_text(encoding="utf-8"))

    def append_log(self, entry: dict[str, Any]) -> None:
        log = self.read_log()
        log.append(entry)
        write_text_atomic(
            self.root / REGISTRY_LOG, json.dumps(log, indent=2, ensure_ascii=False) + "\n"
        )
