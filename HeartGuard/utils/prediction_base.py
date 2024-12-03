# Importación de bibliotecas necesarias
import torch
from torch import nn, optim
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, recall_score, precision_score, f1_score, classification_report 
import pickle  # Para manejar archivos .pkl

# Cargar el dataset
dataset = pd.read_csv('heart.csv')

# Preprocesamiento del dataset
X = dataset.iloc[:, :-1].values
y = dataset.iloc[:, -1].values

# Escalado de las características
scaler = StandardScaler()
X = scaler.fit_transform(X)

# Convertir los datos a tensores
X = torch.tensor(X, dtype=torch.float)
y = torch.tensor(y, dtype=torch.float).unsqueeze(dim=1)  # Ajustar la dimensión de y

# División del dataset
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42)

# Definición del modelo de red neuronal
class HeartAttackClassifier(nn.Module):
    def __init__(self):
        super(HeartAttackClassifier, self).__init__()
        self.linear = nn.Sequential(
            nn.Linear(13, 64),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )

    def forward(self, x):
        return self.linear(x)

# Implementación de la función de pérdida Focal Loss
class FocalLoss(nn.Module):
    def __init__(self, alpha=1, gamma=2, reduction='mean'):
        super(FocalLoss, self).__init__()
        self.alpha = alpha
        self.gamma = gamma
        self.reduction = reduction

    def forward(self, inputs, targets):
        BCE_loss = nn.BCELoss()(inputs, targets)
        pt = torch.exp(-BCE_loss)
        F_loss = self.alpha * (1-pt)**self.gamma * BCE_loss
        return torch.mean(F_loss) if self.reduction == 'mean' else torch.sum(F_loss)

# Función de entrenamiento con early stopping
def train_with_early_stopping(model, loss_fn, optimizer, patience=20):
    epochs = 1000
    best_test_loss = float('inf')
    early_stop_counter = 0

    for epoch in range(epochs):
        model.train()
        y_pred = model(X_train)
        loss = loss_fn(y_pred, y_train)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        model.eval()
        with torch.inference_mode():
            test_pred = model(X_test)
            test_loss = loss_fn(test_pred, y_test)

        if test_loss < best_test_loss:
            best_test_loss = test_loss
            early_stop_counter = 0
        else:
            early_stop_counter += 1

        if early_stop_counter >= patience:
            print(f"Deteniendo temprano en la época {epoch}")
            break

        print(f"Época: {epoch} | Pérdida de entrenamiento: {loss} | Pérdida de prueba: {test_loss}")

# Guardar el escalador y otros objetos
def save_scaler(scaler, file_name='scaler.pkl'):
    with open(file_name, 'wb') as f:
        pickle.dump(scaler, f)
    print(f"Escalador guardado en {file_name}")

# Cargar el escalador
def load_scaler(file_name='scaler.pkl'):
    with open(file_name, 'rb') as f:
        return pickle.load(f)

# Guardar el modelo PyTorch
def save_model(model, file_name='model_heart_attack.pth'):
    torch.save(model.state_dict(), file_name)
    print(f"Modelo guardado en {file_name}")

# Cargar el modelo PyTorch
def load_model(model, file_name='model_heart_attack.pth'):
    model.load_state_dict(torch.load(file_name))
    model.eval()
    print(f"Modelo cargado desde {file_name}")
    return model

# Instanciar el modelo, optimizador y función de pérdida
model = HeartAttackClassifier()
optimizer = optim.Adam(model.parameters(), lr=0.001)
loss_fn = FocalLoss()

# Entrenar el modelo con early stopping
train_with_early_stopping(model, loss_fn, optimizer)

# Función para hacer predicciones
def predict(model, X):
    model.eval()
    with torch.inference_mode():
        return model(X)

y_pred = predict(model, X_test).round()

# Generar el reporte de evaluación
def generate_report(y_test, y_pred):
    print(f"Exactitud (Accuracy): {accuracy_score(y_test, y_pred)}")
    print(f"Recall: {recall_score(y_test, y_pred)}")
    print(f"Precisión: {precision_score(y_test, y_pred)}")
    print(f"F1 Score: {f1_score(y_test, y_pred)}")
    print(classification_report(y_test, y_pred))

# Generar reporte
generate_report(y_test, y_pred)

# Guardar el modelo y el escalador
save_scaler(scaler, 'scaler.pkl')
save_model(model, 'model_heart_attack.pth')
