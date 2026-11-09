import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Icon } from './icon';

/** Paginación numérica con elipsis (como la del `visualizacion_analisis` original). */
@Component({
  selector: 'app-pagination',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pages() > 1) {
      <nav class="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="Paginación">
        <p class="font-mono text-xs text-muted">
          {{ from() }}–{{ to() }} de <span class="text-fg">{{ count() }}</span>
        </p>
        <ul class="flex flex-wrap items-center gap-1">
          <li>
            <button type="button" class="pg" [disabled]="page() <= 1" (click)="go(page() - 1)" aria-label="Página anterior">
              <app-icon name="chevronLeft" [size]="16" />
            </button>
          </li>
          @for (p of items(); track $index) {
            <li>
              @if (p === 0) {
                <span class="px-1 text-muted" aria-hidden="true">…</span>
              } @else {
                <button
                  type="button"
                  class="pg"
                  [class.pg-on]="p === page()"
                  [attr.aria-current]="p === page() ? 'page' : null"
                  [attr.aria-label]="'Página ' + p"
                  (click)="go(p)"
                >
                  {{ p }}
                </button>
              }
            </li>
          }
          <li>
            <button type="button" class="pg" [disabled]="page() >= pages()" (click)="go(page() + 1)" aria-label="Página siguiente">
              <app-icon name="chevronRight" [size]="16" />
            </button>
          </li>
        </ul>
      </nav>
    }
  `,
  styles: `
    .pg {
      display: grid;
      place-items: center;
      min-width: 2.25rem;
      height: 2.25rem;
      padding: 0 0.5rem;
      border-radius: 0.25rem;
      border: 1px solid var(--app-border);
      font-family: var(--font-mono);
      font-size: 0.8rem;
      color: var(--app-fg);
      transition: all 0.15s ease;
    }
    .pg:hover:not(:disabled) {
      border-color: var(--app-border-strong);
      background: var(--app-surface-2);
    }
    .pg:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .pg-on {
      background: var(--app-primary);
      color: var(--app-on-primary);
      border-color: var(--app-primary);
      box-shadow: 0 0 12px -2px var(--app-glow);
    }
  `,
})
export class Pagination {
  readonly page = input.required<number>();
  readonly count = input.required<number>();
  readonly pageSize = input(20);
  readonly pageChange = output<number>();

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.count() / this.pageSize())));
  protected readonly from = computed(() => (this.count() ? (this.page() - 1) * this.pageSize() + 1 : 0));
  protected readonly to = computed(() => Math.min(this.count(), this.page() * this.pageSize()));

  /** Páginas visibles; 0 = elipsis. */
  protected readonly items = computed(() => {
    const n = this.pages();
    const p = this.page();
    const set = new Set([1, n, p - 1, p, p + 1].filter((x) => x >= 1 && x <= n));
    const sorted = [...set].sort((a, b) => a - b);
    const out: number[] = [];
    sorted.forEach((x, i) => {
      if (i && x - sorted[i - 1] > 1) out.push(0);
      out.push(x);
    });
    return out;
  });

  protected go(p: number): void {
    if (p >= 1 && p <= this.pages() && p !== this.page()) this.pageChange.emit(p);
  }
}
