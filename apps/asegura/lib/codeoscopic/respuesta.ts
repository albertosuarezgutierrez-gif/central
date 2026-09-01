// Lectura de la respuesta de `POST /insurances`. PURO: entra JSON, sale modelo.
//
// ─── Por qué esto no es «coger premium y pintarlo» ──────────────────────────
// El fixture real que entregó Manuel (fixtures/codeoscopic/, cotización del
// 10/06/2026) enseña lo que el documento de traspaso no decía: de los 18 precios
// que devolvió, **los 18 traían `messages[]`** y dos venían con `estimate: true`.
// Hay primas con `{"type":"warning","text":"Riesgo condicionado"}` y con
// observaciones del tipo «NECESARIO DOCUMENTO ORIGINAL ACREDITATIVO BONIFICACION».
//
// Pintar «251,77€» sin ese aviso es exactamente la regla de `CLAUDE.md` sobre el
// dato que SÍ está pero se lee mal: el número es plausible, y la condición que lo
// sostiene desaparece por el camino. Un precio condicionado que se enseña como
// firme es una oferta que luego no se puede mantener delante del cliente.
//
// Por eso cada precio sale de aquí con su FIRMEZA, y son tres, no dos.

export type Firmeza = 'firme' | 'condicionado' | 'estimado'

export type Precio = {
  /** `id` del precio: string con prefijo (`"Q7601460"`). Ojo, NO es el de raíz. */
  id: string
  compania: string
  producto: string
  modalidad: string | null
  /** Prima total del periodo, en euros. */
  primaEur: number
  /** Primer pago, en euros. Puede diferir de la prima si se fracciona. */
  entradaEur: number | null
  meses: number | null
  formaPago: string | null
  frecuenciaPago: string | null
  referenciaVendor: string | null
  firmeza: Firmeza
  /** Textos de aviso de la compañía, ya legibles. Se enseñan SIEMPRE. */
  avisos: string[]
  /** `true` si la oferta exige preemisión (re-rate) para poder avanzar. */
  requiereReRate: boolean
}

/** Una compañía que NO dio precio. No es ruido: es información comercial. */
export type FalloCompania = {
  compania: string
  producto: string | null
  /** Motivo legible («La matrícula ya está asegurada en la compañía»). */
  motivo: string
}

export type Cotizacion = {
  /** `id` de raíz: NÚMERO en el JSON. Es el `project_id` de Codeoscopic y la
   *  clave con la que el webhook nos encuentra: hay que persistirlo SIEMPRE
   *  (el `project_not_found` de 2026 fue justo no haberlo guardado). */
  projectId: string
  fechaEfecto: string | null
  precios: Precio[]
  fallos: FalloCompania[]
}

// ─── Acceso defensivo: la respuesta es de un tercero ─────────────────────────
type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Decide la firmeza de un precio.
 *
 * Orden deliberado: `estimate` manda sobre todo lo demás, porque si el propio
 * vendor dice que la cifra es una estimación, ningún aviso la vuelve firme.
 */
export function firmezaDe(estimate: unknown, mensajes: unknown): Firmeza {
  if (estimate === true) return 'estimado'
  const hayReparo = arr(mensajes).some((m) => {
    const t = str(obj(m).type)?.toLowerCase()
    return t === 'warning' || t === 'error'
  })
  if (hayReparo) return 'condicionado'
  // `estimate` ausente NO se asume `false`: sin el dato, el precio no es firme.
  if (estimate !== false) return 'estimado'
  return 'firme'
}

/** Junta `text` y `description` de un mensaje en una línea legible. */
function textoMensaje(m: unknown): string | null {
  const o = obj(m)
  const partes = [str(o.text), str(o.description)].filter(Boolean) as string[]
  if (partes.length === 0) return null
  return partes.join(': ').replace(/\s+/g, ' ').trim()
}

function leerPrecio(raw: unknown): Precio | null {
  const q = obj(raw)
  const id = str(q.id)
  const prima = num(q.premium)
  // Sin id o sin prima no es un precio: se descarta en vez de inventar un 0.
  if (!id || prima === null) return null

  const producto = obj(q.product)
  const acciones = arr(q.actions)

  return {
    id,
    compania: str(obj(producto.vendor).name) ?? 'compañía sin identificar',
    producto: str(producto.name) ?? 'producto sin nombre',
    modalidad: str(obj(producto.modality).name),
    primaEur: prima,
    entradaEur: num(q.downPayment),
    meses: num(q.termMonths),
    formaPago: str(obj(q.paymentMethod).name),
    frecuenciaPago: str(obj(q.paymentFrequency).name) ?? str(q.paymentFrequency),
    referenciaVendor: str(q.referenceFromVendor),
    firmeza: firmezaDe(q.estimate, q.messages),
    avisos: arr(q.messages).map(textoMensaje).filter((t): t is string => t !== null),
    requiereReRate: acciones.some((a) => str(obj(a).id)?.toLowerCase() === 'rerate'),
  }
}

function leerFallo(raw: unknown): FalloCompania | null {
  const e = obj(raw)
  const producto = obj(e.product)
  const motivos = arr(e.messages)
    .map(textoMensaje)
    .filter((t): t is string => t !== null)
  return {
    compania: str(obj(producto.vendor).name) ?? 'compañía sin identificar',
    producto: str(producto.name),
    // Sin texto decimos que no lo dijo, no que no pasara nada.
    motivo: motivos.join(' · ') || 'la compañía no explicó el motivo',
  }
}

/**
 * Convierte la respuesta cruda del vendor en el modelo de la casa.
 *
 * Lanza si falta el `id` de raíz: sin él no podemos correlacionar el webhook ni
 * demostrar por qué nos han facturado esa cotización, así que es preferible
 * fallar ruidosamente a guardar un proyecto huérfano.
 */
export function leerCotizacion(raw: unknown): Cotizacion {
  const r = obj(raw)
  // El `id` de raíz llega como número; los de precio como string. No unificar
  // a ciegas: aquí se normaliza a string una sola vez y con intención.
  const idRaiz = num(r.id) ?? (str(r.id) !== null ? Number(str(r.id)) : null)
  if (idRaiz === null || !Number.isFinite(idRaiz)) {
    throw new Error('codeoscopic_respuesta_sin_project_id')
  }

  return {
    projectId: String(idRaiz),
    fechaEfecto: str(r.effectiveDate),
    precios: arr(r.mainQuotes)
      .map(leerPrecio)
      .filter((p): p is Precio => p !== null),
    fallos: arr(r.errors)
      .map(leerFallo)
      .filter((f): f is FalloCompania => f !== null),
  }
}

/** Resumen honrado para la UI y para Telegram: dice lo que NO se pudo cotizar. */
export function resumirCotizacion(c: Cotizacion): string {
  const firmes = c.precios.filter((p) => p.firmeza === 'firme').length
  const noFirmes = c.precios.length - firmes
  const partes = [`${c.precios.length} precios (${firmes} en firme`]
  partes.push(noFirmes > 0 ? `, ${noFirmes} con reparos)` : ')')
  if (c.fallos.length > 0) {
    partes.push(` · ${c.fallos.length} compañías sin precio: ${c.fallos.map((f) => f.compania).join(', ')}`)
  }
  return partes.join('')
}
