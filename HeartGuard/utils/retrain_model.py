import os
import numpy as np
import torch
import pickle
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import StandardScaler
from django.db import transaction
from HeartGuard.models import Informe


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
        # Cargar el modelo existente
        model = torch.load(model_path)
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
            X.append([
                informe.age,
                informe.sex,
                informe.cp,
                informe.trtbps,
                informe.chol,
                informe.fbs,
                informe.restecg,
                informe.thalachh,
                informe.exng,
                informe.oldpeak,
                informe.slp,
                informe.caa,
                informe.thall,
            ])
            y.append(informe.output)

        X = np.array(X)
        y = np.array(y)

        # Escalar los datos
        X_scaled = scaler.transform(X)

        # Convertir datos a tensores
        X_tensor = torch.tensor(X_scaled, dtype=torch.float32)
        y_tensor = torch.tensor(y, dtype=torch.float32)

        # Crear DataLoader para entrenamiento
        dataset = TensorDataset(X_tensor, y_tensor)
        data_loader = DataLoader(dataset, batch_size=32, shuffle=True)

        # Configurar optimizador y pérdida
        optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
        loss_function = torch.nn.BCELoss()  # Pérdida para clasificación binaria

        # Entrenamiento
        epochs = 50
        for epoch in range(epochs):
            epoch_loss = 0.0
            for batch_X, batch_y in data_loader:
                optimizer.zero_grad()
                outputs = model(batch_X)
                loss = loss_function(outputs.squeeze(), batch_y)
                loss.backward()
                optimizer.step()
                epoch_loss += loss.item()
            print(f"Epoch {epoch + 1}/{epochs}, Loss: {epoch_loss:.4f}")

        # Guardar el modelo actualizado
        torch.save(model, model_path)
        print(f"Modelo actualizado y guardado en {model_path}")

        # Guardar el scaler actualizado (opcional)
        with open(scaler_path, 'wb') as f:
            pickle.dump(scaler, f)
        print(f"Scaler actualizado y guardado en {scaler_path}")

        # Marcar los datos como usados para entrenamiento
        with transaction.atomic():
            informes.update(is_used_for_training=True)
        print("Los registros usados han sido marcados como `is_used_for_training=True`.")

    except Exception as e:
        print(f"Error durante el reentrenamiento: {e}")
