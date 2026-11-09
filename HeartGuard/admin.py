from django.contrib import admin

from .models import Historial, Informe, Medico, Notificacion, Paciente


@admin.register(Medico)
class MedicoAdmin(admin.ModelAdmin):
    list_display = ("id", "nombres", "apellidos", "especialidad", "usuario")
    search_fields = ("nombres", "apellidos", "usuario__username")


@admin.register(Paciente)
class PacienteAdmin(admin.ModelAdmin):
    list_display = ("id", "nombres", "apellidos", "tipo_documento", "numero_documento", "ciudad")
    search_fields = ("nombres", "apellidos", "numero_documento", "usuario__email")
    list_select_related = ("usuario",)


@admin.register(Informe)
class InformeAdmin(admin.ModelAdmin):
    list_display = ("id", "paciente", "medico", "fecha", "nivel_riesgo", "probabilidad", "output")
    list_filter = ("nivel_riesgo", "output", "is_used_for_training")
    search_fields = ("documento", "paciente__nombres", "paciente__apellidos")
    list_select_related = ("paciente", "medico")
    raw_id_fields = ("paciente", "medico")


@admin.register(Historial)
class HistorialAdmin(admin.ModelAdmin):
    list_display = ("id", "paciente", "medico", "fecha")
    raw_id_fields = ("paciente", "medico")


@admin.register(Notificacion)
class NotificacionAdmin(admin.ModelAdmin):
    list_display = ("id", "paciente", "medico", "tipo", "leida", "fecha_envio")
    list_filter = ("tipo", "leida")
    raw_id_fields = ("paciente", "medico")
