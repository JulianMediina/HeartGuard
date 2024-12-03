import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.core.mail import send_mail  # Si deseas enviar correos electrónicos
from .models import Informe, Paciente, Notificacion
import HeartGuard.utils.retrain_model as utils

@receiver(post_save, sender=Informe)
def trigger_retrain(sender, instance, created, **kwargs):
    # Solo si el informe no ha sido utilizado previamente
    if instance.is_used_for_training == 0:
        logging.info(f"Nuevo informe registrado. Iniciando reentrenamiento del modelo...")
        
        # Llamar a la función de reentrenamiento
        utils.retrain_model()

        # Marcar los informes como utilizados
        instance.is_used_for_training = 1
        instance.save()

        # Ahora, enviar notificaciones a los pacientes cuyos informes tienen output=1
        pacientes_con_enfermedad = Paciente.objects.filter(id__in=Informe.objects.filter(output=1).values('paciente_id'))
        mensaje_recomendacion = (
            "Estimado paciente, tras la evaluación de su informe médico, se han encontrado riesgos "
            "que requieren atención inmediata. Por favor, siga las siguientes recomendaciones: "
            "- Realice un chequeo médico completo. "
            "- Mantenga una dieta saludable y evite el estrés. "
            "- Consulte con su médico para un plan de tratamiento adecuado."
        )

        for paciente in pacientes_con_enfermedad:
            # Enviar notificación (si tienes el modelo de notificación)
            Notificacion.objects.create(paciente=paciente, mensaje=mensaje_recomendacion)

            # O también puedes enviar un correo electrónico
            send_mail(
                'Recomendaciones para su salud',
                mensaje_recomendacion,
                'heartguardapp@gmail.com',  # Deberías poner una dirección de correo válida
                [paciente.usuario.email],  # Email del paciente
                fail_silently=False,
            )
        
        logging.info(f"Notificaciones enviadas a los pacientes con output=1.")