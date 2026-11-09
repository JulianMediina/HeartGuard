"""Rellena probabilidad/predicción/nivel de riesgo de los informes con la herramienta de IA."""

from django.core.management.base import BaseCommand, CommandError

from HeartGuard.api import ml_client
from HeartGuard.models import Informe

CAMPOS = ["probabilidad", "prediccion", "nivel_riesgo", "modelo_version"]


class Command(BaseCommand):
    help = "Aplica el modelo de IA a los informes (por defecto, solo a los que no tienen predicción)."

    def add_arguments(self, parser):
        parser.add_argument("--todos", action="store_true", help="Recalcular también los que ya tienen predicción.")
        parser.add_argument("--batch", type=int, default=500, help="Tamaño de lote (por defecto 500).")

    def _predecir_lote(self, lote):
        """Predice el lote; si alguno está fuera del dominio del modelo, se predice uno a uno."""
        try:
            return ml_client.predict_many([informe.features() for informe in lote])
        except ml_client.DatosInvalidosIA:
            resultados = []
            for informe in lote:
                try:
                    resultados.append(ml_client.predict(informe.features()))
                except ml_client.DatosInvalidosIA as exc:
                    self.stdout.write(self.style.WARNING(f"  Informe {informe.id} omitido: {exc}"))
                    resultados.append(None)
            return resultados

    def handle(self, *args, **options):
        qs = Informe.objects.order_by("id")
        if not options["todos"]:
            qs = qs.filter(probabilidad__isnull=True)
        total = qs.count()
        if total == 0:
            self.stdout.write("No hay informes pendientes de predicción.")
            return

        procesados, omitidos, ultimo_id, batch = 0, 0, 0, max(1, options["batch"])
        while True:
            lote = list(qs.filter(id__gt=ultimo_id)[:batch])
            if not lote:
                break
            try:
                resultados = self._predecir_lote(lote)
            except ml_client.ServicioIANoDisponible as exc:
                raise CommandError(f"Servicio de IA no disponible: {exc}") from exc
            actualizar = []
            for informe, resultado in zip(lote, resultados, strict=True):
                if resultado is None:
                    omitidos += 1
                    continue
                informe.aplicar_prediccion(resultado)
                actualizar.append(informe)
            Informe.objects.bulk_update(actualizar, CAMPOS, batch_size=batch)
            procesados += len(lote)
            ultimo_id = lote[-1].id
            self.stdout.write(f"  {procesados}/{total} informes procesados")
        self.stdout.write(self.style.SUCCESS(
            f"Predicción aplicada a {procesados - omitidos} informes ({omitidos} fuera del dominio del modelo)."
        ))
