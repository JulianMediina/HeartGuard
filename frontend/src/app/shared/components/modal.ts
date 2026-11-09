import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

import { Icon } from './icon';

/** Diálogo modal nativo (`<dialog>`): foco atrapado, Escape y fondo con desenfoque. */
@Component({
  selector: 'app-modal',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dlg
      class="modal panel m-auto w-[min(36rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      [attr.aria-labelledby]="titleId"
      (close)="closed.emit()"
      (cancel)="closed.emit()"
    >
      <header class="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface px-5 py-3">
        <h2 [id]="titleId" class="text-lg font-semibold tracking-wide">{{ title() }}</h2>
        <button type="button" class="rounded-sm p-1 text-muted hover:text-fg" (click)="closed.emit()" aria-label="Cerrar">
          <app-icon name="x" />
        </button>
      </header>
      <div class="p-5">
        <ng-content />
      </div>
    </dialog>
  `,
  styles: `
    .modal[open] {
      animation: modal-in 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes modal-in {
      from {
        opacity: 0;
        transform: translateY(16px) scale(0.98);
      }
    }
  `,
})
export class Modal {
  private static seq = 0;
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly closed = output<void>();
  protected readonly titleId = `modal-title-${++Modal.seq}`;
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const d = this.dlg().nativeElement;
      if (this.open() && !d.open) {
        if (typeof d.showModal === 'function') d.showModal();
        else d.setAttribute('open', '');
      } else if (!this.open() && d.open) {
        if (typeof d.close === 'function') d.close();
        else d.removeAttribute('open');
      }
    });
  }
}
