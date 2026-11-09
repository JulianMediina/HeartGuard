import { DestroyRef, effect, inject, signal, Signal, untracked } from '@angular/core';
import { Observable, Subscription } from 'rxjs';

import { describeApiError } from './errors';

export type Loadable<T> =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

export interface LoadableRef<T> {
  state: Signal<Loadable<T>>;
  /** Último dato válido (se conserva mientras se recarga, útil para filtros y paginación). */
  data: Signal<T | null>;
  reload: () => void;
}

/**
 * Envuelve una petición en un signal con estados loading / error / ready y `reload()`.
 * Sin `deps` carga una vez al crearse. Con `deps` (función que lee signals, p. ej. inputs de
 * ruta o filtros) recarga cada vez que cambian. Debe llamarse en contexto de inyección.
 */
export function loadable<T>(source: () => Observable<T>, deps?: () => unknown): LoadableRef<T> {
  const state = signal<Loadable<T>>({ status: 'loading' });
  const data = signal<T | null>(null);
  let sub: Subscription | undefined;
  const reload = () => {
    sub?.unsubscribe();
    state.set({ status: 'loading' });
    sub = source().subscribe({
      next: (d) => {
        data.set(d);
        state.set({ status: 'ready', data: d });
      },
      error: (err: unknown) => state.set({ status: 'error', message: describeApiError(err) }),
    });
  };
  inject(DestroyRef).onDestroy(() => sub?.unsubscribe());
  if (deps) {
    effect(() => {
      deps();
      untracked(reload);
    });
  } else {
    reload();
  }
  return { state: state.asReadonly(), data: data.asReadonly(), reload };
}
