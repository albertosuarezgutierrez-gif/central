// Vigía de DUPLICADOS VIVOS (03/10/2026): grupos de 2+ filas de `seguros.polizas` sin fusionar
// (`merged_into_poliza_id IS NULL`) con el mismo número de póliza normalizado y la misma compañía
// (código DGS o, si falta, nombre de la aseguradora; el cajón 'LEGACY' del volcado = compañía
// desconocida: ese grupo solo cuenta si las filas son del MISMO cliente, porque el mismo número en
// clientes distintos sin compañía no es evidencia). No se cubre «volcado sin compañía frente a fila con
// DGS»: exigiría cruzar grupos y no es barato. Los comodines
// (`esNumeroPolizaComodin`: vacío, PENDIENTE, 0, 1, S/N…) NO entran: no identifican nada.
//
// Solo lectura, sin nombres ni DNI: número, nº de filas y compañía. La normalización de SQL replica
// `normalizarNumeroPoliza` de `@central/module-seguros` (mayúsculas, sin espacios ni `-./`, sin ceros
// a la izquierda); el test `cartera-duplicados.test.ts` ata las dos listas de comodines.

import type { DuplicadosVivos } from '@central/module-seguros'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'

export const TOPE_MUESTRA_DUPLICADOS = 50

/** Mismos comodines que `esNumeroPolizaComodin` (sobre el número YA normalizado). */
export const COMODINES_SQL = ['', 'PENDIENTE', 'NOSE', 'NOSABE', '0', '1', 'SN', 'SINNUMERO', 'NOLOSE', '12345', '5'] as const

/** `null` = no se pudo leer (no es «no hay ninguno»). */
export async function duplicadosVivos(correduriaId: string): Promise<DuplicadosVivos | null> {
  if (!aseguraConfigurada()) return null
  const db = prismaAsegura()
  try {
    const filas = await db.$queryRaw<{ numero: string; filas: number; dgs: string | null; total: number }[]>`
      with norm as (
        select regexp_replace(
                 regexp_replace(upper(translate(coalesce(p.numero_poliza, ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')), '[[:space:]./-]', '', 'g'),
                 '^0+(?=[0-9])', '') as numero,
               p.cliente_id,
               nullif(upper(btrim(coalesce(p.codigo_entidad_dgs, ''))), '') as dgs,
               nullif(regexp_replace(upper(translate(coalesce(p.aseguradora, ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')), '[^A-Z0-9]', '', 'g'), '') as aseg
        from polizas p
        where p.correduria_id = ${correduriaId}::uuid
          and p.merged_into_poliza_id is null
      ), clave as (
        -- compañía = DGS, o el nombre normalizado; 'LEGACY' es el cajón del volcado: «no se sabe» (NULL)
        select numero, cliente_id, dgs, coalesce(dgs, nullif(aseg, 'LEGACY')) as cia from norm
      ), grupos as (
        select numero, cia, max(dgs) as dgs, count(*)::int as filas
        from clave
        where numero <> all(${[...COMODINES_SQL]}::text[])
        group by numero, cia
        having count(*) >= 2
           -- compañía desconocida: solo cuenta si TODAS son del mismo cliente (otro cliente ≠ evidencia)
           and (cia is not null or count(distinct cliente_id) = 1)
      )
      select numero, filas, dgs, (count(*) over ())::int as total
      from grupos
      order by filas desc, numero, cia nulls first
      limit ${TOPE_MUESTRA_DUPLICADOS}`
    // Sin filas = se miró y no hay ninguno (la consulta no falló).
    return {
      total: filas[0]?.total ?? 0,
      muestra: filas.map((f) => ({ numero: f.numero, filas: f.filas, dgs: f.dgs })),
    }
  } catch {
    return null
  }
}
