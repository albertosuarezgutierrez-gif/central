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

const ALLIANZ_AUTO_320200: OpcionProducto[] = [
  { id: 'dtoCap', type: 'number', value: 25 },
  { id: 'dtoVentaCruzada', type: 'number', value: 25 },
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

/**
 * Opciones por defecto para una compañía, por nombre (contains normalizado,
 * como `encontrarPrecio`). `null` si no hay catálogo para ella — hoy es TODO
 * salvo Allianz auto: ni el resto de compañías ni moto/hogar tienen captura,
 * así que el caller manda `[]` (comportamiento igual que hasta ahora, y el
 * vendor lo dirá con su propio 400 real si le hace falta algo).
 */
export function opcionesPorDefecto(compania: string): OpcionProducto[] | null {
  const c = compania.trim().toLowerCase()
  // Copia defensiva: el array de arriba es un módulo compartido entre invocaciones
  // (proceso Node reutilizado en serverless) — devolver la misma referencia dejaría
  // una mutación accidental del caller filtrarse a la siguiente petición.
  if (c.includes('allianz')) return ALLIANZ_AUTO_320200.map((o) => ({ ...o }))
  return null
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
 * Allianz auto tiene esta captura.
 */
export function opcionesEmisionPorDefecto(compania: string): OpcionProducto[] | null {
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
  opts?: { familiaAllianz?: boolean },
): Record<string, unknown> {
  if (typeof campos.product === 'object' && campos.product !== null && !Array.isArray(campos.product)) {
    return campos
  }
  const base = opcionesEmisionPorDefecto(compania)
  if (!base) return campos
  const opciones = opts?.familiaAllianz
    ? base.map((o) => (o.id === 'insuredFamilyInAllianz' ? { ...o, value: true } : o))
    : base
  return { ...campos, product: { options: opciones } }
}
