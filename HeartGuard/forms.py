from django import forms
from django.contrib.auth.models import User  # Importamos el modelo User
from .models import Paciente, Medico,Informe  # Importamos Informe para el nuevo campo
from django.core.exceptions import ValidationError

class PacienteForm(forms.ModelForm):
    # Agregar un campo para el correo electrónico (esto se usará para crear el username en la vista)
    email = forms.EmailField()

    class Meta:
        model = Paciente
        fields = ['nombres', 'apellidos', 'tipo_documento', 'numero_documento', 'direccion', 'telefono', 'fecha_nacimiento', 'departamento', 'ciudad']

    def save(self, commit=True):
        # Sobreescribir el método save para crear el usuario
        paciente = super().save(commit=False)
        
        # Usamos el email como username para el usuario
        email = self.cleaned_data['email']
        usuario = User.objects.create_user(
            username=email,
            email=email,
            password=self.cleaned_data['numero_documento']  # Puedes asignar un valor de contraseña inicial si lo necesitas
        )

        # Asociar el usuario con el paciente
        paciente.usuario = usuario
        
        if commit:
            paciente.save()

        return paciente

class LoginForm(forms.Form):
    username = forms.CharField(max_length=255, label='Usuario')
    password = forms.CharField(widget=forms.PasswordInput, label='Contraseña')

    def clean_username(self):
        username = self.cleaned_data.get('username')
        # Verificar si el usuario existe
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise forms.ValidationError('Usuario no encontrado.')
        return username

    def clean_password(self):
        password = self.cleaned_data.get('password')
        # Aquí la validación de la contraseña se hace en la vista de login con authenticate
        return password

class PacienteForm(forms.ModelForm):
    # Campos para el usuario (usuario, password)
    email = forms.EmailField()
    password = forms.CharField(widget=forms.PasswordInput())
    password_confirmation = forms.CharField(widget=forms.PasswordInput(), label="Confirmar Contraseña")

    class Meta:
        model = Paciente
        fields = [
            'nombres', 'apellidos', 'tipo_documento', 'numero_documento', 
            'direccion', 'telefono', 'fecha_nacimiento', 'departamento', 'ciudad'
        ]

    # Validaciones de contraseñas
    def clean_password_confirmation(self):
        password = self.cleaned_data.get('password')
        password_confirmation = self.cleaned_data.get('password_confirmation')

        if password != password_confirmation:
            raise forms.ValidationError("Las contraseñas no coinciden.")
        return password_confirmation

    def save(self, commit=True):
        # Creamos un usuario asociado al paciente
        user = User.objects.create_user(
            username=self.cleaned_data['numero_documento'], 
            email=self.cleaned_data['email'], 
            password=self.cleaned_data['password']
        )

        paciente = super().save(commit=False)  # No guardamos aún el objeto
        paciente.usuario = user  # Asociamos el paciente al usuario creado

        if commit:
            paciente.save()  # Finalmente guardamos el paciente

        return paciente
class MedicoUpdateForm(forms.ModelForm):
    class Meta:
        model = Medico
        fields = ['nombres', 'apellidos', 'telefono', 'fecha_nacimiento', 'direccion', 'departamento', 'ciudad']
        widgets = {
            'fecha_nacimiento': forms.DateInput(attrs={'type': 'date'}),
        }

class PacienteUpdateForm(forms.ModelForm):
    class Meta:
        model = Paciente
        fields = ['nombres', 'apellidos', 'direccion', 'telefono', 'fecha_nacimiento', 'departamento', 'ciudad']
        widgets = {
            'fecha_nacimiento': forms.DateInput(attrs={'type': 'date'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            field.widget.attrs['class'] = 'form-control'
            
class NotificacionForm(forms.Form):
    paciente = forms.ModelChoiceField(queryset=Paciente.objects.all(), label="cedula")
    mensaje = forms.CharField(widget=forms.Textarea, label="Mensaje de Alerta")
