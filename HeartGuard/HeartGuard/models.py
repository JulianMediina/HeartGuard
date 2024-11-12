from django.db import models
from django.contrib.auth.models import User

# Modelo para Medico
class Medico(models.Model):
    usuario = models.OneToOneField(User, on_delete=models.CASCADE, related_name="medico")
    nombre = models.CharField(max_length=255)
    apellido = models.CharField(max_length=255)
    especialidad = models.CharField(max_length=255, null=True, blank=True)
    telefono = models.CharField(max_length=20, null=True, blank=True)

    def __str__(self):
        return f"Dr. {self.nombre} {self.apellido} - {self.especialidad}"

# Modelo para Paciente
class Paciente(models.Model):
    usuario = models.OneToOneField(User, on_delete=models.CASCADE, related_name="paciente")
    nombre = models.CharField(max_length=255)
    direccion = models.TextField(null=True, blank=True)
    telefono = models.CharField(max_length=20, null=True, blank=True)

    def __str__(self):
        return self.nombre
