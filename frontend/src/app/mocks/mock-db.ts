/**
 * Base de datos en memoria para el modo sin backend (`npm run start:mocks`) y los tests.
 * Datos deterministas (PRNG con semilla) con la misma forma que el contrato de la API.
 */
import {
  FEATURE_NAMES,
  HistorialEntrada,
  Informe,
  Medico,
  Notificacion,
  Paciente,
  PatientInput,
  Role,
  TipoDocumento,
  User,
} from '../core/models/api.models';
import { mockPredict } from './ml-fixtures';

export interface MockAccount {
  user: User;
  password: string;
}

/** Credenciales de demostración del modo mocks (ver README). */
/** Mismas contraseñas que `manage.py crear_usuarios_demo` del backend. */
export const DEMO_CREDENTIALS = {
  medico: { username: 'medico@test.com', password: 'Medico123!' },
  paciente: { username: 'paciente@test.com', password: 'Paciente123!' },
  admin: { username: 'admin', password: 'Admin123!' },
} as const;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOMBRES_M = ['Carlos', 'Andrés', 'Juan', 'Luis', 'Jorge', 'Miguel', 'Santiago', 'Felipe', 'Diego', 'Héctor', 'Óscar', 'Mauricio'];
const NOMBRES_F = ['María', 'Laura', 'Ana', 'Carolina', 'Paula', 'Diana', 'Sofía', 'Valentina', 'Claudia', 'Lucía', 'Gloria', 'Natalia'];
const APELLIDOS = ['Gómez', 'Rodríguez', 'Martínez', 'López', 'García', 'Pérez', 'Ramírez', 'Torres', 'Díaz', 'Moreno', 'Castro', 'Rojas', 'Vargas', 'Ortiz', 'Suárez', 'Herrera'];
const LUGARES: [string, string][] = [
  ['Cundinamarca', 'Bogotá'],
  ['Antioquia', 'Medellín'],
  ['Valle del Cauca', 'Cali'],
  ['Boyacá', 'Tunja'],
  ['Santander', 'Bucaramanga'],
  ['Atlántico', 'Barranquilla'],
];

export class MockDb {
  accounts: MockAccount[] = [];
  medicos: Medico[] = [];
  pacientes: Paciente[] = [];
  informes: Informe[] = [];
  historial = new Map<number, HistorialEntrada[]>();
  notificaciones: Notificacion[] = [];
  modeloVersion = '2.0.0';
  entrenadoEn = '2026-11-09T15:31:37+00:00';
  /** Registro de versiones (`registry.read_log()` del backend). */
  versiones: Record<string, unknown>[] = [
    {
      fecha: '2026-11-09T15:31:37+00:00',
      version: '2.0.0',
      version_previa: null,
      promovido: true,
      motivo: 'Modelo base entrenado con heart.csv (303 pacientes).',
      roc_auc_candidato: 0.9219,
      roc_auc_activo: null,
      n_informes: 0,
      n_descartados: 0,
    },
  ];
  private seq = { user: 100, paciente: 0, informe: 0, notif: 0, hist: 0 };

  constructor(seed = 20241109) {
    const rnd = mulberry32(seed);
    const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
    const int = (a: number, b: number) => Math.round(a + rnd() * (b - a));

    const medico: Medico = {
      id: 1,
      nombres: 'Elena',
      apellidos: 'Restrepo Vélez',
      tipo_documento: 'CC',
      especialidad: 'Cardiología',
      telefono: '3001234567',
      fecha_nacimiento: '1980-04-12',
      direccion: 'Calle 100 # 15-20, Consultorio 402',
      departamento: 'Cundinamarca',
      ciudad: 'Bogotá',
      email: DEMO_CREDENTIALS.medico.username,
    };
    this.medicos.push(medico);
    this.addAccount(1, DEMO_CREDENTIALS.medico.username, 'medico', 1, medico.nombres, medico.apellidos);
    this.addAccount(3, DEMO_CREDENTIALS.admin.username, 'admin', null, 'Admin', 'HeartGuard');

    const hoy = new Date('2026-11-09T10:00:00Z');
    for (let i = 0; i < 46; i++) {
      const mujer = rnd() < 0.42;
      const [dep, ciudad] = pick(LUGARES);
      const demo = i === 0;
      const p: Paciente = {
        id: ++this.seq.paciente,
        nombres: demo ? 'Ana María' : pick(mujer ? NOMBRES_F : NOMBRES_M),
        apellidos: demo ? 'Quintero Ríos' : `${pick(APELLIDOS)} ${pick(APELLIDOS)}`,
        tipo_documento: (rnd() < 0.9 ? 'CC' : pick(['TI', 'PA'])) as TipoDocumento,
        numero_documento: demo ? '1020304050' : String(int(10_000_000, 1_099_999_999)),
        direccion: `Cra ${int(1, 120)} # ${int(1, 90)}-${int(1, 99)}`,
        telefono: `3${int(100000000, 209999999)}`,
        fecha_nacimiento: `${int(1948, 1990)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
        departamento: dep,
        ciudad,
        email: demo ? DEMO_CREDENTIALS.paciente.username : `paciente${i + 1}@correo.co`,
        fecha_registro: new Date(hoy.getTime() - int(30, 500) * 86400000).toISOString().slice(0, 10),
      };
      if (demo) {
        p.fecha_nacimiento = '1964-07-21';
      }
      this.pacientes.push(p);
      if (demo) this.addAccount(2, DEMO_CREDENTIALS.paciente.username, 'paciente', p.id, p.nombres, p.apellidos);

      const edad = 2026 - Number(p.fecha_nacimiento!.slice(0, 4));
      const n = demo ? 7 : int(1, 5);
      const base = rnd();
      for (let k = 0; k < n; k++) {
        const dias = demo ? (n - k) * 55 : int(5, 420);
        const fecha = new Date(hoy.getTime() - dias * 86400000 - int(0, 36000) * 1000);
        // El paciente demo mejora con el tiempo (para la gráfica de evolución).
        const trend = demo ? 1 - k / (n - 1) : base;
        const features: PatientInput = {
          age: Math.min(77, Math.max(29, edad)),
          sex: mujer || demo ? 0 : 1,
          cp: trend > 0.5 ? int(0, 1) : int(1, 3),
          trtbps: int(110, 150) + Math.round(trend * 30),
          chol: int(180, 260) + Math.round(trend * 80),
          fbs: rnd() < 0.15 + trend * 0.2 ? 1 : 0,
          restecg: int(0, 1),
          thalachh: int(130, 175) - Math.round(trend * 35),
          exng: rnd() < trend * 0.8 ? 1 : 0,
          oldpeak: Number((trend * 3 * rnd() + (trend > 0.6 ? 1 : 0)).toFixed(1)),
          slp: trend > 0.5 ? int(0, 1) : 2,
          caa: trend > 0.6 ? int(1, 3) : int(0, 1),
          thall: trend > 0.5 ? 3 : 2,
        };
        this.informes.push(this.buildInforme(p, features, fecha.toISOString(), medico, rnd));
      }
      if (rnd() < 0.5 || demo) {
        this.historial.set(p.id, [
          { id: ++this.seq.hist, fecha: '2026-03-14', observacion: 'Control de rutina. Se solicita perfil lipídico.', medico: medRef(medico) },
          { id: ++this.seq.hist, fecha: '2026-08-02', observacion: 'Refiere disnea leve con esfuerzo moderado. Se ajusta tratamiento.', medico: medRef(medico) },
        ]);
      }
    }
    this.informes.sort((a, b) => b.fecha.localeCompare(a.fecha));

    const altos = this.pacientes.filter((p) => this.ultimoInforme(p.id)?.nivel_riesgo === 'alto').slice(0, 5);
    const demoP = this.pacientes[0];
    for (const [i, p] of [demoP, ...altos].entries()) {
      this.notificaciones.push({
        id: ++this.seq.notif,
        paciente: ref(p),
        fecha_envio: new Date(hoy.getTime() - (i + 1) * 3 * 86400000).toISOString(),
        mensaje:
          i === 0
            ? 'Recuerde su cita de control cardiológico el próximo lunes a las 8:00 a. m. Traiga sus últimos exámenes de laboratorio.'
            : `Estimado/a ${p.nombres} ${p.apellidos}, nuestro sistema ha detectado que usted podría estar en alto riesgo cardíaco. Recomendamos que agende una consulta con su médico lo antes posible.`,
        medico: medRef(medico),
        tipo: i === 0 ? 'manual' : 'automatica',
        leida: i !== 0,
      });
    }
    this.notificaciones.push({
      id: ++this.seq.notif,
      paciente: ref(demoP),
      fecha_envio: new Date(hoy.getTime() - 40 * 86400000).toISOString(),
      mensaje: 'Sus resultados del último informe ya están disponibles en la sección Resultados.',
      medico: medRef(medico),
      tipo: 'manual',
      leida: true,
    });
  }

  private addAccount(id: number, username: string, role: Role, profile: number | null, nombres: string, apellidos: string): void {
    this.accounts.push({
      user: { id, username, email: username.includes('@') ? username : `${username}@example.com`, role, profile_id: profile, nombres, apellidos },
      password: DEMO_CREDENTIALS[role].password,
    });
  }

  buildInforme(p: Paciente, f: PatientInput, fecha: string, medico: Medico | null, rnd: () => number = Math.random): Informe {
    const pred = mockPredict(f, this.modeloVersion);
    const confirmado = rnd() < 0.55;
    return {
      id: ++this.seq.informe,
      paciente: ref(p),
      medico: medico ? { id: medico.id, nombres: medico.nombres, apellidos: medico.apellidos } : null,
      fecha,
      documento: p.numero_documento,
      ...f,
      is_used_for_training: false,
      output: confirmado ? (pred.probabilidad >= 0.5 ? 1 : 0) : null,
      observaciones: rnd() < 0.5 ? 'Paciente estable. Continuar con controles periódicos.' : null,
      probabilidad: pred.probabilidad,
      prediccion: pred.prediccion,
      nivel_riesgo: pred.nivel_riesgo,
      modelo_version: pred.modelo_version,
    };
  }

  ultimoInforme(pacienteId: number): Informe | undefined {
    return this.informes.filter((i) => i.paciente.id === pacienteId).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  }

  pacienteConResumen(p: Paciente): Paciente {
    const u = this.ultimoInforme(p.id);
    return {
      ...p,
      ultimo_riesgo: u?.nivel_riesgo ?? null,
      ultima_probabilidad: u?.probabilidad ?? null,
      ultimo_informe_fecha: u?.fecha ?? null,
      ultimo_informe_id: u?.id ?? null,
    };
  }

  nuevoPaciente(data: Omit<Paciente, 'id'>, password: string): Paciente {
    const p: Paciente = { ...data, id: ++this.seq.paciente, fecha_registro: new Date().toISOString().slice(0, 10) };
    this.pacientes.push(p);
    const uid = ++this.seq.user;
    this.accounts.push({
      user: { id: uid, username: data.email ?? p.numero_documento, email: data.email ?? '', role: 'paciente', profile_id: p.id, nombres: p.nombres, apellidos: p.apellidos },
      password,
    });
    return p;
  }

  nuevoInforme(p: Paciente, f: PatientInput, extra: { observaciones?: string | null; output?: 0 | 1 | null }): Informe {
    const inf = this.buildInforme(p, f, new Date().toISOString(), this.medicos[0], () => 1);
    inf.observaciones = extra.observaciones ?? null;
    inf.output = extra.output ?? null;
    this.informes.unshift(inf);
    return inf;
  }

  nuevaNotificacion(p: Paciente, mensaje: string, tipo: 'manual' | 'automatica' = 'manual'): Notificacion {
    const n: Notificacion = {
      id: ++this.seq.notif,
      paciente: ref(p),
      fecha_envio: new Date().toISOString(),
      mensaje,
      medico: medRef(this.medicos[0]),
      tipo,
      leida: false,
    };
    this.notificaciones.unshift(n);
    return n;
  }

  nuevaEntrada(pacienteId: number, fecha: string, observacion: string): HistorialEntrada {
    const e: HistorialEntrada = { id: ++this.seq.hist, fecha, observacion, medico: medRef(this.medicos[0]) };
    this.historial.set(pacienteId, [...(this.historial.get(pacienteId) ?? []), e]);
    return e;
  }
}

function medRef(m: Medico) {
  return { id: m.id, nombres: m.nombres, apellidos: m.apellidos };
}

export function ref(p: Paciente) {
  return { id: p.id, nombres: p.nombres, apellidos: p.apellidos, numero_documento: p.numero_documento };
}

export function pickFeatures(body: Record<string, unknown>): PatientInput | string[] {
  const missing = FEATURE_NAMES.filter((n) => typeof body[n] !== 'number' || !Number.isFinite(body[n] as number));
  if (missing.length) return missing;
  return Object.fromEntries(FEATURE_NAMES.map((n) => [n, body[n] as number])) as PatientInput;
}
