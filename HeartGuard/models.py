from django.db import models
from django.contrib.auth.models import User

# Modelo Medico
class Medico(models.Model):
    usuario = models.OneToOneField(User, on_delete=models.CASCADE, related_name="medico")
    nombres = models.CharField(max_length=255)
    apellidos = models.CharField(max_length=255)
    tipo_documento = models.CharField(
        max_length=3,
        choices=[
            ('CC', 'Cédula de Ciudadanía'),
            ('TI', 'Tarjeta de Identidad'),
            ('PA', 'Pasaporte')
        ],
        default='CC'
    )
    especialidad = models.CharField(max_length=255, null=True, blank=True)  # Especialidad del médico
    telefono = models.CharField(max_length=20, null=True, blank=True)
    fecha_nacimiento = models.DateField(null=True, blank=True)  # Fecha de nacimiento
    direccion = models.TextField(null=True, blank=True)  # Dirección del médico
    departamento = models.CharField(max_length=255, null=True, blank=True)  # Departamento
    ciudad = models.CharField(max_length=255, null=True, blank=True)  # Ciudad

    def __str__(self):
        return f"Dr. {self.nombres} {self.apellidos} - {self.especialidad if self.especialidad else 'General'}"

# Modelo Paciente
class Paciente(models.Model):
    usuario = models.OneToOneField(User, on_delete=models.CASCADE, related_name="paciente")
    nombres = models.CharField(max_length=255)
    apellidos = models.CharField(max_length=255)
    tipo_documento = models.CharField(
        max_length=3,
        choices=[
            ('CC', 'Cédula de Ciudadanía'),
            ('TI', 'Tarjeta de Identidad'),
            ('PA', 'Pasaporte')
        ],
        default='CC'
    )  # Tipo de documento con opciones predefinidas
    numero_documento = models.CharField(max_length=20, unique=True)  # Número de documento único
    direccion = models.TextField(null=True, blank=True)
    telefono = models.CharField(max_length=20, null=True, blank=True)
    fecha_nacimiento = models.DateField(null=True, blank=True)
    departamento = models.CharField(max_length=255, null=True, blank=True)
    ciudad = models.CharField(max_length=255, null=True, blank=True)

    def __str__(self):
        return f"{self.nombres} {self.apellidos} - {self.tipo_documento} {self.numero_documento}"

# Modelo Informe
class Informe(models.Model):
    paciente = models.ForeignKey(Paciente, on_delete=models.CASCADE, related_name="informes")
    medico = models.ForeignKey(Medico, on_delete=models.SET_NULL, null=True, blank=True, related_name="informes")
    fecha = models.DateTimeField(auto_now_add=True)

    # Información médica específica
    age = models.PositiveIntegerField()  # Edad
    sex = models.IntegerField(choices=[(0, 'Mujer'), (1, 'Hombre')])
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
    output = models.IntegerField(choices=[(0, 'Enfermedad Ausente'), (1, 'Enfermedad Presente')])
    observaciones = models.TextField(null=True, blank=True, verbose_name="Observaciones")

    def __str__(self):
        return f"Informe de {self.paciente.nombre} - Fecha: {self.fecha.strftime('%d/%m/%Y')}"
