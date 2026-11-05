// Libros para legalizar y cuentas anuales exportables: lee del ejercicio y devuelve la `TablaLibro` pedida (a CSV / HTML imprimible → PDF).
// SOLO EXPORTACIÓN: no se legaliza ni se deposita nada. Un libro con más asientos de los que caben se RECHAZA (un libro incompleto no sirve para legalizar).
import { libroCuentasAnuales, libroDiarioLegal, libroInventarios, SEMILLA_PGC_PYMES, type TablaLibro } from '@central/module-contabilidad'
import type { RepoContable } from './repo.ts'
import { LIMITE_ASIENTOS_LIBRO, type RepoF5 } from './repo-f5.ts'
import { cuentasAnuales } from './cierre.ts'

export const LIBROS = ['libro-diario', 'inventario-apertura', 'balances-comprobacion', 'inventario-cierre', 'balance-abreviado', 'balance-abreviado-pasivo', 'pyg-abreviada'] as const
export type ClaveLibro = (typeof LIBROS)[number]
export const esClaveLibro = (v: unknown): v is ClaveLibro => typeof v === 'string' && (LIBROS as readonly string[]).includes(v)

export async function tablaDeLibro(repo: RepoContable, f5: RepoF5, anio: number, clave: ClaveLibro): Promise<{ ok: true; tabla: TablaLibro } | { ok: false; error: string }> {
  const empresa = await repo.empresa()
  const nombreEmpresa = `${empresa?.razonSocial ?? 'Empresa'}${empresa?.nif ? ` · NIF ${empresa.nif}` : ''}`
  if (clave === 'balance-abreviado' || clave === 'balance-abreviado-pasivo' || clave === 'pyg-abreviada') {
    const ca = await cuentasAnuales(repo, f5, anio)
    if (!ca) return { ok: false, error: `no existe el ejercicio ${anio}` }
    const t = libroCuentasAnuales(ca.balance, ca.pyg, { anio, empresa: nombreEmpresa }).find((x) => x.clave === clave)
    return t ? { ok: true, tabla: t } : { ok: false, error: 'libro desconocido' }
  }
  if (!(await repo.ejercicio(anio))) return { ok: false, error: `no existe el ejercicio ${anio}` }
  const { asientos, truncado } = await f5.asientosEjercicio(anio, LIMITE_ASIENTOS_LIBRO)
  if (truncado) return { ok: false, error: `el ejercicio tiene más de ${LIMITE_ASIENTOS_LIBRO} asientos: el libro saldría incompleto y no sirve para legalizar` }
  const nombres: Record<string, string> = Object.fromEntries(SEMILLA_PGC_PYMES.map(([c, n]) => [c, n]))
  for (const c of await repo.planCuentas()) nombres[c.codigo] = c.nombre
  if (clave === 'libro-diario') return { ok: true, tabla: libroDiarioLegal(asientos, nombres, { anio, empresa: nombreEmpresa }) }
  const t = libroInventarios(asientos, nombres, { anio, empresa: nombreEmpresa }).find((x) => x.clave === clave)
  return t ? { ok: true, tabla: t } : { ok: false, error: 'libro desconocido' }
}
