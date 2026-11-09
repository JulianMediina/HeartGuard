"""Carga pacientes (y sus usuarios) desde un CSV.

Columnas: usuario_email, nombres, apellidos, tipo_documento, numero_documento y, opcionalmente,
direccion, telefono, fecha_nacimiento, departamento, ciudad.

Los usuarios nuevos se crean con contraseña inutilizable (nada de contraseñas por defecto en
texto plano, como hacían los antiguos `load_user`/`encrypt_passwords`): el paciente obtiene acceso
cuando un médico/administrador le asigna una contraseña.
"""

import csv

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from HeartGuard.models import Paciente


class Command(BaseCommand):
    help = "Carga pacientes desde un archivo CSV"

    def add_arguments(self, parser):
        parser.add_argument("file_path", type=str, help="Ruta del archivo CSV con los pacientes")

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            with open(options["file_path"], newline="", encoding="utf-8") as csvfile:
                filas = list(csv.DictReader(csvfile))
        except FileNotFoundError as exc:
            raise CommandError(f"El archivo {options['file_path']} no existe.") from exc

        creados = 0
        try:
            for row in filas:
                email = row["usuario_email"].strip()
                if Paciente.objects.filter(numero_documento=row["numero_documento"]).exists():
                    self.stdout.write(self.style.WARNING(f"Documento {row['numero_documento']} ya existe. Saltado."))
                    continue
                usuario, nuevo = User.objects.get_or_create(
                    username=email, defaults={"email": email, "first_name": row["nombres"][:150],
                                              "last_name": row["apellidos"][:150]},
                )
                if nuevo:
                    usuario.set_unusable_password()
                    usuario.save(update_fields=["password"])
                elif hasattr(usuario, "paciente"):
                    self.stdout.write(self.style.WARNING(f"El usuario {email} ya es paciente. Saltado."))
                    continue
                Paciente.objects.create(
                    usuario=usuario,
                    nombres=row["nombres"],
                    apellidos=row["apellidos"],
                    tipo_documento=row.get("tipo_documento") or "CC",
                    numero_documento=row["numero_documento"],
                    direccion=row.get("direccion", ""),
                    telefono=row.get("telefono", ""),
                    fecha_nacimiento=row.get("fecha_nacimiento") or None,
                    departamento=row.get("departamento", ""),
                    ciudad=row.get("ciudad", ""),
                )
                creados += 1
        except KeyError as exc:
            raise CommandError(f"Falta la columna {exc} en el archivo CSV.") from exc
        self.stdout.write(self.style.SUCCESS(f"{creados} pacientes creados con éxito."))
