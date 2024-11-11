from django.db import models
from django.contrib.auth.hashers import make_password, check_password

class Usuario(models.Model):
    id_usuario = models.AutoField(primary_key=True)
    correo = models.EmailField(unique=True)
    password = models.CharField(max_length=128)  # Usar hash en lugar de almacenar texto plano

    def save(self, *args, **kwargs):
        # Almacenar el hash de la contraseña en lugar de texto plano
        if not self.password.startswith('pbkdf2_'):  # Verifica si la contraseña ya está hasheada
            self.password = make_password(self.password)
        super().save(*args, **kwargs)

    def check_password(self, raw_password):
        # Método para validar contraseñas
        return check_password(raw_password, self.password)

    def __str__(self):
        return self.correo

class Doctor(models.Model):
    id_doctor = models.AutoField(primary_key=True)
    usuario = models.ForeignKey(Usuario, on_delete=models.CASCADE)
    nombre = models.CharField(max_length=255)
    apellido = models.CharField(max_length=255)
    especialidad = models.CharField(max_length=255, null=True, blank=True)
    telefono = models.CharField(max_length=20, null=True, blank=True)

    def __str__(self):
        return f"Dr. {self.nombre} {self.apellido} - {self.especialidad}"

class Paciente(models.Model):
    id_paciente = models.AutoField(primary_key=True)
    usuario = models.ForeignKey(Usuario, on_delete=models.CASCADE)
    nombre = models.CharField(max_length=255)
    direccion = models.TextField(null=True, blank=True)
    telefono = models.CharField(max_length=20, null=True, blank=True)

    def __str__(self):
        return self.nombre
