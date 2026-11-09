"""Lógica de negocio compartida por las vistas: anotaciones de riesgo, alertas y predicción."""

import logging
from datetime import datetime, time, timedelta

from django.conf import settings
from django.core.mail import EmailMessage, get_connection, send_mail
from django.db.models import F, OuterRef, Q, Subquery
from django.utils import timezone

from HeartGuard.models import Informe, Notificacion, Paciente

from . import ml_client

logger = logging.getLogger("HeartGuard.api")

ASUNTO_ALERTA_MANUAL = "Alerta Médica Personalizada"
ASUNTO_ALERTA_AUTOMATICA = "Alerta Médica: Riesgo Cardíaco"


def mensaje_riesgo_alto(paciente: Paciente) -> str:
    return (
        f"Estimado/a {paciente.nombres} {paciente.apellidos},\n\n"
        "Nuestro sistema ha detectado que usted podría estar en alto riesgo cardíaco. "
        "Recomendamos que agende una consulta con su médico de cabecera lo antes posible.\n\n"
        "Este aviso lo genera una herramienta de apoyo y no sustituye el diagnóstico médico."
    )


# --- Anotaciones -----------------------------------------------------------------------------
def _ultimo_informe(campo: str):
    return Subquery(
        Informe.objects.filter(paciente=OuterRef("pk")).order_by("-fecha", "-id").values(campo)[:1]
    )


def pacientes_con_riesgo(qs=None):
    """Anota cada paciente con los datos de su último informe."""
    qs = Paciente.objects.all() if qs is None else qs
    return qs.annotate(
        ultimo_riesgo=_ultimo_informe("nivel_riesgo"),
        ultima_probabilidad=_ultimo_informe("probabilidad"),
        ultimo_informe_fecha=_ultimo_informe("fecha"),
        ultimo_informe_id=_ultimo_informe("id"),
    )


# --- Fechas ----------------------------------------------------------------------------------
# Se filtra por rangos de datetime (en la zona horaria local) en lugar de `__date`, porque el
# MySQL local no tiene cargadas las tablas de zonas horarias (CONVERT_TZ devolvería NULL).
def inicio_del_dia(fecha) -> datetime:
    return timezone.make_aware(datetime.combine(fecha, time.min))


def fin_del_dia_exclusivo(fecha) -> datetime:
    return timezone.make_aware(datetime.combine(fecha + timedelta(days=1), time.min))


# --- Predicción ------------------------------------------------------------------------------
def predecir_informe(informe: Informe, guardar: bool = True) -> tuple[bool, str | None]:
    """Aplica la herramienta de IA al informe.

    Devuelve `(True, None)` si se predijo, o `(False, motivo)` si los valores están fuera del dominio
    del modelo o el servicio no está disponible. El informe clínico se conserva en ambos casos.
    """
    try:
        resultado = ml_client.predict(informe.features())
    except ml_client.DatosInvalidosIA as exc:
        logger.info("Informe %s fuera del dominio del modelo: %s", informe.pk, exc)
        return False, f"La herramienta de IA no puede evaluar este informe: {exc}"
    except ml_client.ServicioIANoDisponible:
        logger.warning("No se pudo predecir el informe %s: servicio de IA no disponible", informe.pk)
        return False, "El servicio de IA no está disponible en este momento."
    informe.aplicar_prediccion(resultado)
    if guardar:
        informe.save(update_fields=["probabilidad", "prediccion", "nivel_riesgo", "modelo_version"])
    return True, None


# --- Alertas ---------------------------------------------------------------------------------
def _email_destino(paciente: Paciente) -> str:
    return (paciente.usuario.email or "").strip()


def enviar_alerta(paciente: Paciente, mensaje: str, medico=None, tipo: str = "manual",
                  asunto: str | None = None) -> tuple[Notificacion, bool]:
    """Registra la notificación y envía el correo al paciente. Devuelve (notificación, enviado)."""
    notificacion = Notificacion.objects.create(paciente=paciente, medico=medico, mensaje=mensaje, tipo=tipo)
    asunto = asunto or (ASUNTO_ALERTA_MANUAL if tipo == "manual" else ASUNTO_ALERTA_AUTOMATICA)
    destino = _email_destino(paciente)
    if not destino:
        logger.warning("El paciente %s no tiene correo; la alerta solo queda registrada", paciente.pk)
        return notificacion, False
    try:
        send_mail(asunto, mensaje, settings.DEFAULT_FROM_EMAIL, [destino], fail_silently=False)
    except Exception:
        logger.exception("Error enviando correo de alerta al paciente %s", paciente.pk)
        return notificacion, False
    return notificacion, True


def alerta_automatica_informe(informe: Informe) -> bool:
    """Alerta automática al crear un informe con riesgo alto (si está habilitada)."""
    if informe.nivel_riesgo != "alto" or not settings.HEARTGUARD_ALERTA_AUTOMATICA:
        return False
    _, enviado = enviar_alerta(
        informe.paciente, mensaje_riesgo_alto(informe.paciente), medico=informe.medico, tipo="automatica"
    )
    return enviado


def enviar_alertas_automaticas(medico=None) -> dict:
    """Alerta a los pacientes cuyo último informe es de riesgo alto.

    Es idempotente: omite a los pacientes que ya recibieron una alerta automática posterior a su
    último informe.
    """
    ultima_alerta = Subquery(
        Notificacion.objects.filter(paciente=OuterRef("pk"), tipo="automatica")
        .order_by("-fecha_envio")
        .values("fecha_envio")[:1]
    )
    candidatos = (
        pacientes_con_riesgo(Paciente.objects.select_related("usuario"))
        .annotate(ultima_alerta=ultima_alerta)
        .filter(ultimo_riesgo="alto")
    )
    total_alto = candidatos.count()
    pendientes = list(
        candidatos.filter(Q(ultima_alerta__isnull=True) | Q(ultima_alerta__lt=F("ultimo_informe_fecha")))
    )

    notificaciones, correos = [], []
    for paciente in pendientes:
        mensaje = mensaje_riesgo_alto(paciente)
        notificaciones.append(Notificacion(paciente=paciente, medico=medico, mensaje=mensaje, tipo="automatica"))
        destino = _email_destino(paciente)
        if destino:
            correos.append(EmailMessage(ASUNTO_ALERTA_AUTOMATICA, mensaje, settings.DEFAULT_FROM_EMAIL, [destino]))

    Notificacion.objects.bulk_create(notificaciones, batch_size=500)
    enviados = 0
    if correos:
        try:
            enviados = get_connection(fail_silently=False).send_messages(correos) or 0
        except Exception:
            logger.exception("Error enviando alertas automáticas por correo")
    return {
        "enviadas": len(notificaciones),
        "correos_enviados": enviados,
        "omitidas": total_alto - len(pendientes),
    }
