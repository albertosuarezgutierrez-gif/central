// Guarda ANTI-DUPLICADO de la cotización (08/10/2026). PURO, sin BD ni alias `@/`.
//
// Codeoscopic cobra 0,50 € por cada `POST /insurances` con 200, aunque sea el mismo proyecto repetido.
// Doble clic, recarga o dos pestañas = dos cargos; y un timeout (150 s) cuenta como facturable, así que
// el usuario repite. La huella identifica «la misma petición» sin guardar el cuerpo ni datos personales.
import { createHash } from 'node:crypto'
import { RE_FECHA_ISO, fechaEfectoCaducada } from './fecha-efecto.ts'

/** Ventana en la que una cotización idéntica EN CURSO o sin copia se bloquea (409) en vez de pagarse otra vez. */
export const VENTANA_DUPLICADO_MIN = 15

/**
 * Ventana (05/11/2026) en la que una cotización idéntica YA COBRADA y con copia guardada se reutiliza sin llamar ni
 * cobrar, siempre que la fecha de efecto de esa copia siga siendo válida (hoy o futura). Medido: 2 de 5 cobros de más
 * fueron repeticiones a las ~6 h y ~20 h. `forzar` sigue saltándola.
 */
export const VENTANA_REUTILIZAR_MIN = 24 * 60

/**
 * Techo de la reutilización cuando la copia trae la caducidad de sus precios (correo Codeoscopic 06/11/2026: una
 * oferta vale «entre 15 y 30 días, depende de la compañía»). Es solo el tope de lo que se LEE de la BD; quien manda
 * es la fecha de caducidad de la propia copia. Sin ella, `VENTANA_REUTILIZAR_MIN` (24 h) sigue siendo el límite.
 */
export const VENTANA_REUTILIZAR_MAX_MIN = 30 * 24 * 60

/**
 * Caducidad (ms epoch) de una copia: la MÁS TEMPRANA de las `expirationDate` de sus precios, y solo si TODOS la
 * declaran (un precio sin fecha no se da por vigente: «no se sabe» ≠ «vale 30 días»). `null` = sin caducidad fiable →
 * el límite fijo de 24 h. Solo recibe los precios (`Precio.expiraEn`): la `expirationDate` de una identificación
 * (documento del tomador) NO es esto y jamás pasa por aquí.
 */
export function caducidadDePrecios(precios: ReadonlyArray<{ expiraEn: string | null }>): number | null {
  if (precios.length === 0) return null
  let min = Infinity
  for (const p of precios) {
    const t = typeof p.expiraEn === 'string' ? Date.parse(p.expiraEn) : NaN
    if (!Number.isFinite(t)) return null
    if (t < min) min = t
  }
  return min
}

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
 * Dentro de 15 min: solo una facturable con copia se reutiliza; una reservada, o sin copia, bloquea (409) sin cargo.
 * Entre 15 min y 24 h (o hasta la caducidad de los precios de la copia, si la declara): se reutiliza una con copia (facturable, o reservada cuyo cierre falló tras cobrar) SOLO si
 * la fecha de efecto sigue vigente; sin fecha conocida no se afirma nada y se llama (conservador a favor de la copia
 * caducada: nunca se sirve un precio que la compañía ya no confirmaría).
 */
export function decidirDuplicado(e: {
  previas: FilaPrevia[]
  copias: ReadonlySet<string>
  ahora: Date
  forzar?: boolean
  ventanaMin?: number
  /** Fecha de efecto (aaaa-mm-dd) del cuerpo que se va a enviar (= la de la copia: misma huella). */
  fechaEfecto?: string | null
  /** Hoy en Madrid (aaaa-mm-dd); se inyecta en los tests. */
  hoy?: string
  /** Caducidad (ms epoch, `caducidadDePrecios`) de la copia de cada intento. Ausente/`null` = límite fijo de 24 h. */
  caducidades?: ReadonlyMap<string, number | null>
}): DecisionDuplicado {
  if (e.forzar === true) return { accion: 'llamar' }
  const vivas = e.previas
    .filter((f) => bloqueaDuplicado(f, e.ahora, e.ventanaMin))
    .sort((a, b) => b.creadoAt.getTime() - a.creadoAt.getTime())
  if (vivas.length > 0) {
    const conCopia = vivas.find((f) => f.estado === 'facturable' && e.copias.has(f.intentoId))
    if (conCopia) return { accion: 'reutilizar', intentoId: conCopia.intentoId }
    const f = vivas[0]!
    return { accion: 'bloquear', intentoId: f.intentoId, estado: f.estado as 'reservado' | 'facturable' }
  }
  // Fuera de los 15 min: reutilización de larga duración.
  const fecha = e.fechaEfecto ?? null
  const efectoVigente = typeof fecha === 'string' && RE_FECHA_ISO.test(fecha) && !fechaEfectoCaducada(fecha, e.hoy)
  if (!efectoVigente) return { accion: 'llamar' }
  const larga = e.previas
    .filter((f) => f.estado !== 'descartado' && e.copias.has(f.intentoId))
    .filter((f) => {
      const edadMs = e.ahora.getTime() - f.creadoAt.getTime()
      const caduca = e.caducidades?.get(f.intentoId) ?? null
      // Con caducidad declarada manda ella (sin pasar de 30 días); sin ella, las 24 h de siempre.
      return caduca !== null
        ? e.ahora.getTime() < caduca && edadMs <= VENTANA_REUTILIZAR_MAX_MIN * 60_000
        : edadMs <= VENTANA_REUTILIZAR_MIN * 60_000
    })
    .sort((a, b) => b.creadoAt.getTime() - a.creadoAt.getTime())[0]
  return larga ? { accion: 'reutilizar', intentoId: larga.intentoId } : { accion: 'llamar' }
}

export const MENSAJE_DUPLICADO =
  'Cotización idéntica en curso o reciente (menos de 15 minutos): no se ha vuelto a llamar a la compañía ni se ha ' +
  'cobrado nada. Espera el resultado o, si de verdad hace falta recotizar, fuerza la recotización.'

/**
 * Huella de una operación de emisión (ReRate…) para frenar el doble clic (05/11/2026). Mismo contrato que
 * `huellaCotizacion`: solo viaja el hash, nunca datos. Identifica «el mismo ReRate»: proyecto + precio + producto + efecto.
 */
export function huellaEmision(e: {
  operacion: string
  correduriaId: string
  projectId: string
  precioId?: string | number | null
  productId?: string | number | null
  fechaEfecto?: string | null
  /** Opciones/descuentos/correcciones que viajan: otro cuerpo = otra operación (no es un doble clic). */
  extra?: unknown
}): string {
  return createHash('sha256')
    .update(
      `${e.operacion}\n${e.correduriaId}\n${e.projectId}\n${e.precioId ?? ''}\n${e.productId ?? ''}\n${e.fechaEfecto ?? ''}\n${jsonCanonico(e.extra)}`,
    )
    .digest('hex')
}
