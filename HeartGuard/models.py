from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import models

TIPO_DOCUMENTO_CHOICES = [
    ("CC", "Cédula de Ciudadanía"),
    ("TI", "Tarjeta de Identidad"),
    ("PA", "Pasaporte"),
]


class Medico(models.Model):
    usuario = models.OneToOneField(User, on_delete=models.CASCADE, related_name="medico")
    nombres = models.CharField(max_length=255)
    apellidos = models.CharField(max_length=255)
    tipo_documento = models.CharField(max_length=3, choices=TIPO_DOCUMENTO_CHOICES, default="CC")
    especialidad = models.CharField(max_length=255, null=True, blank=True)
    telefono = models.CharField(max_length=20, null=True, blank=True)
    fecha_nacimiento = models.DateField(null=True, blank=True)
    direccion = models.TextField(null=True, blank=True)
    departamento = models.CharField(max_length=255, null=True, blank=True)
    ciudad = models.CharField(max_length=255, null=True, blank=True)

    def __str__(self):
        return f"Dr. {self.nombres} {self.apellidos} - {self.especialidad or 'General'}"


class Paciente(models.Model):
    usuario = models.OneToOneField(User, on_delete=models.CASCADE, related_name="paciente")
    nombres = models.CharField(max_length=255)
    apellidos = models.CharField(max_length=255)
    tipo_documento = models.CharField(max_length=3, choices=TIPO_DOCUMENTO_CHOICES, default="CC")
    numero_documento = models.CharField(max_length=20, unique=True)
    direccion = models.TextField(null=True, blank=True)
    telefono = models.CharField(max_length=20, null=True, blank=True)
    fecha_nacimiento = models.DateField(null=True, blank=True)
    departamento = models.CharField(max_length=255, null=True, blank=True)
    ciudad = models.CharField(max_length=255, null=True, blank=True)

    def __str__(self):
        return f"{self.nombres} {self.apellidos} - {self.tipo_documento} {self.numero_documento}"


class Informe(models.Model):
    """Informe clínico con las 13 variables que usa la herramienta de predicción."""

    NIVEL_RIESGO_CHOICES = [("bajo", "Bajo"), ("moderado", "Moderado"), ("alto", "Alto")]

    documento = models.CharField(max_length=20, verbose_name="Documento del Paciente")
    paciente = models.ForeignKey(Paciente, on_delete=models.CASCADE, related_name="informes")
    medico = models.ForeignKey(Medico, on_delete=models.SET_NULL, null=True, blank=True, related_name="informes")
    fecha = models.DateTimeField(auto_now_add=True)

    # Variables clínicas
    age = models.PositiveIntegerField()
    sex = models.IntegerField(choices=[(0, "Mujer"), (1, "Hombre")])
    cp = models.IntegerField("Tipo de Dolor en el Pecho")
    trtbps = models.PositiveIntegerField("Presión Arterial en Reposo (mm Hg)")
    chol = models.PositiveIntegerField("Colesterol Sérico (mg/dl)")
    fbs = models.BooleanField("Azúcar en Sangre en Ayunas > 120 mg/dl")
    restecg = models.IntegerField("Resultados del Electrocardiograma en Reposo")
    thalachh = models.PositiveIntegerField("Frecuencia Cardíaca Máxima Alcanzada")
    exng = models.BooleanField("Angina Inducida por Ejercicio")
    oldpeak = models.FloatField("Depresión ST")
    slp = models.IntegerField("Pendiente del Segmento ST")
    caa = models.IntegerField("Número de Vasos Principales Coloreados")
    thall = models.IntegerField("Tipo de Talasemia")
    # Diagnóstico confirmado por el médico (etiqueta usada para reentrenar).
    output = models.IntegerField(null=True, blank=True, choices=[(0, "Enfermedad Ausente"), (1, "Enfermedad Presente")])
    observaciones = models.TextField(null=True, blank=True, verbose_name="Observaciones")
    # Trazabilidad del diagnóstico confirmado: solo estos informes se usan para reentrenar.
    diagnostico_confirmado_por = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="diagnosticos_confirmados"
    )
    diagnostico_confirmado_en = models.DateTimeField(null=True, blank=True)

    is_used_for_training = models.BooleanField(default=False, verbose_name="Usado para Reentrenar")

    # Resultado de la herramienta de IA (no sustituye el criterio médico).
    probabilidad = models.FloatField(null=True, blank=True, verbose_name="Probabilidad de enfermedad")
    prediccion = models.IntegerField(null=True, blank=True, choices=[(0, "Sin enfermedad"), (1, "Enfermedad")])
    nivel_riesgo = models.CharField(max_length=10, null=True, blank=True, choices=NIVEL_RIESGO_CHOICES, db_index=True)
    modelo_version = models.CharField(max_length=64, null=True, blank=True)

    FEATURE_NAMES = (
        "age", "sex", "cp", "trtbps", "chol", "fbs", "restecg",
        "thalachh", "exng", "oldpeak", "slp", "caa", "thall",
    )

    class Meta:
        indexes = [models.Index(fields=["paciente", "-fecha"], name="informe_paciente_fecha_idx")]

    def __str__(self):
        return f"Informe de {self.paciente.nombres} - Fecha: {self.fecha.strftime('%d/%m/%Y')}"

    def clean(self):
        """Verifica que el documento corresponda a un paciente existente y asigna el paciente."""
        try:
            self.paciente = Paciente.objects.get(numero_documento=self.documento)
        except Paciente.DoesNotExist:
            raise ValidationError(f"No se encontró un paciente con el documento: {self.documento}") from None

    def features(self) -> dict:
        """Variables clínicas en el formato que espera el servicio de IA."""
        data = {name: getattr(self, name) for name in self.FEATURE_NAMES}
        data["fbs"] = int(bool(data["fbs"]))
        data["exng"] = int(bool(data["exng"]))
        return data

    def aplicar_prediccion(self, resultado: dict) -> None:
        self.probabilidad = resultado.get("probabilidad")
        self.prediccion = resultado.get("prediccion")
        self.nivel_riesgo = resultado.get("nivel_riesgo")
        self.modelo_version = resultado.get("modelo_version")


class Historial(models.Model):
    paciente = models.ForeignKey(Paciente, on_delete=models.CASCADE, related_name="historiales")
    medico = models.ForeignKey(Medico, on_delete=models.SET_NULL, null=True, blank=True, related_name="historiales")
    fecha = models.DateField()
    observacion = models.TextField()

    def __str__(self):
        return f"Historial de {self.paciente.nombres} {self.paciente.apellidos} - {self.fecha}"


class Notificacion(models.Model):
    TIPO_CHOICES = [("manual", "Manual"), ("automatica", "Automática")]

    paciente = models.ForeignKey(Paciente, on_delete=models.CASCADE, related_name="notificaciones")
    medico = models.ForeignKey(
        Medico, on_delete=models.SET_NULL, null=True, blank=True, related_name="notificaciones_enviadas"
    )
    fecha_envio = models.DateTimeField(auto_now_add=True)
    mensaje = models.TextField()
    tipo = models.CharField(max_length=12, choices=TIPO_CHOICES, default="manual")
    leida = models.BooleanField(default=False)

    def __str__(self):
        return (
            f"Notificación para {self.paciente.nombres} {self.paciente.apellidos} - "
            f"{self.fecha_envio.strftime('%d/%m/%Y %H:%M')}"
        )
