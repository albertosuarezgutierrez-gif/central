// Ajuste RLS por transacción: el ÚNICO camino a las tablas de negocio del schema `contabilidad`.
//
// Las políticas de 0001_schema_contabilidad.sql comparan `empresa_id` con `contabilidad.empresa_actual()`, que lee
// `current_setting('contabilidad.empresa_id', true)`. Aquí se fija con `set_config(..., true)` (LOCAL a la transacción: con
// pgbouncer en modo transacción no se filtra a otra petición). Un gestor con N empresas abre UNA transacción por empresa.
//
// Falla CERRADO por dos lados:
//   · sin empresaId válido (no uuid) → lanza `SinEmpresaError` y no abre transacción;
//   · si alguien consulta con el cliente global SIN pasar por aquí → RLS devuelve cero filas / rechaza el INSERT.
// PURO respecto a Prisma (solo tipos): el cliente real se inyecta en lib/db.ts; los tests usan un fake.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class SinEmpresaError extends Error {
  constructor(motivo: string) {
    super(`Sin empresa: ${motivo}`)
    this.name = 'SinEmpresaError'
  }
}

export type OpcionesTx = { timeout?: number; maxWait?: number }

/** Lo mínimo de una transacción Prisma que usa la app: SQL con plantilla (parámetros enlazados, nunca concatenados). */
export type TxSql = {
  $queryRaw<T = unknown>(consulta: TemplateStringsArray, ...valores: unknown[]): Promise<T>
  $executeRaw(consulta: TemplateStringsArray, ...valores: unknown[]): Promise<number>
}

export type ClienteConTx<Tx> = {
  $transaction<R>(fn: (tx: Tx) => Promise<R>, opciones?: OpcionesTx): Promise<R>
}

export type ConEmpresa<Tx = TxSql> = <R>(empresaId: unknown, fn: (tx: Tx) => Promise<R>, opciones?: OpcionesTx) => Promise<R>

export function esUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

export function crearConEmpresa<Tx extends Pick<TxSql, '$queryRaw'>>(cliente: ClienteConTx<Tx>): ConEmpresa<Tx> {
  return async (empresaId, fn, opciones) => {
    if (!esUuid(empresaId)) throw new SinEmpresaError('falta la empresa o no es un uuid')
    const id = empresaId.toLowerCase()
    return cliente.$transaction(async (tx) => {
      const filas = (await tx.$queryRaw`SELECT set_config('contabilidad.empresa_id', ${id}, true) AS v`) as
        | Array<{ v?: unknown }>
        | undefined
      // Si el ajuste no quedó puesto, nada de lo que siga sería de la empresa correcta: se aborta.
      if (!Array.isArray(filas) || filas[0]?.v !== id) throw new SinEmpresaError('el ajuste de sesión no se aplicó')
      return fn(tx)
    }, opciones)
  }
}
