"""Endpoints de la herramienta de IA (predicción de riesgo cardíaco)."""

from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from HeartGuard.models import Informe

from . import ml_client
from .permissions import EsAdmin, EsMedico, EsMedicoOAdmin
from .serializers import PrediccionSerializer, VariablesModeloSerializer

NO_DISPONIBLE = {"detail": "El servicio de IA no está disponible en este momento."}


def _no_disponible(exc):
    return Response({**NO_DISPONIBLE, "error": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class PrediccionView(APIView):
    """Predice el riesgo a partir de las 13 variables, sin guardar nada."""

    permission_classes = [EsMedico]

    @extend_schema(request=VariablesModeloSerializer,
                   responses={200: PrediccionSerializer, 400: OpenApiResponse(), 503: OpenApiResponse()})
    def post(self, request):
        serializer = VariablesModeloSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            resultado = ml_client.predict(dict(serializer.validated_data))
        except ml_client.DatosInvalidosIA as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except ml_client.ServicioIANoDisponible as exc:
            return _no_disponible(exc)
        return Response(resultado)


class ModeloView(APIView):
    permission_classes = [EsMedicoOAdmin]

    @extend_schema(responses=dict)
    def get(self, request):
        try:
            return Response(ml_client.model_info())
        except ml_client.ServicioIANoDisponible as exc:
            return _no_disponible(exc)


class FeaturesView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=list[dict])
    def get(self, request):
        try:
            return Response(ml_client.features_metadata())
        except ml_client.ServicioIANoDisponible as exc:
            return _no_disponible(exc)


class ReentrenarView(APIView):
    """Reentrena el modelo con los informes que tienen diagnóstico confirmado (`output`)."""

    permission_classes = [EsAdmin]
    throttle_scope = "reentrenar"

    @extend_schema(request=None, responses=inline_serializer("Reentrenamiento", {
        "version": serializers.CharField(), "metrics": serializers.DictField(), "promovido": serializers.BooleanField(),
    }))
    def post(self, request):
        informes = Informe.objects.filter(output__isnull=False)
        try:
            resultado = ml_client.retrain(informes)
        except ml_client.ReentrenamientoEnCurso as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        except ml_client.ServicioIANoDisponible as exc:
            return _no_disponible(exc)
        return Response(resultado)
