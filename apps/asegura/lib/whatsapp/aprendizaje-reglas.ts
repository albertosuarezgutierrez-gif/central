// Aprendizaje y autonomía gradual de las propuestas de la IA de WhatsApp (spec 2026-11-04 § «Aprendizaje y autonomía»).
// Reglas PURAS (sin BD), testeadas en `aprendizaje.test.ts`. Las consultas viven en `aprendizaje.ts`.
//
// Mismo patrón que el agente de huéspedes de pisos (`apps/plataforma/lib/sivra/agente-huesped/`):
//   · cada decisión de Alberto queda registrada (aplicada / descartada / modificada con ✏️), con contexto SIN PII;
//   · antes de proponer, los casos PARECIDOS (palabra de contenido en común + mismo origen del saliente, como
//     `similitud-reglas.ts`; sin embeddings ni servicios de pago) entran en el prompt;
//   · autonomía por TIPO: N aprobadas SEGUIDAS sin modificar → ese tipo se aplica solo y avisa con ↩️ Deshacer.
//     Cualquier ❌, ✏️ o ↩️ la devuelve a «con permiso» (la racha vuelve a 0).
//
// 🚫 NUNCA autónomo: lanzar bots RPA de tarificación, tarificar en Avant2 o cualquier cosa que salga a un TERCERO
//    (cliente, compañía). Solo los tres tipos de `TIPOS_AUTONOMIZABLES`, que escriben únicamente en la cartera propia
//    (fecha prometida, tarea, vencimiento de una oportunidad) y se pueden deshacer. Cepo en `aprendizaje.test.ts`.

import { redactarPii } from '@central/module-seguros'
import { fechaIsoReal, type TipoPropuesta } from './propuestas-reglas.ts'

/** Lo ÚNICO que puede ir en modo autónomo. Cualquier otro tipo (bots, tarificar, enviar…) → siempre con permiso. */
export const TIPOS_AUTONOMIZABLES: readonly TipoPropuesta[] = ['fecha_cobro', 'pagado', 'vencimiento'] as const

export const ENV_AUTONOMIA = 'ASEGURA_WHATSAPP_AUTONOMIA_ACTIVA'
export const ENV_UMBRAL = 'ASEGURA_WHATSAPP_AUTONOMIA_UMBRAL'
export const UMBRAL_POR_DEFECTO = 20
/** Por debajo de esto un umbral es un error de configuración, no una decisión: se ignora (nunca autónomo). */
export const UMBRAL_MINIMO = 5
export const UMBRAL_MAXIMO = 1000

export const ACTOR_AUTONOMO = 'agente:whatsapp-ia-autonomo'

export type Resolucion = 'aplicada' | 'descartada' | 'modificada'

/** Un evento de la racha: una resolución (o un ↩️ Deshacer, que es otro evento en SU fecha). */
export type EventoRacha = { resolucion: Resolucion; autonoma: boolean; deshechaAt: Date | null; resueltaAt: Date }

/** `1` exacto. Cualquier otra cosa (vacío, `true`, `si`) → apagado. */
export function autonomiaActiva(valor: string | undefined): boolean {
  return (valor ?? '').trim() === '1'
}

/** Umbral de la env; vacío → 20. Mal formado o fuera de [5, 1000] → `null` (= nunca autónomo: el estado conservador). */
export function leerUmbral(valor: string | undefined): number | null {
  const v = (valor ?? '').trim()
  if (v === '') return UMBRAL_POR_DEFECTO
  if (!/^\d{1,4}$/.test(v)) return null
  const n = Number(v)
  return n >= UMBRAL_MINIMO && n <= UMBRAL_MAXIMO ? n : null
}

/**
 * Racha de aprobadas SEGUIDAS sin modificar (de la más reciente hacia atrás) hasta el primer reinicio.
 *   · ✅ aplicada por Alberto → +1.
 *   · ❌ descartada, ✏️ modificada → corta (reinicio).
 *   · ↩️ deshecha (de una autónoma) → corta, en la fecha del deshacer (no en la de la aplicación).
 *   · aplicada SOLA y no deshecha → ni suma ni corta (la autonomía no se alimenta a sí misma).
 */
export function calcularRacha(eventos: readonly EventoRacha[]): number {
  type Marca = { at: number; tipo: 'mas' | 'corte' | 'neutro' }
  const marcas: Marca[] = []
  for (const e of eventos) {
    if (e.autonoma) {
      marcas.push({ at: e.resueltaAt.getTime(), tipo: 'neutro' })
      if (e.deshechaAt) marcas.push({ at: e.deshechaAt.getTime(), tipo: 'corte' })
      continue
    }
    marcas.push({ at: e.resueltaAt.getTime(), tipo: e.resolucion === 'aplicada' ? 'mas' : 'corte' })
  }
  // Más reciente primero; a igual instante, el corte manda (estado conservador).
  marcas.sort((a, b) => b.at - a.at || (a.tipo === 'corte' ? -1 : b.tipo === 'corte' ? 1 : 0))
  let n = 0
  for (const m of marcas) {
    if (m.tipo === 'corte') break
    if (m.tipo === 'mas') n++
  }
  return n
}

export type VeredictoAutonomia = { autonoma: true } | { autonoma: false; motivo: 'flag_apagado' | 'umbral_invalido' | 'tipo_no_autonomizable' | 'racha_ilegible' | 'racha_corta' }

/**
 * ¿Se aplica SOLA esta propuesta? Todas las puertas, en orden; cualquiera cerrada → con permiso (botones ✅/✏️/❌).
 * `racha` null = no se pudo leer (tabla sin aplicar, error) → nunca autónomo.
 */
export function decidirAutonomia(a: { flag: string | undefined; umbral: string | undefined; tipo: string; racha: number | null }): VeredictoAutonomia {
  if (!autonomiaActiva(a.flag)) return { autonoma: false, motivo: 'flag_apagado' }
  const umbral = leerUmbral(a.umbral)
  if (umbral === null) return { autonoma: false, motivo: 'umbral_invalido' }
  if (!(TIPOS_AUTONOMIZABLES as readonly string[]).includes(a.tipo)) return { autonoma: false, motivo: 'tipo_no_autonomizable' }
  if (a.racha === null || !Number.isInteger(a.racha) || a.racha < 0) return { autonoma: false, motivo: 'racha_ilegible' }
  if (a.racha < umbral) return { autonoma: false, motivo: 'racha_corta' }
  return { autonoma: true }
}

// ── ✏️ Corrección de Alberto ───────────────────────────────────────────────────

export const MAX_CORRECCION = 500
export const MAX_OBSERVACION = 300

export type Correccion = { fecha: string | null; observacion: string | null }

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Lo que Alberto contesta al ✏️: una fecha (aaaa-mm-dd, dd/mm/aaaa, dd-mm-aa, dd/mm) y/o una observación (el resto).
 * Para `pagado` no hay fecha que corregir: todo el texto es observación. `dd/mm` sin año = la próxima vez que llegue
 * esa fecha (hoy incluido). Vacío, demasiado largo o una fecha que no existe → `null` (no se aplica nada).
 */
export function leerCorreccion(texto: string, tipo: TipoPropuesta, hoy: string): Correccion | null {
  const t = (texto ?? '').replace(/\s+/g, ' ').trim()
  if (!t || t.length > MAX_CORRECCION) return null
  if (tipo === 'pagado') return { fecha: null, observacion: t.slice(0, MAX_OBSERVACION) }
  let fecha: string | null = null
  let resto = t
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t)
  const es = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?\b/.exec(t)
  if (iso) {
    fecha = `${iso[1]}-${iso[2]}-${iso[3]}`
    resto = t.replace(iso[0], ' ')
  } else if (es) {
    const d = Number(es[1])
    const m = Number(es[2])
    let anio: number
    if (es[3]) anio = es[3].length === 2 ? 2000 + Number(es[3]) : Number(es[3])
    else {
      anio = Number(hoy.slice(0, 4))
      if (`${anio}-${pad(m)}-${pad(d)}` < hoy) anio++
    }
    fecha = `${anio}-${pad(m)}-${pad(d)}`
    resto = t.replace(es[0], ' ')
  }
  if (fecha !== null && !fechaIsoReal(fecha)) return null
  const observacion = resto.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/^[\s,.;:—-]+|[\s,.;:—-]+$/g, '').trim()
  if (fecha === null && !observacion) return null
  return { fecha, observacion: observacion ? observacion.slice(0, MAX_OBSERVACION) : null }
}

// ── Contexto sin PII ─────────────────────────────────────────────────────────────

export const MAX_EXTRACTO = 300

/** Extracto del mensaje del cliente para el registro: redactado (DNI, IBAN, teléfonos, nombre…), una línea, ≤300. */
export function extractoRedactado(texto: string | null | undefined, nombres: readonly (string | null | undefined)[] = []): string | null {
  const r = redactarPii(texto ?? '', { nombres }).replace(/\s+/g, ' ').trim()
  return r ? r.slice(0, MAX_EXTRACTO) : null
}

// ── Casos parecidos (misma idea que `similitud-reglas.ts` de pisos) ──────────────

export const MAX_CASOS = 6
export const RESERVA_RECIENTES = 2
const MIN_LETRAS = 5
const MAX_CLAVES = 8
const VACIAS = new Set([
  'hola', 'buenos', 'buenas', 'gracias', 'favor', 'saludos', 'sobre', 'desde', 'hasta', 'para', 'porque', 'pero',
  'esta', 'este', 'esto', 'estas', 'puedo', 'puede', 'quiero', 'tengo', 'tiene', 'estoy', 'tambien', 'también',
  'cuando', 'donde', 'dónde', 'como', 'cómo', 'muchas', 'mucho', 'vale', 'perfecto', 'entonces', 'ahora',
])

/** Palabras de CONTENIDO (≥5 letras, sin vacías ni marcas de redacción como [DNI]). */
export function palabrasClave(texto: string | null | undefined): string[] {
  const limpio = (texto ?? '').toLowerCase().replace(/\[[a-z_]+\]/g, ' ')
  const out: string[] = []
  const vistas = new Set<string>()
  for (const t of limpio.split(/[^\p{L}\p{N}]+/u)) {
    if (t.length < MIN_LETRAS || VACIAS.has(t) || vistas.has(t) || /^\d+$/.test(t)) continue
    vistas.add(t)
    out.push(t)
    if (out.length >= MAX_CLAVES) break
  }
  return out
}

export type CasoAprendido = {
  tipo: TipoPropuesta
  origenSaliente: string | null
  extracto: string | null
  resolucion: Resolucion
  autonoma: boolean
  deshecha: boolean
  propuesto: { fecha?: string }
  final: { fecha?: string } | null
  observacion: string | null
  resueltaAt: Date
}

/** Puntuación de parecido: palabras de contenido en común + 1 si el saliente era del mismo origen. 0 = no se parece. */
export function parecido(c: Pick<CasoAprendido, 'extracto' | 'origenSaliente'>, q: { claves: readonly string[]; origenSaliente: string | null }): number {
  const del = new Set(palabrasClave(c.extracto))
  const comunes = q.claves.filter((k) => del.has(k)).length
  if (comunes === 0) return 0
  return comunes + (q.origenSaliente !== null && c.origenSaliente === q.origenSaliente ? 1 : 0)
}

/**
 * Los casos que entran al prompt: primero los PARECIDOS (por puntuación, luego recencia), con `RESERVA_RECIENTES`
 * huecos para los más recientes aunque no se parezcan (lo último que corrigió Alberto no debe desaparecer). Sin duplicar.
 */
export function elegirCasos(casos: readonly CasoAprendido[], q: { extracto: string | null; origenSaliente: string | null }, max = MAX_CASOS, reserva = RESERVA_RECIENTES): CasoAprendido[] {
  const claves = palabrasClave(q.extracto)
  const recientes = [...casos].sort((a, b) => b.resueltaAt.getTime() - a.resueltaAt.getTime())
  const parecidos = recientes
    .map((c) => ({ c, p: parecido(c, { claves, origenSaliente: q.origenSaliente }) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || b.c.resueltaAt.getTime() - a.c.resueltaAt.getTime())
    .map((x) => x.c)
  const out: CasoAprendido[] = []
  const meter = (c: CasoAprendido) => {
    if (!out.includes(c) && out.length < max) out.push(c)
  }
  for (const c of parecidos.slice(0, Math.max(0, max - reserva))) meter(c)
  for (const c of recientes) meter(c)
  for (const c of parecidos) meter(c)
  return out
}

/** Lo que ve la IA de un caso: sin ids, sin fechas de resolución, sin actor. */
export function casoParaIA(c: CasoAprendido): {
  tipo: TipoPropuesta; origen_saliente: string | null; mensaje_cliente: string | null; decision: string
  propuesto: { fecha?: string }; final: { fecha?: string } | null; observacion_corredor: string | null
} {
  const decision = c.autonoma ? (c.deshecha ? 'aplicada_sola_y_deshecha_por_el_corredor' : 'aplicada_sola') : c.resolucion
  return { tipo: c.tipo, origen_saliente: c.origenSaliente, mensaje_cliente: c.extracto, decision, propuesto: c.propuesto, final: c.final, observacion_corredor: c.observacion }
}
