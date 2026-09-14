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
  /** Nivel de cobertura: «Terceros», «Todo Riesgo Con Franquicia Alta»… Es la
   *  agrupación natural de una comparativa: sin ella se comparan peras y manzanas. */
  categoria: string | null
  /** Franquicia en euros. 🚨 `null` = el producto no la declara, NO «sin franquicia»:
   *  enseñar un todo riesgo de 427,79€ callando que lleva 1.500€ de franquicia es
   *  la regla «dato que SÍ está pero se lee mal» en su forma más cara. */
  franquiciaEur: number | null
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
  /**
   * 🚨 `product.id` — DISTINTO de `id` de arriba. Medido en el fixture real:
   * `id` es `"Q7601460"` (string, el mainQuote) y `product.id` es `10`
   * (número, el producto del catálogo del vendor). El primer 400 real de
   * ReRate (11/09/2026, proyecto 40681298) confundía los dos: mandaba el
   * `id` del mainQuote como si fuera el del producto, y encima nunca ponía
   * `mainQuote.id`. Se pasa TAL CUAL (`unknown`), sin coaccionar tipo.
   */
  productId: unknown
  /**
   * `product.options` — el vendor lo exige en el ReRate («[Path
   * '/mainQuote/product'] Object has missing required properties
   * (['options'])») pero el fixture real de la cotización NUNCA lo trae: no
   * es un campo que el vendor devuelva al cotizar, así que aquí casi
   * siempre será `null`. 🚨 Es un ARRAY, no un objeto: el backend Java lo
   * declara `ArrayList<InsuranceProductOption>` (segundo 400 real,
   * 11/09/2026, mismo proyecto — mandar `{}` revienta con
   * `JsonMappingException` porque espera `START_ARRAY`, no `START_OBJECT`).
   * Se reenvía tal cual en vez de inventar una forma — ver `reRate()` en
   * `emitir.ts` para qué se manda cuando falta.
   */
  productOptions: unknown
  /**
   * `expirationDate` del precio. Solo lo trae un precio ya CONFIRMADO por
   * ReRate (`Q2018406592` en el caso real de Pilar Franco Ruz, 12/09/2026);
   * el resto de precios de una cotización inicial no lo declaran. Existe para
   * poder decidir si un proyecto ya cotizado sigue vigente ANTES de pedir uno
   * nuevo — ver `proyectoVigenteDePoliza` en `retarificar-cartera.ts`.
   */
  expiraEn: string | null
}

/**
 * Un producto que no devolvió precio. No es ruido: es información comercial.
 *
 * 🚨 OJO: cada entrada es una CONFIGURACIÓN de producto, no una compañía. En la
 * cotización real del 10/06/2026, Reale sale aquí con la config «37786__» Y
 * ADEMÁS devolvió 8 precios con la config «83474 (ASM y API)». Decir «Reale no
 * dio precio» habría sido falso justo sobre la compañía que más dio — por eso
 * existe `tambienDioPrecio`.
 */
export type FalloProducto = {
  compania: string
  producto: string | null
  /** Nombre de la configuración que falló, cuando el vendor lo dice. */
  configuracion: string | null
  /** Motivo legible («La matrícula ya está asegurada en la compañía»). */
  motivo: string
  /** `true` si esta MISMA compañía sí dio precio por otra configuración. */
  tambienDioPrecio: boolean
}

/** @deprecated Nombre viejo; se mantiene para no romper importaciones. */
export type FalloCompania = FalloProducto

export type Cotizacion = {
  /** `id` de raíz: NÚMERO en el JSON. Es el `project_id` de Codeoscopic y la
   *  clave con la que el webhook nos encuentra: hay que persistirlo SIEMPRE
   *  (el `project_not_found` de 2026 fue justo no haberlo guardado). */
  projectId: string
  fechaEfecto: string | null
  /**
   * `insuranceLine.id` de raíz (`"Car"`, `"Home"`…). Hace falta para el
   * `PATCH /insurances/{id}` de `actualizarFechaEfecto()`: el cuarto 400 real
   * decía «incremental» y el quinto demostró que NO lo es del todo — el
   * vendor exige `insuranceLine` en el cuerpo aunque solo se corrija
   * `effectiveDate` («The `insuranceLine` field is missing or invalid.»,
   * 12/09/2026). Se relee del proyecto en vez de suponerse por ramo.
   */
  insuranceLineId: string | null
  precios: Precio[]
  fallos: FalloProducto[]
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
    categoria: str(obj(obj(producto.modality).category).name),
    franquiciaEur: num(q.deductible),
    primaEur: prima,
    entradaEur: num(q.downPayment),
    meses: num(q.termMonths),
    formaPago: str(obj(q.paymentMethod).name),
    frecuenciaPago: str(obj(q.paymentFrequency).name) ?? str(q.paymentFrequency),
    referenciaVendor: str(q.referenceFromVendor),
    firmeza: firmezaDe(q.estimate, q.messages),
    avisos: arr(q.messages).map(textoMensaje).filter((t): t is string => t !== null),
    requiereReRate: acciones.some((a) => str(obj(a).id)?.toLowerCase() === 'rerate'),
    productId: producto.id ?? null,
    productOptions: producto.options ?? null,
    expiraEn: str(q.expirationDate),
  }
}

function leerFallo(raw: unknown, companiasConPrecio: Set<string>): FalloProducto | null {
  const e = obj(raw)
  const producto = obj(e.product)
  const motivos = arr(e.messages)
    .map(textoMensaje)
    .filter((t): t is string => t !== null)
  const compania = str(obj(producto.vendor).name) ?? 'compañía sin identificar'
  return {
    compania,
    producto: str(producto.name),
    configuracion: str(obj(producto.config).name),
    // Sin texto decimos que no lo dijo, no que no pasara nada.
    motivo: motivos.join(' · ') || 'la compañía no explicó el motivo',
    tambienDioPrecio: companiasConPrecio.has(compania),
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

  const precios = arr(r.mainQuotes)
    .map(leerPrecio)
    .filter((p): p is Precio => p !== null)
  const companiasConPrecio = new Set(precios.map((p) => p.compania))

  return {
    projectId: String(idRaiz),
    fechaEfecto: str(r.effectiveDate),
    insuranceLineId: str(obj(r.insuranceLine).id),
    precios,
    fallos: arr(r.errors)
      .map((e) => leerFallo(e, companiasConPrecio))
      .filter((f): f is FalloProducto => f !== null),
  }
}

/** Resumen honrado para la UI y para Telegram: dice lo que NO se pudo cotizar. */
export function resumirCotizacion(c: Cotizacion): string {
  const firmes = c.precios.filter((p) => p.firmeza === 'firme').length
  const noFirmes = c.precios.length - firmes
  const partes = [`${c.precios.length} precios (${firmes} en firme`]
  partes.push(noFirmes > 0 ? `, ${noFirmes} con reparos)` : ')')
  // Solo se nombran las que NO dieron NINGÚN precio: una compañía que falló en
  // una configuración pero coticé en otra no está «sin precio».
  const mudas = [...new Set(c.fallos.filter((f) => !f.tambienDioPrecio).map((f) => f.compania))]
  if (mudas.length > 0) partes.push(` · sin precio: ${mudas.join(', ')}`)
  return partes.join('')
}
