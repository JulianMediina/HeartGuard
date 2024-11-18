from django.contrib.auth import authenticate, login
from django.shortcuts import render, redirect
from django.contrib import messages
from django.contrib.auth.models import User
from .models import Medico, Paciente

# Vista para el login
def login_view(request):
    if request.method == 'POST':
        username = request.POST['username']
        password = request.POST['password']
        
        # Verificar si el usuario existe y la contraseña es correcta
        user = authenticate(request, username=username, password=password)
        
        if user is not None:
            login(request, user)  # Iniciar sesión del usuario
            
            # Verificar el rol (Medico o Paciente) basado en la relación con los modelos
            if Medico.objects.filter(usuario=user).exists():
                messages.success(request, "Inicio de sesión exitoso como Médico")
                return redirect('medico_dashboard')  # Redirigir a la página del médico
            elif Paciente.objects.filter(usuario=user).exists():
                messages.success(request, "Inicio de sesión exitoso como Paciente")
                return redirect('paciente_dashboard')  # Redirigir a la página del paciente
            else:
                messages.error(request, "El usuario no está asignado a un rol válido.")
                return redirect('login')  # Redirigir al login si no se encuentra un rol
        else:
            messages.error(request, "Usuario o contraseña incorrectos")
    
    return render(request, 'login.html')

# Vista para el registro de usuarios
def registrar_usuario(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        email = request.POST.get('email')
        password = request.POST.get('password')
        password_confirmation = request.POST.get('password_confirmation')
        role = request.POST.get('role')

        if password != password_confirmation:
            messages.error(request, "Las contraseñas no coinciden.")
            return redirect('registro')

        # Crear usuario
        user = User.objects.create_user(username=username, email=email, password=password)

        # Crear instancia de Medico o Paciente según el rol
        if role == 'medico':
            medico_nombre = request.POST.get('medico_nombre', '')
            medico_apellido = request.POST.get('medico_apellido', '')
            medico_especialidad = request.POST.get('medico_especialidad', '')
            medico_telefono = request.POST.get('medico_telefono', '')
            
            Medico.objects.create(
                usuario=user,
                nombre=medico_nombre,
                apellido=medico_apellido,
                especialidad=medico_especialidad,
                telefono=medico_telefono
            )
        elif role == 'paciente':
            paciente_nombre = request.POST.get('paciente_nombre', '')
            paciente_direccion = request.POST.get('paciente_direccion', '')
            paciente_telefono = request.POST.get('paciente_telefono', '')
            
            Paciente.objects.create(
                usuario=user,
                nombre=paciente_nombre,
                direccion=paciente_direccion,
                telefono=paciente_telefono
            )

        messages.success(request, "Usuario registrado exitosamente.")
        return redirect('login')

    return render(request, 'registrar_usuario.html')

# Vista para el dashboard del médico
def medico_dashboard(request):
    return render(request, "medico_dashboard.html")

# Vista para el dashboard del paciente
def paciente_dashboard(request):
    return render(request, "paciente_dashboard.html")

# Vista para el perfil del médico
def perfil_medico(request):
    return render(request, 'perfil_medico.html')

# Vista para la visualización y análisis
def visualizacion_analisis(request):
    return render(request, 'visualizacion_analisis.html')

# Vista para las notificaciones
def cnotificaciones(request):
    return render(request, 'notificaciones.html')

# Vista para el historial médico
def historial_medico(request):
    return render(request, 'historial_medico.html')

# Vista para la configuración del médico
def configuracion_medico(request):
    return render(request, 'configuracion_medico.html')
