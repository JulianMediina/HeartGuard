"""
URL configuration for HeartGuard project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from . import views


urlpatterns = [
    path('admin/', admin.site.urls),
    path('login/',views.login_view, name = 'login'),
    path('medico_dashboard/', views.medico_dashboard, name='medico_dashboard'),
    path('paciente_dashboard/', views.paciente_dashboard, name='paciente_dashboard'),
    path('registro/', views.registrar_usuario,name="registrar_usuario"),
    path('gestionPacientes/',views.gestionPacientes, name = 'gestionPacientes'),
    path('historialMedico/',views.historialMedico, name = 'historialMedico'),
    path('resultados/', views.resultados, name='resultados'),
]
