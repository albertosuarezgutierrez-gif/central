// Filtro `?familia=` de «Mis seguros» (26/10/2026): el destino de las tarjetas de Inicio. PURO.
//
// 🚨 Es una VISTA, no un permiso: el valor de la URL solo elige qué filas se enseñan de lo que la sesión ya puede ver;
// nunca entra en una consulta. Un valor fuera de la lista (o repetido, o vacío) = sin filtro, nunca un error ni una
// lista vacía. La familia se decide con la MISMA regla que las tarjetas (`familiaSeguro`: el titular jurídico manda).
import { FAMILIAS_SEGURO, familiaSeguro, type FamiliaSeguro } from '@central/module-seguros-portal'

export function familiaDeParametro(v: string | string[] | undefined): FamiliaSeguro | null {
  return typeof v === 'string' && (FAMILIAS_SEGURO as readonly string[]).includes(v) ? (v as FamiliaSeguro) : null
}

export function enFamilia(ramo: string | null | undefined, empresa: boolean, familia: FamiliaSeguro | null): boolean {
  return familia === null || familiaSeguro(ramo, empresa).familia === familia
}

/** Los titulares con SOLO las pólizas de la familia (sin familia = los mismos, sin tocar). */
export function titularesDeFamilia<T extends { tipoPersona: string; polizas: { ramo: string | null }[] }>(
  titulares: readonly T[],
  familia: FamiliaSeguro | null,
): T[] {
  if (familia === null) return [...titulares]
  return titulares.map((t) => ({ ...t, polizas: t.polizas.filter((p) => enFamilia(p.ramo, t.tipoPersona === 'juridica', familia)) }))
}
