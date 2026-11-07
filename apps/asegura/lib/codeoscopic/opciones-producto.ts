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

// 07/11/2026 (decisión de Alberto): el ReRate YA NO manda descuentos comerciales por defecto. Codeoscopic
// confirmó que las «afinaciones» que Alberto configura en el panel de Avant2 solo se aplican si el valor NO
// se envía. El descuento MANUAL de un cliente concreto sí se manda (`conDescuentos`, con el catálogo
// `descuentosAdmitidos` de qué id admite cada compañía/ramo). Antes (29/09/2026) se mandaba 50.

const ALLIANZ_AUTO_320200: OpcionProducto[] = [
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

// Descuentos que admite cada (compañía, ramo) — ids = `name` del campo del formulario real de Avant2
// (moto/hogar leídos el 03/10/2026). Solo se mandan si el corredor los pide; `comissionType` NO jamás.
// Allianz: dtoCap + dtoVentaCruzada. Generali: commercialDiscountNumber (auto: mismo id, sin captura propia).
// PENDIENTE: Occident (`commercialDiscount` moto, `discount` hogar) y Fidelidade (`discount` hogar).
const DESCUENTOS_ALLIANZ = ['dtoCap', 'dtoVentaCruzada']
const DESCUENTOS_GENERALI = ['commercialDiscountNumber']

/** Ids de descuento que admite la compañía en ese ramo (`[]` si ninguno). Sin ramo se asume auto. */
export function descuentosAdmitidos(compania: string, ramo: string | null = 'auto'): string[] {
  const r = ramo ?? 'auto'
  if (r !== 'auto' && r !== 'moto' && r !== 'hogar') return []
  const c = compania.trim().toLowerCase()
  if (c.includes('allianz')) return [...DESCUENTOS_ALLIANZ]
  if (c.includes('generali')) return [...DESCUENTOS_GENERALI]
  return []
}

/**
 * Opciones por defecto para una compañía, por nombre (contains normalizado,
 * como `encontrarPrecio`). `null` si no hay catálogo para ella — hoy es TODO
 * salvo Allianz auto: ni el resto de compañías ni moto/hogar tienen captura,
 * así que el caller manda `[]` (comportamiento igual que hasta ahora, y el
 * vendor lo dirá con su propio 400 real si le hace falta algo).
 */
export function opcionesPorDefecto(compania: string, ramo: string | null = 'auto'): OpcionProducto[] | null {
  // Por (compañía, RAMO): las 12 de Allianz son del producto de AUTO 320200. Mandárselas al ReRate
  // de Allianz Motos sería declarar opciones de otro producto (auditoría 23/09/2026). Sin ramo = auto.
  // Nunca incluye descuentos (07/11/2026): ver cabecera de descuentosAdmitidos.
  const r = ramo ?? 'auto'
  const c = compania.trim().toLowerCase()
  // Copia defensiva: el array es un módulo compartido entre invocaciones (proceso Node reutilizado).
  if (r === 'auto' && c.includes('allianz')) return ALLIANZ_AUTO_320200.map((o) => ({ ...o }))
  return null
}

/**
 * PURO. Las opciones de producto del ReRate: las que el vendor devolvió para ESE precio (`delVendor`),
 * tal cual (07/11/2026: ya no se fuerza ningún descuento, ni en Generali auto), y si no hay, el catálogo.
 */
export function opcionesParaReRate(delVendor: unknown, compania: string, ramo: string | null = 'auto'): unknown {
  if (delVendor == null) return opcionesPorDefecto(compania, ramo)
  return delVendor
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
 * PURO. Aplica los descuentos pedidos a las opciones que irán en el ReRate. Si el campo ya viene en
 * `base`, lo pisa. Si no viene: con origen `'catalogo'` y `destino` (compañía + ramo) que lo admite, lo
 * AÑADE como number (07/11/2026: el catálogo ya no lo trae por defecto); si no lo admite, reparo (meter un
 * `dtoCap` en otra compañía sería declarar un campo de otro producto). Con `'formulario'` nunca se
 * inventa un id. Devuelve una copia; nunca muta la entrada.
 */
export function conDescuentos(
  base: unknown,
  pedidos: DescuentosPedidos,
  origen: 'catalogo' | 'formulario' = 'catalogo',
  destino?: { compania: string; ramo: string | null },
): { ok: true; opciones: unknown[] } | { ok: false; motivo: string } {
  const lista = (Array.isArray(base) ? base : []).map((o) => (o && typeof o === 'object' ? { ...(o as Record<string, unknown>) } : o))
  for (const [id, pct] of Object.entries(pedidos)) {
    const o = lista.find((x) => x && typeof x === 'object' && (x as { id?: unknown }).id === id) as Record<string, unknown> | undefined
    if (!o && origen === 'catalogo' && destino && descuentosAdmitidos(destino.compania, destino.ramo).includes(id)) {
      lista.push({ id, type: 'number', value: pct })
      continue
    }
    if (!o) {
      return {
        ok: false,
        motivo: origen === 'formulario'
          ? `el formulario de la compañía no trae «${id}»: ajusta el descuento dentro del formulario`
          : `esta compañía no admite «${id}» en el ReRate (solo Allianz y Generali lo tienen catalogado)`,
      }
    }
    // Respeta el tipo con el que venía el campo (el formulario del vendor puede mandarlo como texto).
    o!.value = typeof o!.value === 'string' ? String(pct) : pct
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
