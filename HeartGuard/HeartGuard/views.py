from django.http import HttpResponse
import datetime
from django.template.loader import get_template


def login (request):
    docAux = get_template('login-roles.html')
    document = docAux.render()
    return HttpResponse(document)
def home (request):
    docAux = get_template('dashboard.html')
    document = docAux.render()
    return HttpResponse(document)

def gestionPacientes (request):
    docAux = get_template('gestion-pacientes.html')
    document = docAux.render()
    return HttpResponse(document)

def historialMedico (request):
    docAux = get_template('historial-medico.html')
    document = docAux.render()
    return HttpResponse(document)

def resultados (request):
    docAux = get_template('resultados.html')
    document = docAux.render()
    return HttpResponse(document)
