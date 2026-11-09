"""Señales de la app HeartGuard.

En la versión original, ``post_save`` de ``Informe`` reentrenaba la red neuronal en cada
guardado (bloqueando la petición y sobrescribiendo los artefactos) y enviaba un correo a
todos los pacientes con ``output=1`` en cada guardado. Ambos comportamientos se eliminaron
(ver docs/AUDIT.md, ML-04 y SEC-12):

* El reentrenamiento es explícito: ``HeartGuard.ml.service.retrain()``, el comando
  ``python manage.py reentrenar_modelo`` o ``POST /api/v1/ml/reentrenar``.
* Las alertas las envía el backend de forma explícita (``HeartGuard/api/services.py``).

Este módulo se conserva vacío a propósito: importarlo no tiene efectos secundarios.
"""
