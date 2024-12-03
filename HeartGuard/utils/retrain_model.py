import os
import numpy as np
import torch
import pickle
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import StandardScaler
from django.db import transaction
from HeartGuard.models import Informe
from HeartGuard.utils.prediction_base import HeartAttackClassifier  # Asegúrate de importar la clase correcta

def retrain_model():
    """
    Reentrena un modelo PyTorch utilizando datos de la base de datos.
    Los archivos de modelo y scaler están ubicados en rutas predefinidas.
    """
    # Rutas de los archivos
    model_path = "model_heart_attack.pth"  # Archivo del modelo
    scaler_path = "scaler.pkl"             # Archivo del scaler

    # Validar que los archivos existen
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"El archivo del modelo no se encontró en {model_path}")
    if not os.path.exists(scaler_path):
        raise FileNotFoundError(f"El archivo del scaler no se encontró en {scaler_path}")

    try:
        # Crear una instancia del modelo y cargar los pesos
        model = HeartAttackClassifier()  # Instanciamos el modelo
        model.load_state_dict(torch.load(model_path, map_location=torch.device('cpu')))  # Cargamos los pesos en el modelo
        model.train()  # Asegurarse de que el modelo esté en modo entrenamiento
        print(f"Modelo cargado desde {model_path}")

        # Cargar el scaler existente
        with open(scaler_path, 'rb') as f:
            scaler = pickle.load(f)
        print(f"Scaler cargado desde {scaler_path}")

        # Obtener los datos que no han sido usados para entrenamiento
        informes = Informe.objects.filter(is_used_for_training=False)
        if not informes.exists():
            print("No hay datos nuevos para reentrenar el modelo.")
            return

        # Preparar los datos
        X, y = [], []
        for informe in informes:
            # Asegurarse de que los datos son numéricos y no contienen valores nulos
            X.append([  
                informe.age if informe.age is not None else 0,
                informe.sex if informe.sex is not None else 0,
                informe.cp if informe.cp is not None else 0,
                informe.trtbps if informe.trtbps is not None else 0,
                informe.chol if informe.chol is not None else 0,
                informe.fbs if informe.fbs is not None else 0,
                informe.restecg if informe.restecg is not None else 0,
                informe.thalachh if informe.thalachh is not None else 0,
                informe.exng if informe.exng is not None else 0,
                informe.oldpeak if informe.oldpeak is not None else 0,
                informe.slp if informe.slp is not None else 0,
                informe.caa if informe.caa is not None else 0,
                informe.thall if informe.thall is not None else 0,
            ])
            y.append(informe.output if informe.output is not None else 0)

        # Convertir a np.array y asegurarse de que sean del tipo correcto
        X = np.array(X, dtype=np.float32)  # Asegurarse de que X sea float32
        y = np.array(y, dtype=np.float32)  # Asegurarse de que y sea float32

        # Escalar los datos
        X_scaled = scaler.transform(X)

        # Convertir a tensores
        X_tensor = torch.tensor(X_scaled, dtype=torch.float32)
        y_tensor = torch.tensor(y, dtype=torch.float32)

        # Crear DataLoader para entrenamiento
        dataset = TensorDataset(X_tensor, y_tensor)
        data_loader = DataLoader(dataset, batch_size=32, shuffle=True)

        # Configurar optimizador y pérdida
        optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
        loss_function = torch.nn.BCELoss()  # Pérdida para clasificación binaria

        # Entrenamiento
        epochs = 100
        for epoch in range(epochs):
            epoch_loss = 0.0
            for batch_X, batch_y in data_loader:
                optimizer.zero_grad()
                outputs = model(batch_X)
                # Asegurarse de que outputs y batch_y tengan la misma forma
                loss = loss_function(outputs.view(-1), batch_y)  # Usamos view(-1) para aplanar outputs
                loss.backward()
                optimizer.step()
                epoch_loss += loss.item()
            print(f"Epoch {epoch + 1}/{epochs}, Loss: {epoch_loss:.4f}")

        # Guardar el modelo actualizado
        torch.save(model.state_dict(), model_path)
        print(f"Modelo actualizado y guardado en {model_path}")

        # Guardar el scaler actualizado (opcional)
        with open(scaler_path, 'wb') as f:
            pickle.dump(scaler, f)
        print(f"Scaler actualizado y guardado en {scaler_path}")

        # Marcar los datos como usados para entrenamiento
        with transaction.atomic():
            informes.update(is_used_for_training=True)
        print("Los registros usados han sido marcados como is_used_for_training=True.")

    except Exception as e:
        print(f"Error durante el reentrenamiento: {e}")