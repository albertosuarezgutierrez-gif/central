// Que la IA PROPONGA la clasificación de una factura pendiente, con el contexto que ya existe.
//
// Contexto (29/08/2026). Alberto, al estrenar la bandeja: «que la IA proponga». Hasta ahora la
// propuesta era determinista (`sugerencia-pendiente.ts`): el histórico del mismo proveedor y poco
// más. Eso deja fuera justo lo que hace falta en la factura de un proveedor NUEVO, que es el 90 %
// de la bandeja — sin histórico no propone nada y hay que rellenar el formulario a mano.
//
// Aquí la IA lee lo que el humano leería: proveedor, concepto, importe, el histórico si lo hay y
// el movimiento bancario que casa (de qué cuenta salió, que es la pista más fuerte: la correduría
// es SIEMPRE BBVA). La IA no escribe nada: rellena los desplegables y Alberto confirma.
//
// 🚨 La IA propone, NO decide, y su salida se valida contra la lista blanca ANTES de tocar la UI.
// Es la misma razón por la que el módulo determinista no desempata: lo que se confirma aquí nace
// como REGLA y a partir de la segunda confirmación imputa sola, así que un valor inventado no se
// queda en una factura, se propaga a todas las futuras de ese proveedor.
//
// 🚨 Tres estados, nunca dos. `ilegible` («no se pudo leer la respuesta») NO se colapsa con
// `sin_criterio` («la IA miró y no lo tiene claro»): el primero manda a reintentar, el segundo a
// mirarlo tú. Y un valor fuera de la lista blanca se DESCARTA a null; no se sustituye por un
// default plausible — ese es el patrón que convierte un «no lo sé» en una afirmación falsa.
//
// Módulo PURO (sin imports ni BD) para poder testearlo con `node --test`.

/** Valor que la IA usa para decir «esto no es de ningún piso» (correduría, infraestructura…). */
export const SIN_PISO = 'CORREDURIA'

export type EstadoSugerenciaIA = 'propuesta' | 'sin_criterio' | 'ilegible'

export interface SugerenciaIA {
  /** `propuesta` = hay algo que proponer · `sin_criterio` = respondió y no lo sabe ·
   *  `ilegible` = no se pudo interpretar la respuesta (fallo técnico, no un veredicto). */
  estado: EstadoSugerenciaIA
  /** `null` = no propone. `''` = propone explícitamente SIN piso (gasto de la correduría). */
  propiedad: string | null
  /** `null` = no propone. */
  categoria: string | null
  /** Explicación corta para pintar junto a los campos. */
  motivo: string | null
  /** 0..1 tal como la dio la IA, o `null` si no la dio o venía fuera de rango. */
  confianza: number | null
  /** Valores que la IA propuso y NO están en la lista blanca. Se declaran, no se ocultan. */
  descartado: string[]
}

export interface ContextoFactura {
  proveedor?: string | null
  nif_proveedor?: string | null
  concepto?: string | null
  numero_factura?: string | null
  fecha?: string | null
  total: number
  /** Facturas YA REVISADAS del mismo proveedor: es la señal más fuerte que hay. */
  historico?: Array<{ fecha?: string | null; propiedad?: string | null; categoria?: string | null }>
  /** Movimiento bancario que casa con la factura, si se encontró. */
  movimiento?: { banco?: string | null; concepto?: string | null; destino?: string | null } | null
}

export interface ListasBlancas {
  categorias: readonly string[]
  /** Pisos válidos: `{ id, name }`. La correduría NO está aquí — es la ausencia de piso. */
  propiedades: readonly { id: string; name: string }[]
}

export function construirSystem(listas: ListasBlancas): string {
  const cats = listas.categorias.join(' | ')
  const pisos = listas.propiedades.map((p) => `${p.id} (${p.name})`).join(' · ')
  return `Eres el contable de Alberto (persona física, España). Clasificas UNA factura de proveedor.

Alberto tiene dos actividades:
- CORREDURÍA de seguros (su actividad profesional). Aquí van la infraestructura y el software:
  hosting, dominios, IA, asesoría, cuota de autónomos, material de oficina. Se paga casi siempre
  desde BBVA.
- PISOS TURÍSTICOS en Sevilla. Aquí van limpieza, lavandería, suministros, comunidad, mobiliario,
  reparaciones, plataformas de reserva (Booking/Airbnb/Smoobu) y seguros del piso.

Devuelve DOS cosas:
1. "propiedad": el piso al que se imputa, uno de: ${pisos}
   - "prop_multi_apartamentos" si es de los pisos pero no se sabe de cuál (gasto compartido).
   - "${SIN_PISO}" si NO es de ningún piso: gasto de la correduría o infraestructura.
   - null si de verdad no lo sabes.
2. "categoria": una de: ${cats}

REGLAS:
- El HISTÓRICO del mismo proveedor manda sobre cualquier intuición tuya. Si sus facturas
  anteriores fueron a un piso concreto, propón ese piso.
- El BANCO es una pista fuerte: lo pagado desde BBVA suele ser de la correduría.
- Las COMISIONES que cobran Booking, Airbnb o Expedia son gasto DE LOS PISOS (categoría
  PLATAFORMAS), nunca de la correduría. Si la factura no dice de qué piso son, van a
  "prop_multi_apartamentos": esas plataformas facturan las reservas de todos a la vez.
- Un servicio contratado "para todos los pisos" (limpieza mensual, lavandería, seguro conjunto)
  va a "prop_multi_apartamentos", no a un piso al azar.
- Lo PERSONAL de Alberto (su declaración de la renta, gastos de casa) va a "prop_personal": no es
  deducible ni en los pisos ni en la correduría.
- Si no lo tienes claro, responde null. NO adivines: lo que Alberto confirme se convierte en una
  REGLA que imputará sola las siguientes facturas de este proveedor, así que un valor inventado
  se propaga. Un null es una respuesta correcta y útil.
- "confianza": 0 a 1, cuánto de seguro estás.
- "motivo": una frase de máximo 90 caracteres explicando en qué te basas.

Responde SOLO JSON, sin markdown:
{"propiedad":"<id>|${SIN_PISO}|null","categoria":"<CATEGORIA>|null","confianza":0.0,"motivo":"..."}`
}

export function construirUser(ctx: ContextoFactura): string {
  const l: string[] = []
  l.push(`Factura de: ${ctx.proveedor || '(proveedor desconocido)'}${ctx.nif_proveedor ? ` (NIF ${ctx.nif_proveedor})` : ''}`)
  l.push(`Importe: ${ctx.total.toFixed(2)} €${ctx.fecha ? ` · fecha ${ctx.fecha}` : ''}${ctx.numero_factura ? ` · nº ${ctx.numero_factura}` : ''}`)
  if (ctx.concepto) l.push(`Concepto: ${ctx.concepto.slice(0, 300)}`)

  const hist = ctx.historico ?? []
  if (hist.length) {
    l.push(`Facturas anteriores YA revisadas de este proveedor (${hist.length}):`)
    for (const h of hist.slice(0, 10)) {
      l.push(`  - ${h.fecha ?? '?'} → piso ${h.propiedad ?? `${SIN_PISO} (sin piso)`}, categoría ${h.categoria ?? '?'}`)
    }
  } else {
    // Se DECLARA la ausencia: «no hay histórico» no es lo mismo que no decir nada, porque sin esta
    // línea el modelo puede suponer que se le ocultó y fabricar una continuidad que no existe.
    l.push('No hay ninguna factura anterior revisada de este proveedor.')
  }

  if (ctx.movimiento) {
    l.push(`Cargo bancario que casa: banco ${ctx.movimiento.banco ?? '?'}${ctx.movimiento.destino ? ` · clasificado como ${ctx.movimiento.destino}` : ''}`)
    if (ctx.movimiento.concepto) l.push(`  concepto del banco: ${ctx.movimiento.concepto.slice(0, 160)}`)
  } else {
    l.push('No se ha encontrado el cargo bancario de esta factura (puede que aún no haya llegado).')
  }
  return l.join('\n')
}

/** Quita el envoltorio markdown y los bloques `<think>` de los modelos de razonamiento. */
function limpiar(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json|```/g, '')
    .trim()
}

/** Normaliza lo que la IA pudo escribir como «nada»: null, "null", "", "ninguno"… */
function esNulo(v: unknown): boolean {
  if (v == null) return true
  if (typeof v !== 'string') return false
  const s = v.trim().toLowerCase()
  return s === '' || s === 'null' || s === 'none' || s === 'ninguno' || s === 'desconocido' || s === 'n/a'
}

/**
 * Interpreta la respuesta del modelo y la valida contra la lista blanca.
 *
 * Nada de lo que devuelve puede estar fuera de las listas: un id de piso o una categoría que la IA
 * se invente se descarta a `null` y se anota en `descartado`, NUNCA se sustituye por un valor por
 * defecto — la propuesta acaba en una regla que imputa sola.
 */
export function interpretarRespuestaIA(raw: string, listas: ListasBlancas): SugerenciaIA {
  const vacia = (estado: EstadoSugerenciaIA, motivo: string | null): SugerenciaIA => ({
    estado, propiedad: null, categoria: null, motivo, confianza: null, descartado: [],
  })

  let obj: Record<string, unknown>
  try {
    const limpio = limpiar(raw)
    // Un modelo puede envolver el JSON en texto; se coge el primer objeto de llave a llave.
    const i = limpio.indexOf('{')
    const j = limpio.lastIndexOf('}')
    if (i < 0 || j <= i) return vacia('ilegible', 'La IA no devolvió un JSON reconocible.')
    obj = JSON.parse(limpio.slice(i, j + 1)) as Record<string, unknown>
  } catch {
    return vacia('ilegible', 'La IA no devolvió un JSON reconocible.')
  }

  const descartado: string[] = []
  const idsPiso = new Set(listas.propiedades.map((p) => p.id))
  const cats = new Set(listas.categorias)

  let propiedad: string | null = null
  const pRaw = obj.propiedad
  if (!esNulo(pRaw) && typeof pRaw === 'string') {
    const p = pRaw.trim()
    if (p.toUpperCase() === SIN_PISO) propiedad = '' // '' = sin piso, a propósito
    else if (idsPiso.has(p)) propiedad = p
    else descartado.push(`propiedad «${p.slice(0, 40)}»`)
  }

  let categoria: string | null = null
  const cRaw = obj.categoria
  if (!esNulo(cRaw) && typeof cRaw === 'string') {
    const c = cRaw.trim().toUpperCase()
    if (cats.has(c)) categoria = c
    else descartado.push(`categoría «${c.slice(0, 40)}»`)
  }

  // La confianza solo se conserva si es un número dentro de rango. Un "0.9" fuera de [0,1] o un
  // texto no es una confianza baja: es una confianza que no se sabe.
  const conf = typeof obj.confianza === 'number' ? obj.confianza
    : typeof obj.confianza === 'string' ? Number(obj.confianza)
    : NaN
  const confianza = Number.isFinite(conf) && conf >= 0 && conf <= 1 ? conf : null

  const motivoIA = typeof obj.motivo === 'string' && obj.motivo.trim() ? obj.motivo.trim().slice(0, 120) : null

  if (propiedad === null && categoria === null) {
    const nota = descartado.length
      ? `La IA propuso valores que no existen (${descartado.join(', ')}); no se aplican.`
      : (motivoIA ?? 'La IA no ha sabido proponer nada para esta factura.')
    return { estado: 'sin_criterio', propiedad: null, categoria: null, motivo: nota, confianza, descartado }
  }

  return { estado: 'propuesta', propiedad, categoria, motivo: motivoIA, confianza, descartado }
}
