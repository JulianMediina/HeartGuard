import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Bloque de carga con brillo animado. */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'aria-hidden': 'true' },
  template: `<div class="skeleton" [class]="shape()"></div>`,
})
export class Skeleton {
  /** Clases de tamaño, p. ej. 'h-32 w-full'. */
  readonly shape = input('h-24 w-full');
}
