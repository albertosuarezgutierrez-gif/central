// Obligaciones y recordatorios PROPIOS de un inmueble, que escribe el cliente (25/10/2026): IBI, comunidad, revisión
// de la caldera, ITE, fin de seguro, hipoteca… Entran en el calendario igual que las derivadas de contrato (`calendario.ts`).
//
// Reglas PURAS: catálogo cerrado + texto libre opcional, periodicidad (única/mensual/trimestral/anual), validación del
// cuerpo y qué pasa al marcar «hecha». 🚨 Ninguna función lee el reloj: `hoy` entra como parámetro.
// 🚨 Una obligación propia SIEMPRE lleva fecha (`vence`): sin fecha no hay recordatorio, y un `null` aquí sería
// «no sabemos» disfrazado de recordatorio. Las derivadas (ITE sin fecha → `sin_dato`) siguen su camino en `calendario.ts`.

import { diasEntre, esFecha, sumarMeses, type Fecha } from './fechas.ts'

// 🚨 Esta lista es la del CHECK de BD (`portal_patrimonio_obligacion_categoria_catalogo_v2`, SQL
// `apps/asegura-portal/prisma/sql/2026-10-27_portal_patrimonio_obligacion_hipoteca.sql`); el cepo
// `test/regression-portal-patrimonio-sql.test.ts` compara las dos. `hipoteca` (27/10/2026): cuota o vencimiento.
export const CATEGORIAS_OBLIGACION_PROPIA = ['ibi', 'comunidad', 'caldera', 'ite', 'fin_seguro', 'basuras', 'hipoteca', 'otro'] as const
export type CategoriaObligacionPropia = (typeof CATEGORIAS_OBLIGACION_PROPIA)[number]

export interface ReglaCategoria {
  etiqueta: string
  /** Días antes del vencimiento desde los que se avisa. */
  avisoDias: number
  /** El texto libre es obligatorio (sin él «Otro» no dice nada). */
  descripcionObligatoria: boolean
}

export const CATALOGO_CATEGORIAS: Readonly<Record<CategoriaObligacionPropia, ReglaCategoria>> = Object.freeze({
  ibi: { etiqueta: 'IBI (impuesto sobre bienes inmuebles)', avisoDias: 30, descripcionObligatoria: false },
  comunidad: { etiqueta: 'Cuota de la comunidad', avisoDias: 7, descripcionObligatoria: false },
  caldera: { etiqueta: 'Revisión de la caldera', avisoDias: 30, descripcionObligatoria: false },
  ite: { etiqueta: 'ITE del edificio', avisoDias: 180, descripcionObligatoria: false },
  fin_seguro: { etiqueta: 'Fin del seguro', avisoDias: 30, descripcionObligatoria: false },
  basuras: { etiqueta: 'Tasa de basuras', avisoDias: 30, descripcionObligatoria: false },
  hipoteca: { etiqueta: 'Hipoteca (cuota o vencimiento)', avisoDias: 7, descripcionObligatoria: false },
  otro: { etiqueta: 'Otro recordatorio', avisoDias: 30, descripcionObligatoria: true },
})

export function esCategoriaObligacionPropia(v: unknown): v is CategoriaObligacionPropia {
  return typeof v === 'string' && (CATEGORIAS_OBLIGACION_PROPIA as readonly string[]).includes(v)
}

export const PERIODICIDADES_PROPIA = ['unica', 'mensual', 'trimestral', 'anual'] as const
export type PeriodicidadPropia = (typeof PERIODICIDADES_PROPIA)[number]

/** Meses entre repeticiones; `null` = única. Es lo que se guarda en `periodicidad_meses`. */
export const MESES_DE_PERIODICIDAD: Readonly<Record<PeriodicidadPropia, number | null>> = Object.freeze({
  unica: null,
  mensual: 1,
  trimestral: 3,
  anual: 12,
})

export function esPeriodicidadPropia(v: unknown): v is PeriodicidadPropia {
  return typeof v === 'string' && (PERIODICIDADES_PROPIA as readonly string[]).includes(v)
}

/** Lo guardado → periodicidad. Un número que no es 1/3/12 NO se interpreta (`null` = no se sabe leerlo). */
export function periodicidadDeMeses(meses: number | null): PeriodicidadPropia | null {
  if (meses === null) return 'unica'
  for (const p of PERIODICIDADES_PROPIA) if (MESES_DE_PERIODICIDAD[p] === meses) return p
  return null
}

export const MAX_DESCRIPCION = 200
export const ANIO_MIN = 2000
export const ANIO_MAX = 2100
/** Tope por inmueble (corta un bucle o un abuso; no es un límite de negocio). */
export const MAX_PROPIAS_POR_INMUEBLE = 60

export interface ObligacionPropiaValida {
  categoria: CategoriaObligacionPropia
  vence: Fecha
  periodicidad: PeriodicidadPropia
  /** Texto libre ya recortado; `null` = no escribió nada. */
  descripcion: string | null
}

export type ResultadoValidacionPropia =
  | { ok: true; valor: ObligacionPropiaValida }
  | { ok: false; campo: 'categoria' | 'vence' | 'periodicidad' | 'descripcion' }

// Sin caracteres de control: el texto pegado con saltos de línea se trata como espacio.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g

/** Valida el cuerpo de un alta/edición. Nada se normaliza «a lo que parece»: lo que no encaja se rechaza con su campo. */
export function validarObligacionPropia(c: unknown): ResultadoValidacionPropia {
  if (c === null || typeof c !== 'object' || Array.isArray(c)) return { ok: false, campo: 'categoria' }
  const x = c as Record<string, unknown>
  if (!esCategoriaObligacionPropia(x.categoria)) return { ok: false, campo: 'categoria' }
  if (!esFecha(x.vence)) return { ok: false, campo: 'vence' }
  const anio = Number(x.vence.slice(0, 4))
  if (anio < ANIO_MIN || anio > ANIO_MAX) return { ok: false, campo: 'vence' }
  if (!esPeriodicidadPropia(x.periodicidad)) return { ok: false, campo: 'periodicidad' }
  let descripcion: string | null = null
  if (x.descripcion !== undefined && x.descripcion !== null) {
    if (typeof x.descripcion !== 'string') return { ok: false, campo: 'descripcion' }
    const t = x.descripcion.replace(CONTROL, ' ').trim()
    if (t.length > MAX_DESCRIPCION) return { ok: false, campo: 'descripcion' }
    descripcion = t === '' ? null : t
  }
  if (CATALOGO_CATEGORIAS[x.categoria].descripcionObligatoria && descripcion === null) return { ok: false, campo: 'descripcion' }
  return { ok: true, valor: { categoria: x.categoria, vence: x.vence, periodicidad: x.periodicidad, descripcion } }
}

export type TrasHecha =
  /** Única: se cumple y deja de salir (se archiva; nunca se borra). */
  | { accion: 'archivar' }
  /** Recurrente: la siguiente fecha estrictamente posterior a `hoy`, contando desde la ORIGINAL (no se acumula el recorte de fin de mes). */
  | { accion: 'avanzar'; vence: Fecha }

/**
 * Qué pasa al marcar «hecha». Recurrente: salta al próximo ciclo (si llevaba varios sin marcar, al primero que aún no
 * ha pasado). Una periodicidad que no entendemos (`null`) NO se adivina: devuelve `null` y quien llama responde error.
 */
export function trasMarcarHecha(vence: Fecha, periodicidadMeses: number | null, hoy: Fecha): TrasHecha | null {
  const p = periodicidadDeMeses(periodicidadMeses)
  if (p === null) return null
  if (p === 'unica') return { accion: 'archivar' }
  const meses = MESES_DE_PERIODICIDAD[p] as number
  let k = 1
  let siguiente = sumarMeses(vence, meses * k)
  // Acotado: 100 años de ciclos mensuales son 1200 vueltas como mucho.
  while (diasEntre(hoy, siguiente) <= 0 && k < 1300) {
    k++
    siguiente = sumarMeses(vence, meses * k)
  }
  return { accion: 'avanzar', vence: siguiente }
}
