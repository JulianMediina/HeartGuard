from django.db.models import Q
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.response import Response

from HeartGuard.models import Historial, Informe, Notificacion, Paciente

from . import ml_client, services
from .filters import InformeFilter, NotificacionFilter, PacienteFilter
from .permissions import EsMedico, EsMedicoOAdmin, EsPaciente, TieneRol, es_admin, es_medico, es_paciente
from .serializers import (
    HistorialSerializer,
    InformeCreateSerializer,
    InformeSerializer,
    InformeUpdateSerializer,
    MedicoSerializer,
    NotificacionCreadaSerializer,
    NotificacionCreateSerializer,
    NotificacionSerializer,
    PacienteCreateSerializer,
    PacientePerfilSerializer,
    PacienteSerializer,
)


class MedicoMeView(RetrieveUpdateAPIView):
    """Perfil del médico autenticado."""

    serializer_class = MedicoSerializer
    permission_classes = [EsMedico]
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return self.request.user.medico


class PacienteViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin,
                      mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Pacientes (gestión por médicos y administradores) y perfil propio del paciente (`me`)."""

    permission_classes = [EsMedicoOAdmin]
    filterset_class = PacienteFilter
    search_fields = ["nombres", "apellidos", "numero_documento", "usuario__email"]
    ordering_fields = ["id", "nombres", "apellidos", "numero_documento", "ultimo_informe_fecha",
                       "ultima_probabilidad", "usuario__date_joined"]
    ordering = ["id"]
    lookup_value_regex = r"\d+"
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return services.pacientes_con_riesgo(Paciente.objects.select_related("usuario"))

    def get_serializer_class(self):
        if self.action == "create":
            return PacienteCreateSerializer
        if self.action == "me":
            return PacientePerfilSerializer
        if self.action == "historial":
            return HistorialSerializer
        return PacienteSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        paciente = serializer.save()
        instancia = self.get_queryset().get(pk=paciente.pk)
        data = PacienteSerializer(instancia).data
        if serializer.password_generada:
            # Se muestra una única vez para que el médico se la entregue al paciente.
            data["password_temporal"] = serializer.password_generada
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get", "patch"], permission_classes=[EsPaciente],
            filter_backends=[], pagination_class=None)
    def me(self, request):
        paciente = request.user.paciente
        if request.method == "PATCH":
            serializer = PacientePerfilSerializer(paciente, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)
        return Response(PacientePerfilSerializer(paciente).data)

    @action(detail=True, methods=["get", "post"], filter_backends=[])
    def historial(self, request, pk=None):
        paciente = self.get_object()
        if request.method == "POST":
            if not es_medico(request.user):
                raise PermissionDenied("Solo los médicos pueden registrar historial.")
            serializer = HistorialSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(paciente=paciente, medico=request.user.medico)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        qs = Historial.objects.filter(paciente=paciente).select_related("medico").order_by("-fecha", "-id")
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(HistorialSerializer(page, many=True).data)


class InformeViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin,
                     mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Informes clínicos. Al crearlos se aplica automáticamente la herramienta de IA.

    Los pacientes solo ven sus propios informes (solo lectura).
    """

    filterset_class = InformeFilter
    search_fields = ["paciente__nombres", "paciente__apellidos", "paciente__numero_documento", "observaciones"]
    ordering_fields = ["id", "fecha", "probabilidad", "age", "nivel_riesgo"]
    ordering = ["-fecha", "-id"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_permissions(self):
        if self.action in ("create", "predecir"):
            return [EsMedico()]
        if self.action in ("update", "partial_update"):
            return [EsMedicoOAdmin()]
        return [TieneRol()]

    def get_queryset(self):
        qs = Informe.objects.select_related("paciente", "medico")
        user = self.request.user
        if es_paciente(user):
            return qs.filter(paciente=user.paciente)
        if es_medico(user) or es_admin(user):
            return qs
        return qs.none()

    def get_serializer_class(self):
        if self.action == "create":
            return InformeCreateSerializer
        if self.action in ("update", "partial_update"):
            return InformeUpdateSerializer
        return InformeSerializer

    @extend_schema(request=InformeCreateSerializer, responses={201: InformeSerializer})
    def create(self, request, *args, **kwargs):
        serializer = InformeCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        informe = serializer.save(medico=request.user.medico)
        prediccion_ok, advertencia = services.predecir_informe(informe)
        alerta = services.alerta_automatica_informe(informe) if prediccion_ok else False
        data = InformeSerializer(informe, context=self.get_serializer_context()).data
        data["prediccion_disponible"] = prediccion_ok
        data["advertencia_ia"] = advertencia
        data["alerta_enviada"] = alerta
        return Response(data, status=status.HTTP_201_CREATED)

    @extend_schema(request=InformeUpdateSerializer, responses=InformeSerializer)
    def partial_update(self, request, *args, **kwargs):
        informe = self.get_object()
        serializer = InformeUpdateSerializer(informe, data=request.data, partial=True,
                                             context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(InformeSerializer(informe, context=self.get_serializer_context()).data)

    @extend_schema(
        request=None,
        responses={
            200: InformeSerializer,
            400: OpenApiResponse(description="Valores fuera del dominio del modelo"),
            503: OpenApiResponse(description="IA no disponible"),
        },
    )
    @action(detail=True, methods=["post"])
    def predecir(self, request, pk=None):
        """Vuelve a aplicar la herramienta de IA (modelo actual) a un informe existente."""
        informe = self.get_object()
        try:
            informe.aplicar_prediccion(ml_client.predict(informe.features()))
        except ml_client.DatosInvalidosIA as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except ml_client.ServicioIANoDisponible:
            return Response({"detail": "El servicio de IA no está disponible."},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        informe.save(update_fields=["probabilidad", "prediccion", "nivel_riesgo", "modelo_version"])
        return Response(InformeSerializer(informe, context=self.get_serializer_context()).data)


class NotificacionViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin,
                          mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Notificaciones/alertas. Pacientes: las propias (pueden marcarlas como leídas). Médicos: todas."""

    filterset_class = NotificacionFilter
    search_fields = ["mensaje", "paciente__nombres", "paciente__apellidos", "paciente__numero_documento"]
    ordering_fields = ["id", "fecha_envio", "leida"]
    ordering = ["-fecha_envio", "-id"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_permissions(self):
        if self.action == "create":
            return [EsMedico()]
        if self.action == "automaticas":
            return [EsMedicoOAdmin()]
        if self.action in ("update", "partial_update", "marcar_todas_leidas"):
            return [EsPaciente()]
        return [TieneRol()]

    def get_queryset(self):
        qs = Notificacion.objects.select_related("paciente", "medico")
        user = self.request.user
        if es_paciente(user):
            return qs.filter(paciente=user.paciente)
        if es_medico(user) or es_admin(user):
            return qs
        return qs.none()

    def get_serializer_class(self):
        if self.action == "create":
            return NotificacionCreateSerializer
        return NotificacionSerializer

    @extend_schema(request=NotificacionCreateSerializer, responses={201: NotificacionCreadaSerializer})
    def create(self, request, *args, **kwargs):
        serializer = NotificacionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos = serializer.validated_data
        notificacion, enviado = services.enviar_alerta(
            datos["paciente"], datos["mensaje"], medico=request.user.medico, tipo="manual", asunto=datos.get("asunto")
        )
        data = NotificacionCreadaSerializer(notificacion, context={"email_enviado": enviado}).data
        return Response(data, status=status.HTTP_201_CREATED)

    @extend_schema(
        request=inline_serializer("NotificacionLeida", {"leida": serializers.BooleanField()}),
        responses=NotificacionSerializer,
    )
    def partial_update(self, request, *args, **kwargs):
        notificacion = self.get_object()
        serializer = NotificacionSerializer(notificacion, data={"leida": request.data.get("leida", True)}, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @extend_schema(request=None, responses=inline_serializer("AlertasAutomaticas", {
        "enviadas": serializers.IntegerField(), "correos_enviados": serializers.IntegerField(),
        "omitidas": serializers.IntegerField(),
    }))
    @action(detail=False, methods=["post"])
    def automaticas(self, request):
        """Alerta a los pacientes cuyo último informe tiene riesgo alto (no repite alertas ya enviadas)."""
        medico = getattr(request.user, "medico", None)
        return Response(services.enviar_alertas_automaticas(medico=medico))

    @extend_schema(
        request=None,
        responses=inline_serializer("MarcarLeidas", {"actualizadas": serializers.IntegerField()}),
    )
    @action(detail=False, methods=["post"], url_path="marcar-todas-leidas")
    def marcar_todas_leidas(self, request):
        n = Notificacion.objects.filter(Q(paciente=request.user.paciente) & Q(leida=False)).update(leida=True)
        return Response({"actualizadas": n})
