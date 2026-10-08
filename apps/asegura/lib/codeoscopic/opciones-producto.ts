// Catálogo ESTÁTICO de `product.options` por defecto para el ReRate, para las
// compañías que exigen campos que la cotización NUNCA devuelve (ver
// `Precio.productOptions` en `respuesta.ts` — el vendor no los manda al
// cotizar, así que aquí casi siempre es `null`).
//
// Sin sandbox y sin catálogo REST para esto: `docs/CODEOSCOPIC-API-PORTAL.md`
// es explícito — «Saber de antemano qué opciones pide cada producto: No existe
// por REST. La única vía documentada es su formulario incrustado [iframe]».
// La única fuente real es una captura del formulario en vivo.
//
// 🚨 Esa captura YA EXISTE: el CRM de Manuel (repo `asegura`, ya en la cuenta
// de Alberto) tiene `product-form-catalog.data.ts` — los 13 campos de
// ALLIANZ AUTO TERCEROS (`product.config.id` = `320200`) capturados del
// formulario en vivo el 02/07/2026, validados EMPÍRICAMENTE contra el vendor
// (probe F7: re-rate 200 real + `submittable: true`). Los valores de aquí son
// los `value`/`defaultValue` que ese formulario traía resueltos ese día — el
// mismo «estado deseado completo» que su `product-options-projector.ts`
// proyecta, no una invención nueva.
//
// 🚨 Excepción: `naturalPhenomena` ("Fenómenos de la naturaleza"). En la
// captura de Manuel NO tiene valor resoluble (ni `value` ni `defaultValue`
// literal — su `required`/`visible` son una expresión `/.../` del motor de
// reglas del vendor) y por eso su proyector lo OMITE: su probe mandó 13
// options, no 14, y el vendor lo aceptó sin él. El 400 real de Pilar Franco
// Ruz (11/09/2026, proyecto 40681298) demuestra que es CONDICIONAL a la
// cotización (vehículo/zona, no fijo): a veces el vendor no lo pide, a veces
// sí. Sin ese dato en ningún catálogo, lo decidió Alberto: **no incluido
// (`false`)** por defecto.
//
// Módulo PURO: sin red, sin BD.

export type OpcionProducto = { id: string; type: string; value: unknown }

// Descuentos por defecto al 50 (29/09/2026, decisión de Alberto): la compañía recorta al máximo que
// admite y lo va variando, así que pedir 50 deja siempre el suyo. Medido en la web con la moto de
// Manuel Piña (40961885): 50 + 50 dio el MISMO precio confirmado que 20 + 20, sin error.
export const DESCUENTO_POR_DEFECTO = 50

const ALLIANZ_AUTO_320200: OpcionProducto[] = [
  { id: 'dtoCap', type: 'number', value: DESCUENTO_POR_DEFECTO },
  { id: 'dtoVentaCruzada', type: 'number', value: DESCUENTO_POR_DEFECTO },
  { id: 'comissionType', type: 'string', value: 'A' },
  { id: 'mesesVencimiento', type: 'string', value: '12' },
  { id: 'under25', type: 'boolean', value: false },
  { id: 'licenseIssuedInUE', type: 'boolean', value: true },
  { id: 'IVACompensation', type: 'boolean', value: true },
  { id: 'driverAccidents', type: 'string', value: '30000' },
  { id: 'travelAssistance', type: 'string', value: 'STD' },
  { id: 'replacementVehicle', type: 'boolean', value: false },
  { id: 'fineWarnAndManagement', type: 'boolean', value: false },
  { id: 'naturalPhenomena', type: 'boolean', value: false },
  { id: 'isNewVehicle', type: 'string', value: '2' },
  { id: 'vehicleUseFrequency', type: 'number', value: 1 },
]

// Moto y hogar (ids = `name` del campo, leídos el 03/10/2026 del formulario real de Avant2).
// Allianz: mismos dos campos que en auto; `comissionType` NO se manda jamás (toca la comisión).
const ALLIANZ_DESCUENTOS: OpcionProducto[] = [
  { id: 'dtoCap', type: 'number', value: DESCUENTO_POR_DEFECTO },
  { id: 'dtoVentaCruzada', type: 'number', value: DESCUENTO_POR_DEFECTO },
]
// Generali: la compañía recorta sola (~12 % en moto, 29/09) y no da error.
const GENERALI_DESCUENTO: OpcionProducto[] = [{ id: 'commercialDiscountNumber', type: 'number', value: DESCUENTO_POR_DEFECTO }]
// PENDIENTE: Occident (`commercialDiscount` moto, `discount` hogar; ya traen 30) y Fidelidade (`discount` hogar): máximos sin medir.

/**
 * Opciones por defecto para una compañía, por nombre (contains normalizado,
 * como `encontrarPrecio`). `null` si no hay catálogo para ella — hoy es TODO
 * salvo Allianz auto: ni el resto de compañías ni moto/hogar tienen captura,
 * así que el caller manda `[]` (comportamiento igual que hasta ahora, y el
 * vendor lo dirá con su propio 400 real si le hace falta algo).
 */
export function opcionesPorDefecto(compania: string, ramo: string | null = 'auto'): OpcionProducto[] | null {
  // Por (compañía, RAMO): las 14 de Allianz son del producto de AUTO 320200.
  // Mandárselas al ReRate de Allianz Motos sería declarar opciones de otro
  // producto (auditoría 23/09/2026, plan punto 7). Sin ramo se asume auto,
  // que es el comportamiento de siempre.
  const r = ramo ?? 'auto'
  const c = compania.trim().toLowerCase()
  if (r === 'moto' || r === 'hogar') {
    if (c.includes('allianz')) return ALLIANZ_DESCUENTOS.map((o) => ({ ...o }))
    if (c.includes('generali')) return GENERALI_DESCUENTO.map((o) => ({ ...o }))
    return null
  }
  if (r !== 'auto') return null
  // Copia defensiva: el array de arriba es un módulo compartido entre invocaciones
  // (proceso Node reutilizado en serverless) — devolver la misma referencia dejaría
  // una mutación accidental del caller filtrarse a la siguiente petición.
  if (c.includes('allianz')) return ALLIANZ_AUTO_320200.map((o) => ({ ...o }))
  // Generali auto (05/10/2026): el id `commercialDiscountNumber` está medido en moto/hogar, NO en auto
  // (sin captura del formulario). Por eso aquí solo sirve con el filtro de `opcionesParaReRate`:
  // si el vendor ya devolvió sus opciones y no traen el id, no se manda (un id inexistente = 400 de 0,50€).
  if (c.includes('generali')) return GENERALI_DESCUENTO.map((o) => ({ ...o }))
  return null
}

/**
 * PURO. Las opciones de producto del ReRate: las que el vendor devolvió para ESE precio (`delVendor`)
 * y, si no hay, el catálogo por defecto. Generali auto: si el vendor devolvió opciones, el descuento
 * por defecto solo se aplica si traen `commercialDiscountNumber`; si no lo traen, se reenvían tal cual
 * (nunca se inventa un id). Sin opciones del vendor (`null`) no se puede comprobar y manda el catálogo.
 */
export function opcionesParaReRate(delVendor: unknown, compania: string, ramo: string | null = 'auto'): unknown {
  if (delVendor == null) return opcionesPorDefecto(compania, ramo)
  const esGeneraliAuto = (ramo ?? 'auto') === 'auto' && compania.trim().toLowerCase().includes('generali')
  if (!esGeneraliAuto || !Array.isArray(delVendor)) return delVendor
  const id = GENERALI_DESCUENTO[0].id
  if (!delVendor.some((o) => o && typeof o === 'object' && (o as { id?: unknown }).id === id)) return delVendor
  const r = conDescuentos(delVendor, { commercialDiscountNumber: DESCUENTO_POR_DEFECTO })
  return r.ok ? r.opciones : delVendor
}

// ── Descuento comercial en preemisión (29/09/2026) ──
//
// Límites del formulario REAL de Allianz auto 320200 en el stage `preissuance`, capturado del
// front en vivo (repo `asegura`, `product-form-catalog.data.ts`): «Descuento comercial % (CAP)»
// min 0 · max 99 (100 solo en `edit`), «(venta cruzada)» min 0 · max 100, paso 1. Son los
// límites del VENDOR, no un tope de negocio: se valida aquí para no gastar un ReRate en un
// 400 seguro. Qué parte de ese % sale de la comisión de la correduría no está confirmado.
export const LIMITES_DESCUENTO: Readonly<Record<'dtoCap' | 'dtoVentaCruzada' | 'commercialDiscountNumber', { min: number; max: number }>> = {
  dtoCap: { min: 0, max: 99 },
  dtoVentaCruzada: { min: 0, max: 100 },
  // Generali moto/hogar (03/10/2026): sin límite medido en el formulario; 0-100 es el tope seguro de un %.
  commercialDiscountNumber: { min: 0, max: 100 },
}

export type DescuentosPedidos = Partial<Record<keyof typeof LIMITES_DESCUENTO, number>>

/** Lee `{ dtoCap?, dtoVentaCruzada? }` del cuerpo. `null` si no viene nada; lanza nada: lo raro es reparo. */
export function descuentosDelCuerpo(v: unknown): { pedidos: DescuentosPedidos | null } | { reparo: string } {
  if (v == null) return { pedidos: null }
  if (typeof v !== 'object' || Array.isArray(v)) return { reparo: 'descuentos debe ser un objeto { dtoCap?, dtoVentaCruzada? }' }
  const r: DescuentosPedidos = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    // `hasOwn`, no `in`: `toString`/`constructor` pasarían y se validarían contra límites `undefined`.
    if (!Object.hasOwn(LIMITES_DESCUENTO, k)) return { reparo: `descuento desconocido: ${k}` }
    if (val == null || val === '') continue
    // Solo un número o dígitos: `true`, `[5]`, «0x10» o « 7 » no son un porcentaje tecleado.
    const n = typeof val === 'number' ? val : typeof val === 'string' && /^\d{1,3}$/.test(val) ? Number(val) : NaN
    const lim = LIMITES_DESCUENTO[k as keyof typeof LIMITES_DESCUENTO]
    if (!Number.isInteger(n) || n < lim.min || n > lim.max) return { reparo: `${k} tiene que ser un entero entre ${lim.min} y ${lim.max}` }
    r[k as keyof typeof LIMITES_DESCUENTO] = n
  }
  return { pedidos: Object.keys(r).length > 0 ? r : null }
}

/**
 * PURO. Aplica los descuentos pedidos a las opciones que irán en el ReRate. Solo si esas opciones
 * YA traen el campo (hoy, el catálogo de Allianz auto): meter un `dtoCap` en otra compañía sería
 * declarar un campo de otro producto. Devuelve una copia; nunca muta la entrada.
 */
export function conDescuentos(
  base: unknown,
  pedidos: DescuentosPedidos,
  origen: 'catalogo' | 'formulario' = 'catalogo',
): { ok: true; opciones: unknown[] } | { ok: false; motivo: string } {
  const lista = (Array.isArray(base) ? base : []).map((o) => (o && typeof o === 'object' ? { ...(o as Record<string, unknown>) } : o))
  for (const [id, pct] of Object.entries(pedidos)) {
    const o = lista.find((x) => x && typeof x === 'object' && (x as { id?: unknown }).id === id) as Record<string, unknown> | undefined
    if (!o) {
      return {
        ok: false,
        motivo: origen === 'formulario'
          ? `el formulario de la compañía no trae «${id}»: ajusta el descuento dentro del formulario`
          : `esta compañía no admite «${id}» en el ReRate (solo Allianz y Generali lo tienen catalogado)`,
      }
    }
    // Respeta el tipo con el que venía el campo (el formulario del vendor puede mandarlo como texto).
    o.value = typeof o.value === 'string' ? String(pct) : pct
  }
  return { ok: true, opciones: lista }
}

// ── Consentimientos del Submit (17/09/2026) — DISTINTO del catálogo de arriba ──
//
// El de arriba (`ALLIANZ_AUTO_320200`) es para `mainQuote.product.options` en el
// ReRate (`POST /insurances/{id}/offers`). Este es para `product.options` en el
// SUBMIT (`POST /insurances/{id}/policy-applications`), y son campos DISTINTOS:
// no técnicos/comerciales sino consentimientos legales del tomador.
//
// Confirmado por Juan Manuel Fernández (Product Manager API Codeoscopic, correo
// del 17/09/2026, proyecto 40685793): el 500 «Unknown error while waiting for
// the operation to complete» de dos Submits reales (13/09/2026, 06:27 y 14:41
// UTC) NO era un fallo del vendor — nuestro cuerpo no incluía este bloque en
// absoluto: `[{ quote: { id }, payment: { bankAccount: { iban } } }]`. Adjuntó
// captura del formulario de Allianz con los 4 campos marcados obligatorios y
// dijo explícitamente que hay que enviar un valor «aunque visualmente tenga un
// valor por defecto que es NO».
//
// Los 4 en `false`: es el valor por defecto que el propio formulario de Allianz
// enseña, y ninguno se decide a favor del cliente sin que él lo diga — ni family
// (no hay dato para afirmar que SÍ hay un familiar asegurado en Allianz) ni los
// tres consentimientos de marketing/perfilado (opt-out es el default seguro:
// nunca se firma un consentimiento comercial en su nombre).
const ALLIANZ_SUBMIT_CONSENTIMIENTOS: OpcionProducto[] = [
  { id: 'insuredFamilyInAllianz', type: 'boolean', value: false },
  { id: 'publicityConsent', type: 'boolean', value: false },
  { id: 'allianzGroupProductsConsent', type: 'boolean', value: false },
  { id: 'commercialProfilingConsent', type: 'boolean', value: false },
]

/**
 * Opciones por defecto para `product.options` en el SUBMIT (no en el ReRate:
 * ver `opcionesPorDefecto` de arriba). `null` si no hay catálogo — hoy solo
 * Allianz AUTO tiene esta captura (los 4 consentimientos son del formulario de
 * Allianz auto; en moto/hogar no hay captura, así que no se firma nada por defecto).
 * Sin ramo se asume auto, como `opcionesPorDefecto`.
 */
export function opcionesEmisionPorDefecto(compania: string, ramo: string | null = 'auto'): OpcionProducto[] | null {
  if ((ramo ?? 'auto') !== 'auto') return null
  const c = compania.trim().toLowerCase()
  if (c.includes('allianz')) return ALLIANZ_SUBMIT_CONSENTIMIENTOS.map((o) => ({ ...o }))
  return null
}

/**
 * Añade `product.options` por defecto a `campos` (el cuerpo del Submit) SOLO
 * si nadie ya puso un `product` — el JSON avanzado del corredor manda sobre
 * cualquier default. Puro y testeable aparte de la ruta: la ruta solo llama.
 *
 * `opts.familiaAllianz`: 17/09/2026, Alberto — `insuredFamilyInAllianz` NO es
 * un consentimiento a secas, es una pregunta con DESCUENTO detrás (bonificación
 * de cartera si el tomador ya tiene familiares asegurados en Allianz). Por eso
 * el default sigue en `false` (no hay dato para afirmar que SÍ los tiene: no
 * se inventa un ahorro que no se ha comprobado) pero el corredor puede marcarlo
 * explícitamente cuando SÍ lo sabe, sin tener que pegar el JSON `product`
 * completo a mano.
 */
export function conProductoPorDefecto(
  campos: Record<string, unknown>,
  compania: string,
  opts?: { familiaAllianz?: boolean; ramo?: string | null },
): Record<string, unknown> {
  if (typeof campos.product === 'object' && campos.product !== null && !Array.isArray(campos.product)) {
    return campos
  }
  const base = opcionesEmisionPorDefecto(compania, opts?.ramo)
  if (!base) return campos
  const opciones = opts?.familiaAllianz
    ? base.map((o) => (o.id === 'insuredFamilyInAllianz' ? { ...o, value: true } : o))
    : base
  return { ...campos, product: { options: opciones } }
}
