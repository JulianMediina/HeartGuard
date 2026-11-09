/**
 * Datos de ejemplo realistas para tests y para el modo `useMocks`.
 * Las variables y rangos reproducen `src/heart_nn/features.py`; las estadísticas
 * del dataset salen de `data/heart.csv` (303 filas, 1 duplicado).
 */
import {
  FeatureSpec,
  MetricsResponse,
  PatientInput,
  Prediccion,
  RiskLevel,
  TrainingHistory,
} from '../core/models/api.models';

export const MOCK_NOTA_ETIQUETA =
  "La predicción es la probabilidad de enfermedad cardíaca. La columna 'output' del CSV de Kaggle está invertida respecto al dataset UCI original, por lo que el modelo se entrena con enfermedad = 1 - output. Es un modelo educativo y no sustituye un diagnóstico médico.";

const yesNo = [
  { value: 0, label_es: 'No' },
  { value: 1, label_es: 'Sí' },
];

export const MOCK_FEATURES: FeatureSpec[] = [
  {
    name: 'age',
    label_es: 'Edad',
    description_es: 'Edad del paciente en años.',
    type: 'numeric',
    min: 29,
    max: 77,
    step: 1,
  },
  {
    name: 'sex',
    label_es: 'Sexo',
    description_es: 'Sexo biológico del paciente.',
    type: 'categorical',
    min: 0,
    max: 1,
    step: 1,
    options: [
      { value: 0, label_es: 'Mujer' },
      { value: 1, label_es: 'Hombre' },
    ],
  },
  {
    name: 'cp',
    label_es: 'Tipo de dolor torácico',
    description_es: 'Tipo de dolor en el pecho referido por el paciente.',
    type: 'categorical',
    min: 0,
    max: 3,
    step: 1,
    options: [
      { value: 0, label_es: 'Asintomático' },
      { value: 1, label_es: 'Angina atípica' },
      { value: 2, label_es: 'Dolor no anginoso' },
      { value: 3, label_es: 'Angina típica' },
    ],
  },
  {
    name: 'trtbps',
    label_es: 'Presión arterial en reposo',
    description_es: 'Presión arterial sistólica en reposo (mm Hg) al ingreso.',
    type: 'numeric',
    min: 94,
    max: 200,
    step: 1,
  },
  {
    name: 'chol',
    label_es: 'Colesterol sérico',
    description_es: 'Colesterol sérico total (mg/dl).',
    type: 'numeric',
    min: 126,
    max: 564,
    step: 1,
  },
  {
    name: 'fbs',
    label_es: 'Glucemia en ayunas > 120 mg/dl',
    description_es: 'Indica si la glucosa en ayunas supera 120 mg/dl.',
    type: 'categorical',
    min: 0,
    max: 1,
    step: 1,
    options: yesNo,
  },
  {
    name: 'restecg',
    label_es: 'Electrocardiograma en reposo',
    description_es: 'Resultado del electrocardiograma en reposo.',
    type: 'categorical',
    min: 0,
    max: 2,
    step: 1,
    options: [
      { value: 0, label_es: 'Hipertrofia ventricular izquierda (criterios de Estes)' },
      { value: 1, label_es: 'Normal' },
      { value: 2, label_es: 'Anomalía de la onda ST-T' },
    ],
  },
  {
    name: 'thalachh',
    label_es: 'Frecuencia cardíaca máxima',
    description_es: 'Frecuencia cardíaca máxima alcanzada en la prueba de esfuerzo (lpm).',
    type: 'numeric',
    min: 71,
    max: 202,
    step: 1,
  },
  {
    name: 'exng',
    label_es: 'Angina inducida por ejercicio',
    description_es: 'Indica si el ejercicio provocó angina.',
    type: 'categorical',
    min: 0,
    max: 1,
    step: 1,
    options: yesNo,
  },
  {
    name: 'oldpeak',
    label_es: 'Depresión del ST (oldpeak)',
    description_es: 'Depresión del segmento ST inducida por el ejercicio respecto al reposo (mm).',
    type: 'numeric',
    min: 0,
    max: 6.2,
    step: 0.1,
  },
  {
    name: 'slp',
    label_es: 'Pendiente del ST en esfuerzo',
    description_es: 'Pendiente del segmento ST en el pico del ejercicio.',
    type: 'categorical',
    min: 0,
    max: 2,
    step: 1,
    options: [
      { value: 0, label_es: 'Descendente' },
      { value: 1, label_es: 'Plana' },
      { value: 2, label_es: 'Ascendente' },
    ],
  },
  {
    name: 'caa',
    label_es: 'Vasos principales coloreados',
    description_es: 'Número de vasos principales (0-3) coloreados por fluoroscopia.',
    type: 'categorical',
    min: 0,
    max: 4,
    step: 1,
    options: [
      { value: 0, label_es: '0 vasos' },
      { value: 1, label_es: '1 vaso' },
      { value: 2, label_es: '2 vasos' },
      { value: 3, label_es: '3 vasos' },
      { value: 4, label_es: 'Desconocido (dato faltante en el origen)' },
    ],
  },
  {
    name: 'thall',
    label_es: 'Talasemia / gammagrafía con talio',
    description_es: 'Resultado de la prueba de perfusión con talio.',
    type: 'categorical',
    min: 0,
    max: 3,
    step: 1,
    options: [
      { value: 0, label_es: 'Desconocido (dato faltante en el origen)' },
      { value: 1, label_es: 'Defecto fijo' },
      { value: 2, label_es: 'Normal' },
      { value: 3, label_es: 'Defecto reversible' },
    ],
  },
];

// Valores reales de artifacts/metrics.json (modelo v2.0.0, clase 1 = enfermedad).
export const MOCK_METRICS: MetricsResponse = {
  test: {
    accuracy: 0.8261,
    precision: 0.76,
    recall: 0.9048,
    f1: 0.8261,
    roc_auc: 0.9219,
  },
  test_threshold_0_5: {
    accuracy: 0.8043,
    precision: 0.8,
    recall: 0.7619,
    f1: 0.7805,
    roc_auc: 0.9219,
  },
  cv: {
    accuracy: {
      mean: 0.8361,
      std: 0.0501,
    },
    precision: {
      mean: 0.8456,
      std: 0.0928,
    },
    recall: {
      mean: 0.7949,
      std: 0.0356,
    },
    f1: {
      mean: 0.8176,
      std: 0.0506,
    },
    roc_auc: {
      mean: 0.8955,
      std: 0.0285,
    },
  },
  cv_folds: 5,
  confusion_matrix: [
    [19, 6],
    [2, 19],
  ],
  roc_curve: {
    fpr: [0.0, 0.0, 0.0, 0.04, 0.04, 0.08, 0.08, 0.16, 0.16, 0.28, 0.28, 0.36, 0.36, 1.0],
    tpr: [
      0.0, 0.047619, 0.52381, 0.52381, 0.571429, 0.571429, 0.666667, 0.666667, 0.904762, 0.904762,
      0.952381, 0.952381, 1.0, 1.0,
    ],
  },
  class_distribution: {
    '0': 164,
    '1': 138,
  },
  baselines: {
    logistic_regression: {
      accuracy: 0.8043,
      precision: 0.7727,
      recall: 0.8095,
      f1: 0.7907,
      roc_auc: 0.9219,
    },
  },
  n_samples: {
    train: 210,
    val: 46,
    test: 46,
  },
  threshold: 0.3446,
};

// Valores reales de artifacts/history.json (best_epoch es un índice base 0).
export const MOCK_TRAINING_HISTORY: TrainingHistory = {
  train_loss: [
    0.6819, 0.6614, 0.646, 0.6256, 0.597, 0.5618, 0.5318, 0.4965, 0.4501, 0.4168, 0.3744, 0.3702,
    0.3275, 0.3408, 0.3095, 0.3032, 0.2846, 0.2963, 0.272, 0.2724, 0.2637, 0.2421, 0.2533, 0.242,
    0.247, 0.2415, 0.2415, 0.2376, 0.2295, 0.2308, 0.2242, 0.2113, 0.224, 0.1977, 0.2092, 0.2019,
    0.1981, 0.1963, 0.1811, 0.2002,
  ],
  val_loss: [
    0.6644, 0.6512, 0.6367, 0.6181, 0.5956, 0.568, 0.5402, 0.5156, 0.499, 0.4909, 0.4911, 0.4982,
    0.5049, 0.5127, 0.5193, 0.5239, 0.5272, 0.5321, 0.5381, 0.5461, 0.553, 0.5542, 0.5575, 0.5636,
    0.5711, 0.5774, 0.5756, 0.5792, 0.5865, 0.5963, 0.5996, 0.6096, 0.6178, 0.6221, 0.6293, 0.6355,
    0.6365, 0.6428, 0.6459, 0.6456,
  ],
  best_epoch: 9,
};


export const MOCK_PATIENT: PatientInput = {
  age: 63,
  sex: 1,
  cp: 3,
  trtbps: 145,
  chol: 233,
  fbs: 1,
  restecg: 0,
  thalachh: 150,
  exng: 0,
  oldpeak: 2.3,
  slp: 0,
  caa: 0,
  thall: 1,
};

export function riskLevelFor(probability: number): RiskLevel {
  if (probability < 0.33) return 'bajo';
  if (probability < 0.66) return 'moderado';
  return 'alto';
}

/**
 * Predicción simulada (heurística logística) para el modo sin backend.
 * Devuelve P(enfermedad). NO es el modelo real: sólo sirve para que la interfaz sea navegable.
 */
export function mockPredict(p: PatientInput, version = '2.0.0'): Prediccion {
  // Heurística sobre `output` del CSV; la probabilidad de enfermedad es su complemento.
  const zOutput =
    -0.6 +
    0.03 * (p.age - 54) -
    0.9 * p.sex +
    0.75 * p.cp +
    0.012 * (p.trtbps - 131) +
    0.003 * (p.chol - 246) +
    0.025 * (p.thalachh - 150) -
    0.9 * p.exng -
    0.6 * p.oldpeak +
    0.5 * p.slp -
    0.75 * p.caa +
    (p.thall === 2 ? 1.1 : -0.6);
  const z = -zOutput;
  const probability = Number((1 / (1 + Math.exp(-z))).toFixed(4));
  return {
    probabilidad: probability,
    prediccion: probability >= (MOCK_METRICS.threshold ?? 0.5) ? 1 : 0,
    nivel_riesgo: riskLevelFor(probability),
    modelo_version: version,
  };
}
