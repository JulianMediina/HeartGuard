import pytest

from HeartGuard.models import Notificacion

from .conftest import crear_informe

pytestmark = pytest.mark.django_db


class TestAlertaManual:
    def test_por_paciente_id_envia_correo(self, como, ctx, mailoutbox):
        r = como(ctx.medico.usuario).post("/api/v1/notificaciones",
                                          {"paciente_id": ctx.paciente.id, "mensaje": "Venga a control"},
                                          format="json")
        assert r.status_code == 201, r.data
        assert r.data["email_enviado"] is True
        assert r.data["medico"]["id"] == ctx.medico.id and r.data["tipo"] == "manual"
        assert len(mailoutbox) == 1
        assert mailoutbox[0].to == ["p1@test.com"] and mailoutbox[0].body == "Venga a control"
        assert mailoutbox[0].subject == "Alerta Médica Personalizada"

    def test_por_cedula(self, como, ctx, mailoutbox):
        r = como(ctx.medico.usuario).post("/api/v1/notificaciones", {"documento": "222", "mensaje": "Hola"},
                                          format="json")
        assert r.status_code == 201
        assert Notificacion.objects.get().paciente == ctx.otro

    def test_paciente_inexistente_o_mensaje_vacio(self, como, ctx, mailoutbox):
        api = como(ctx.medico.usuario)
        r = api.post("/api/v1/notificaciones", {"documento": "x", "mensaje": "Hola"}, format="json")
        assert r.status_code == 400
        assert api.post("/api/v1/notificaciones", {"paciente_id": ctx.paciente.id, "mensaje": "  "},
                        format="json").status_code == 400
        assert api.post("/api/v1/notificaciones", {"mensaje": "Hola"}, format="json").status_code == 400
        assert mailoutbox == []

    def test_paciente_sin_correo_se_registra_sin_envio(self, como, ctx, mailoutbox):
        ctx.paciente.usuario.email = ""
        ctx.paciente.usuario.save()
        r = como(ctx.medico.usuario).post("/api/v1/notificaciones",
                                          {"paciente_id": ctx.paciente.id, "mensaje": "Hola"}, format="json")
        assert r.status_code == 201 and r.data["email_enviado"] is False
        assert mailoutbox == []

    @pytest.mark.parametrize("quien", ["paciente", "admin"])
    def test_solo_medico_envia(self, como, ctx, quien):
        user = ctx.paciente.usuario if quien == "paciente" else ctx.admin
        r = como(user).post("/api/v1/notificaciones", {"paciente_id": ctx.paciente.id, "mensaje": "x"}, format="json")
        assert r.status_code == 403


class TestListadoYLectura:
    def test_paciente_ve_solo_las_suyas_y_marca_leida(self, como, ctx):
        propia = Notificacion.objects.create(paciente=ctx.paciente, mensaje="a")
        ajena = Notificacion.objects.create(paciente=ctx.otro, mensaje="b")
        api = como(ctx.paciente.usuario)
        assert [n["id"] for n in api.get("/api/v1/notificaciones").data["results"]] == [propia.id]
        assert api.get(f"/api/v1/notificaciones/{ajena.id}").status_code == 404
        assert api.patch(f"/api/v1/notificaciones/{ajena.id}", {"leida": True}, format="json").status_code == 404
        r = api.patch(f"/api/v1/notificaciones/{propia.id}", {"leida": True, "mensaje": "hack"}, format="json")
        assert r.status_code == 200 and r.data["leida"] is True and r.data["mensaje"] == "a"
        assert api.get("/api/v1/notificaciones?leida=false").data["count"] == 0

    def test_marcar_todas_leidas(self, como, ctx):
        Notificacion.objects.create(paciente=ctx.paciente, mensaje="a")
        Notificacion.objects.create(paciente=ctx.paciente, mensaje="b")
        Notificacion.objects.create(paciente=ctx.otro, mensaje="c")
        r = como(ctx.paciente.usuario).post("/api/v1/notificaciones/marcar-todas-leidas")
        assert r.data == {"actualizadas": 2}
        assert Notificacion.objects.filter(leida=False).count() == 1

    def test_medico_ve_todas_y_filtra_enviadas(self, como, ctx):
        Notificacion.objects.create(paciente=ctx.paciente, mensaje="a", medico=ctx.medico)
        Notificacion.objects.create(paciente=ctx.otro, mensaje="b")
        api = como(ctx.medico.usuario)
        assert api.get("/api/v1/notificaciones").data["count"] == 2
        assert api.get("/api/v1/notificaciones?enviadas=true").data["count"] == 1
        assert api.get(f"/api/v1/notificaciones?paciente={ctx.otro.id}").data["count"] == 1

    def test_medico_no_modifica(self, como, ctx):
        n = Notificacion.objects.create(paciente=ctx.paciente, mensaje="a")
        assert como(ctx.medico.usuario).patch(f"/api/v1/notificaciones/{n.id}", {"leida": True},
                                              format="json").status_code == 403


class TestAutomaticas:
    def test_alerta_a_pacientes_con_ultimo_informe_alto_e_idempotente(self, como, ctx, mailoutbox):
        crear_informe(ctx.paciente, nivel_riesgo="alto")
        crear_informe(ctx.otro, nivel_riesgo="alto")
        crear_informe(ctx.otro, nivel_riesgo="bajo")  # el último del otro es bajo
        api = como(ctx.medico.usuario)
        r = api.post("/api/v1/notificaciones/automaticas")
        assert r.status_code == 200
        assert r.data["enviadas"] == 1 and r.data["correos_enviados"] == 1
        assert [m.to for m in mailoutbox] == [["p1@test.com"]]
        n = Notificacion.objects.get()
        assert n.tipo == "automatica" and n.paciente == ctx.paciente

        # Segunda ejecución: no repite
        r = api.post("/api/v1/notificaciones/automaticas")
        assert r.data["enviadas"] == 0 and r.data["omitidas"] == 1
        assert len(mailoutbox) == 1

    def test_admin_puede_paciente_no(self, como, ctx):
        assert como(ctx.admin).post("/api/v1/notificaciones/automaticas").status_code == 200
        assert como(ctx.paciente.usuario).post("/api/v1/notificaciones/automaticas").status_code == 403
