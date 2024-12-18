# Generated by Django 5.1.3 on 2024-11-24 05:03

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('HeartGuard', '0003_rename_fecha_creacion_informe_fecha_informe_medico_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='paciente',
            name='numero_documento',
            field=models.CharField(default=0, max_length=20, unique=True),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='paciente',
            name='tipo_documento',
            field=models.CharField(choices=[('CC', 'Cédula de Ciudadanía'), ('TI', 'Tarjeta de Identidad'), ('PA', 'Pasaporte')], default='CC', max_length=3),
        ),
    ]
