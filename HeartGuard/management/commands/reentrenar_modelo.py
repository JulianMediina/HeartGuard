"""Reentrena la herramienta de IA con los informes con diagnóstico confirmado.

Uso::

    python manage.py reentrenar_modelo [--tolerancia 0.0] [--forzar] [--epocas N] [--folds K]

Sustituye al reentrenamiento que la versión original lanzaba en cada guardado de un
informe (señal ``post_save``). Ver ``HeartGuard/ml/README.md``.
"""

import json
import logging
from dataclasses import replace

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Reentrena el modelo de IA con informes confirmados y lo promueve si no empeora."

    def add_arguments(self, parser):
        parser.add_argument("--tolerancia", type=float, default=0.0,
                            help="Caída de ROC-AUC admitida para promover (por defecto 0).")
        parser.add_argument("--forzar", action="store_true",
                            help="Entrena aunque no haya informes nuevos.")
        parser.add_argument("--epocas", type=int, default=None, help="Máximo de épocas.")
        parser.add_argument("--folds", type=int, default=None, help="Folds de la validación cruzada.")

    def handle(self, *args, **opts):
        from heart_nn.config import TrainConfig

        from HeartGuard.ml import service

        logging.getLogger("HeartGuard.ml").setLevel(logging.INFO)
        cfg = TrainConfig()
        if opts["epocas"]:
            cfg = replace(cfg, max_epochs=opts["epocas"])
        if opts["folds"]:
            cfg = replace(cfg, cv_folds=opts["folds"])
        try:
            result = service.retrain(
                None, config=cfg, tolerance=opts["tolerancia"], force=opts["forzar"]
            )
        except RuntimeError as exc:
            raise CommandError(str(exc)) from exc
        style = self.style.SUCCESS if result["promovido"] else self.style.WARNING
        self.stdout.write(style(result.get("motivo", "")))
        resumen = {k: result.get(k) for k in ("version", "promovido", "informes_usados",
                                                "informes_nuevos_marcados")}
        holdout = result["metrics"].get("holdout", {})
        if holdout:
            resumen["roc_auc_candidato"] = holdout["candidato"]["roc_auc"]
            resumen["roc_auc_activo"] = holdout["activo"]["roc_auc"]
        self.stdout.write(json.dumps(resumen, indent=2, ensure_ascii=False))
