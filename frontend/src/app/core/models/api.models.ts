/**
 * Tipos del contrato de la API de HeartGuard (docs/CONTRATO_API.md).
 * Backend Django/DRF, autenticación JWT (simplejwt), paginación DRF.
 */

export type Role = 'medico' | 'paciente' | 'admin';

export interface User {
  id: number;
  username: string;
  email: string;
  role: Role;
  profile_id: number | null;
  nombres: string;
  apellidos: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type TipoDocumento = 'CC' | 'TI' | 'PA';

export const TIPOS_DOCUMENTO: { value: TipoDocumento; label: string }[] = [
  { value: 'CC', label: 'Cédula de Ciudadanía' },
  { value: 'TI', label: 'Tarjeta de Identidad' },
  { value: 'PA', label: 'Pasaporte' },
];

export interface RegistroPayload {
  email: string;
  password: string;
  password_confirmation: string;
  nombres: string;
  apellidos: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  direccion?: string;
  telefono?: string;
  fecha_nacimiento?: string | null;
  departamento?: string;
  ciudad?: string;
}

export interface Medico {
  id: number;
  nombres: string;
  apellidos: string;
  tipo_documento?: TipoDocumento;
  especialidad: string | null;
  telefono: string | null;
  fecha_nacimiento: string | null;
  direccion: string | null;
  departamento: string | null;
  ciudad: string | null;
  email?: string;
}

export type MedicoUpdate = Partial<
  Pick<Medico, 'nombres' | 'apellidos' | 'telefono' | 'fecha_nacimiento' | 'direccion' | 'departamento' | 'ciudad'>
>;

export type RiskLevel = 'bajo' | 'moderado' | 'alto';

export interface InformeResumen {
  id: number;
  fecha: string;
  probabilidad: number | null;
  prediccion?: 0 | 1 | null;
  nivel_riesgo: RiskLevel | null;
  output?: 0 | 1 | null;
  paciente?: PacienteRef;
}

export interface Paciente {
  id: number;
  nombres: string;
  apellidos: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  direccion: string | null;
  telefono: string | null;
  fecha_nacimiento: string | null;
  departamento: string | null;
  ciudad: string | null;
  email?: string;
  username?: string;
  fecha_registro?: string | null;
  /** Datos del último informe (anotados por el backend en el listado de médicos). */
  ultimo_riesgo?: RiskLevel | null;
  ultima_probabilidad?: number | null;
  ultimo_informe_fecha?: string | null;
  ultimo_informe_id?: number | null;
  /** Sólo en la respuesta de alta sin contraseña: contraseña generada (se muestra una vez). */
  password_temporal?: string;
}

export type PacienteUpdate = Partial<
  Pick<Paciente, 'nombres' | 'apellidos' | 'direccion' | 'telefono' | 'fecha_nacimiento' | 'departamento' | 'ciudad'>
>;

export interface PacienteCreate {
  email: string;
  nombres: string;
  apellidos: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  direccion?: string;
  telefono?: string;
  fecha_nacimiento?: string | null;
  departamento?: string;
  ciudad?: string;
  password?: string;
}

export interface PacienteRef {
  id: number;
  nombres: string;
  apellidos: string;
  numero_documento: string;
}

export interface MedicoRef {
  id: number;
  nombres: string;
  apellidos: string;
}

export const FEATURE_NAMES = [
  'age',
  'sex',
  'cp',
  'trtbps',
  'chol',
  'fbs',
  'restecg',
  'thalachh',
  'exng',
  'oldpeak',
  'slp',
  'caa',
  'thall',
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];
export type PatientInput = Record<FeatureName, number>;

export interface Informe extends PatientInput {
  id: number;
  paciente: PacienteRef;
  medico: MedicoRef | null;
  fecha: string;
  /** Diagnóstico confirmado: 0 ausente, 1 presente, null sin confirmar. */
  output: 0 | 1 | null;
  observaciones: string | null;
  probabilidad: number | null;
  prediccion: 0 | 1 | null;
  nivel_riesgo: RiskLevel | null;
  modelo_version: string | null;
  documento?: string;
  is_used_for_training?: boolean;
  /** Id del médico que confirmó el diagnóstico (`output`) y cuándo. */
  diagnostico_confirmado_por?: number | null;
  diagnostico_confirmado_en?: string | null;
}

/** Respuesta de POST /informes: el informe más el resultado de la predicción automática. */
export interface InformeCreado extends Informe {
  prediccion_disponible?: boolean;
  /** Aviso de la IA (p. ej. valores fuera del dominio del modelo: se guarda sin predicción). */
  advertencia_ia?: string | null;
  /** Se envió una alerta automática al paciente (riesgo alto). */
  alerta_enviada?: boolean;
}

export interface InformeCreate extends PatientInput {
  documento: string;
  observaciones?: string;
  output?: 0 | 1 | null;
}

export interface InformeUpdate {
  observaciones?: string | null;
  output?: 0 | 1 | null;
}

export interface HistorialEntrada {
  id: number;
  fecha: string;
  observacion: string;
  medico?: MedicoRef | null;
}

export interface Notificacion {
  id: number;
  paciente: PacienteRef;
  fecha_envio: string;
  mensaje: string;
  medico?: MedicoRef | null;
  tipo?: 'manual' | 'automatica';
  leida?: boolean;
  email_enviado?: boolean;
}

/** Alerta manual: paciente por id o por número de documento (cédula, como el original). */
export interface NotificacionCreate {
  paciente_id?: number;
  documento?: string;
  mensaje: string;
  asunto?: string;
}

export interface AutomaticasResultado {
  enviadas: number;
  correos_enviados?: number;
  omitidas?: number;
}

export type DistribucionRiesgo = Record<RiskLevel, number> & { sin_prediccion?: number };

export interface DashboardMedico {
  total_pacientes: number;
  total_informes: number;
  alto_riesgo: number;
  distribucion_riesgo: DistribucionRiesgo;
  mis_informes?: number;
  pendientes_diagnostico?: number;
  informes_por_mes: { mes: string; total: number }[];
  ultimos_informes: InformeResumen[];
  notificaciones_recientes: Notificacion[];
}

export interface DashboardPaciente {
  paciente: Paciente;
  ultimo_informe: Informe | null;
  evolucion: { fecha: string; probabilidad: number | null; nivel_riesgo?: RiskLevel | null; id?: number }[];
  total_informes?: number;
  notificaciones_recientes: Notificacion[];
  notificaciones_no_leidas?: number;
}

export interface GrupoAnalisis {
  etiqueta: string;
  total: number;
  alto_riesgo?: number;
  probabilidad_media?: number | null;
}

export interface Analisis {
  total_informes: number;
  distribucion_riesgo: DistribucionRiesgo;
  por_sexo: GrupoAnalisis[];
  por_edad: GrupoAnalisis[];
  por_cp: GrupoAnalisis[];
  /** Medias de variables por diagnóstico confirmado (clase 0 ausente / 1 presente). */
  medias_por_clase: { variable: string; etiqueta: string; sin: number | null; con: number | null }[];
  /** Nº de informes con diagnóstico confirmado en cada clase. */
  total_por_clase?: { sin: number; con: number };
}

// ---------------------------------------------------------------- IA

export interface FeatureOption {
  value: number;
  label_es: string;
}

export interface FeatureSpec {
  name: FeatureName;
  label_es: string;
  description_es: string;
  type: 'numeric' | 'categorical';
  min: number;
  max: number;
  step: number;
  options?: FeatureOption[];
}

export interface Prediccion {
  probabilidad: number;
  prediccion: 0 | 1;
  nivel_riesgo: RiskLevel;
  modelo_version: string;
}

export interface ClassificationMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number;
}

export type MetricKey = keyof ClassificationMetrics;

export interface MeanStd {
  mean: number;
  std: number;
}

export interface MetricsResponse {
  test: ClassificationMetrics;
  test_threshold_0_5?: ClassificationMetrics;
  cv?: Partial<Record<MetricKey, MeanStd>>;
  cv_folds?: number;
  confusion_matrix?: [[number, number], [number, number]];
  roc_curve?: { fpr: number[]; tpr: number[] };
  class_distribution?: Record<string, number>;
  baselines?: { logistic_regression?: ClassificationMetrics };
  n_samples?: { train: number; val: number; test: number };
  threshold?: number;
}

export interface TrainingHistory {
  train_loss: number[];
  val_loss: number[];
  best_epoch?: number;
}

export interface ModeloInfo {
  version: string;
  entrenado_en: string | null;
  threshold: number | null;
  metrics: MetricsResponse | null;
  features: (FeatureSpec | string)[];
  history: TrainingHistory | null;
  nota_etiqueta: string | null;
  arquitectura?: Record<string, unknown> | null;
  umbrales_riesgo?: Record<string, string>;
  version_previa?: string | null;
  versiones?: VersionModelo[];
}

export interface VersionModelo {
  version: string;
  fecha?: string;
  version_previa?: string | null;
  promovido?: boolean;
  motivo?: string;
  roc_auc_candidato?: number | null;
  roc_auc_activo?: number | null;
  n_informes?: number;
  n_descartados?: number;
}

export interface ReentrenoResultado {
  version: string;
  metrics: Partial<MetricsResponse> | Record<string, unknown>;
  promovido: boolean;
  motivo?: string;
  n_informes?: number;
}

export function nombreCompleto(p: { nombres?: string; apellidos?: string } | null | undefined): string {
  if (!p) return '—';
  return `${p.nombres ?? ''} ${p.apellidos ?? ''}`.trim() || '—';
}

export function nivelDesdeProbabilidad(p: number | null | undefined): RiskLevel | null {
  if (p === null || p === undefined || !Number.isFinite(p)) return null;
  return p < 0.33 ? 'bajo' : p < 0.66 ? 'moderado' : 'alto';
}
