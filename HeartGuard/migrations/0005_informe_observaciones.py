# Generated by Django 5.1.3 on 2024-11-24 05:08

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('HeartGuard', '0004_paciente_numero_documento_paciente_tipo_documento'),
    ]

    operations = [
        migrations.AddField(
            model_name='informe',
            name='observaciones',
            field=models.TextField(blank=True, null=True, verbose_name='Observaciones'),
        ),
    ]