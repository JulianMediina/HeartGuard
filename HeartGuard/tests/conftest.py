import itertools
from types import SimpleNamespace

import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.test import APIClient

from HeartGuard.models import Informe, Medico, Paciente

PASSWORD = "Clave1234X"
_seq = itertools.count(1)

FEATURES = {
    "age": 54, "sex": 1, "cp": 0, "trtbps": 130, "chol": 250, "fbs": 0, "restecg": 1,
    "thalachh": 150, "exng": 0, "oldpeak": 1.0, "slp": 1, "caa": 0, "thall": 2,
}


def nivel(p):
    return "bajo" if p < 0.33 else "moderado" if p < 0.66 else "alto"


class FakeService:
    """Doble del servicio de IA: la probabilidad depende de la edad (age/100)."""

    def __init__(self):
        self.calls = []

    def _pred(self, f):
        p = min(f["age"] / 100, 0.99)
        return {"probabilidad": p, "prediccion": int(p >= 0.5), "nivel_riesgo": nivel(p), "modelo_version": "test-1"}

    def predict(self, features):
        self.calls.append(features)
        return self._pred(features)

    def predict_many(self, lista):
        return [self._pred(f) for f in lista]

    def model_info(self):
        return {"version": "test-1", "threshold": 0.5, "metrics": {}, "features": [], "history": [],
                "entrenado_en": None, "nota_etiqueta": "test"}

    def retrain(self, qs):
        return {"version": "test-2", "metrics": {"n": qs.count()}, "promovido": True}


@pytest.fixture(autouse=True)
def _limpiar_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def fake_ml(monkeypatch):
    fake = FakeService()
    monkeypatch.setattr("HeartGuard.api.ml_client._service", lambda: fake)
    return fake


@pytest.fixture
def api():
    return APIClient()


def crear_paciente(documento=None, email=None, **extra):
    n = next(_seq)
    email = email or f"paciente{n}@test.com"
    user = User.objects.create_user(username=email, email=email, password=PASSWORD)
    return Paciente.objects.create(
        usuario=user, nombres=extra.pop("nombres", f"Nombre{n}"), apellidos=extra.pop("apellidos", f"Apellido{n}"),
        numero_documento=documento or f"10{n:06d}", **extra,
    )


def crear_informe(paciente, medico=None, **campos):
    datos = {**FEATURES, **campos}
    datos["fbs"], datos["exng"] = bool(datos["fbs"]), bool(datos["exng"])
    return Informe.objects.create(paciente=paciente, medico=medico, documento=paciente.numero_documento, **datos)


@pytest.fixture
def medico(db):
    user = User.objects.create_user(username="medico@hg.com", email="medico@hg.com", password=PASSWORD)
    return Medico.objects.create(usuario=user, nombres="Ana", apellidos="Médica", especialidad="Cardiología")


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(username="root", email="root@hg.com", password=PASSWORD, is_staff=True)


@pytest.fixture
def paciente(db):
    return crear_paciente(documento="111", email="p1@test.com", nombres="Pedro", apellidos="Pérez")


@pytest.fixture
def otro_paciente(db):
    return crear_paciente(documento="222", email="p2@test.com", nombres="Lucía", apellidos="Gómez")


@pytest.fixture
def como(api):
    """`como(user)` autentica el cliente con ese usuario."""

    def _login(user):
        api.force_authenticate(user=user)
        return api

    return _login


@pytest.fixture
def ctx(medico, paciente, otro_paciente, admin_user):
    return SimpleNamespace(medico=medico, paciente=paciente, otro=otro_paciente, admin=admin_user)
