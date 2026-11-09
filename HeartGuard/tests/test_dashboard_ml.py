import pytest
from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError

from HeartGuard.models import Informe, Notificacion, Paciente

from .conftest import FEATURES, crear_informe

pytestmark = pytest.mark.django_db


class TestDashboards:
    def test_medico(self, como, ctx):
        crear_informe(ctx.paciente, nivel_riesgo="alto", probabilidad=0.9)
        crear_informe(ctx.otro, nivel_riesgo="bajo", probabilidad=0.1)
        Notificacion.objects.create(paciente=ctx.paciente, mensaje="x")
        r = como(ctx.medico.usuario).get("/api/v1/dashboard/medico")
        assert r.status_code == 200
        d = r.data
        assert d["total_pacientes"] == 2 and d["total_informes"] == 2 and d["alto_riesgo"] == 1
        assert d["distribucion_riesgo"] == {"bajo": 1, "moderado": 0, "alto": 1, "sin_prediccion": 0}
        assert sum(m["total"] for m in d["informes_por_mes"]) == 2
        assert len(d["ultimos_informes"]) == 2 and len(d["notificaciones_recientes"]) == 1

    def test_paciente(self, como, ctx):
        crear_informe(ctx.paciente, probabilidad=0.2, nivel_riesgo="bajo")
        ultimo = crear_informe(ctx.paciente, probabilidad=0.7, nivel_riesgo="alto")
        crear_informe(ctx.otro, probabilidad=0.9)
        Notificacion.objects.create(paciente=ctx.paciente, mensaje="x")
        Notificacion.objects.create(paciente=ctx.otro, mensaje="y")
        d = como(ctx.paciente.usuario).get("/api/v1/dashboard/paciente").data
        assert d["paciente"]["id"] == ctx.paciente.id
        assert d["ultimo_informe"]["id"] == ultimo.id
        assert [e["probabilidad"] for e in d["evolucion"]] == [0.2, 0.7]
        assert len(d["notificaciones_recientes"]) == 1 and d["notificaciones_no_leidas"] == 1

    def test_permisos_dashboards(self, como, ctx):
        assert como(ctx.paciente.usuario).get("/api/v1/dashboard/medico").status_code == 403
        assert como(ctx.medico.usuario).get("/api/v1/dashboard/paciente").status_code == 403

    def test_analisis(self, como, ctx):
        crear_informe(ctx.paciente, age=35, sex=0, cp=2, nivel_riesgo="alto", probabilidad=0.8, output=1)
        crear_informe(ctx.otro, age=65, sex=1, cp=0, nivel_riesgo="bajo", probabilidad=0.1, output=0)
        api = como(ctx.medico.usuario)
        d = api.get("/api/v1/analisis").data
        assert d["total_informes"] == 2
        assert d["distribucion_riesgo"]["alto"] == 1
        assert {s["etiqueta"]: s["total"] for s in d["por_sexo"]} == {"Mujer": 1, "Hombre": 1}
        edades = {e["rango"]: e["total"] for e in d["por_edad"]}
        assert edades["<40"] == 1 and edades["60-69"] == 1 and edades["70+"] == 0
        assert {c["cp"] for c in d["por_tipo_dolor"]} == {0, 2}
        clases = {m["clase"]: m["medias"]["age"] for m in d["medias_por_clase"]}
        assert clases == {0: 65, 1: 35}
        assert api.get("/api/v1/analisis?hasta=2000-01-01").data["total_informes"] == 0
        assert api.get("/api/v1/analisis?desde=mal").status_code == 400
        assert como(ctx.paciente.usuario).get("/api/v1/analisis").status_code == 403


class TestML:
    def test_prediccion_sin_guardar(self, como, ctx):
        r = como(ctx.medico.usuario).post("/api/v1/ml/prediccion", FEATURES, format="json")
        assert r.status_code == 200
        assert r.data["nivel_riesgo"] == "moderado" and r.data["modelo_version"] == "test-1"
        assert not Informe.objects.exists()

    def test_prediccion_fuera_de_rango_del_modelo(self, como, ctx):
        r = como(ctx.medico.usuario).post("/api/v1/ml/prediccion", {**FEATURES, "age": 90}, format="json")
        assert r.status_code == 400 and "age" in r.data

    def test_prediccion_value_error_del_servicio_es_400(self, como, ctx, fake_ml, monkeypatch):
        def invalido(features):
            raise ValueError("dato inválido")

        monkeypatch.setattr(fake_ml, "predict", invalido)
        r = como(ctx.medico.usuario).post("/api/v1/ml/prediccion", FEATURES, format="json")
        assert r.status_code == 400 and r.data["detail"] == "dato inválido"

    def test_prediccion_servicio_caido_es_503(self, como, ctx, fake_ml, monkeypatch):
        def roto(features):
            raise OSError("artefactos corruptos")

        monkeypatch.setattr(fake_ml, "predict", roto)
        assert como(ctx.medico.usuario).post("/api/v1/ml/prediccion", FEATURES, format="json").status_code == 503

    def test_prediccion_valida_y_permisos(self, como, ctx):
        assert como(ctx.medico.usuario).post("/api/v1/ml/prediccion", {"age": 50}, format="json").status_code == 400
        assert como(ctx.paciente.usuario).post("/api/v1/ml/prediccion", FEATURES, format="json").status_code == 403

    def test_modelo(self, como, ctx):
        assert como(ctx.medico.usuario).get("/api/v1/ml/modelo").data["version"] == "test-1"
        assert como(ctx.admin).get("/api/v1/ml/modelo").status_code == 200
        assert como(ctx.paciente.usuario).get("/api/v1/ml/modelo").status_code == 403

    def test_features_para_cualquier_autenticado(self, como, ctx, api):
        r = como(ctx.paciente.usuario).get("/api/v1/ml/features")
        assert r.status_code == 200
        assert [f["name"] for f in r.data][:3] == ["age", "sex", "cp"]

    def test_reentrenar(self, como, ctx):
        crear_informe(ctx.paciente, output=1)
        crear_informe(ctx.paciente)
        r = como(ctx.admin).post("/api/v1/ml/reentrenar")
        assert r.status_code == 200 and r.data["promovido"] is True
        assert r.data["metrics"]["n"] == 1  # solo informes con diagnóstico confirmado
        assert como(ctx.paciente.usuario).post("/api/v1/ml/reentrenar").status_code == 403
        assert como(ctx.medico.usuario).post("/api/v1/ml/reentrenar").status_code == 403

    def test_reentrenamiento_en_curso_409(self, como, ctx, fake_ml, monkeypatch):
        def ocupado(qs):
            raise RuntimeError("Ya hay un reentrenamiento en curso.")

        monkeypatch.setattr(fake_ml, "retrain", ocupado)
        assert como(ctx.admin).post("/api/v1/ml/reentrenar").status_code == 409

    def test_reentrenar_con_throttling(self, como, ctx):
        api = como(ctx.admin)
        codigos = [api.post("/api/v1/ml/reentrenar").status_code for _ in range(4)]
        assert codigos == [200, 200, 200, 429]


class TestComandos:
    def test_predecir_informes(self, ctx):
        a = crear_informe(ctx.paciente, age=80)
        b = crear_informe(ctx.otro, age=20)
        call_command("predecir_informes", batch=1)
        a.refresh_from_db()
        b.refresh_from_db()
        assert a.nivel_riesgo == "alto" and b.nivel_riesgo == "bajo"
        assert a.modelo_version == "test-1"

    def test_crear_usuarios_demo_solo_debug(self, ctx, settings):
        settings.DEBUG = False
        with pytest.raises(CommandError):
            call_command("crear_usuarios_demo")

    def test_predecir_informes_omite_fuera_de_dominio(self, ctx, fake_ml, monkeypatch):
        a = crear_informe(ctx.paciente, age=50)
        b = crear_informe(ctx.otro, age=99)
        original = fake_ml.predict

        def predict_many(lista):
            raise ValueError("fuera de rango")

        def predict(f):
            if f["age"] > 77:
                raise ValueError("fuera de rango")
            return original(f)

        monkeypatch.setattr(fake_ml, "predict_many", predict_many)
        monkeypatch.setattr(fake_ml, "predict", predict)
        call_command("predecir_informes")
        a.refresh_from_db()
        b.refresh_from_db()
        assert a.nivel_riesgo == "moderado" and b.nivel_riesgo is None

    def test_bloquear_passwords_legado(self, ctx, settings):
        settings.DEBUG = True
        call_command("crear_usuarios_demo")
        call_command("bloquear_passwords_legado", excluir=["root"])
        demo_paciente = Paciente.objects.order_by("id").first().usuario
        demo_paciente.refresh_from_db()
        assert demo_paciente.has_usable_password()
        assert User.objects.get(username="medico@test.com").has_usable_password()
        assert User.objects.get(username="root").has_usable_password()  # excluido
        assert not User.objects.get(username="medico@hg.com").has_usable_password()
        assert not User.objects.get(pk=ctx.otro.usuario_id).has_usable_password()

    def test_crear_usuarios_demo(self, ctx, settings):
        settings.DEBUG = True
        call_command("crear_usuarios_demo", documento="111")
        ctx.paciente.usuario.refresh_from_db()
        assert ctx.paciente.usuario.check_password("Paciente123!")
