from django.urls import include, re_path
from rest_framework.routers import DefaultRouter

from . import views, views_auth, views_dashboard, views_ml


class Router(DefaultRouter):
    """Rutas sin barra final obligatoria (`/api/v1/pacientes` y `/api/v1/pacientes/` funcionan)."""

    def __init__(self):
        super().__init__()
        self.trailing_slash = "/?"


router = Router()
router.register("pacientes", views.PacienteViewSet, basename="paciente")
router.register("informes", views.InformeViewSet, basename="informe")
router.register("notificaciones", views.NotificacionViewSet, basename="notificacion")

urlpatterns = [
    re_path(r"^auth/login/?$", views_auth.LoginView.as_view(), name="auth-login"),
    re_path(r"^auth/refresh/?$", views_auth.RefreshView.as_view(), name="auth-refresh"),
    re_path(r"^auth/logout/?$", views_auth.LogoutView.as_view(), name="auth-logout"),
    re_path(r"^auth/me/?$", views_auth.MeView.as_view(), name="auth-me"),
    re_path(r"^auth/change-password/?$", views_auth.ChangePasswordView.as_view(), name="auth-change-password"),
    re_path(r"^auth/register/?$", views_auth.RegisterView.as_view(), name="auth-register"),
    re_path(r"^medicos/me/?$", views.MedicoMeView.as_view(), name="medico-me"),
    re_path(r"^dashboard/medico/?$", views_dashboard.DashboardMedicoView.as_view(), name="dashboard-medico"),
    re_path(r"^dashboard/paciente/?$", views_dashboard.DashboardPacienteView.as_view(), name="dashboard-paciente"),
    re_path(r"^analisis/?$", views_dashboard.AnalisisView.as_view(), name="analisis"),
    re_path(r"^ml/prediccion/?$", views_ml.PrediccionView.as_view(), name="ml-prediccion"),
    re_path(r"^ml/modelo/?$", views_ml.ModeloView.as_view(), name="ml-modelo"),
    re_path(r"^ml/features/?$", views_ml.FeaturesView.as_view(), name="ml-features"),
    re_path(r"^ml/reentrenar/?$", views_ml.ReentrenarView.as_view(), name="ml-reentrenar"),
    re_path(r"^", include(router.urls)),
]
