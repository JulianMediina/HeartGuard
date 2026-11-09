import datetime as dt

from django.db.models import Avg, Case, Count, IntegerField, Q, Value, When
from django.db.models.functions import TruncMonth
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from HeartGuard.models import Informe, Notificacion, Paciente

from . import services
from .permissions import EsMedico, EsMedicoOAdmin, EsPaciente
from .serializers import (
    InformeResumenSerializer,
    InformeSerializer,
    NotificacionSerializer,
    PacientePerfilSerializer,
)

NIVELES = ("bajo", "moderado", "alto")


def _distribucion(qs, campo: str) -> dict:
    conteo = {fila[campo]: fila["total"] for fila in qs.values(campo).annotate(total=Count("id")).order_by()}
    data = {nivel: conteo.get(nivel, 0) for nivel in NIVELES}
    data["sin_prediccion"] = conteo.get(None, 0)
    return data


class DashboardMedicoView(APIView):
    permission_classes = [EsMedico]

    @extend_schema(responses=dict)
    def get(self, request):
        medico = request.user.medico
        pacientes = services.pacientes_con_riesgo()
        distribucion = _distribucion(pacientes, "ultimo_riesgo")
        # TruncMonth en UTC: el MySQL local no tiene tablas de zonas horarias (ver services).
        por_mes = (
            Informe.objects.annotate(mes=TruncMonth("fecha", tzinfo=dt.UTC))
            .values("mes").annotate(total=Count("id")).order_by("mes")
        )
        informes_por_mes = [{"mes": f["mes"].strftime("%Y-%m"), "total": f["total"]} for f in por_mes][-12:]
        ultimos = Informe.objects.select_related("paciente").order_by("-fecha", "-id")[:10]
        notificaciones = Notificacion.objects.select_related("paciente", "medico").order_by("-fecha_envio", "-id")[:5]
        return Response({
            "total_pacientes": Paciente.objects.count(),
            "total_informes": Informe.objects.count(),
            "alto_riesgo": distribucion["alto"],
            "distribucion_riesgo": distribucion,
            "informes_por_mes": informes_por_mes,
            "ultimos_informes": InformeResumenSerializer(ultimos, many=True).data,
            "notificaciones_recientes": NotificacionSerializer(notificaciones, many=True).data,
            "mis_informes": Informe.objects.filter(medico=medico).count(),
            "pendientes_diagnostico": Informe.objects.filter(output__isnull=True).count(),
        })


class DashboardPacienteView(APIView):
    permission_classes = [EsPaciente]

    @extend_schema(responses=dict)
    def get(self, request):
        paciente = request.user.paciente
        informes = Informe.objects.filter(paciente=paciente).select_related("paciente", "medico")
        ultimo = informes.order_by("-fecha", "-id").first()
        evolucion = [
            {"fecha": f["fecha"], "probabilidad": f["probabilidad"], "nivel_riesgo": f["nivel_riesgo"], "id": f["id"]}
            for f in informes.order_by("fecha", "id").values("id", "fecha", "probabilidad", "nivel_riesgo")
        ]
        notificaciones = Notificacion.objects.filter(paciente=paciente).select_related("paciente", "medico")
        return Response({
            "paciente": PacientePerfilSerializer(paciente).data,
            "ultimo_informe": InformeSerializer(ultimo, context={"request": request}).data if ultimo else None,
            "evolucion": evolucion,
            "total_informes": len(evolucion),
            "notificaciones_recientes": NotificacionSerializer(
                notificaciones.order_by("-fecha_envio", "-id")[:5], many=True
            ).data,
            "notificaciones_no_leidas": notificaciones.filter(leida=False).count(),
        })


RANGOS_EDAD = [("<40", 0, 40), ("40-49", 40, 50), ("50-59", 50, 60), ("60-69", 60, 70), ("70+", 70, 200)]
CP_ETIQUETAS = {0: "Asintomático", 1: "Angina atípica", 2: "Dolor no anginoso", 3: "Angina típica"}
SEXO_ETIQUETAS = {0: "Mujer", 1: "Hombre"}
CLASE_ETIQUETAS = {0: "Enfermedad Ausente", 1: "Enfermedad Presente"}
VARIABLES_NUMERICAS = ["age", "trtbps", "chol", "thalachh", "oldpeak", "caa", "cp", "fbs", "exng"]


def _resumen_grupo():
    return {
        "total": Count("id"),
        "alto_riesgo": Count("id", filter=Q(nivel_riesgo="alto")),
        "probabilidad_media": Avg("probabilidad"),
    }


class AnalisisView(APIView):
    """Agregados para la vista de análisis del médico (filtrable por fecha del informe)."""

    permission_classes = [EsMedicoOAdmin]

    @extend_schema(
        parameters=[
            OpenApiParameter("desde", str, description="AAAA-MM-DD"),
            OpenApiParameter("hasta", str, description="AAAA-MM-DD (inclusive)"),
        ],
        responses=dict,
    )
    def get(self, request):
        qs = Informe.objects.all()
        for parametro, aplicar in (
            ("desde", lambda q, d: q.filter(fecha__gte=services.inicio_del_dia(d))),
            ("hasta", lambda q, d: q.filter(fecha__lt=services.fin_del_dia_exclusivo(d))),
        ):
            valor = request.query_params.get(parametro)
            if valor:
                try:
                    qs = aplicar(qs, dt.date.fromisoformat(valor))
                except ValueError:
                    return Response({parametro: ["Fecha inválida, use AAAA-MM-DD."]}, status=400)

        por_sexo = [
            {"sexo": f["sex"], "etiqueta": SEXO_ETIQUETAS.get(f["sex"], str(f["sex"])), **_sin(f, "sex")}
            for f in qs.values("sex").annotate(**_resumen_grupo()).order_by("sex")
        ]
        rango = Case(
            *[When(age__gte=lo, age__lt=hi, then=Value(i)) for i, (_, lo, hi) in enumerate(RANGOS_EDAD)],
            output_field=IntegerField(),
        )
        filas_edad = qs.annotate(rango=rango).values("rango").annotate(**_resumen_grupo()).order_by()
        edades = {f["rango"]: f for f in filas_edad}
        vacio = {"total": 0, "alto_riesgo": 0, "probabilidad_media": None}
        por_edad = [
            {"rango": etiqueta, **_sin(edades.get(i, vacio), "rango")}
            for i, (etiqueta, _, _) in enumerate(RANGOS_EDAD)
        ]
        por_cp = [
            {"cp": f["cp"], "etiqueta": CP_ETIQUETAS.get(f["cp"], str(f["cp"])), **_sin(f, "cp")}
            for f in qs.values("cp").annotate(**_resumen_grupo()).order_by("cp")
        ]
        medias = []
        for f in qs.filter(output__isnull=False).values("output").annotate(
            total=Count("id"), **{v: Avg(v) for v in VARIABLES_NUMERICAS}
        ).order_by("output"):
            medias.append({
                "clase": f["output"],
                "etiqueta": CLASE_ETIQUETAS.get(f["output"], str(f["output"])),
                "total": f["total"],
                "medias": {v: round(f[v], 2) if f[v] is not None else None for v in VARIABLES_NUMERICAS},
            })
        return Response({
            "total_informes": qs.count(),
            "distribucion_riesgo": _distribucion(qs, "nivel_riesgo"),
            "por_sexo": por_sexo,
            "por_edad": por_edad,
            "por_tipo_dolor": por_cp,
            "medias_por_clase": medias,
        })


def _sin(fila: dict, clave: str) -> dict:
    datos = {k: v for k, v in fila.items() if k != clave}
    if datos.get("probabilidad_media") is not None:
        datos["probabilidad_media"] = round(datos["probabilidad_media"], 4)
    return datos
