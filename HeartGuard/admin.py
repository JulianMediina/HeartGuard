from django.contrib.auth.models import User
from django.contrib import admin
from .models import Medico, Paciente, Informe

# Aquí puedes registrar tus modelos en el admin de Django
admin.site.register(Medico)
admin.site.register(Paciente)
admin.site.register(Informe)
