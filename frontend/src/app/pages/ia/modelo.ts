import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { AuthService } from '../../core/auth/auth.service';
import { featureLabel } from '../../core/features';
import { FeatureSpec, MetricKey, ModeloInfo, ReentrenoResultado } from '../../core/models/api.models';
import { MlService } from '../../core/services/api';
import { describeApiError } from '../../core/services/errors';
import { loadable } from '../../core/services/loadable';
import { ModeloStore } from '../../core/services/modelo.store';
import { ToastService } from '../../core/services/toast.service';
import { ClassDistribution } from '../../shared/components/class-distribution';
import { ComparisonBars, ComparisonRow } from '../../shared/components/comparison-bars';
import { ConfusionMatrix } from '../../shared/components/confusion-matrix';
import { ErrorBanner } from '../../shared/components/error-banner';
import { Icon } from '../../shared/components/icon';
import { KpiCard } from '../../shared/components/kpi-card';
import { ChartMarker, LineChart, LineSeries } from '../../shared/components/line-chart';
import { MedicalNotice } from '../../shared/components/medical-notice';
import { Modal } from '../../shared/components/modal';
import { PageHeader } from '../../shared/components/page-header';
import { Skeleton } from '../../shared/components/skeleton';

const METRICAS: { key: MetricKey; label: string; code: string }[] = [
  { key: 'roc_auc', label: 'Área bajo la curva ROC', code: 'AUC' },
  { key: 'accuracy', label: 'Exactitud', code: 'ACC' },
  { key: 'recall', label: 'Sensibilidad (recall)', code: 'SEN' },
  { key: 'precision', label: 'Precisión', code: 'PPV' },
  { key: 'f1', label: 'F1', code: 'F1' },
];

/** «Modelo IA»: métricas, curvas de pérdida, matriz de confusión, ROC, versiones y reentrenamiento. */
@Component({
  selector: 'app-modelo',
  imports: [DatePipe, DecimalPipe, PageHeader, KpiCard, LineChart, ConfusionMatrix, ComparisonBars, ClassDistribution, ErrorBanner, Skeleton, Modal, MedicalNotice, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modelo.html',
})
export class Modelo {
  private readonly ml = inject(MlService);
  private readonly store = inject(ModeloStore);
  private readonly toast = inject(ToastService);
  protected readonly isAdmin = computed(() => this.auth.role() === 'admin');
  private readonly auth = inject(AuthService);

  protected readonly data = loadable(() => this.ml.modelo());
  protected readonly m = this.data.data;
  protected readonly errorMsg = computed(() => {
    const s = this.data.state();
    return s.status === 'error' ? s.message : '';
  });

  protected readonly confirmar = signal(false);
  protected readonly retraining = signal(false);
  protected readonly retrainResult = signal<ReentrenoResultado | null>(null);
  protected readonly retrainError = signal('');

  protected readonly kpis = computed(() => {
    const met = this.m()?.metrics;
    if (!met?.test) return [];
    return METRICAS.filter((k) => met.test[k.key] !== undefined).map((k) => ({
      ...k,
      value: met.test[k.key],
      cv: met.cv?.[k.key] ?? null,
    }));
  });

  protected readonly lossSeries = computed<LineSeries[]>(() => {
    const h = this.m()?.history;
    if (!h?.train_loss?.length) return [];
    return [
      { id: 'train', label: 'Entrenamiento', color: 'var(--app-series-1)', points: h.train_loss.map((y, i) => ({ x: i + 1, y })) },
      { id: 'val', label: 'Validación', color: 'var(--app-series-2)', dashed: true, points: (h.val_loss ?? []).map((y, i) => ({ x: i + 1, y })) },
    ];
  });

  protected readonly bestMarker = computed<ChartMarker | null>(() => {
    const h = this.m()?.history;
    if (!h) return null;
    const best = h.best_epoch ?? h.val_loss?.indexOf(Math.min(...(h.val_loss ?? [])));
    return best !== undefined && best >= 0 ? { x: best + 1, label: `Mejor época (${best + 1})` } : null;
  });

  protected readonly rocSeries = computed<LineSeries[]>(() => {
    const r = this.m()?.metrics?.roc_curve;
    if (!r?.fpr?.length) return [];
    return [{ id: 'roc', label: 'Red neuronal', color: 'var(--app-series-1)', area: true, points: r.fpr.map((x, i) => ({ x, y: r.tpr[i] })) }];
  });

  protected readonly comparacion = computed<ComparisonRow[]>(() => {
    const met = this.m()?.metrics;
    const lr = met?.baselines?.logistic_regression;
    if (!met?.test || !lr) return [];
    return METRICAS.map((k) => ({ label: k.label, a: met.test[k.key], b: lr[k.key] }));
  });

  protected readonly featureSpecs = computed<FeatureSpec[]>(() =>
    (this.m()?.features ?? []).filter((f): f is FeatureSpec => typeof f === 'object'),
  );
  protected readonly featureNames = computed<string[]>(() =>
    (this.m()?.features ?? []).map((f) => (typeof f === 'string' ? f : f.name)),
  );

  protected readonly capas = computed(() => {
    const a = (this.m()?.arquitectura ?? {}) as Record<string, unknown>;
    const hidden = Array.isArray(a['hidden_sizes']) ? (a['hidden_sizes'] as number[]) : [];
    const dropout = a['dropout'];
    const inputDim = Number(a['input_dim']) || null;
    return [
      { name: 'Entrada', size: inputDim ?? 13, detail: inputDim ? '13 variables → codificación one-hot + estandarización' : '13 variables clínicas' },
      ...hidden.map((n, i) => ({ name: `Oculta ${i + 1}`, size: n, detail: `Lineal + ReLU${dropout ? ' + Dropout ' + dropout : ''}` })),
      { name: 'Salida', size: 1, detail: 'Logit → sigmoide = P(enfermedad)' },
    ];
  });

  protected readonly versiones = computed(() => [...(this.m()?.versiones ?? [])].reverse());
  protected readonly label = featureLabel;
  protected readonly pct = (v: number) => `${(v * 100).toLocaleString('es-CO', { maximumFractionDigits: 0 })} %`;
  protected readonly fmt3 = (v: number) => v.toLocaleString('es-CO', { maximumFractionDigits: 3 });
  protected readonly epoch = (x: number) => `Época ${Math.round(x)}`;
  protected readonly fpr = (x: number) => `FPR ${x.toLocaleString('es-CO', { maximumFractionDigits: 2 })}`;

  protected reentrenar(): void {
    this.confirmar.set(false);
    this.retraining.set(true);
    this.retrainError.set('');
    this.retrainResult.set(null);
    this.ml.reentrenar().subscribe({
      next: (r) => {
        this.retraining.set(false);
        this.retrainResult.set(r);
        this.toast.success(r.promovido ? `Nuevo modelo ${r.version} promovido.` : `Modelo ${r.version} entrenado pero no promovido.`);
        this.data.reload();
        this.ml.modelo().subscribe({ next: (m: ModeloInfo) => this.store.set(m), error: () => undefined });
      },
      error: (err: unknown) => {
        this.retraining.set(false);
        this.retrainError.set(describeApiError(err));
      },
    });
  }
}
