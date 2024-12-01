from django.contrib.auth import authenticate, login
from django.shortcuts import render, redirect,get_object_or_404
from django.contrib import messages
from django.contrib.auth.models import User
from .models import Medico, Paciente, Notificacion
from .forms import  MedicoUpdateForm,NotificacionForm,PacienteUpdateForm
from django.db import IntegrityError
from django.http import HttpResponseForbidden,HttpResponse
from django.contrib.auth.decorators import login_required
from django.contrib.auth import logout
from datetime import date
from django.core.mail import send_mail
from django.core.exceptions import PermissionDenied
from django.http import JsonResponse


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

# Vista para la visualización y análisis
def visualizacion_analisis(request):
    return render(request, 'visualizacion_analisis.html')

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

# Decorador para restringir el acceso solo a médicos
@login_required
def perfil_medico(request):
    medico = get_object_or_404(Medico, usuario=request.user)
    if request.method == "POST":
        form = MedicoUpdateForm(request.POST, instance=medico)
        if form.is_valid():
            form.save()
            # Añade un mensaje de éxito si deseas
            return redirect('perfil_medico')
    else:
        form = MedicoUpdateForm(instance=medico)
    
    return render(request, 'perfil_medico.html', {'medico': medico, 'form': form})
def medico_required(view_func):
    def wrapper(request, *args, **kwargs):
        if hasattr(request.user, 'medico'):
            return view_func(request, *args, **kwargs)
        return HttpResponseForbidden("Acceso denegado. Solo disponible para médicos.")
    return wrapper

@login_required
@medico_required
def perfil_medico(request):
    # Obtener el perfil del médico asociado al usuario autenticado
    medico = get_object_or_404(Medico, usuario=request.user)

    if request.method == "POST":
        form = MedicoUpdateForm(request.POST, instance=medico)
        if form.is_valid():
            form.save()
            messages.success(request, "Información actualizada correctamente.")
            return redirect('perfil_medico')
    else:
        form = MedicoUpdateForm(instance=medico)

    # Pasar los datos del médico y el formulario al template
    return render(request, 'perfil_medico.html', {'medico': medico, 'form': form})
@login_required
@medico_required
def visualizacion_analisis(request):
    return render(request, 'visualizacion_analisis.html')

@login_required
@medico_required
def notificaciones(request):
    pacientes = Paciente.objects.all()
    return render(request, 'notificaciones.html', {'pacientes': pacientes})

@login_required
@medico_required
def historial_medico(request):
    pacientes = Paciente.objects.all()
    return render(request, 'historial_medico.html', {'pacientes': pacientes})


def lista_pacientes(request):
    pacientes = Paciente.objects.all()
    dia = request.GET.get('dia')
    mes = request.GET.get('mes')
    anio = request.GET.get('anio')

    # Filtro por fecha si los valores están presentes
    if dia and mes and anio:
        try:
            fecha_filtro = date(int(anio), int(mes), int(dia))
            pacientes = pacientes.filter(fecha_registro=fecha_filtro)
        except ValueError:
            pass  # Fecha inválida, ignora el filtro

    return render(request, 'historial_pacientes.html', {'pacientes': pacientes})

def detalle_paciente(request, paciente_id):
    paciente = get_object_or_404(Paciente, id=paciente_id)
    return render(request, 'detalle_paciente.html', {'paciente': paciente})

#notificaciones
def notificaciones_medicas(request):
    # Lista de pacientes con alto riesgo cardíaco (ejemplo)
    pacientes_riesgo = Paciente.objects.filter(output=1)  # Pacientes con riesgo alto
    
    if request.method == 'POST':
        # Enviar alerta personalizada
        paciente_id = request.POST.get('paciente')
        mensaje = request.POST.get('mensaje')
        
        paciente = Paciente.objects.get(id=paciente_id)
        
        # Enviar el correo
        send_mail(
            'Alerta Médica: Riesgo Cardíaco',
            mensaje,
            'heartguardapp@gmail.com',  # Remitente
            [paciente.user.email],  # Destinatario (correo del paciente)
            fail_silently=False,
        )
        return HttpResponse('Alerta enviada con éxito.')

    return render(request, 'notificaciones.html', {'pacientes_riesgo': pacientes_riesgo})

def enviar_notificaciones_automaticas():
    pacientes_en_riesgo = Paciente.objects.filter(informes__output=1).distinct()

    for paciente in pacientes_en_riesgo:
        mensaje = (
            f"Estimado/a {paciente.nombres} {paciente.apellidos},\n\n"
            "Nuestro sistema ha detectado que usted podría estar en alto riesgo cardíaco. "
            "Recomendamos que agende una consulta con su médico de cabecera lo antes posible."
        )
        
        # Enviar correo
        send_mail(
            subject="Alerta Médica: Riesgo Cardíaco",
            message=mensaje,
            from_email="notificaciones@hospital.com",
            recipient_list=[paciente.usuario.email],
            fail_silently=False,
        )
        
        # Registrar la notificación en el sistema
        Notificacion.objects.create(
            paciente=paciente,
            mensaje=mensaje,
        )
def enviar_alerta_personalizada(request):
    if request.method == "POST":
        form = NotificacionForm(request.POST)
        if form.is_valid():
            paciente = form.cleaned_data["paciente"]
            mensaje = form.cleaned_data["mensaje"]
            
            # Enviar correo
            send_mail(
                subject="Alerta Médica Personalizada",
                message=mensaje,
                from_email="notificaciones@hospital.com",
                recipient_list=[paciente.usuario.email],
                fail_silently=False,
            )
            
            # Registrar la notificación en el sistema
            Notificacion.objects.create(
                paciente=paciente,
                mensaje=mensaje,
            )
            
            messages.success(request, "Alerta enviada correctamente.")
            return redirect("notificaciones")  # Cambia "notificaciones" al nombre de tu vista correspondiente
    else:
        form = NotificacionForm()

    return render(request, "enviar_alerta.html", {"form": form})

@login_required
def cambiar_contrasena(request):
    if request.method == "POST":
        contrasena_actual = request.POST.get("contraseña_actual")
        nueva_contraseña = request.POST.get("nueva_contraseña")
        confirmar_contraseña = request.POST.get("confirmar_contraseña")

        user = request.user

        # Verificar contraseña actual
        if not user.check_password(contrasena_actual):
            messages.error(request, "La contraseña actual no es correcta.")
            return redirect("cambiar_contrasena")

        # Verificar coincidencia de las contraseñas nuevas
        if nueva_contraseña != confirmar_contraseña:
            messages.error(request, "Las nuevas contraseñas no coinciden.")
            return redirect("cambiar_contrasena")

        # Verificar reglas de complejidad (opcional)
        if len(nueva_contraseña) < 8 or not any(c.isdigit() for c in nueva_contraseña) or \
           not any(c.isupper() for c in nueva_contraseña) or not any(c.islower() for c in nueva_contraseña):
            messages.error(request, "La nueva contraseña no cumple con los requisitos de seguridad.")
            return redirect("cambiar_contrasena")

        # Cambiar la contraseña
        user.set_password(nueva_contraseña)
        user.save()


        # Autenticar nuevamente al usuario
        user = authenticate(username=user.username, password=nueva_contraseña)
        if user:
            login(request, user)
            messages.success(request, "Contraseña cambiada exitosamente.")
            return redirect("cambiar_contrasena")

    return render(request, "cambiar_contrasena.html")
@login_required
def logout_view(request):
    logout(request)
    messages.success(request, "Has cerrado sesión correctamente.")
    return redirect('login')
