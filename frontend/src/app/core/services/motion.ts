/** true si el usuario pidió reducir el movimiento (o no hay matchMedia, p. ej. en tests). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
