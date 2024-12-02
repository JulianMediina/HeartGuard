from django.apps import AppConfig

class MiappConfig(AppConfig):
    name = 'HeartGuard'

    def ready(self):
        import HeartGuard.signals  # Importar el archivo de señales para que se registre