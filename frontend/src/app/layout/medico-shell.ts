import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AuthService } from '../core/auth/auth.service';
import { Role } from '../core/models/api.models';
import { environment } from '../../environments/environment';
import { Icon } from '../shared/components/icon';
import { ThemeToggle } from '../shared/components/theme-toggle';
import { Brand, LiveClock } from './brand';
import { EcgLine } from './ecg-line';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  roles: Role[];
  exact?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Menú del médico: mismas secciones que el sidebar de `medico_dashboard.html` + la herramienta de IA. */
export const MEDICO_NAV: NavGroup[] = [
  {
    title: 'Consulta',
    items: [
      { path: '/medico', label: 'Panel', icon: 'home', roles: ['medico'], exact: true },
      { path: '/medico/perfil', label: 'Perfil médico', icon: 'doctor', roles: ['medico'] },
      { path: '/medico/pacientes', label: 'Historial médico', icon: 'folder', roles: ['medico', 'admin'] },
      { path: '/medico/cedula', label: 'Filtrar por cédula', icon: 'id', roles: ['medico', 'admin'] },
      { path: '/medico/informes', label: 'Informes', icon: 'file', roles: ['medico'], exact: true },
      { path: '/medico/analisis', label: 'Visualización', icon: 'chart', roles: ['medico', 'admin'] },
      { path: '/medico/notificaciones', label: 'Notificaciones', icon: 'bell', roles: ['medico', 'admin'] },
    ],
  },
  {
    title: 'Herramienta IA',
    items: [
      { path: '/medico/informes/nuevo', label: 'Nuevo informe', icon: 'filePlus', roles: ['medico'] },
      { path: '/medico/prediccion', label: 'Predicción rápida', icon: 'zap', roles: ['medico'] },
      { path: '/medico/modelo', label: 'Modelo IA', icon: 'cpu', roles: ['medico', 'admin'] },
    ],
  },
  {
    title: 'Sistema',
    items: [{ path: '/medico/configuracion', label: 'Configuración', icon: 'cog', roles: ['medico', 'admin'] }],
  },
];

@Component({
  selector: 'app-medico-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, ThemeToggle, Brand, LiveClock, EcgLine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh">
      <!-- Fondo del cajón en móvil -->
      @if (open()) {
        <button type="button" class="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] lg:hidden" aria-label="Cerrar menú" (click)="open.set(false)"></button>
      }

      <!-- Rack lateral -->
      <aside
        id="rack"
        class="rack fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-surface transition-transform duration-300 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0"
        [class.-translate-x-full]="!open()"
        aria-label="Navegación principal"
      >
        <div class="flex items-center justify-between gap-2 border-b border-border px-4 py-4">
          <app-brand [subtitle]="role() === 'admin' ? 'Administración' : 'Módulo médico'" />
          <button type="button" class="rounded-sm p-1 text-muted hover:text-fg lg:hidden" (click)="open.set(false)" aria-label="Cerrar menú">
            <app-icon name="x" />
          </button>
        </div>

        <nav class="flex-1 overflow-y-auto px-3 py-4">
          @for (g of nav(); track g.title; let gi = $index) {
            <p class="channel-label mt-4 mb-2 px-2 first:mt-0">{{ g.title }}</p>
            <ul class="space-y-1">
              @for (it of g.items; track it.path; let i = $index) {
                <li class="stagger-in" [style.--i]="gi * 3 + i">
                  <a
                    [routerLink]="it.path"
                    routerLinkActive="unit-on"
                    [routerLinkActiveOptions]="{ exact: !!it.exact }"
                    #rla="routerLinkActive"
                    [attr.aria-current]="rla.isActive ? 'page' : null"
                    class="unit group flex items-center gap-3 rounded-sm border border-transparent px-2.5 py-2 text-sm font-medium text-muted transition"
                  >
                    <span class="led-slot" aria-hidden="true"></span>
                    <app-icon [name]="it.icon" [size]="17" />
                    <span class="flex-1">{{ it.label }}</span>
                    <span class="font-mono text-[9px] tracking-widest opacity-60">CH{{ pad(gi * 10 + i + 1) }}</span>
                  </a>
                </li>
              }
            </ul>
          }
        </nav>

        <div class="border-t border-border p-3">
          <div class="mb-3 flex items-center gap-3 rounded-sm bg-surface-2 px-3 py-2">
            <span class="grid size-8 place-items-center rounded-sm bg-hg-teal font-bold text-white">{{ initials() }}</span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-fg">{{ displayName() }}</p>
              <p class="truncate font-mono text-[10px] text-muted uppercase">{{ role() }} · {{ auth.user()?.username }}</p>
            </div>
          </div>
          <button type="button" class="btn btn-danger w-full" (click)="auth.logout()">
            <app-icon name="logout" [size]="16" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
          <div class="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              class="grid size-9 place-items-center rounded-md border border-border text-fg lg:hidden"
              (click)="open.set(true)"
              aria-label="Abrir menú"
              aria-controls="rack"
              [attr.aria-expanded]="open()"
            >
              <app-icon name="menu" />
            </button>
            <app-brand class="lg:hidden" />
            <div class="hidden items-center gap-2 lg:flex">
              <span class="led animate-blink" aria-hidden="true"></span>
              <span class="channel-label">Monitor en línea</span>
              @if (mocks) {
                <span class="chip">datos de demostración</span>
              }
            </div>
            <app-ecg-line class="mx-2 hidden h-7 flex-1 opacity-70 md:block" [beats]="6" [speed]="3.4" />
            <span class="flex-1 md:hidden"></span>
            <app-live-clock class="hidden sm:block" />
            <app-theme-toggle />
          </div>
        </header>

        <main id="contenido" tabindex="-1" class="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none sm:px-6 lg:py-8">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: `
    .unit:hover {
      color: var(--app-fg);
      background: var(--app-surface-2);
    }
    .led-slot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--app-border);
      transition: all 0.2s ease;
    }
    .unit-on {
      color: var(--app-fg) !important;
      border-color: var(--app-border-strong) !important;
      background: color-mix(in oklab, var(--app-surface-2) 80%, transparent);
      box-shadow: inset 2px 0 0 var(--color-hg-sage);
    }
    .unit-on .led-slot {
      background: var(--color-hg-sage);
      box-shadow: 0 0 8px var(--color-hg-sage);
    }
    .rack {
      background-image: linear-gradient(180deg, color-mix(in oklab, var(--app-surface-2) 40%, transparent), transparent 30%);
    }
  `,
})
export class MedicoShell {
  protected readonly auth = inject(AuthService);
  protected readonly open = signal(false);
  protected readonly mocks = environment.useMocks;
  protected readonly role = this.auth.role;

  protected readonly nav = computed(() => {
    const r = this.role();
    return MEDICO_NAV.map((g) => ({ ...g, items: g.items.filter((i) => r && i.roles.includes(r)) })).filter(
      (g) => g.items.length,
    );
  });

  protected readonly displayName = computed(() => {
    const u = this.auth.user();
    if (!u) return '';
    const n = `${u.nombres} ${u.apellidos}`.trim() || u.username;
    return u.role === 'medico' ? `Dr(a). ${n}` : n;
  });

  protected readonly initials = computed(() => {
    const u = this.auth.user();
    return ((u?.nombres?.[0] ?? u?.username?.[0] ?? '') + (u?.apellidos?.[0] ?? '')).toUpperCase();
  });

  constructor() {
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.open.set(false));
  }

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }
}
