import csv
import torch
from django.core.management.base import BaseCommand
from HeartGuard.models import Paciente, Informe
from sklearn.preprocessing import StandardScaler
from torch import nn
import joblib  # Usado para cargar el scaler guardado previamente

# Definir la estructura de tu modelo (igual a la de tu entrenamiento)
class HeartAttackClassifier(nn.Module):
    def __init__(self):
        super(HeartAttackClassifier, self).__init__()
        self.linear = nn.Sequential(
            nn.Linear(13, 64),  # Capa de entrada con 13 características y 64 neuronas
            nn.ReLU(),          # Función de activación ReLU
            nn.Dropout(0.3),    # Dropout del 30%
            nn.Linear(64, 32),  # Capa intermedia de 64 a 32 neuronas
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(32, 1),   # Capa de salida con 1 neurona (para clasificación binaria)
            nn.Sigmoid()        # Función de activación Sigmoid para obtener probabilidades
        )

    def forward(self, x):
        return self.linear(x)

class Command(BaseCommand):
    help = 'Carga informes desde un archivo CSV'

    def add_arguments(self, parser):
        parser.add_argument('file_path', type=str, help='Ruta del archivo CSV con los informes')

    def handle(self, *args, **kwargs):
        file_path = kwargs['file_path']

        # Cargar el modelo entrenado
        model = HeartAttackClassifier()
        model.load_state_dict(torch.load('model_heart_attack.pth'))  # Asegúrate de que el archivo esté en la ruta correcta
        model.eval()  # Colocar el modelo en modo de evaluación

        # Cargar el scaler entrenado (debe ser el mismo que usaste durante el entrenamiento)
        scaler = joblib.load('scaler.pkl')  # Asegúrate de que el archivo del scaler esté en la ruta correcta

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

                    # Preprocesar los datos (solo las características relevantes)
                    features = [
                        float(row['age']),
                        float(row['sex']),
                        float(row['cp']),
                        float(row['trtbps']),
                        float(row['chol']),
                        float(row['fbs']),
                        float(row['restecg']),
                        float(row['thalachh']),
                        float(row['exng']),
                        float(row['oldpeak']),
                        float(row['slp']),
                        float(row['caa']),
                        float(row['thall']),
                        
                    ]

                    # Escalar las características usando el scaler entrenado
                    features_scaled = scaler.transform([features])

                    # Convertir las características escaladas a tensor de PyTorch
                    features_tensor = torch.tensor(features_scaled, dtype=torch.float)

                    # Realizar la predicción usando el modelo
                    with torch.no_grad():
                        prediction = model(features_tensor).item()  # Obtener el valor predicho

                    # Convertir la predicción a un valor binario (0 o 1)
                    output = 1 if prediction >= 0.5 else 0

                    # Crear el informe con la predicción
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
                        output=output  # Asignar la predicción al campo 'output'
                    )

                    self.stdout.write(self.style.SUCCESS(f"Informe creado para el paciente con documento {documento}, predicción: {output}."))

        except FileNotFoundError:
            self.stdout.write(self.style.ERROR(f"El archivo {file_path} no existe."))
        except KeyError as e:
            self.stdout.write(self.style.ERROR(f"Falta la columna {e} en el archivo CSV."))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error inesperado: {e}"))
