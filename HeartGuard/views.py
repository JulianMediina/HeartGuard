from django.contrib.auth import authenticate, login
from django.shortcuts import render, redirect,get_object_or_404
from django.contrib import messages
from django.contrib.auth.models import User
from .models import Medico, Paciente
from .forms import PacienteForm
from django.db import IntegrityError
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
    if request.method == "POST":
        email = request.POST.get("email")
        password = request.POST.get("password")
        password_confirmation = request.POST.get("password_confirmation")
        nombre = request.POST.get("nombres")
        apellidos = request.POST.get("apellidos")
        tipo_documento = request.POST.get("tipo_documento")
        numero_documento = request.POST.get("numero_documento")
        direccion = request.POST.get("direccion", "")
        telefono = request.POST.get("telefono", "")
        fecha_nacimiento = request.POST.get("fecha_nacimiento", None)
        departamento = request.POST.get("departamento", "")
        ciudad = request.POST.get("ciudad", "")

        # Validación de contraseñas
        if password != password_confirmation:
            messages.error(request, "Las contraseñas no coinciden.")
            return redirect("registrar_usuario")

        try:
            # Verificar si el correo electrónico ya está registrado
            if User.objects.filter(email=email).exists():
                messages.error(request, "El correo electrónico ya está registrado.")
                return redirect("registrar_usuario")
            
            # Crear usuario con correo electrónico como username
            usuario = User.objects.create_user(
                username=email, email=email, password=password
            )
            
            # Crear paciente relacionado
            paciente = Paciente.objects.create(
                usuario=usuario,
                nombres=nombre,
                apellidos=apellidos,
                tipo_documento=tipo_documento,
                numero_documento=numero_documento,
                direccion=direccion,
                telefono=telefono,
                fecha_nacimiento=fecha_nacimiento,
                departamento=departamento,
                ciudad=ciudad,
            )
            messages.success(request, "El usuario ha sido registrado exitosamente.")
            return redirect("login")
        except IntegrityError:
            messages.error(request, "Error al registrar el usuario.")
        except Exception as e:
            messages.error(request, f"Ha ocurrido un error: {str(e)}")

    return render(request, "registrar_usuario.html")
# Vista para el dashboard del médico
def medico_dashboard(request):
    return render(request, "medico_dashboard.html")

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

# Vista para el dashboard del paciente
def paciente_dashboard(request):
    return render(request, "paciente_dashboard.html")

# Vista para el perfil del paciente
def perfil_paciente(request):
    return render(request, 'perfil_paciente.html')

# Vista para la visualización paciente
def visualizacion_paciente(request):
    return render(request, 'visualizacion_paciente.html')

# Vista para la configuración del paciente
def configuracion_paciente(request):
    return render(request, 'configuracion_paciente.html')

# Vista para la detalles del paciente
def detalles_resultados(request):
    return render(request, 'detalles_resultados.html')

#vista update paciente
def update_paciente(request, paciente_id):
    paciente = get_object_or_404(Paciente, id=paciente_id)
    if request.method == 'POST':
        form = PacienteForm(request.POST, instance=paciente)
        if form.is_valid():
            form.save()
            return redirect('perfil_paciente', paciente_id=paciente.id)
    else:
        form = PacienteForm(instance=paciente)
    return render(request, 'perfil_paciente.html', {'paciente': paciente, 'form': form})

