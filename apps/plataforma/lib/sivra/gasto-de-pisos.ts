// Qué filas de `gastos` cuentan como GASTO DE LOS PISOS en el resumen del negocio SIVRA.
//
// 🚨 Caso fundacional (29/08/2026). `getResumenSivra(anio)` sumaba, sin propertyId,
// `SELECT SUM(total) FROM gastos WHERE año = X` — a secas. Dos agujeros en la misma consulta:
//
// 1. **No filtraba `revisado`**, así que lo que está en la BANDEJA esperando a que Alberto lo
//    confirme ya contaba como gasto contabilizado. Eso convierte «pendiente de revisar» en una
//    afirmación, que es justo lo que la bandeja existe para no hacer. Ese día había dentro:
//    3.300.000 € + 33.000 € de la reserva del edificio de C/ San Luis 9 (dos documentos del
//    MISMO contrato leídos como dos facturas, y encima a nombre de «SAN LUIS 9 CB», que no es
//    ninguno de los titulares) y el Modelo 200 de 2025 TRIPLICADO. El resumen de SIVRA daba
//    **3.372.460,28 €** de gasto en 2026 contra **13.755,66 €** reales.
//
// 2. **No filtraba la propiedad**, así que sumaba también lo que no es de los pisos: la
//    correduría (IONOS, Vercel, Anthropic…) y lo personal, ambos con `propiedad` NULL o
//    `prop_personal`. El numerador de esa card sale de `incomes`, que es SOLO pisos, así que el
//    denominador tenía que serlo también. Se destapó al importar el histórico de IONOS (55
//    facturas de la correduría con `propiedad = NULL`): habrían aterrizado en el gasto de SIVRA.
//
// `prop_multi_apartamentos` SÍ entra: es gasto compartido de los pisos (lavandería, internet…),
// deducible y de ellos, aunque no aterrice en ninguno concreto. Solo el P&L POR PISO lo excluye
// (`lib/sivra/pl-mensual.ts`), porque ahí sí hace falta saber de cuál es.
//
// Módulo PURO (sin imports ni Prisma) para poder testearlo con `node --test`.

/**
 * Valores de `gastos.propiedad` que NO son de los pisos turísticos.
 * `NULL` queda fuera aparte (SQL no lo compara con `NOT IN`), y es el caso más común: es lo que
 * llevan los gastos de la correduría.
 */
export const PROPIEDADES_NO_PISOS = ['prop_personal', ''] as const

export interface FilaGasto {
  propiedad?: string | null
  revisado?: boolean | null
}

/**
 * ¿Esta fila cuenta como gasto de los pisos turísticos?
 *
 * Tres estados colapsados a uno a propósito: `revisado = false` («aún no lo he mirado») y
 * `revisado = null` («no consta») valen los dos como NO contabilizado. Al revés sería afirmar
 * un gasto que nadie ha confirmado.
 */
export function esGastoDePisos(f: FilaGasto): boolean {
  if (f.revisado !== true) return false
  const p = f.propiedad
  if (p == null) return false
  return !(PROPIEDADES_NO_PISOS as readonly string[]).includes(p)
}

/**
 * La MISMA condición, en SQL, para el `WHERE` de `getResumenSivra`.
 *
 * Se devuelve como texto (no como `Prisma.sql`) para que este módulo siga siendo puro; va a
 * `Prisma.raw`, y puede: no interpola NADA de fuera, solo las constantes de este archivo.
 */
export function sqlGastoDePisos(alias = ''): string {
  const c = alias ? `${alias}.` : ''
  const lista = PROPIEDADES_NO_PISOS.map((p) => `'${p}'`).join(', ')
  return `${c}revisado = true AND ${c}propiedad IS NOT NULL AND ${c}propiedad NOT IN (${lista})`
}
