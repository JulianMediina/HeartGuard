import pytest

from HeartGuard.models import Historial, Paciente

from .conftest import crear_informe

pytestmark = pytest.mark.django_db


def test_paciente_no_puede_listar_ni_ver_pacientes(como, ctx):
    api = como(ctx.paciente.usuario)
    assert api.get("/api/v1/pacientes").status_code == 403
    assert api.get(f"/api/v1/pacientes/{ctx.otro.id}").status_code == 403


def test_medico_y_admin_listan_paginado(como, ctx):
    for user in (ctx.medico.usuario, ctx.admin):
        r = como(user).get("/api/v1/pacientes")
        assert r.status_code == 200
        assert {"count", "next", "previous", "results"} <= r.data.keys()
        assert r.data["count"] == 2


def test_filtros_documento_search_riesgo_ordering(como, ctx):
    crear_informe(ctx.paciente, age=80, nivel_riesgo="alto", probabilidad=0.8)
    crear_informe(ctx.otro, age=20, nivel_riesgo="bajo", probabilidad=0.2)
    api = como(ctx.medico.usuario)
    assert [p["id"] for p in api.get("/api/v1/pacientes?documento=222").data["results"]] == [ctx.otro.id]
    assert [p["id"] for p in api.get("/api/v1/pacientes?search=Pérez").data["results"]] == [ctx.paciente.id]
    alto = api.get("/api/v1/pacientes?riesgo=alto").data["results"]
    assert [p["id"] for p in alto] == [ctx.paciente.id]
    assert alto[0]["ultimo_riesgo"] == "alto"
    orden = api.get("/api/v1/pacientes?ordering=-ultima_probabilidad").data["results"]
    assert orden[0]["id"] == ctx.paciente.id
    assert api.get("/api/v1/pacientes?page_size=1").data["next"] is not None


def test_riesgo_usa_el_ultimo_informe(como, ctx):
    crear_informe(ctx.paciente, nivel_riesgo="alto")
    crear_informe(ctx.paciente, nivel_riesgo="bajo")
    api = como(ctx.medico.usuario)
    assert api.get("/api/v1/pacientes?riesgo=alto").data["count"] == 0
    assert api.get("/api/v1/pacientes?riesgo=bajo").data["count"] == 1


def test_registrado_desde_hasta(como, ctx):
    api = como(ctx.medico.usuario)
    assert api.get("/api/v1/pacientes?registrado_hasta=2000-01-01").data["count"] == 0
    assert api.get("/api/v1/pacientes?registrado_desde=2000-01-01").data["count"] == 2


ALTA = {"email": "alta@test.com", "nombres": "Alta", "apellidos": "Nueva", "numero_documento": "555",
        "tipo_documento": "CC"}


def test_medico_crea_paciente_con_password_temporal(como, ctx):
    r = como(ctx.medico.usuario).post("/api/v1/pacientes", ALTA, format="json")
    assert r.status_code == 201, r.data
    assert "password" not in r.data
    p = Paciente.objects.get(numero_documento="555")
    assert p.usuario.username == "alta@test.com"
    # Ya no se usa la cédula como contraseña: se genera una aleatoria y se devuelve una vez
    assert not p.usuario.check_password("555")
    assert p.usuario.check_password(r.data["password_temporal"])


def test_medico_crea_paciente_con_password_propia(como, ctx):
    api = como(ctx.medico.usuario)
    assert api.post("/api/v1/pacientes", {**ALTA, "password": "debil"}, format="json").status_code == 400
    r = api.post("/api/v1/pacientes", {**ALTA, "password": "Inicial2024x"}, format="json")
    assert r.status_code == 201 and "password_temporal" not in r.data
    assert Paciente.objects.get(numero_documento="555").usuario.check_password("Inicial2024x")


def test_crear_paciente_documento_o_correo_duplicado(como, ctx):
    api = como(ctx.medico.usuario)
    base = {"nombres": "X", "apellidos": "Y", "tipo_documento": "CC"}
    assert api.post("/api/v1/pacientes", {**base, "email": "z@t.com", "numero_documento": "111"},
                    format="json").status_code == 400
    assert api.post("/api/v1/pacientes", {**base, "email": "p1@test.com", "numero_documento": "777"},
                    format="json").status_code == 400


def test_paciente_no_puede_crear_pacientes(como, ctx):
    r = como(ctx.paciente.usuario).post("/api/v1/pacientes", {"email": "a@a.com"}, format="json")
    assert r.status_code == 403


def test_medico_actualiza_paciente(como, ctx):
    r = como(ctx.medico.usuario).patch(f"/api/v1/pacientes/{ctx.paciente.id}",
                                       {"telefono": "300", "email": "nuevo@x.com"}, format="json")
    assert r.status_code == 200, r.data
    ctx.paciente.refresh_from_db()
    ctx.paciente.usuario.refresh_from_db()
    assert ctx.paciente.telefono == "300"
    assert ctx.paciente.usuario.email == "nuevo@x.com"
    assert ctx.paciente.usuario.username == "nuevo@x.com"


class TestPerfilPaciente:
    def test_get_y_patch_me(self, como, ctx):
        api = como(ctx.paciente.usuario)
        assert api.get("/api/v1/pacientes/me").data["id"] == ctx.paciente.id
        r = api.patch("/api/v1/pacientes/me", {"ciudad": "Cali", "numero_documento": "000"}, format="json")
        assert r.status_code == 200
        ctx.paciente.refresh_from_db()
        assert ctx.paciente.ciudad == "Cali"
        assert ctx.paciente.numero_documento == "111"  # no editable por el paciente

    def test_medico_no_tiene_pacientes_me(self, como, ctx):
        assert como(ctx.medico.usuario).get("/api/v1/pacientes/me").status_code == 403


class TestPerfilMedico:
    def test_get_y_patch(self, como, ctx):
        api = como(ctx.medico.usuario)
        assert api.get("/api/v1/medicos/me").data["especialidad"] == "Cardiología"
        r = api.patch("/api/v1/medicos/me", {"telefono": "123", "especialidad": "Otra"}, format="json")
        assert r.status_code == 200
        ctx.medico.refresh_from_db()
        assert ctx.medico.telefono == "123" and ctx.medico.especialidad == "Cardiología"

    def test_paciente_no_accede(self, como, ctx):
        assert como(ctx.paciente.usuario).get("/api/v1/medicos/me").status_code == 403


class TestHistorial:
    def test_medico_crea_y_lista(self, como, ctx):
        api = como(ctx.medico.usuario)
        url = f"/api/v1/pacientes/{ctx.paciente.id}/historial"
        r = api.post(url, {"fecha": "2024-12-01", "observacion": "Control"}, format="json")
        assert r.status_code == 201, r.data
        assert r.data["medico"]["id"] == ctx.medico.id
        assert api.get(url).data["count"] == 1
        assert str(Historial.objects.get()).startswith("Historial de Pedro Pérez")

    def test_paciente_no_accede(self, como, ctx):
        url = f"/api/v1/pacientes/{ctx.paciente.id}/historial"
        assert como(ctx.paciente.usuario).get(url).status_code == 403

    def test_admin_lee_pero_no_crea(self, como, ctx):
        api = como(ctx.admin)
        url = f"/api/v1/pacientes/{ctx.paciente.id}/historial"
        assert api.get(url).status_code == 200
        assert api.post(url, {"fecha": "2024-12-01", "observacion": "x"}, format="json").status_code == 403
