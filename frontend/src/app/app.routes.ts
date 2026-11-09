import { Routes } from '@angular/router';

import { authGuard, guestGuard, roleGuard } from './core/auth/guards';

const T = (s: string) => `${s} · HeartGuard`;

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    title: T('Inicio de sesión'),
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/login').then((m) => m.Login),
  },
  {
    path: 'registro',
    title: T('Registrar usuario'),
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/registro').then((m) => m.Registro),
  },
  {
    path: 'medico',
    canActivate: [authGuard, roleGuard('medico', 'admin')],
    loadComponent: () => import('./layout/medico-shell').then((m) => m.MedicoShell),
    children: [
      {
        path: '',
        title: T('Panel del médico'),
        canActivate: [roleGuard('medico')],
        loadComponent: () => import('./pages/medico/dashboard').then((m) => m.MedicoDashboard),
      },
      {
        path: 'pacientes',
        title: T('Historial médico'),
        loadComponent: () => import('./pages/medico/pacientes').then((m) => m.Pacientes),
      },
      {
        path: 'pacientes/nuevo',
        title: T('Nuevo paciente'),
        loadComponent: () => import('./pages/medico/paciente-nuevo').then((m) => m.PacienteNuevo),
      },
      {
        path: 'pacientes/:id',
        title: T('Detalle del paciente'),
        loadComponent: () => import('./pages/medico/paciente-detalle').then((m) => m.PacienteDetalle),
      },
      {
        path: 'cedula',
        title: T('Filtrar por cédula'),
        loadComponent: () => import('./pages/medico/filtrar-cedula').then((m) => m.FiltrarCedula),
      },
      {
        path: 'analisis',
        title: T('Visualización y análisis'),
        loadComponent: () => import('./pages/medico/analisis').then((m) => m.AnalisisPage),
      },
      {
        path: 'informes',
        title: T('Informes'),
        canActivate: [roleGuard('medico')],
        loadComponent: () => import('./pages/medico/informes').then((m) => m.Informes),
      },
      {
        path: 'informes/nuevo',
        title: T('Nuevo informe'),
        canActivate: [roleGuard('medico')],
        loadComponent: () => import('./pages/ia/informe-nuevo').then((m) => m.InformeNuevo),
      },
      {
        path: 'informes/:id',
        title: T('Informe'),
        canActivate: [roleGuard('medico')],
        loadComponent: () => import('./pages/comun/informe-detalle').then((m) => m.InformeDetalle),
      },
      {
        path: 'prediccion',
        title: T('Predicción rápida'),
        canActivate: [roleGuard('medico')],
        loadComponent: () => import('./pages/ia/prediccion-rapida').then((m) => m.PrediccionRapida),
      },
      {
        path: 'modelo',
        title: T('Modelo IA'),
        loadComponent: () => import('./pages/ia/modelo').then((m) => m.Modelo),
      },
      {
        path: 'notificaciones',
        title: T('Notificaciones'),
        loadComponent: () => import('./pages/medico/notificaciones').then((m) => m.NotificacionesMedico),
      },
      {
        path: 'notificaciones/enviar',
        title: T('Enviar alerta'),
        canActivate: [roleGuard('medico')],
        loadComponent: () => import('./pages/medico/enviar-alerta').then((m) => m.EnviarAlerta),
      },
      {
        path: 'perfil',
        title: T('Perfil médico'),
        canActivate: [roleGuard('medico')],
        loadComponent: () => import('./pages/medico/perfil').then((m) => m.PerfilMedico),
      },
      {
        path: 'configuracion',
        title: T('Configuración'),
        loadComponent: () => import('./pages/comun/cambiar-contrasena').then((m) => m.CambiarContrasena),
      },
    ],
  },
  {
    path: 'paciente',
    canActivate: [authGuard, roleGuard('paciente')],
    loadComponent: () => import('./layout/paciente-shell').then((m) => m.PacienteShell),
    children: [
      {
        path: '',
        title: T('Mi panel'),
        loadComponent: () => import('./pages/paciente/dashboard').then((m) => m.PacienteDashboard),
      },
      {
        path: 'resultados',
        title: T('Mis resultados'),
        loadComponent: () => import('./pages/paciente/resultados').then((m) => m.Resultados),
      },
      {
        path: 'resultados/:id',
        title: T('Detalle del resultado'),
        loadComponent: () => import('./pages/comun/informe-detalle').then((m) => m.InformeDetalle),
      },
      {
        path: 'perfil',
        title: T('Mi perfil'),
        loadComponent: () => import('./pages/paciente/perfil').then((m) => m.PerfilPaciente),
      },
      {
        path: 'notificaciones',
        title: T('Mis notificaciones'),
        loadComponent: () => import('./pages/paciente/notificaciones').then((m) => m.NotificacionesPaciente),
      },
      {
        path: 'configuracion',
        title: T('Configuración'),
        loadComponent: () => import('./pages/comun/cambiar-contrasena').then((m) => m.CambiarContrasena),
      },
    ],
  },
  {
    path: '**',
    title: T('Página no encontrada'),
    loadComponent: () => import('./pages/comun/no-encontrado').then((m) => m.NoEncontrado),
  },
];
