import { inject, Injectable, signal } from '@angular/core';
import { catchError, of, tap } from 'rxjs';

import { ModeloInfo } from '../models/api.models';
import { MlService } from './api';

/**
 * Caché ligera de GET /ml/modelo para las pantallas de predicción (umbral de decisión y
 * nota de la etiqueta). Si falla, las predicciones siguen funcionando sin esos datos.
 */
@Injectable({ providedIn: 'root' })
export class ModeloStore {
  private readonly ml = inject(MlService);
  readonly info = signal<ModeloInfo | null>(null);
  private loading = false;

  ensure(): void {
    if (this.info() || this.loading) return;
    this.loading = true;
    this.ml
      .modelo()
      .pipe(
        tap((m) => this.info.set(m)),
        catchError(() => of(null)),
      )
      .subscribe(() => (this.loading = false));
  }

  set(m: ModeloInfo): void {
    this.info.set(m);
  }
}
