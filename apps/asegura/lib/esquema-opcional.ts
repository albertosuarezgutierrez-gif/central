// Tolerancia a esquema NO migrado (08/10/2026). El código de #4458 salió antes que sus SQL; esto deja que
// las columnas/tabla nuevas sean OPCIONALES: se comprueba si existen (cache con TTL, para que al aplicar el SQL
// se active solo) y, si no, se cae al comportamiento anterior.
// 🔒 Solo para cosas ADITIVAS de trazabilidad/antiduplicado. NUNCA para relajar la reserva en libro ni los topes.
// Fail-closed al revés: si la comprobación falla, se asume «no existe» (comportamiento previo, el seguro).
// Puro e inyectable (sin BD): la instancia real está en `esquema-bd.ts`.

export type ElementoEsquema = { tipo: 'columna'; tabla: string; columna: string } | { tipo: 'tabla'; tabla: string }

export const TTL_ESQUEMA_MS = 5 * 60_000
/** Si la comprobación falla se reintenta pronto (no 5 min) para no tardar en activarse. */
export const TTL_FALLO_MS = 30_000

export type DepsEsquema = {
  /** Consulta real; debe devolver true/false o lanzar. */
  consultar: (e: ElementoEsquema) => Promise<boolean>
  ahora?: () => number
  ttlMs?: number
  ttlFalloMs?: number
}

export function crearEsquemaOpcional(deps: DepsEsquema) {
  const ahora = deps.ahora ?? Date.now
  const ttl = deps.ttlMs ?? TTL_ESQUEMA_MS
  const ttlFallo = deps.ttlFalloMs ?? TTL_FALLO_MS
  const cache = new Map<string, { valor: boolean; hasta: number }>()

  async function existe(e: ElementoEsquema): Promise<boolean> {
    const k = e.tipo === 'tabla' ? `t:${e.tabla}` : `c:${e.tabla}.${e.columna}`
    const hit = cache.get(k)
    const t = ahora()
    if (hit && hit.hasta > t) return hit.valor
    try {
      const valor = (await deps.consultar(e)) === true
      cache.set(k, { valor, hasta: t + ttl })
      return valor
    } catch {
      cache.set(k, { valor: false, hasta: t + ttlFallo })
      return false
    }
  }

  return {
    existeColumna: (tabla: string, columna: string) => existe({ tipo: 'columna', tabla, columna }),
    existeTabla: (tabla: string) => existe({ tipo: 'tabla', tabla }),
    limpiar: () => cache.clear(),
  }
}
