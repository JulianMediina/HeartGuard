"""Corrige la semántica de ``output`` de los informes heredados (ver HeartGuard/ml/legacy.py).

Uso::

    python manage.py sanear_informes_legado --dry-run   # solo cuenta
    python manage.py sanear_informes_legado             # aplica los cambios
"""

import json

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Invierte el output de las filas Kaggle, anula el output heredado del modelo original "
        "y recalcula predicciones."
    )

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="No modifica nada; solo informa.")

    def handle(self, *args, **opts):
        from HeartGuard.ml.legacy import sanear_informes_legado
        from HeartGuard.models import Informe

        resumen = sanear_informes_legado(Informe, dry_run=opts["dry_run"])
        self.stdout.write(json.dumps(resumen, indent=2, ensure_ascii=False))
