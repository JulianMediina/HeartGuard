# HeartGuard - Proyecto de Gestión de Resultados Cardíacos

Este proyecto es una aplicación web que permite la visualización de resultados cardíacos de pacientes utilizando una red neuronal para predecir la presencia o ausencia de enfermedades cardiacas. Está desarrollada con Django, utilizando una base de datos MySQL para almacenar los datos de los pacientes y sus informes.

## Requisitos

- Python 3.8 o superior
- Django 5.1.3
- MySQL 8.0 o superior
- pip (para la instalación de dependencias)

## Instalación

### 1. Clonar el repositorio

Primero, clona el repositorio en tu máquina local:

```bash
git clone https://github.com/julianMediina/heartguard.git
cd heartguard
```
### 2. Crear un entorno virtual
Crea un entorno virtual para gestionar las dependencias de Python:

```bash
Copiar código
python -m venv venv
```
### 3. Activar el entorno virtual
En Windows:
```bash
Copiar código
venv\Scripts\activate
```
En macOS/Linux:
```bash
Copiar código
source venv/bin/activate
```
### 4. Instalar las dependencias
Instala las dependencias del proyecto con pip:
```bash
Copiar código
pip install -r requirements.txt
```
###5. Configuración de la base de datos MySQL
Asegúrate de tener MySQL instalado y en ejecución. Si no tienes MySQL, puedes seguir la documentación oficial de MySQL para instalarlo en tu sistema.

### 5.1 Crear la base de datos
Accede a MySQL y crea una base de datos para el proyecto:
```sql
Copiar código
CREATE DATABASE heartguard_db;
```
### 5.2 Configurar la conexión en settings.py
Abre el archivo heartguard/settings.py y configura la base de datos MySQL en la sección DATABASES de la siguiente manera:
```python
Copiar código
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'heartguard_db',
        'USER': 'root',  # Cambia por tu usuario de MySQL
        'PASSWORD': 'tu_contraseña',  # Cambia por tu contraseña de MySQL
        'HOST': 'localhost',
        'PORT': '3306',
    }
}
```
# IMPORTANTE IMPORTA BASE DE DATOS ARCHIVO "backup.sql"
### 5.3 Instalar el conector de MySQL
Si no tienes el conector de MySQL para Python, instálalo con:

```bash
Copiar código
pip install mysqlclient
```
Si tienes problemas con mysqlclient, puedes intentar con PyMySQL como alternativa:

```bash
Copiar código
pip install PyMySQL
Y en el archivo __init__.py de tu carpeta de configuración (heartguard/__init__.py), agrega:
```

```python
Copiar código
import pymysql
pymysql.install_as_MySQLdb()
```
### 6. Migrar la base de datos
Aplica las migraciones para crear las tablas en la base de datos:

```bash
Copiar código
python manage.py migrate
```
### 7. Crear un superusuario
Crea un superusuario para acceder al panel de administración de Django:

```bash
Copiar código
python manage.py createsuperuser
Sigue las instrucciones en la terminal para establecer el nombre de usuario, correo electrónico y contraseña.
```
###8. Ejecutar el servidor
Ahora, puedes ejecutar el servidor de desarrollo de Django para ver la aplicación en acción:

```bash
Copiar código
python manage.py runserver
```
### Accede a la aplicación en tu navegador en la siguiente dirección:

```
Copiar código
http://127.0.0.1:8000/
```
### URLconf 
```
Using the URLconf defined in HeartGuard.urls, Django tried these URL patterns, in this order:
alguna direcciones
admin/
login/ [name='login']
logout/ [name='logout']
registrar_usuario/ [name='registrar_usuario']
medico_dashboard/ [name='medico_dashboard']
cambiar_contrasena/ [name='cambiar_contrasena']
historial_medico/ [name='historial_medico']
notificaciones/ [name='notificaciones']
perfil_medico/ [name='perfil_medico']
visualizacion_analisis/ [name='visualizacion_analisis']
detalle_paciente/<int:paciente_id>/ [name='detalle_paciente']
paciente_dashboard/ [name='paciente_dashboard']
configuracion_paciente/ [name='configuracion_paciente']
perfil_paciente/ [name='perfil_paciente']
visualizacion_paciente/ [name='visualizacion_paciente']
detalles_resultados/ [name='detalles_resultados']
filtrar_por_cedula/ [name='filtrar_por_cedula']
enviar_alerta/ [name='enviar_alerta_personalizada']
```
### Para acceder al panel de administración de Django, utiliza la siguiente URL:
```
Copiar código
http://127.0.0.1:8000/login/
http://127.0.0.1:8000/admin/
```


### Admin de pruebas 
```
usuario
admin
contraseña
admin
```
### Medico de pruebas 
```
usuario
medico@test.com
contraseña
Test123456789
```
### Paciente de pruebas 
```
usuario
felipe.luque4182@example.com
contraseña
Test123456789
```
