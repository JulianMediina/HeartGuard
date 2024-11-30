import csv
from django.core.management.base import BaseCommand
from HeartGuard.models import Paciente, Informe


class Command(BaseCommand):
    help = 'Carga informes desde un archivo CSV'

    def add_arguments(self, parser):
        parser.add_argument('file_path', type=str, help='Ruta del archivo CSV con los informes')

    def handle(self, *args, **kwargs):
        file_path = kwargs['file_path']

        try:
            with open(file_path, newline='', encoding='utf-8') as csvfile:
                reader = csv.DictReader(csvfile)

                for row in reader:
                    # Obtener el paciente usando el documento
                    documento = row.get('documento')
                    try:
                        paciente = Paciente.objects.get(numero_documento=documento)
                    except Paciente.DoesNotExist:
                        self.stdout.write(
                            self.style.ERROR(f"No se encontró un paciente con el documento {documento}. Informe ignorado.")
                        )
                        continue

                    # Crear el informe
                    Informe.objects.create(
                        paciente=paciente,
                        age=row['age'],
                        sex=row['sex'],
                        cp=row['cp'],
                        trtbps=row['trtbps'],
                        chol=row['chol'],
                        fbs=row['fbs'],
                        restecg=row['restecg'],
                        thalachh=row['thalachh'],
                        exng=row['exng'],
                        oldpeak=row['oldpeak'],
                        slp=row['slp'],
                        caa=row['caa'],
                        thall=row['thall'],
                        output=row['output']
                    )

                    self.stdout.write(self.style.SUCCESS(f"Informe creado para el paciente con documento {documento}."))

        except FileNotFoundError:
            self.stdout.write(self.style.ERROR(f"El archivo {file_path} no existe."))
        except KeyError as e:
            self.stdout.write(self.style.ERROR(f"Falta la columna {e} en el archivo CSV."))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error inesperado: {e}"))
