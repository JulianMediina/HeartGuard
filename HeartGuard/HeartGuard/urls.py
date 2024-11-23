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
    path('registro/', views.registrar_usuario,name="registrar_usuario"),

    path('medico_dashboard/', views.medico_dashboard, name='medico_dashboard'),
    path('configuracion_medico/', views.configuracion_medico, name='configuracion_medico'),
    path('historial_medico/', views.historial_medico, name='historial_medico'),
    path('notificaciones/', views.cnotificaciones, name='notificaciones'),
    path('perfil_medico/', views.perfil_medico, name='perfil_medico'),
    path('visualizacion_analisis/', views.visualizacion_analisis, name='visualizacion_analisis'),
    

    path('paciente_dashboard/', views.paciente_dashboard, name='paciente_dashboard'),
    path('configuracion_paciente/', views.configuracion_paciente, name='configuracion_paciente'),
    path('perfil_paciente/', views.perfil_paciente, name='perfil_paciente'),
    path('visualizacion_paciente/', views.visualizacion_paciente, name='visualizacion_paciente'),
    path('detalles_resultados/', views.detalles_resultados, name='detalles_resultados'),

]
