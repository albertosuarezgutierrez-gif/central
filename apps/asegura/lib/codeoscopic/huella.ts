// Guarda ANTI-DUPLICADO de la cotización (08/10/2026). PURO, sin BD ni alias `@/`.
//
// Codeoscopic cobra 0,50 € por cada `POST /insurances` con 200, aunque sea el mismo proyecto repetido.
// Doble clic, recarga o dos pestañas = dos cargos; y un timeout (150 s) cuenta como facturable, así que
// el usuario repite. La huella identifica «la misma petición» sin guardar el cuerpo ni datos personales.
import { createHash } from 'node:crypto'

/** Ventana en la que una cotización idéntica no se vuelve a pagar. */
export const VENTANA_DUPLICADO_MIN = 15

/** JSON canónico: claves ordenadas a todos los niveles; `undefined` fuera (como hace `JSON.stringify`). */
export function jsonCanonico(v: unknown): string {
  if (v === undefined) return 'null'
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map((x) => jsonCanonico(x)).join(',')}]`
  const o = v as Record<string, unknown>
  const claves = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
  return `{${claves.map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`).join(',')}}`
}

/**
 * sha256 (hex) de cuerpo canónico + ramo + correduría + contexto (`oportunidadId ?? polizaId`). El contexto evita que
 * la misma petición lanzada desde OTRA oportunidad/póliza reutilice la copia de precios de la primera (quedaría
 * colgada del sitio equivocado). Solo la huella llega a la BD.
 */
export function huellaCotizacion(e: {
  cuerpo: unknown
  ramo: string | null | undefined
  correduriaId: string
  oportunidadId?: string | null
  polizaId?: string | null
}): string {
  const contexto = e.oportunidadId ?? e.polizaId ?? ''
  return createHash('sha256')
    .update(`${e.correduriaId}\n${e.ramo ?? ''}\n${contexto}\n${jsonCanonico(e.cuerpo)}`)
    .digest('hex')
}

export type FilaPrevia = { estado: 'reservado' | 'facturable' | 'descartado'; creadoAt: Date; intentoId: string }

/** ¿Esta fila previa bloquea? Reservada (en curso o timeout sin prueba) o facturable dentro de la ventana. */
export function bloqueaDuplicado(f: FilaPrevia, ahora: Date, ventanaMin = VENTANA_DUPLICADO_MIN): boolean {
  if (f.estado === 'descartado') return false // hay prueba de que no hubo cargo
  const edadMs = ahora.getTime() - f.creadoAt.getTime()
  return edadMs <= ventanaMin * 60_000
}

export type DecisionDuplicado =
  | { accion: 'llamar' }
  | { accion: 'reutilizar'; intentoId: string }
  | { accion: 'bloquear'; intentoId: string; estado: 'reservado' | 'facturable' }

/**
 * Llamar / reutilizar / bloquear. `forzar` salta la guarda (recotización explícita del operador).
 * `copias` = intentos cuya copia de precios consta en `tarificaciones` (con respuesta cruda).
 * Solo una facturable con copia se reutiliza; una reservada, o sin copia, bloquea (409) sin cargo.
 */
export function decidirDuplicado(e: {
  previas: FilaPrevia[]
  copias: ReadonlySet<string>
  ahora: Date
  forzar?: boolean
  ventanaMin?: number
}): DecisionDuplicado {
  if (e.forzar === true) return { accion: 'llamar' }
  const vivas = e.previas
    .filter((f) => bloqueaDuplicado(f, e.ahora, e.ventanaMin))
    .sort((a, b) => b.creadoAt.getTime() - a.creadoAt.getTime())
  if (vivas.length === 0) return { accion: 'llamar' }
  const conCopia = vivas.find((f) => f.estado === 'facturable' && e.copias.has(f.intentoId))
  if (conCopia) return { accion: 'reutilizar', intentoId: conCopia.intentoId }
  const f = vivas[0]!
  return { accion: 'bloquear', intentoId: f.intentoId, estado: f.estado as 'reservado' | 'facturable' }
}

export const MENSAJE_DUPLICADO =
  'Cotización idéntica en curso o reciente (menos de 15 minutos): no se ha vuelto a llamar a la compañía ni se ha ' +
  'cobrado nada. Espera el resultado o, si de verdad hace falta recotizar, fuerza la recotización.'
