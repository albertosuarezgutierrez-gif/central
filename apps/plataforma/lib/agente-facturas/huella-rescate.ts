// Rescatar la HUELLA de las facturas que se guardaron sin ella.
//
// Caso fundacional (29/08/2026). Alberto, sobre una factura que la bandeja presentaba como
// «SOCORRO · sin histórico»: «esto realmente es Giraldillo lavandería, que ya he dado ok a
// varias… tiene el agente que aprender». Y no aprendía, pero no por lo que parecía.
//
// `confirmarPendiente` solo refuerza la regla `if (fila.fingerprint)`. En `gastos` había **47
// filas ya revisadas sin `fingerprint`** (13.267,14 €): todo lo entrado por `banco-conciliado`,
// `manual` y las antiguas sin `origen`. Entre ellas, las CINCO facturas de Lavandería El
// Giraldillo que Alberto ya había aprobado. Cinco decisiones suyas que el sistema tiró.
//
// 🚨 Y el rescate obvio —«pon la huella del nombre del proveedor»— era una trampa: 28 de esas 47
// filas tienen `proveedor = 'Importado'`, un CENTINELA, no un nombre. Normalizarlo habría dado la
// misma huella `'importado'` a TotalEnergies, EMASESA, DIGI, PriceLabs, Petroprix y Si Que Brilla:
// seis proveedores distintos convertidos en uno, con la regla de cualquiera imputando las
// facturas de los demás. Es el «no lo sé disfrazado de valor» que el CLAUDE.md raíz documenta con
// el `'otro'` de `subastas.tipo_bien` (PRs #1266→#1268), aquí a punto de repetirse.
//
// En esas filas el proveedor REAL vive en el concepto, delante del guion:
//   «TotalEnergies Electricidad y Gas España S.A.U. - Electricidad Calle Socorro 24 (32 días…)»
//
// Módulo PURO (sin imports ni BD) para poder testearlo con `node --test`.

/**
 * Valores que el corpus usa como «no se supo leer el proveedor». NO son nombres: normalizarlos
 * fusionaría proveedores distintos bajo la misma huella.
 */
export const PROVEEDORES_CENTINELA = new Set(['importado', 'desconocido', 'sin proveedor', 'n/a', 'otro', ''])

export function esCentinela(proveedor?: string | null): boolean {
  return PROVEEDORES_CENTINELA.has((proveedor ?? '').trim().toLowerCase())
}

/**
 * Saca el nombre del proveedor del principio del concepto: el corpus importado lo escribe como
 * «PROVEEDOR - descripción». Devuelve `null` si no encuentra esa forma — es mejor quedarse sin
 * huella que inventarse una, porque una huella equivocada AGRUPA, y agrupar mal propaga reglas.
 */
export function proveedorDesdeConcepto(concepto?: string | null): string | null {
  const c = (concepto ?? '').trim()
  if (!c) return null

  // Se exige el separador « - » con espacios: un guion pegado suele ser parte del nombre
  // («TotalEnergies-Gas») o de un código de factura, no un separador de campos.
  const i = c.indexOf(' - ')
  if (i <= 0) return null

  const nombre = c.slice(0, i).trim()
  // Un «proveedor» de una palabra corta o puramente numérico no es un nombre fiable.
  if (nombre.length < 4) return null
  if (!/[a-zá-úñ]/i.test(nombre)) return null
  return nombre
}

/**
 * Qué proveedor usar para calcular la huella de una fila.
 *
 * Devuelve `null` cuando no hay ninguno fiable: esa fila se queda SIN huella a propósito, que es
 * el estado honesto («no se sabe de quién es») y el que ya tenía. Rellenarla con un valor de
 * relleno la haría agrupar con otras que no le corresponden.
 */
export function proveedorParaHuella(f: {
  proveedor?: string | null
  concepto?: string | null
}): string | null {
  if (!esCentinela(f.proveedor)) {
    const p = (f.proveedor ?? '').trim()
    return p.length >= 3 ? p : null
  }
  return proveedorDesdeConcepto(f.concepto)
}
