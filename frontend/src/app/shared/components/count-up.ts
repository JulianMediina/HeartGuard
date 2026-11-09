import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';

import { prefersReducedMotion } from '../../core/services/motion';

/**
 * Número animado: cuenta desde el valor mostrado hasta `value` cada vez que éste cambia
 * (no sólo en el primer render). Si la pestaña está oculta (rAF en pausa) o se pide
 * movimiento reducido, muestra el valor final directamente para no quedarse a medias.
 */
@Component({
  selector: 'app-count-up',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="tabular-nums">{{ prefix() }}{{ display() }}{{ suffix() }}</span>`,
})
export class CountUp {
  readonly value = input.required<number>();
  readonly decimals = input(0);
  readonly duration = input(1100);
  readonly prefix = input('');
  readonly suffix = input('');

  protected readonly display = signal('0');
  private current = 0;
  private frame = 0;
  private fallback: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
    effect(() => {
      const target = this.value();
      const decimals = this.decimals();
      const duration = this.duration();
      untracked(() => this.animateTo(target, decimals, duration));
    });
  }

  private animateTo(target: number, decimals: number, duration: number): void {
    this.stop();
    const from = this.current;
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (
      !Number.isFinite(target) ||
      prefersReducedMotion() ||
      hidden ||
      typeof requestAnimationFrame !== 'function' ||
      from === target
    ) {
      this.set(target, decimals);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.set(from + (target - from) * eased, decimals);
      if (t < 1) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
    // Garantía: aunque rAF se pause (pestaña en segundo plano), el valor final llega.
    this.fallback = setTimeout(() => {
      cancelAnimationFrame(this.frame);
      this.set(target, decimals);
    }, duration + 150);
  }

  private set(v: number, decimals: number): void {
    this.current = v;
    this.display.set(
      Number.isFinite(v)
        ? v.toLocaleString('es-ES', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        : '—',
    );
  }

  private stop(): void {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.fallback);
  }
}
