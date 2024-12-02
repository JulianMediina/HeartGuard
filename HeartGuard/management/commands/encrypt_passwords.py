from django.core.management.base import BaseCommand
from django.contrib.auth.models import User

class Command(BaseCommand):
    help = "Cifra contraseñas de usuarios que no están cifradas"

    def handle(self, *args, **kwargs):
        # Obtén todos los usuarios o filtra según sea necesario
        usuarios = User.objects.all()

        for usuario in usuarios:
            if not usuario.password.startswith('pbkdf2_'):  # Verifica si la contraseña ya está cifrada
                # Cifrar la contraseña existente
                contrasena_actual = usuario.password  # Contraseña en texto plano
                usuario.set_password(contrasena_actual)  # Cifra la contraseña
                usuario.save()  # Guarda los cambios
                self.stdout.write(self.style.SUCCESS(f"Contraseña cifrada para el usuario {usuario.username}."))
            else:
                self.stdout.write(self.style.WARNING(f"Usuario {usuario.username} ya tiene contraseña cifrada."))
