"""Carga informes desde un CSV y aplica la herramienta de IA a cada uno.

El CSV debe tener la columna `documento` y las 13 variables clínicas; `output` (diagnóstico
confirmado) es opcional. A diferencia de la versión original, la predicción del modelo ya no se
guarda en `output` (que es el diagnóstico médico) sino en `probabilidad/prediccion/nivel_riesgo`.
"""

import csv

from django.core.management.base import BaseCommand, CommandError

from HeartGuard.api import ml_client
from HeartGuard.models import Informe, Paciente


class Command(BaseCommand):
    help = "Carga informes desde un archivo CSV"

    def add_arguments(self, parser):
        parser.add_argument("file_path", type=str, help="Ruta del archivo CSV con los informes")

    def handle(self, *args, **options):
        try:
            with open(options["file_path"], newline="", encoding="utf-8") as csvfile:
                filas = list(csv.DictReader(csvfile))
        except FileNotFoundError as exc:
            raise CommandError(f"El archivo {options['file_path']} no existe.") from exc

        creados = 0
        for row in filas:
            documento = row.get("documento")
            paciente = Paciente.objects.filter(numero_documento=documento).first()
            if paciente is None:
                self.stdout.write(self.style.ERROR(f"No se encontró un paciente con el documento {documento}."))
                continue
            try:
                datos = {name: float(row[name]) for name in Informe.FEATURE_NAMES}
            except (KeyError, ValueError) as exc:
                raise CommandError(f"Fila inválida o columna faltante: {exc}") from exc
            output = row.get("output")
            informe = Informe(
                paciente=paciente,
                documento=documento,
                output=int(output) if output not in (None, "") else None,
                **{k: (v if k == "oldpeak" else int(v)) for k, v in datos.items()},
            )
            informe.fbs, informe.exng = bool(informe.fbs), bool(informe.exng)
            try:
                informe.aplicar_prediccion(ml_client.predict(informe.features()))
            except ml_client.ServicioIANoDisponible as exc:
                self.stdout.write(self.style.WARNING(f"Sin predicción para {documento}: {exc}"))
            informe.save()
            creados += 1
        self.stdout.write(self.style.SUCCESS(f"{creados} informes creados."))
