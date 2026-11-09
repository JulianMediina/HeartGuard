"""Roles y permisos de la API.

Rol de un usuario: `medico` si tiene perfil de médico, `paciente` si tiene perfil de paciente,
`admin` si es staff sin perfil clínico. Los usuarios sin rol no pueden usar la API.
"""

from rest_framework.permissions import BasePermission

ROL_MEDICO = "medico"
ROL_PACIENTE = "paciente"
ROL_ADMIN = "admin"


def get_role(user) -> str | None:
    if not user or not user.is_authenticated:
        return None
    if hasattr(user, "medico"):
        return ROL_MEDICO
    if hasattr(user, "paciente"):
        return ROL_PACIENTE
    if user.is_staff:
        return ROL_ADMIN
    return None


def es_medico(user) -> bool:
    return get_role(user) == ROL_MEDICO


def es_paciente(user) -> bool:
    return get_role(user) == ROL_PACIENTE


def es_admin(user) -> bool:
    return bool(user and user.is_authenticated and user.is_staff)


class TieneRol(BasePermission):
    message = "El usuario no tiene un rol válido en HeartGuard."

    def has_permission(self, request, view):
        return get_role(request.user) is not None


class EsMedico(BasePermission):
    message = "Acceso permitido solo a médicos."

    def has_permission(self, request, view):
        return es_medico(request.user)


class EsPaciente(BasePermission):
    message = "Acceso permitido solo a pacientes."

    def has_permission(self, request, view):
        return es_paciente(request.user)


class EsMedicoOAdmin(BasePermission):
    message = "Acceso permitido solo a médicos o administradores."

    def has_permission(self, request, view):
        return es_medico(request.user) or es_admin(request.user)


class EsAdmin(BasePermission):
    message = "Acceso permitido solo a administradores."

    def has_permission(self, request, view):
        return es_admin(request.user)
