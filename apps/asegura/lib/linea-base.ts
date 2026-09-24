// Línea base semanal (§N.2 de ASegura OS): recuento por semana (lunes de Madrid) de lo que entra y
// de lo que se hace a mano en la cartera. Solo LEE. El correo lo cuenta plataforma, que es quien lo
// tiene; aquí van las series de la cartera (`fuente: 'asegura'` en `SERIES_LINEA_BASE`).
import type { SerieLineaBase } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'

export type ConteosLineaBase = Partial<Record<SerieLineaBase, Record<string, number>>>

type Fila = { serie: SerieLineaBase; semana: string; n: number }

/**
 * `auditoria` no lleva `correduria_id`: hoy hay una sola correduría y el puerto es suyo. Solo cuenta
 * escrituras que salieron bien (`estado_http < 400`): un intento rechazado no es trabajo hecho.
 * «A mano» = actor humano; lo demás (crons, plataforma, portal) es el sistema.
 */
export async function conteosLineaBase(correduriaId: string, desde: Date): Promise<ConteosLineaBase> {
  const filas = await prismaAsegura().$queryRaw<Fila[]>`
    with s as (
      select case when actor_tipo = 'humano' then 'a_mano' else 'automaticas' end as serie, created_at as t
        from auditoria where created_at >= ${desde} and metodo <> 'GET' and estado_http < 400
      union all
      select 'aprobaciones_pedidas', created_at from aprobacion
        where correduria_id = ${correduriaId}::uuid and created_at >= ${desde}
      union all
      select 'aprobaciones_decididas', decidida_at from aprobacion
        where correduria_id = ${correduriaId}::uuid and decidida_at >= ${desde}
          and decidida_por is not null and decidida_por not like 'sistema:%'
      union all
      select 'documentos_recibidos', created_at from documentos
        where correduria_id = ${correduriaId}::uuid and created_at >= ${desde}
      union all
      select 'documentos_revisados', revisado_at from documentos
        where correduria_id = ${correduriaId}::uuid and revisado_at >= ${desde}
      union all
      select 'oportunidades_nuevas', o.created_at from oportunidades o
        where o.correduria_id = ${correduriaId}::uuid and o.created_at >= ${desde}
          and o.import_ref is null -- import_ref de OPORTUNIDAD (lead del volcado), no de póliza
    )
    select serie, to_char(date_trunc('week', t at time zone 'Europe/Madrid'), 'YYYY-MM-DD') as semana, count(*)::int as n
      from s group by 1, 2`
  const out: ConteosLineaBase = {}
  for (const f of filas) (out[f.serie] ??= {})[f.semana] = Number(f.n)
  return out
}
