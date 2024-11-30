import csv
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from HeartGuard.models import Paciente
from django.db import transaction

class Command(BaseCommand):
    help = 'Carga pacientes desde un archivo CSV'

    def add_arguments(self, parser):
        parser.add_argument('file_path', type=str, help='Ruta del archivo CSV con los pacientes')

    def handle(self, *args, **kwargs):
        file_path = kwargs['file_path']

        try:
            # Cargar pacientes desde el archivo CSV
            pacientes = []
            with open(file_path, newline='', encoding='utf-8') as csvfile:
                reader = csv.DictReader(csvfile)

                for row in reader:
                    email = row['usuario_email']
                    try:
                        # Obtener usuario relacionado
                        usuario = User.objects.get(username=email)

                        # Crear paciente en memoria
                        paciente = Paciente(
                            usuario=usuario,
                            nombres=row['nombres'],
                            apellidos=row['apellidos'],
                            tipo_documento=row['tipo_documento'],
                            numero_documento=row['numero_documento'],
                            direccion=row.get('direccion', ''),
                            telefono=row.get('telefono', ''),
                            fecha_nacimiento=row.get('fecha_nacimiento', None),
                            departamento=row.get('departamento', ''),
                            ciudad=row.get('ciudad', ''),
                        )
                        pacientes.append(paciente)
                    except User.DoesNotExist:
                        self.stdout.write(self.style.WARNING(f"El usuario con correo {email} no encontrado para el paciente {row['nombres']} {row['apellidos']}. Saltado."))

            # Insertar pacientes de una sola vez
            with transaction.atomic():
                Paciente.objects.bulk_create(pacientes)
            self.stdout.write(self.style.SUCCESS(f"{len(pacientes)} pacientes creados con éxito."))

        except FileNotFoundError as e:
            self.stdout.write(self.style.ERROR(f"El archivo {e.filename} no existe."))
        except KeyError as e:
            self.stdout.write(self.style.ERROR(f"Falta la columna {e} en el archivo CSV."))
