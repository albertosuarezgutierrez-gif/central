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
  if (c.includes('allianz')) return ALLIANZ_AUTO_320200
  return null
}
