// Ajuste RLS por transacción: el ÚNICO camino a la BD del schema `taller`.
//
// Las políticas de 0001_schema_taller.sql comparan `taller_id` con `taller.taller_actual()`, que lee
// `current_setting('taller.taller_id', true)`. Aquí se fija con `set_config(..., true)` (LOCAL a la
// transacción: con pgbouncer en modo transacción no se filtra a la siguiente petición de otra conexión).
//
// Falla CERRADO por dos lados:
//   · sin tallerId válido (no uuid) → lanza `SinTallerError` y no abre transacción;
//   · si alguien consulta con el cliente global SIN pasar por aquí → RLS devuelve cero filas / rechaza el INSERT.
// PURO respecto a Prisma (solo tipos): el cliente real se inyecta en lib/db.ts; los tests usan un fake.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class SinTallerError extends Error {
  constructor(motivo: string) {
    super(`Sin taller: ${motivo}`)
    this.name = 'SinTallerError'
  }
}

export type OpcionesTx = { timeout?: number; maxWait?: number }

/** Lo mínimo que se usa de una transacción Prisma para el ajuste. */
export type TxConRaw = {
  $queryRaw(consulta: TemplateStringsArray, ...valores: unknown[]): Promise<unknown>
}

export type ClienteConTx<Tx> = {
  $transaction<R>(fn: (tx: Tx) => Promise<R>, opciones?: OpcionesTx): Promise<R>
}

export type ConTaller<Tx> = <R>(tallerId: unknown, fn: (tx: Tx) => Promise<R>, opciones?: OpcionesTx) => Promise<R>

export function esTallerId(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

export function crearConTaller<Tx extends TxConRaw>(cliente: ClienteConTx<Tx>): ConTaller<Tx> {
  return async (tallerId, fn, opciones) => {
    if (!esTallerId(tallerId)) throw new SinTallerError('falta el taller o no es un uuid')
    return cliente.$transaction(async (tx) => {
      const filas = (await tx.$queryRaw`SELECT set_config('taller.taller_id', ${tallerId}, true) AS v`) as
        | Array<{ v?: unknown }>
        | undefined
      // Si el ajuste no quedó puesto, nada de lo que siga sería del taller correcto: se aborta.
      if (!Array.isArray(filas) || filas[0]?.v !== tallerId) throw new SinTallerError('el ajuste de sesión no se aplicó')
      return fn(tx)
    }, opciones)
  }
}
