import pytest

from HeartGuard.api import ml_client
from HeartGuard.models import Informe, Notificacion

from .conftest import FEATURES, crear_informe

pytestmark = pytest.mark.django_db


def payload(documento="111", **extra):
    return {"documento": documento, **FEATURES, **extra}


class TestCrearInforme:
    def test_medico_crea_y_predice(self, como, ctx, fake_ml, mailoutbox):
        r = como(ctx.medico.usuario).post("/api/v1/informes", payload(observaciones="Control"), format="json")
        assert r.status_code == 201, r.data
        assert len(fake_ml.calls) == 1
        assert fake_ml.calls[0]["fbs"] == 0 and fake_ml.calls[0]["age"] == 54
        assert r.data["probabilidad"] == pytest.approx(0.54)
        assert r.data["nivel_riesgo"] == "moderado"
        assert r.data["prediccion"] == 1
        assert r.data["modelo_version"] == "test-1"
        assert r.data["paciente"]["id"] == ctx.paciente.id
        assert r.data["medico"]["id"] == ctx.medico.id
        assert r.data["output"] is None
        assert r.data["alerta_enviada"] is False
        informe = Informe.objects.get(pk=r.data["id"])
        assert informe.nivel_riesgo == "moderado" and informe.probabilidad == pytest.approx(0.54)
        assert mailoutbox == []

    def test_riesgo_alto_envia_alerta_automatica(self, como, ctx, mailoutbox):
        r = como(ctx.medico.usuario).post("/api/v1/informes", payload(age=80), format="json")
        assert r.status_code == 201
        assert r.data["nivel_riesgo"] == "alto" and r.data["alerta_enviada"] is True
        assert len(mailoutbox) == 1 and mailoutbox[0].to == ["p1@test.com"]
        n = Notificacion.objects.get()
        assert n.tipo == "automatica" and n.paciente == ctx.paciente and n.medico == ctx.medico

    def test_alerta_automatica_desactivable(self, como, ctx, mailoutbox, settings):
        settings.HEARTGUARD_ALERTA_AUTOMATICA = False
        r = como(ctx.medico.usuario).post("/api/v1/informes", payload(age=80), format="json")
        assert r.status_code == 201 and r.data["alerta_enviada"] is False
        assert mailoutbox == [] and not Notificacion.objects.exists()

    def test_documento_inexistente(self, como, ctx):
        r = como(ctx.medico.usuario).post("/api/v1/informes", payload(documento="nope"), format="json")
        assert r.status_code == 400 and "documento" in r.data

    @pytest.mark.parametrize("campo,valor", [("age", 0), ("cp", 7), ("thall", 9), ("oldpeak", -1), ("sex", 3)])
    def test_validacion_de_variables(self, como, ctx, campo, valor):
        r = como(ctx.medico.usuario).post("/api/v1/informes", payload(**{campo: valor}), format="json")
        assert r.status_code == 400 and campo in r.data

    def test_fuera_del_dominio_del_modelo_guarda_sin_prediccion(self, como, ctx, fake_ml, monkeypatch, mailoutbox):
        def invalido(features):
            raise ValueError("'age'=95 fuera de rango [29, 77].")

        monkeypatch.setattr(fake_ml, "predict", invalido)
        r = como(ctx.medico.usuario).post("/api/v1/informes", payload(age=95), format="json")
        assert r.status_code == 201
        assert r.data["prediccion_disponible"] is False and r.data["nivel_riesgo"] is None
        assert "fuera de rango" in r.data["advertencia_ia"]
        assert Informe.objects.get().age == 95
        assert mailoutbox == []

    def test_output_al_crear_registra_confirmacion(self, como, ctx):
        r = como(ctx.medico.usuario).post("/api/v1/informes", payload(output=1), format="json")
        informe = Informe.objects.get(pk=r.data["id"])
        assert informe.diagnostico_confirmado_por == ctx.medico.usuario
        assert informe.diagnostico_confirmado_en is not None

    def test_ia_no_disponible_guarda_sin_prediccion(self, como, ctx, monkeypatch):
        def falla():
            raise ml_client.ServicioIANoDisponible("sin modelo")

        monkeypatch.setattr("HeartGuard.api.ml_client._service", falla)
        r = como(ctx.medico.usuario).post("/api/v1/informes", payload(), format="json")
        assert r.status_code == 201
        assert r.data["prediccion_disponible"] is False and r.data["probabilidad"] is None
        assert r.data["advertencia_ia"]

    @pytest.mark.parametrize("quien", ["paciente", "admin"])
    def test_solo_medico_crea(self, como, ctx, quien):
        user = ctx.paciente.usuario if quien == "paciente" else ctx.admin
        assert como(user).post("/api/v1/informes", payload(), format="json").status_code == 403


class TestAccesoInformes:
    def test_paciente_solo_ve_los_suyos(self, como, ctx):
        propio = crear_informe(ctx.paciente)
        ajeno = crear_informe(ctx.otro)
        api = como(ctx.paciente.usuario)
        r = api.get("/api/v1/informes")
        assert [i["id"] for i in r.data["results"]] == [propio.id]
        # IDOR: el informe de otro paciente no existe para él
        assert api.get(f"/api/v1/informes/{ajeno.id}").status_code == 404
        assert api.get(f"/api/v1/informes?paciente={ctx.otro.id}").data["count"] == 0
        detalle = api.get(f"/api/v1/informes/{propio.id}")
        assert detalle.status_code == 200
        # Campos internos ocultos al paciente
        assert "is_used_for_training" not in detalle.data
        assert "diagnostico_confirmado_por" not in detalle.data

    def test_paciente_no_puede_modificar(self, como, ctx):
        propio = crear_informe(ctx.paciente)
        r = como(ctx.paciente.usuario).patch(f"/api/v1/informes/{propio.id}", {"output": 0}, format="json")
        assert r.status_code == 403

    def test_medico_ve_todos(self, como, ctx):
        crear_informe(ctx.paciente)
        crear_informe(ctx.otro)
        assert como(ctx.medico.usuario).get("/api/v1/informes").data["count"] == 2

    def test_sin_autenticar(self, api, db):
        assert api.get("/api/v1/informes").status_code == 401

    def test_medico_confirma_diagnostico(self, como, ctx):
        informe = crear_informe(ctx.paciente, is_used_for_training=True)
        r = como(ctx.medico.usuario).patch(f"/api/v1/informes/{informe.id}",
                                           {"output": 1, "observaciones": "Confirmado", "age": 99}, format="json")
        assert r.status_code == 200, r.data
        informe.refresh_from_db()
        assert informe.output == 1 and informe.observaciones == "Confirmado"
        assert informe.age == 54  # las variables clínicas no se editan
        assert informe.is_used_for_training is False
        assert informe.diagnostico_confirmado_por == ctx.medico.usuario
        assert informe.diagnostico_confirmado_en is not None
        assert "is_used_for_training" in r.data

        # Quitar el diagnóstico borra la confirmación
        como(ctx.medico.usuario).patch(f"/api/v1/informes/{informe.id}", {"output": None}, format="json")
        informe.refresh_from_db()
        assert informe.output is None and informe.diagnostico_confirmado_por is None

    def test_put_no_permitido(self, como, ctx):
        informe = crear_informe(ctx.paciente)
        assert como(ctx.medico.usuario).put(f"/api/v1/informes/{informe.id}", {}, format="json").status_code == 405

    def test_repredecir(self, como, ctx):
        informe = crear_informe(ctx.paciente, age=70)
        r = como(ctx.medico.usuario).post(f"/api/v1/informes/{informe.id}/predecir")
        assert r.status_code == 200 and r.data["nivel_riesgo"] == "alto"


class TestFiltrosInformes:
    def test_filtros(self, como, ctx):
        a = crear_informe(ctx.paciente, nivel_riesgo="alto", output=1)
        b = crear_informe(ctx.otro, nivel_riesgo="bajo")
        api = como(ctx.medico.usuario)

        def ids(q):
            return [i["id"] for i in api.get(f"/api/v1/informes?{q}").data["results"]]

        assert ids(f"paciente={ctx.paciente.id}") == [a.id]
        assert ids("documento=222") == [b.id]
        assert ids("riesgo=alto") == [a.id]
        assert ids("output=1") == [a.id]
        assert ids("sin_diagnostico=true") == [b.id]
        assert set(ids("desde=2000-01-01")) == {a.id, b.id}
        assert ids("hasta=2000-01-01") == []
        assert ids("ordering=fecha")[0] == a.id
        assert api.get("/api/v1/informes?desde=no-fecha").status_code == 400
