"""Herramienta de IA de HeartGuard.

Envuelve el paquete ``heart_nn`` (red neuronal de predicción de enfermedad cardíaca) para
que el resto de la aplicación lo use a través de una interfaz estable
(``HeartGuard.ml.service``). Importar este paquete no carga el modelo ni tiene efectos
secundarios: el modelo se carga de forma perezosa en la primera predicción.
"""
