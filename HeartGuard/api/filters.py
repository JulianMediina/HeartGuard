import django_filters

from HeartGuard.models import Informe, Notificacion, Paciente

from .services import fin_del_dia_exclusivo, inicio_del_dia

RIESGO_CHOICES = Informe.NIVEL_RIESGO_CHOICES


def _desde(campo):
    def filtro(queryset, name, value):
        return queryset.filter(**{f"{campo}__gte": inicio_del_dia(value)})
    return filtro


def _hasta(campo):
    def filtro(queryset, name, value):
        return queryset.filter(**{f"{campo}__lt": fin_del_dia_exclusivo(value)})
    return filtro


class PacienteFilter(django_filters.FilterSet):
    documento = django_filters.CharFilter(field_name="numero_documento", lookup_expr="exact",
                                          label="Número de documento (cédula)")
    riesgo = django_filters.ChoiceFilter(field_name="ultimo_riesgo", choices=RIESGO_CHOICES,
                                         label="Nivel de riesgo del último informe")
    registrado_desde = django_filters.DateFilter(method=_desde("usuario__date_joined"))
    registrado_hasta = django_filters.DateFilter(method=_hasta("usuario__date_joined"))

    class Meta:
        model = Paciente
        fields = ["documento", "riesgo", "tipo_documento", "ciudad", "departamento"]


class InformeFilter(django_filters.FilterSet):
    paciente = django_filters.NumberFilter(field_name="paciente_id")
    documento = django_filters.CharFilter(field_name="paciente__numero_documento", label="Cédula del paciente")
    medico = django_filters.NumberFilter(field_name="medico_id")
    riesgo = django_filters.ChoiceFilter(field_name="nivel_riesgo", choices=RIESGO_CHOICES)
    desde = django_filters.DateFilter(method=_desde("fecha"), label="Fecha desde (AAAA-MM-DD)")
    hasta = django_filters.DateFilter(method=_hasta("fecha"), label="Fecha hasta (AAAA-MM-DD, inclusive)")
    sin_diagnostico = django_filters.BooleanFilter(field_name="output", lookup_expr="isnull")

    class Meta:
        model = Informe
        fields = ["paciente", "documento", "medico", "riesgo", "desde", "hasta", "output", "prediccion"]


class NotificacionFilter(django_filters.FilterSet):
    paciente = django_filters.NumberFilter(field_name="paciente_id")
    documento = django_filters.CharFilter(field_name="paciente__numero_documento")
    desde = django_filters.DateFilter(method=_desde("fecha_envio"))
    hasta = django_filters.DateFilter(method=_hasta("fecha_envio"))
    enviadas = django_filters.BooleanFilter(method="filtrar_enviadas", label="Solo las enviadas por mí (médico)")

    class Meta:
        model = Notificacion
        fields = ["paciente", "documento", "tipo", "leida", "desde", "hasta"]

    def filtrar_enviadas(self, queryset, name, value):
        medico = getattr(self.request.user, "medico", None)
        if value and medico is not None:
            return queryset.filter(medico=medico)
        return queryset
