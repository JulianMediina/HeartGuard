from django.shortcuts import render

def login(request):
    return render(request, 'login-roles.html')

def home(request):
    return render(request, 'dashboard.html')

def gestionPacientes(request):
    return render(request, 'gestion-pacientes.html')

def historialMedico(request):
    return render(request, 'historial-medico.html')

def resultados(request):
    return render(request, 'resultados.html')
