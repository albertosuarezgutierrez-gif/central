// Ajuste RLS por transacción: el ÚNICO camino de LECTURA a las tablas del schema `herramientas` (patrón conEmpresa de contabilidad).
// Las políticas de 0001 llaman a `herramientas.es_miembro()`, que lee `current_setting('herramientas.persona_id', true)`. Aquí se
// fija con `set_config(..., true)` (LOCAL a la transacción: con pgbouncer en modo transacción no se filtra a otra petición).
// Falla CERRADO: sin personaId válido lanza y no abre transacción; sin pasar por aquí, RLS devuelve cero filas.
// Las funciones de la persona (firmar_version, dar_acceso, registrar_traspaso) también leen ese ajuste: se llaman DENTRO.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class SinPersonaError extends Error {
  constructor(motivo: string) {
    super(`Sin persona: ${motivo}`)
    this.name = 'SinPersonaError'
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

export type ConPersona<Tx = TxSql> = <R>(personaId: unknown, fn: (tx: Tx) => Promise<R>, opciones?: OpcionesTx) => Promise<R>

export function esUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

export function crearConPersona<Tx extends Pick<TxSql, '$queryRaw'>>(cliente: ClienteConTx<Tx>): ConPersona<Tx> {
  return async (personaId, fn, opciones) => {
    if (!esUuid(personaId)) throw new SinPersonaError('falta la persona o no es un uuid')
    const id = personaId.toLowerCase()
    return cliente.$transaction(async (tx) => {
      const filas = (await tx.$queryRaw`SELECT set_config('herramientas.persona_id', ${id}, true) AS v`) as
        | Array<{ v?: unknown }>
        | undefined
      // Si el ajuste no quedó puesto, nada de lo que siga sería de la empresa correcta: se aborta.
      if (!Array.isArray(filas) || filas[0]?.v !== id) throw new SinPersonaError('el ajuste de sesión no se aplicó')
      return fn(tx)
    }, opciones)
  }
}
