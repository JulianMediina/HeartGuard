import pytest
from django.contrib.auth.models import User

from HeartGuard.models import Paciente

from .conftest import PASSWORD

pytestmark = pytest.mark.django_db

REGISTRO = {
    "email": "nuevo@test.com", "password": "Segura123", "password_confirmation": "Segura123",
    "nombres": "Nuevo", "apellidos": "Paciente", "tipo_documento": "CC", "numero_documento": "999",
}


def login(api, username, password=PASSWORD):
    return api.post("/api/v1/auth/login", {"username": username, "password": password}, format="json")


def test_login_devuelve_tokens_y_usuario(api, medico):
    r = login(api, "medico@hg.com")
    assert r.status_code == 200
    assert {"access", "refresh", "user"} <= r.data.keys()
    assert r.data["user"]["role"] == "medico"
    assert r.data["user"]["profile_id"] == medico.id
    assert r.data["user"]["nombres"] == "Ana"


def test_login_roles_paciente_y_admin(api, paciente, admin_user):
    assert login(api, "p1@test.com").data["user"]["role"] == "paciente"
    assert login(api, "root").data["user"]["role"] == "admin"


def test_login_incorrecto(api, medico):
    assert login(api, "medico@hg.com", "mala").status_code == 401


def test_login_usuario_sin_rol_rechazado(api, db):
    User.objects.create_user(username="nadie", password=PASSWORD)
    r = login(api, "nadie")
    assert r.status_code in (400, 401)
    assert "access" not in r.data


def test_me_requiere_token(api):
    assert api.get("/api/v1/auth/me").status_code == 401


def test_me_con_bearer_refresh_y_logout(api, medico):
    tokens = login(api, "medico@hg.com").data
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    assert api.get("/api/v1/auth/me").data["username"] == "medico@hg.com"

    r = api.post("/api/v1/auth/refresh", {"refresh": tokens["refresh"]}, format="json")
    assert r.status_code == 200 and "access" in r.data
    nuevo_refresh = r.data.get("refresh", tokens["refresh"])

    assert api.post("/api/v1/auth/logout", {"refresh": nuevo_refresh}, format="json").status_code == 205
    # El refresh en lista negra ya no sirve
    assert api.post("/api/v1/auth/refresh", {"refresh": nuevo_refresh}, format="json").status_code == 401


def test_logout_con_token_de_otro_usuario(api, medico, paciente):
    ajeno = login(api, "p1@test.com").data["refresh"]
    api.force_authenticate(medico.usuario)
    assert api.post("/api/v1/auth/logout", {"refresh": ajeno}, format="json").status_code == 400


def test_rutas_con_y_sin_barra_final(api, medico):
    api.force_authenticate(medico.usuario)
    assert api.get("/api/v1/auth/me").status_code == 200
    assert api.get("/api/v1/auth/me/").status_code == 200
    assert api.get("/api/v1/pacientes").status_code == 200
    assert api.get("/api/v1/pacientes/").status_code == 200


class TestCambioPassword:
    def test_ok_e_invalida_refresh(self, api, paciente):
        refresh = login(api, "p1@test.com").data["refresh"]
        api.force_authenticate(paciente.usuario)
        r = api.post("/api/v1/auth/change-password",
                     {"old_password": PASSWORD, "new_password": "NuevaClave9"}, format="json")
        assert r.status_code == 204
        paciente.usuario.refresh_from_db()
        assert paciente.usuario.check_password("NuevaClave9")
        api.force_authenticate(None)
        assert api.post("/api/v1/auth/refresh", {"refresh": refresh}, format="json").status_code == 401

    def test_actual_incorrecta(self, api, paciente):
        api.force_authenticate(paciente.usuario)
        r = api.post("/api/v1/auth/change-password",
                     {"old_password": "otra", "new_password": "NuevaClave9"}, format="json")
        assert r.status_code == 400 and "old_password" in r.data

    @pytest.mark.parametrize("nueva", ["corta1A", "sinnumeroABC", "sinmayus123", "SINMINUS123"])
    def test_complejidad(self, api, paciente, nueva):
        api.force_authenticate(paciente.usuario)
        r = api.post("/api/v1/auth/change-password", {"old_password": PASSWORD, "new_password": nueva}, format="json")
        assert r.status_code == 400 and "new_password" in r.data

    def test_confirmacion_no_coincide(self, api, paciente):
        api.force_authenticate(paciente.usuario)
        r = api.post("/api/v1/auth/change-password", {
            "old_password": PASSWORD, "new_password": "NuevaClave9", "new_password_confirmation": "OtraClave9",
        }, format="json")
        assert r.status_code == 400


class TestRegistro:
    def test_registro_crea_paciente_con_correo_como_usuario(self, api, db):
        r = api.post("/api/v1/auth/register", REGISTRO, format="json")
        assert r.status_code == 201, r.data
        assert r.data["role"] == "paciente"
        p = Paciente.objects.get(numero_documento="999")
        assert p.usuario.username == "nuevo@test.com"
        assert login(api, "nuevo@test.com", "Segura123").status_code == 200

    def test_contrasenas_no_coinciden(self, api, db):
        r = api.post("/api/v1/auth/register", {**REGISTRO, "password_confirmation": "Otra1234"}, format="json")
        assert r.status_code == 400 and "password_confirmation" in r.data

    def test_correo_duplicado(self, api, paciente):
        r = api.post("/api/v1/auth/register", {**REGISTRO, "email": "p1@test.com"}, format="json")
        assert r.status_code == 400 and "email" in r.data

    def test_documento_duplicado(self, api, paciente):
        r = api.post("/api/v1/auth/register", {**REGISTRO, "numero_documento": "111"}, format="json")
        assert r.status_code == 400 and "numero_documento" in r.data

    def test_password_debil(self, api, db):
        r = api.post("/api/v1/auth/register", {**REGISTRO, "password": "abc", "password_confirmation": "abc"},
                     format="json")
        assert r.status_code == 400 and "password" in r.data
