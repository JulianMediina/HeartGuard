"""Inutiliza las contraseñas de las cuentas importadas de `backup.sql` (SEC-11).

Las cuentas de los datos de ejemplo comparten la contraseña `password123` (muchas en texto
plano). Este comando ejecuta `set_unusable_password()` sobre todas las cuentas salvo las de
demostración (`crear_usuarios_demo`) y las indicadas con `--excluir`. Las cuentas bloqueadas no
pueden iniciar sesión hasta que un administrador les asigne una contraseña nueva.
"""

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

from HeartGuard.management.commands.crear_usuarios_demo import usuarios_demo


class Command(BaseCommand):
    help = "Inutiliza las contraseñas de todas las cuentas excepto las de demostración."

    def add_arguments(self, parser):
        parser.add_argument("--excluir", nargs="*", default=[], help="Usuarios adicionales a conservar.")
        parser.add_argument("--dry-run", action="store_true", help="Solo cuenta, no modifica nada.")

    @transaction.atomic
    def handle(self, *args, **options):
        conservar = set(usuarios_demo()) | set(options["excluir"])
        qs = User.objects.exclude(username__in=conservar).exclude(password__startswith="!")
        total = qs.count()
        if options["dry_run"]:
            self.stdout.write(f"[dry-run] Se bloquearían {total} cuentas. Se conservan: {sorted(conservar)}")
            return
        # Una sola contraseña inutilizable ("!" + aleatorio) para todas: equivale a set_unusable_password().
        qs.update(password=make_password(None))
        self.stdout.write(self.style.SUCCESS(f"{total} cuentas bloqueadas. Se conservan: {sorted(conservar)}"))
