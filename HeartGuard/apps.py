from django.apps import AppConfig


class HeartGuardConfig(AppConfig):
    name = "HeartGuard"
    verbose_name = "HeartGuard"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        import HeartGuard.signals  # noqa: F401
