import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService, homeFor } from '../../core/auth/auth.service';
import { EcgLine } from '../../layout/ecg-line';

@Component({
  selector: 'app-no-encontrado',
  imports: [RouterLink, EcgLine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="contenido" class="grid min-h-dvh place-items-center px-4">
      <div class="panel max-w-md text-center">
        <p class="channel-label">Error 404 · Sin señal</p>
        <app-ecg-line class="mx-auto mt-4 h-10 w-56 opacity-50" [beats]="2" [speed]="6" />
        <h1 class="mt-4 text-2xl font-bold text-fg">Página no encontrada</h1>
        <p class="mt-2 text-sm text-muted">La dirección no corresponde a ninguna pantalla de HeartGuard.</p>
        <a [routerLink]="home()" class="btn btn-primary mt-6">Volver al inicio</a>
      </div>
    </main>
  `,
})
export class NoEncontrado {
  private readonly auth = inject(AuthService);
  protected readonly home = computed(() => homeFor(this.auth.role()));
}
