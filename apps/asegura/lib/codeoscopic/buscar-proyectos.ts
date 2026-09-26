// Busca en Codeoscopic los proyectos de un tomador por su DNI (26/09/2026). Para traer el PDF de una
// póliza emitida en Avant2 cuando nadie sabe el nº de proyecto (Alberto: «¿no puede buscar por
// matrícula, DNI del tomador o algo?»). `GET /insurances?holderIdentification=` es gratis; la de
// matrícula (`GET /vehicles`) consume créditos y no devuelve proyectos, así que no sirve aquí.
// El rango de fechas es obligatorio y como mucho de un año (docs/CODEOSCOPIC-API-REFERENCIA-2026-09.md).
import type { ConfigCodeoscopic } from './config.ts'
import { peticion } from './cliente.ts'

export const normalizarDni = (v: string) => v.replace(/[^0-9A-Za-z]/g, '').toUpperCase()

const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Ids de proyecto de una respuesta de búsqueda. `null` = forma desconocida (NO «no hay ninguno»):
 * la doc no fija el sobre, así que se aceptan array suelto o `{ items | results | data | content }`.
 */
export function idsDeBusqueda(raw: unknown): string[] | null {
  const lista = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? (['items', 'results', 'data', 'content'].map((k) => (raw as Record<string, unknown>)[k]).find(Array.isArray) as unknown[] | undefined)
      : undefined
  if (!lista) return raw === null ? [] : null
  const ids: string[] = []
  for (const x of lista) {
    const id = x && typeof x === 'object' ? (x as Record<string, unknown>).id : undefined
    if (typeof id === 'string' || typeof id === 'number') ids.push(String(id))
  }
  return [...new Set(ids)]
}

export async function proyectosDelTomador(config: ConfigCodeoscopic, dni: string, hoy = new Date()): Promise<string[]> {
  const desde = new Date(hoy.getTime() - 364 * 86_400_000)
  const q = new URLSearchParams({
    holderIdentification: normalizarDni(dni),
    fromDate: iso(desde),
    toDate: iso(hoy),
    policyApplicationSubmitted: 'true',
    pageSize: '100',
  })
  const raw = await peticion(config, { metodo: 'GET', path: `/insurances?${q}`, timeoutMs: config.timeoutGenericoMs })
  const ids = idsDeBusqueda(raw)
  if (!ids) throw new Error('la búsqueda de Codeoscopic devolvió una forma desconocida')
  return ids
}
