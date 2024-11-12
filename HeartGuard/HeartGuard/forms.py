from django import forms
from django.contrib.auth.models import User  # Importamos el modelo User

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
