from django.contrib.auth import password_validation
from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from HeartGuard.models import TIPO_DOCUMENTO_CHOICES, Historial, Informe, Medico, Notificacion, Paciente

from .permissions import ROL_MEDICO, ROL_PACIENTE, es_paciente, get_role


# --- Usuario / autenticación -----------------------------------------------------------------
def user_payload(user) -> dict:
    role = get_role(user)
    perfil = None
    if role == ROL_MEDICO:
        perfil = user.medico
    elif role == ROL_PACIENTE:
        perfil = user.paciente
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": role,
        "profile_id": perfil.id if perfil else None,
        "nombres": perfil.nombres if perfil else user.first_name,
        "apellidos": perfil.apellidos if perfil else user.last_name,
    }


class UserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    email = serializers.EmailField(allow_blank=True)
    role = serializers.ChoiceField(choices=["medico", "paciente", "admin"], allow_null=True)
    profile_id = serializers.IntegerField(allow_null=True)
    nombres = serializers.CharField(allow_blank=True)
    apellidos = serializers.CharField(allow_blank=True)

    def to_representation(self, instance):
        return user_payload(instance)


def generar_password_temporal() -> str:
    """Contraseña aleatoria que cumple las reglas de complejidad."""
    import secrets
    import string

    while True:
        candidata = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(14))
        if (any(c.isdigit() for c in candidata) and any(c.isupper() for c in candidata)
                and any(c.islower() for c in candidata)):
            return candidata


def validar_complejidad(password: str, user=None) -> None:
    """Reglas del sistema original (>= 8 caracteres, dígito, mayúscula y minúscula) + validadores de Django."""
    errores = []
    if (
        len(password) < 8
        or not any(c.isdigit() for c in password)
        or not any(c.isupper() for c in password)
        or not any(c.islower() for c in password)
    ):
        errores.append(
            "La contraseña debe tener al menos 8 caracteres e incluir un número, una mayúscula y una minúscula."
        )
    try:
        password_validation.validate_password(password, user)
    except Exception as exc:  # django.core.exceptions.ValidationError
        errores.extend(getattr(exc, "messages", [str(exc)]))
    if errores:
        raise serializers.ValidationError(errores)


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    new_password_confirmation = serializers.CharField(write_only=True, required=False)

    def validate_old_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("La contraseña actual no es correcta.")
        return value

    def validate(self, attrs):
        confirmacion = attrs.get("new_password_confirmation")
        if confirmacion is not None and confirmacion != attrs["new_password"]:
            raise serializers.ValidationError({"new_password_confirmation": "Las nuevas contraseñas no coinciden."})
        try:
            validar_complejidad(attrs["new_password"], self.context["request"].user)
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"new_password": exc.detail}) from exc
        return attrs


# --- Perfiles --------------------------------------------------------------------------------
class MedicoResumenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Medico
        fields = ["id", "nombres", "apellidos"]


class MedicoSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="usuario.email", read_only=True)
    username = serializers.CharField(source="usuario.username", read_only=True)

    class Meta:
        model = Medico
        fields = [
            "id", "username", "email", "nombres", "apellidos", "tipo_documento", "especialidad",
            "telefono", "fecha_nacimiento", "direccion", "departamento", "ciudad",
        ]
        # Igual que MedicoUpdateForm: el médico no cambia su tipo de documento ni su especialidad.
        read_only_fields = ["id", "tipo_documento", "especialidad"]


class PacienteResumenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Paciente
        fields = ["id", "nombres", "apellidos", "numero_documento"]


PACIENTE_CAMPOS_PERFIL = [
    "nombres", "apellidos", "tipo_documento", "numero_documento", "direccion", "telefono",
    "fecha_nacimiento", "departamento", "ciudad",
]


class PacienteSerializer(serializers.ModelSerializer):
    """Paciente visto por médicos/administradores (incluye datos de su último informe)."""

    email = serializers.EmailField(source="usuario.email", required=False)
    username = serializers.CharField(source="usuario.username", read_only=True)
    fecha_registro = serializers.DateTimeField(source="usuario.date_joined", read_only=True)
    ultimo_riesgo = serializers.CharField(read_only=True, allow_null=True, default=None)
    ultima_probabilidad = serializers.FloatField(read_only=True, allow_null=True, default=None)
    ultimo_informe_fecha = serializers.DateTimeField(read_only=True, allow_null=True, default=None)
    ultimo_informe_id = serializers.IntegerField(read_only=True, allow_null=True, default=None)

    class Meta:
        model = Paciente
        fields = ["id", "username", "email", *PACIENTE_CAMPOS_PERFIL, "fecha_registro",
                  "ultimo_riesgo", "ultima_probabilidad", "ultimo_informe_fecha", "ultimo_informe_id"]

    def validate_email(self, value):
        qs = User.objects.filter(email__iexact=value) | User.objects.filter(username__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.usuario_id)
        if qs.exists():
            raise serializers.ValidationError("El correo electrónico ya está registrado.")
        return value

    @transaction.atomic
    def update(self, instance, validated_data):
        usuario_data = validated_data.pop("usuario", {})
        if "email" in usuario_data:
            usuario = instance.usuario
            nuevo = usuario_data["email"]
            # Los pacientes usan su correo como nombre de usuario.
            if usuario.username.lower() == (usuario.email or "").lower():
                usuario.username = nuevo
            usuario.email = nuevo
            usuario.save(update_fields=["username", "email"])
        return super().update(instance, validated_data)


class PacienteCreateSerializer(PacienteSerializer):
    """Alta de paciente por un médico/admin: crea también su usuario (username = correo).

    Si no se indica contraseña inicial se genera una aleatoria, que se devuelve UNA sola vez en la
    respuesta (`password_temporal`) para entregársela al paciente, que debe cambiarla en
    `auth/change-password`. (El sistema original usaba la cédula como contraseña: se eliminó.)
    """

    email = serializers.EmailField(source="usuario.email")
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta(PacienteSerializer.Meta):
        fields = [*PacienteSerializer.Meta.fields, "password"]

    password_generada: str | None = None

    def validate(self, attrs):
        password = attrs.get("password")
        if password:
            email = attrs.get("usuario", {}).get("email", "")
            try:
                validar_complejidad(password, User(username=email, email=email))
            except serializers.ValidationError as exc:
                raise serializers.ValidationError({"password": exc.detail}) from exc
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        email = validated_data.pop("usuario")["email"]
        password = validated_data.pop("password", "")
        if not password:
            password = self.password_generada = generar_password_temporal()
        usuario = User.objects.create_user(
            username=email, email=email, password=password,
            first_name=validated_data["nombres"][:150], last_name=validated_data["apellidos"][:150],
        )
        return Paciente.objects.create(usuario=usuario, **validated_data)


class PacientePerfilSerializer(serializers.ModelSerializer):
    """Perfil propio del paciente (campos editables de PacienteUpdateForm)."""

    email = serializers.EmailField(source="usuario.email", read_only=True)
    username = serializers.CharField(source="usuario.username", read_only=True)

    class Meta:
        model = Paciente
        fields = ["id", "username", "email", *PACIENTE_CAMPOS_PERFIL]
        read_only_fields = ["id", "tipo_documento", "numero_documento"]


class RegistroSerializer(serializers.Serializer):
    """Autorregistro de pacientes (reglas de `registrar_usuario` del sistema original)."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    password_confirmation = serializers.CharField(write_only=True)
    nombres = serializers.CharField(max_length=255)
    apellidos = serializers.CharField(max_length=255)
    tipo_documento = serializers.ChoiceField(choices=TIPO_DOCUMENTO_CHOICES, default="CC")
    numero_documento = serializers.CharField(max_length=20)
    direccion = serializers.CharField(required=False, allow_blank=True, default="")
    telefono = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    fecha_nacimiento = serializers.DateField(required=False, allow_null=True, default=None)
    departamento = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    ciudad = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists() or User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("El correo electrónico ya está registrado.")
        return value

    def validate_numero_documento(self, value):
        if Paciente.objects.filter(numero_documento=value).exists():
            raise serializers.ValidationError("Ya existe un paciente con este número de documento.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirmation"]:
            raise serializers.ValidationError({"password_confirmation": "Las contraseñas no coinciden."})
        try:
            validar_complejidad(attrs["password"], User(username=attrs["email"], email=attrs["email"]))
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"password": exc.detail}) from exc
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        validated_data.pop("password_confirmation")
        email = validated_data.pop("email")
        password = validated_data.pop("password")
        usuario = User.objects.create_user(
            username=email, email=email, password=password,
            first_name=validated_data["nombres"][:150], last_name=validated_data["apellidos"][:150],
        )
        return Paciente.objects.create(usuario=usuario, **validated_data)


# --- Variables clínicas ----------------------------------------------------------------------
class VariablesClinicasSerializer(serializers.Serializer):
    """Las 13 variables de entrada de la herramienta de IA, con rangos clínicamente plausibles."""

    age = serializers.IntegerField(min_value=1, max_value=120)
    sex = serializers.ChoiceField(choices=[(0, "Mujer"), (1, "Hombre")])
    cp = serializers.IntegerField(min_value=0, max_value=3)
    trtbps = serializers.IntegerField(min_value=50, max_value=300)
    chol = serializers.IntegerField(min_value=50, max_value=1000)
    fbs = serializers.IntegerField(min_value=0, max_value=1)
    restecg = serializers.IntegerField(min_value=0, max_value=2)
    thalachh = serializers.IntegerField(min_value=40, max_value=250)
    exng = serializers.IntegerField(min_value=0, max_value=1)
    oldpeak = serializers.FloatField(min_value=0, max_value=10)
    slp = serializers.IntegerField(min_value=0, max_value=2)
    caa = serializers.IntegerField(min_value=0, max_value=4)
    thall = serializers.IntegerField(min_value=0, max_value=3)

    def to_internal_value(self, data):
        # Aceptar booleanos para fbs/exng (como el formulario original).
        if hasattr(data, "copy"):
            data = data.copy()
            for campo in ("fbs", "exng"):
                if isinstance(data.get(campo), bool):
                    data[campo] = int(data[campo])
        return super().to_internal_value(data)


def _rangos_modelo() -> dict:
    from .ml_client import features_metadata

    return {f["name"]: (f["min"], f["max"]) for f in features_metadata() if f.get("type") == "numeric"}


class VariablesModeloSerializer(VariablesClinicasSerializer):
    """Variables para `ml/prediccion`: además exige el rango documentado del modelo (heart_nn.FEATURES)."""

    def validate(self, attrs):
        errores = {}
        for nombre, (minimo, maximo) in _rangos_modelo().items():
            if nombre in attrs and not minimo <= attrs[nombre] <= maximo:
                errores[nombre] = [f"Fuera del rango que admite el modelo [{minimo}, {maximo}]."]
        if errores:
            raise serializers.ValidationError(errores)
        return attrs


class PrediccionSerializer(serializers.Serializer):
    probabilidad = serializers.FloatField()
    prediccion = serializers.IntegerField()
    nivel_riesgo = serializers.ChoiceField(choices=Informe.NIVEL_RIESGO_CHOICES)
    modelo_version = serializers.CharField()


# --- Informes --------------------------------------------------------------------------------
class InformeSerializer(serializers.ModelSerializer):
    paciente = PacienteResumenSerializer(read_only=True)
    medico = MedicoResumenSerializer(read_only=True, allow_null=True)
    fbs = serializers.IntegerField(read_only=True)
    exng = serializers.IntegerField(read_only=True)

    CAMPOS_INTERNOS = ("is_used_for_training", "diagnostico_confirmado_por")

    class Meta:
        model = Informe
        fields = [
            "id", "paciente", "medico", "fecha", "documento", *Informe.FEATURE_NAMES, "output", "observaciones",
            "probabilidad", "prediccion", "nivel_riesgo", "modelo_version",
            "diagnostico_confirmado_por", "diagnostico_confirmado_en", "is_used_for_training",
        ]
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["fbs"] = int(bool(instance.fbs))
        data["exng"] = int(bool(instance.exng))
        # Los datos internos (uso para entrenamiento, quién confirmó) solo los ven médicos/admin.
        request = self.context.get("request")
        if request is None or es_paciente(request.user):
            for campo in self.CAMPOS_INTERNOS:
                data.pop(campo, None)
        return data


class InformeResumenSerializer(serializers.ModelSerializer):
    paciente = PacienteResumenSerializer(read_only=True)

    class Meta:
        model = Informe
        fields = ["id", "paciente", "fecha", "probabilidad", "prediccion", "nivel_riesgo", "output"]


class InformeCreateSerializer(VariablesClinicasSerializer):
    documento = serializers.CharField(max_length=20)
    observaciones = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    output = serializers.ChoiceField(choices=[(0, "Enfermedad Ausente"), (1, "Enfermedad Presente")],
                                     required=False, allow_null=True)

    def validate_documento(self, value):
        try:
            self.context["paciente"] = Paciente.objects.get(numero_documento=value)
        except Paciente.DoesNotExist:
            raise serializers.ValidationError(f"No se encontró un paciente con el documento: {value}") from None
        return value

    def create(self, validated_data):
        validated_data["fbs"] = bool(validated_data["fbs"])
        validated_data["exng"] = bool(validated_data["exng"])
        if validated_data.get("output") is not None:
            validated_data["diagnostico_confirmado_por"] = self.context["request"].user
            validated_data["diagnostico_confirmado_en"] = timezone.now()
        return Informe.objects.create(paciente=self.context["paciente"], **validated_data)


class InformeUpdateSerializer(serializers.ModelSerializer):
    output = serializers.ChoiceField(choices=[(0, "Enfermedad Ausente"), (1, "Enfermedad Presente")],
                                     required=False, allow_null=True)

    class Meta:
        model = Informe
        fields = ["observaciones", "output"]

    def update(self, instance, validated_data):
        if "output" in validated_data and validated_data["output"] != instance.output:
            # Un diagnóstico nuevo o corregido vuelve a estar disponible para reentrenar y queda
            # registrado quién y cuándo lo confirmó.
            instance.is_used_for_training = False
            confirmado = validated_data["output"] is not None
            instance.diagnostico_confirmado_por = self.context["request"].user if confirmado else None
            instance.diagnostico_confirmado_en = timezone.now() if confirmado else None
        return super().update(instance, validated_data)


# --- Historial y notificaciones --------------------------------------------------------------
class HistorialSerializer(serializers.ModelSerializer):
    medico = MedicoResumenSerializer(read_only=True, allow_null=True)

    class Meta:
        model = Historial
        fields = ["id", "paciente", "medico", "fecha", "observacion"]
        read_only_fields = ["id", "paciente", "medico"]


class NotificacionSerializer(serializers.ModelSerializer):
    paciente = PacienteResumenSerializer(read_only=True)
    medico = MedicoResumenSerializer(read_only=True, allow_null=True)

    class Meta:
        model = Notificacion
        fields = ["id", "paciente", "medico", "fecha_envio", "mensaje", "tipo", "leida"]
        read_only_fields = ["id", "paciente", "medico", "fecha_envio", "mensaje", "tipo"]


class NotificacionCreateSerializer(serializers.Serializer):
    """Alerta manual de un médico. El paciente se indica por id o por número de documento (cédula)."""

    paciente_id = serializers.IntegerField(required=False)
    documento = serializers.CharField(required=False, max_length=20)
    mensaje = serializers.CharField()
    asunto = serializers.CharField(required=False, max_length=200)

    def validate(self, attrs):
        try:
            if attrs.get("paciente_id") is not None:
                attrs["paciente"] = Paciente.objects.select_related("usuario").get(pk=attrs["paciente_id"])
            elif attrs.get("documento"):
                attrs["paciente"] = Paciente.objects.select_related("usuario").get(numero_documento=attrs["documento"])
            else:
                raise serializers.ValidationError("Indique `paciente_id` o `documento`.")
        except Paciente.DoesNotExist:
            raise serializers.ValidationError(
                {"paciente": "No se encontró un paciente con el identificador proporcionado."}
            ) from None
        if not attrs["mensaje"].strip():
            raise serializers.ValidationError({"mensaje": "El mensaje no puede estar vacío."})
        return attrs


class NotificacionCreadaSerializer(NotificacionSerializer):
    email_enviado = serializers.SerializerMethodField()

    class Meta(NotificacionSerializer.Meta):
        fields = [*NotificacionSerializer.Meta.fields, "email_enviado"]

    @extend_schema_field(serializers.BooleanField())
    def get_email_enviado(self, obj):
        return self.context.get("email_enviado", False)
