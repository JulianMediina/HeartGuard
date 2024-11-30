import csv
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User

class Command(BaseCommand):
    help = 'Carga usuarios desde un archivo CSV'

    def add_arguments(self, parser):
        parser.add_argument('file_path', type=str, help='Ruta del archivo CSV con los usuarios')

    def handle(self, *args, **kwargs):
        file_path = kwargs['file_path']
        default_password = "password123"  # Contraseña predeterminada para los usuarios

        try:
            # Cargar usuarios desde el archivo CSV
            usuarios = []
            with open(file_path, newline='', encoding='utf-8') as csvfile:
                reader = csv.DictReader(csvfile)

                for row in reader:
                    email = row['usuario_email']
                    if User.objects.filter(username=email).exists():
                        self.stdout.write(self.style.WARNING(f"El usuario con correo {email} ya existe. Saltado."))
                        continue

                    # Crear usuario en memoria
                    usuario = User(
                        username=email,  # El correo es el nombre de usuario
                        first_name=row['nombres'],
                        last_name=row['apellidos'],
                        email=email,
                        password=default_password,
                    )
                    usuarios.append(usuario)

            # Insertar usuarios de una sola vez
            User.objects.bulk_create(usuarios)
            self.stdout.write(self.style.SUCCESS(f"{len(usuarios)} usuarios creados con éxito."))

        except FileNotFoundError as e:
            self.stdout.write(self.style.ERROR(f"El archivo {e.filename} no existe."))
        except KeyError as e:
            self.stdout.write(self.style.ERROR(f"Falta la columna {e} en el archivo CSV."))
