import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { EcgLine } from '../../layout/ecg-line';
import { Icon } from './icon';

export interface ProfileItem {
  icon: string;
  label: string;
  value: string | null | undefined;
}

/** Tarjeta de perfil (`perfil_medico.html` / `perfil_paciente.html`): avatar, datos y botón de edición. */
@Component({
  selector: 'app-profile-card',
  imports: [Icon, EcgLine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <article class="panel stagger-in overflow-hidden" style="--i: 1">
      <div class="flex flex-col items-center gap-4 border-b border-border pb-5 text-center sm:flex-row sm:text-left">
        <span class="relative grid size-20 shrink-0 place-items-center rounded-md border border-border-strong bg-surface-2 text-3xl font-bold text-fg">
          {{ initials() }}
          <span class="led absolute -right-1 -bottom-1 animate-blink" aria-hidden="true"></span>
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-2xl font-bold text-fg">{{ name() }}</h2>
          <p class="text-muted">{{ role() }}</p>
          <app-ecg-line class="mt-2 h-6 max-w-xs opacity-70" [beats]="3" [speed]="2.8" />
        </div>
        <button type="button" class="btn btn-primary" (click)="edit.emit()"><app-icon name="edit" [size]="16" /> Actualizar información</button>
      </div>
      <h3 class="channel-label mt-5 flex items-center gap-2 !text-fg"><app-icon name="info" [size]="14" /> Información personal</h3>
      <dl class="mt-3 grid gap-2 sm:grid-cols-2">
        @for (it of items(); track it.label; let i = $index) {
          <div class="stagger-in flex items-start gap-3 rounded-sm border border-border bg-surface-2/50 px-3 py-2.5" [style.--i]="i + 2">
            <app-icon [name]="it.icon" [size]="16" class="mt-0.5 text-hg-sage" />
            <div class="min-w-0">
              <dt class="font-mono text-[10px] tracking-widest text-muted uppercase">{{ it.label }}</dt>
              <dd class="truncate text-sm text-fg">{{ it.value || '—' }}</dd>
            </div>
          </div>
        }
      </dl>
    </article>
  `,
})
export class ProfileCard {
  readonly name = input.required<string>();
  readonly role = input('');
  readonly items = input.required<ProfileItem[]>();
  readonly edit = output<void>();
  protected readonly initials = computed(() =>
    this.name()
      .replace(/^Dr\(a\)\.\s*/, '')
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0] ?? '')
      .join('')
      .toUpperCase(),
  );
}
