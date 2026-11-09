import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { InformeCreado, Paciente, PatientInput } from '../../core/models/api.models';
import { InformesService, PacientesService } from '../../core/services/api';
import { applyServerErrorsMulti } from '../../core/services/errors';
import { ModeloStore } from '../../core/services/modelo.store';
import { ToastService } from '../../core/services/toast.service';
import { EcgLine } from '../../layout/ecg-line';
import { ClinicalForm } from '../../shared/clinical-form/clinical-form';
import { FieldError } from '../../shared/components/field-error';
import { Icon } from '../../shared/components/icon';
import { MedicalNotice } from '../../shared/components/medical-notice';
import { PageHeader } from '../../shared/components/page-header';
import { PredictionReadout } from '../../shared/components/prediction-readout';

/** Nuevo informe: documento del paciente + 13 variables → se guarda y se predice automáticamente. */
@Component({
  selector: 'app-informe-nuevo',
  imports: [ReactiveFormsModule, RouterLink, PageHeader, ClinicalForm, PredictionReadout, FieldError, EcgLine, MedicalNotice, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header channel="Herramienta IA · Informe" title="Nuevo informe" subtitle="Registra las variables clínicas del paciente. Al guardar, la red neuronal calcula la probabilidad de enfermedad cardíaca.">
      <a routerLink="/medico/informes" class="btn btn-ghost"><app-icon name="list" [size]="16" /> Informes</a>
    </app-page-header>
    <app-medical-notice class="stagger-in mb-5" style="--i: 1" [detail]="modelo.info()?.nota_etiqueta ?? ''" />

    <div class="grid items-start gap-5 lg:grid-cols-5">
      <div class="space-y-5 lg:col-span-3">
        <form class="panel stagger-in" style="--i: 2" [formGroup]="pForm" novalidate aria-labelledby="pac-t" (ngSubmit)="buscarPaciente()">
          <h2 id="pac-t" class="panel-title">Paciente</h2>
          <div class="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label class="label" for="documento">Documento del paciente *</label>
              <input id="documento" class="field vital" formControlName="documento" inputmode="numeric" placeholder="Número de cédula" (blur)="buscarPaciente()" [attr.aria-invalid]="pForm.controls.documento.invalid && pForm.controls.documento.touched" aria-describedby="doc-e doc-ok" />
            </div>
            <button type="submit" class="btn btn-ghost"><app-icon name="search" [size]="16" /> Verificar</button>
          </div>
          <app-field-error [control]="pForm.controls.documento" id="doc-e" [tick]="tick()" />
          <p id="doc-ok" class="mt-2 text-sm" aria-live="polite">
            @if (paciente(); as p) {
              <span class="inline-flex items-center gap-2 text-fg"><span class="led" aria-hidden="true"></span> {{ p.nombres }} {{ p.apellidos }} · {{ p.ciudad || 'sin ciudad' }}</span>
            } @else if (buscando()) {
              <span class="animate-blink text-muted">Buscando paciente…</span>
            }
          </p>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="output">Diagnóstico confirmado (opcional)</label>
              <select id="output" class="field" formControlName="output">
                <option [ngValue]="null">Sin confirmar</option>
                <option [ngValue]="0">Enfermedad ausente</option>
                <option [ngValue]="1">Enfermedad presente</option>
              </select>
            </div>
            <div class="sm:col-span-2">
              <label class="label" for="obs">Observaciones</label>
              <textarea id="obs" class="field" rows="3" formControlName="observaciones" aria-describedby="obs-e"></textarea>
              <app-field-error [control]="pForm.controls.observaciones" id="obs-e" [tick]="tick()" />
            </div>
          </div>
        </form>

        <app-clinical-form class="stagger-in" style="--i: 3" [strictRange]="false" submitLabel="Guardar y predecir" busyLabel="Guardando…" [busy]="saving()" (submitted)="guardar($event)" />
      </div>

      <div class="lg:sticky lg:top-24 lg:col-span-2" aria-live="polite" aria-atomic="true">
        @if (error()) {
          <div class="panel border-alert-border" role="alert">
            <p class="channel-label !text-alert-fg">No se pudo guardar</p>
            <p class="mt-2 text-sm text-alert-fg">{{ error() }}</p>
          </div>
        }
        @if (creado(); as i) {
          @if (i.advertencia_ia) {
            <div class="panel mb-4 !border-flare-2" role="status">
              <p class="channel-label !text-flare-2">Advertencia de la IA</p>
              <p class="mt-2 text-sm text-fg">{{ i.advertencia_ia }}</p>
            </div>
          }
          @if (i.alerta_enviada) {
            <p class="mb-4 flex items-center gap-2 rounded-sm border border-alert-border bg-alert-bg px-3 py-2 text-sm text-alert-fg" role="status">
              <app-icon name="bell" [size]="16" /> Riesgo alto: se envió una alerta automática al paciente.
            </p>
          }
          @if (i.probabilidad !== null && i.nivel_riesgo) {
            <app-prediction-readout
              [title]="'Informe #' + i.id + ' guardado · P(enfermedad)'"
              [probability]="i.probabilidad"
              [level]="i.nivel_riesgo"
              [prediction]="i.prediccion"
              [threshold]="modelo.info()?.threshold ?? null"
              [version]="i.modelo_version"
            >
              <div class="mt-4 grid gap-2 sm:grid-cols-2">
                <a [routerLink]="['/medico/informes', i.id]" class="btn btn-primary">Ver informe</a>
                <button type="button" class="btn btn-ghost" (click)="otro()">Otro informe</button>
              </div>
            </app-prediction-readout>
          } @else {
            <div class="panel">
              <p class="channel-label">Informe #{{ i.id }} guardado</p>
              <p class="mt-2 text-sm text-fg">El informe se guardó sin predicción de la IA. Puedes volver a predecir desde el detalle del informe.</p>
              <a [routerLink]="['/medico/informes', i.id]" class="btn btn-primary mt-4">Ver informe</a>
            </div>
          }
        } @else if (!error()) {
          <div class="panel py-8 text-center">
            <p class="channel-label">Lectura pendiente</p>
            <p class="vital mt-2 text-5xl font-bold text-muted" aria-hidden="true">--,-<span class="text-xl">%</span></p>
            <app-ecg-line class="mt-4 h-10 opacity-60" [beats]="3" [speed]="4" />
            <p class="mt-3 text-sm text-muted">El resultado aparecerá aquí al guardar el informe.</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class InformeNuevo {
  private readonly informes = inject(InformesService);
  private readonly pacientes = inject(PacientesService);
  private readonly toast = inject(ToastService);
  protected readonly modelo = inject(ModeloStore);
  private readonly clinical = viewChild.required(ClinicalForm);
  /** `?documento=` desde la ficha del paciente. */
  readonly documento = input<string>('');

  protected readonly tick = signal(0);
  protected readonly saving = signal(false);
  protected readonly buscando = signal(false);
  protected readonly paciente = signal<Paciente | null>(null);
  protected readonly creado = signal<InformeCreado | null>(null);
  protected readonly error = signal('');
  private buscado = '';

  readonly pForm = new FormGroup({
    documento: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(20)] }),
    observaciones: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
    output: new FormControl<0 | 1 | null>(null),
  });

  constructor() {
    this.modelo.ensure();
    effect(() => {
      const d = this.documento();
      if (d) {
        this.pForm.controls.documento.setValue(d);
        this.buscarPaciente();
      }
    });
  }

  protected buscarPaciente(): void {
    const doc = this.pForm.controls.documento.value.trim();
    if (!doc || doc === this.buscado) return;
    this.buscado = doc;
    this.buscando.set(true);
    this.paciente.set(null);
    this.pacientes
      .list({ documento: doc })
      .pipe(
        map((p) => p.results[0] ?? null),
        catchError(() => of(null)),
      )
      .subscribe((p) => {
        this.buscando.set(false);
        this.paciente.set(p);
        const c = this.pForm.controls.documento;
        if (!p) {
          c.setErrors({ server: `No se encontró un paciente con el documento: ${doc}` });
          c.markAsTouched();
        }
        this.tick.update((t) => t + 1);
      });
  }

  guardar(vars: PatientInput): void {
    this.pForm.markAllAsTouched();
    this.tick.update((t) => t + 1);
    if (this.pForm.invalid) {
      document.getElementById('documento')?.focus();
      return;
    }
    const v = this.pForm.getRawValue();
    this.saving.set(true);
    this.error.set('');
    this.informes.create({ ...vars, documento: v.documento.trim(), observaciones: v.observaciones || undefined, output: v.output }).subscribe({
      next: (i) => {
        this.saving.set(false);
        this.creado.set(i);
        this.toast.success(`Informe guardado para ${i.paciente.nombres} ${i.paciente.apellidos}.`);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const general = applyServerErrorsMulti([this.pForm, this.clinical().form()], err);
        if (err instanceof HttpErrorResponse && err.status === 400) this.clinical().goToFirstInvalid();
        this.error.set(general.join(' '));
        this.tick.update((t) => t + 1);
      },
    });
  }

  protected otro(): void {
    this.creado.set(null);
    this.error.set('');
    this.buscado = '';
    this.paciente.set(null);
    this.pForm.reset({ documento: '', observaciones: '', output: null });
    this.clinical().reset();
  }
}
