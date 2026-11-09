import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastService } from '../../core/services/toast.service';
import { Icon } from './icon';

/** Región `aria-live` con los avisos efímeros. */
@Component({
  selector: 'app-toast-outlet',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pointer-events-none fixed inset-x-3 bottom-3 z-[65] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5" aria-live="polite" role="status">
      @for (t of toasts.toasts(); track t.id) {
        <div
          class="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border bg-surface px-4 py-3 text-sm shadow-xl sm:w-96"
          [class]="t.kind === 'error' ? 'border-alert-border text-alert-fg' : 'border-border-strong text-fg'"
          [attr.role]="t.kind === 'error' ? 'alert' : null"
        >
          <span class="mt-0.5 grid size-5 place-items-center rounded-sm" [class]="t.kind === 'error' ? 'bg-hg-alert text-white' : 'bg-hg-sage text-hg-abyss'">
            <app-icon [name]="t.kind === 'error' ? 'alert' : 'check'" [size]="13" [stroke]="2.6" />
          </span>
          <p class="flex-1">{{ t.text }}</p>
          <button type="button" class="text-muted hover:text-fg" (click)="toasts.dismiss(t.id)" aria-label="Cerrar aviso">
            <app-icon name="x" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toast-in {
      animation: toast-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(12px) scale(0.97);
      }
    }
  `,
})
export class ToastOutlet {
  protected readonly toasts = inject(ToastService);
}
