"""Crea/actualiza usuarios de demostración con contraseñas conocidas (SOLO desarrollo local)."""

from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from HeartGuard.models import Medico, Paciente

MEDICO = ("medico@test.com", "Medico123!")
ADMIN = ("admin", "Admin123!")
PACIENTE_PASSWORD = "Paciente123!"


def paciente_demo(documento: str | None = None):
    pacientes = Paciente.objects.select_related("usuario").order_by("id")
    if documento:
        pacientes = pacientes.filter(numero_documento=documento)
    return pacientes.first()


def usuarios_demo() -> list[str]:
    """Nombres de usuario de las cuentas de demostración (médico, admin y paciente demo)."""
    nombres = [MEDICO[0], ADMIN[0]]
    paciente = paciente_demo()
    if paciente is not None:
        nombres.append(paciente.usuario.username)
    return nombres


class Command(BaseCommand):
    help = "Asigna contraseñas conocidas a medico@test.com, admin y un paciente (solo con DEBUG=True)."

    def add_arguments(self, parser):
        parser.add_argument("--documento", help="Número de documento del paciente demo (por defecto, el primero).")

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Este comando solo puede ejecutarse en local (DJANGO_DEBUG=True).")

        # Médico
        username, password = MEDICO
        user, _ = User.objects.get_or_create(username=username)
        user.email = user.email or username
        user.set_password(password)
        user.save()
        if not hasattr(user, "medico"):
            Medico.objects.create(usuario=user, nombres="Médico", apellidos="Demo", especialidad="Cardiología")

        # Administrador
        admin_name, admin_password = ADMIN
        admin, _ = User.objects.get_or_create(username=admin_name, defaults={"email": "admin@example.com"})
        admin.is_staff = admin.is_superuser = True
        admin.set_password(admin_password)
        admin.save()

        # Paciente
        paciente = paciente_demo(options["documento"])
        if paciente is None:
            raise CommandError("No hay pacientes en la base de datos.")
        paciente.usuario.set_password(PACIENTE_PASSWORD)
        paciente.usuario.save()

        self.stdout.write(self.style.SUCCESS("Usuarios de demostración listos:"))
        self.stdout.write(f"  médico    usuario={username:<40} contraseña={password}")
        self.stdout.write(f"  admin     usuario={admin_name:<40} contraseña={admin_password}")
        self.stdout.write(
            f"  paciente  usuario={paciente.usuario.username:<40} contraseña={PACIENTE_PASSWORD} "
            f"(documento {paciente.numero_documento})"
        )
