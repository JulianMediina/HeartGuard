import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth/auth.service';
import { Icon } from '../shared/components/icon';
import { ThemeToggle } from '../shared/components/theme-toggle';
import { Brand } from './brand';
import { EcgLine } from './ecg-line';

/** Menú del paciente: secciones de `paciente_dashboard.html` (+ panel y notificaciones). */
export const PACIENTE_NAV = [
  { path: '/paciente', label: 'Mi panel', icon: 'home', exact: true },
  { path: '/paciente/resultados', label: 'Resultados', icon: 'chart', exact: false },
  { path: '/paciente/notificaciones', label: 'Avisos', icon: 'bell', exact: false },
  { path: '/paciente/perfil', label: 'Perfil', icon: 'user', exact: false },
  { path: '/paciente/configuracion', label: 'Configuración', icon: 'cog', exact: false },
];

/** Disposición sencilla para el paciente: cabecera con pestañas y barra inferior en móvil. */
@Component({
  selector: 'app-paciente-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, ThemeToggle, Brand, EcgLine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh flex-col pb-16 md:pb-0">
      <header class="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
        <div class="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <a routerLink="/paciente" class="rounded-md" aria-label="HeartGuard, ir a mi panel"><app-brand subtitle="Portal del paciente" /></a>
          <nav class="ml-2 hidden flex-1 md:block" aria-label="Navegación principal">
            <ul class="flex items-center gap-0.5 lg:gap-1">
              @for (it of nav; track it.path) {
                <li>
                  <a
                    [routerLink]="it.path"
                    routerLinkActive="tab-on"
                    [routerLinkActiveOptions]="{ exact: it.exact }"
                    #rla="routerLinkActive"
                    [attr.aria-current]="rla.isActive ? 'page' : null"
                    class="tab relative flex items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium whitespace-nowrap text-muted transition hover:text-fg"
                  >
                    <app-icon [name]="it.icon" [size]="16" />
                    {{ it.label }}
                  </a>
                </li>
              }
            </ul>
          </nav>
          <span class="flex-1 md:hidden"></span>
          @if (mocks) {
            <span class="chip hidden lg:inline-flex">demo</span>
          }
          <span class="hidden max-w-40 truncate text-right xl:block">
            <span class="block truncate text-sm font-semibold text-fg">{{ name() }}</span>
            <span class="block font-mono text-[10px] text-muted uppercase">Paciente</span>
          </span>
          <app-theme-toggle />
          <button type="button" class="btn btn-danger btn-sm" (click)="auth.logout()" aria-label="Cerrar sesión">
            <app-icon name="logout" [size]="15" /><span class="hidden sm:inline">Salir</span>
          </button>
        </div>
        <app-ecg-line class="block h-3 opacity-50" [beats]="10" [speed]="5" />
      </header>

      <main id="contenido" tabindex="-1" class="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none sm:px-6 lg:py-8">
        <router-outlet />
      </main>

      <!-- Barra inferior (móvil) -->
      <nav class="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden" aria-label="Navegación inferior">
        <ul class="grid grid-cols-5">
          @for (it of nav; track it.path) {
            <li>
              <a
                [routerLink]="it.path"
                routerLinkActive="bottom-on"
                [routerLinkActiveOptions]="{ exact: it.exact }"
                #rlb="routerLinkActive"
                [attr.aria-current]="rlb.isActive ? 'page' : null"
                class="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted"
              >
                <app-icon [name]="it.icon" [size]="19" />
                {{ it.label }}
              </a>
            </li>
          }
        </ul>
      </nav>
    </div>
  `,
  styles: `
    .tab-on {
      color: var(--app-fg) !important;
      background: var(--app-surface-2);
    }
    .tab-on::after {
      content: '';
      position: absolute;
      left: 0.75rem;
      right: 0.75rem;
      bottom: -0.55rem;
      height: 2px;
      background: var(--color-hg-sage);
      box-shadow: 0 0 10px var(--color-hg-sage);
    }
    .bottom-on {
      color: var(--app-fg) !important;
    }
    .bottom-on app-icon {
      color: var(--color-hg-sage);
      filter: drop-shadow(0 0 4px var(--color-hg-sage));
    }
  `,
})
export class PacienteShell {
  protected readonly auth = inject(AuthService);
  protected readonly nav = PACIENTE_NAV;
  protected readonly mocks = environment.useMocks;
  protected readonly name = computed(() => {
    const u = this.auth.user();
    return u ? `${u.nombres} ${u.apellidos}`.trim() || u.username : '';
  });
}
