from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .permissions import get_role
from .serializers import ChangePasswordSerializer, RegistroSerializer, UserSerializer, user_payload


class LoginSerializer(TokenObtainPairSerializer):
    default_error_messages = {
        "no_active_account": "Usuario o contraseña incorrectos.",
        "sin_rol": "El usuario no está asignado a un rol válido.",
    }

    def validate(self, attrs):
        data = super().validate(attrs)
        if get_role(self.user) is None:
            self.fail("sin_rol")
        data["user"] = user_payload(self.user)
        return data

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = get_role(user)
        return token


class LoginView(TokenObtainPairView):
    """Inicio de sesión: devuelve `{access, refresh, user}`."""

    serializer_class = LoginSerializer
    throttle_scope = "auth"

    @extend_schema(responses=inline_serializer("LoginResponse", {
        "access": serializers.CharField(), "refresh": serializers.CharField(), "user": UserSerializer(),
    }))
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class RefreshView(TokenRefreshView):
    throttle_scope = "auth"


class LogoutView(APIView):
    """Invalida (blacklist) el refresh token."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=inline_serializer("LogoutRequest", {"refresh": serializers.CharField()}),
        responses={205: OpenApiResponse(description="Sesión cerrada")},
    )
    def post(self, request):
        refresh = request.data.get("refresh")
        if not refresh:
            return Response({"refresh": ["Este campo es requerido."]}, status=status.HTTP_400_BAD_REQUEST)
        try:
            token = RefreshToken(refresh)
            if str(token.get("user_id")) != str(request.user.id):
                return Response({"detail": "El token no pertenece al usuario."}, status=status.HTTP_400_BAD_REQUEST)
            token.blacklist()
        except TokenError:
            return Response({"detail": "Token inválido o expirado."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=UserSerializer)
    def get(self, request):
        return Response(user_payload(request.user))


class ChangePasswordView(APIView):
    """Cambio de contraseña (reglas del sistema original). Invalida los refresh tokens existentes."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=ChangePasswordSerializer,
        responses={204: OpenApiResponse(description="Contraseña cambiada")},
    )
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        for token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=token)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegisterView(APIView):
    """Autorregistro de pacientes (público). El correo es el nombre de usuario."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "auth"

    @extend_schema(request=RegistroSerializer, responses={201: UserSerializer})
    def post(self, request):
        serializer = RegistroSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        paciente = serializer.save()
        return Response(user_payload(paciente.usuario), status=status.HTTP_201_CREATED)
