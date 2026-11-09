import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { map, Observable, of, switchMap } from 'rxjs';

import { Informe, Paciente } from '../../core/models/api.models';
import { InformesService, PacientesService } from '../../core/services/api';
import { loadable } from '../../core/services/loadable';
import { EmptyState } from '../../shared/components/empty-state';
import { ErrorBanner } from '../../shared/components/error-banner';
import { Icon } from '../../shared/components/icon';
import { InformesTable } from '../../shared/components/informes-table';
import { PageHeader } from '../../shared/components/page-header';
import { Skeleton } from '../../shared/components/skeleton';

interface Resultado {
  paciente: Paciente | null;
  historial: Informe[];
}

/** `filtrar_por_cedula`: busca un paciente por número de documento y muestra todos sus informes. */
@Component({
  selector: 'app-filtrar-cedula',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, PageHeader, InformesTable, ErrorBanner, Skeleton, EmptyState, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header channel="Historial médico · Búsqueda" title="Filtrar por número de cédula" subtitle="Consulta la información completa y todos los informes de un paciente a partir de su documento." />

    <form class="panel stagger-in flex flex-wrap items-end gap-3" style="--i: 1" (ngSubmit)="buscar()" novalidate role="search">
      <div class="min-w-56 flex-1">
        <label class="label" for="cedula">Número de cédula</label>
        <input id="cedula" class="field vital" [formControl]="ctl" placeholder="Ej: 1234567890" inputmode="numeric" [attr.aria-invalid]="ctl.invalid && ctl.touched" aria-describedby="cedula-e" />
        @if (ctl.invalid && ctl.touched) {
          <p id="cedula-e" class="mt-1 text-xs font-semibold text-alert-fg" role="alert">Introduce un número de documento.</p>
        }
      </div>
      <button type="submit" class="btn btn-primary"><app-icon name="search" [size]="16" /> Buscar</button>
    </form>

    <div class="mt-5" aria-live="polite">
      @if (cedula()) {
        @switch (data.state().status) {
          @case ('loading') {
            <app-skeleton shape="h-64 w-full" />
          }
          @case ('error') {
            <app-error-banner [message]="errorMsg()" (retry)="data.reload()" />
          }
          @case ('ready') {
            @if (r(); as r) {
              @if (r.paciente; as p) {
                <section class="panel stagger-in" aria-labelledby="pac-t">
                  <header class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p class="channel-label">Paciente encontrado</p>
                      <h2 id="pac-t" class="mt-1 text-xl font-bold text-fg">Historial médico de {{ p.nombres }} {{ p.apellidos }}</h2>
                    </div>
                    <a [routerLink]="['/medico/pacientes', p.id]" class="btn btn-ghost btn-sm">Abrir ficha <app-icon name="arrowRight" [size]="14" /></a>
                  </header>
                  <dl class="dl-grid mt-4 lg:grid-cols-4">
                    <div><dt>Documento</dt><dd class="vital">{{ p.numero_documento }}</dd></div>
                    <div><dt>Dirección</dt><dd>{{ p.direccion || '—' }}</dd></div>
                    <div><dt>Teléfono</dt><dd class="vital">{{ p.telefono || '—' }}</dd></div>
                    <div><dt>Fecha de nacimiento</dt><dd>{{ p.fecha_nacimiento ? (p.fecha_nacimiento | date: 'dd/MM/yyyy') : '—' }}</dd></div>
                  </dl>
                  <h3 class="mt-6 text-lg font-semibold text-fg">Informes</h3>
                  @if (r.historial.length) {
                    <app-informes-table class="mt-2" [informes]="r.historial" />
                  } @else {
                    <p class="mt-2 text-sm text-flare-2">No se encontraron informes médicos para este paciente.</p>
                  }
                </section>
              } @else {
                <div class="panel"><app-empty-state title="No se encontró un paciente con la cédula ingresada." [text]="'Documento buscado: ' + cedula()" /></div>
              }
            }
          }
        }
      }
    </div>
  `,
})
export class FiltrarCedula {
  private readonly pacientes = inject(PacientesService);
  private readonly informes = inject(InformesService);
  private readonly router = inject(Router);
  /** `?cedula=` (enlazado desde la URL). */
  readonly cedula = input<string>('');
  readonly ctl = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(20)] });

  protected readonly data = loadable<Resultado>(() => this.consultar(this.cedula() ?? ''), () => this.cedula());
  protected readonly r = this.data.data;
  protected readonly errorMsg = computed(() => {
    const s = this.data.state();
    return s.status === 'error' ? s.message : '';
  });

  constructor() {
    effect(() => this.ctl.setValue(this.cedula() ?? ''));
  }

  private consultar(cedula: string): Observable<Resultado> {
    if (!cedula) return of({ paciente: null, historial: [] });
    return this.pacientes.list({ documento: cedula }).pipe(
      map((p) => p.results[0] ?? null),
      switchMap((paciente) =>
        paciente
          ? this.informes.list({ paciente: paciente.id, page_size: 200, ordering: '-fecha' }).pipe(map((i) => ({ paciente, historial: i.results })))
          : of({ paciente: null, historial: [] }),
      ),
    );
  }

  buscar(): void {
    this.ctl.markAsTouched();
    if (this.ctl.invalid) return;
    void this.router.navigate([], { queryParams: { cedula: this.ctl.value.trim() } });
  }
}
