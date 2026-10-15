// Estadísticas de los bots del tarificador RPA (15/10/2026): SQL agregado de solo lectura. Reglas puras en
// ./tarificador-estadisticas-reglas.ts. Por `correduria_id`; solo trabajos de TARIFICAR (ni emisión, ni exploración, ni la PRUEBA NOCTURNA DE HUMO: ni éxito ni fallo de tarificación).
// 🔒 Solo salen contadores, medias y claves de atasco: ni riesgo, ni error crudo, ni datos personales.
import { prisma } from './tenant'
import { hayAtascos } from './esquema-bd'
import { proyectarEstadisticas, proyectarParejas, type FilaAgregada, type FilaClave, type FilaEstadistica, type FilaPareja, type ParejaEstadistica } from './tarificador-estadisticas-reglas'

export type EstadisticasTarificador = { estado: 'ok'; generadoEn: string; filas: FilaEstadistica[]; parejas: ParejaEstadistica[]; atascosDisponibles: boolean }

export async function leerEstadisticasTarificador(correduriaId: string, ahora = new Date()): Promise<EstadisticasTarificador> {
  const conAtascos = await hayAtascos()
  const [agregadas, claves, parejas] = await Promise.all([
    prisma.$queryRaw<FilaAgregada[]>`
      select v.dias::int as dias, t.compania, t.ramo, to_jsonb(t)->>'bot_version' as bot_version,
             count(*)::int as total,
             (count(*) filter (where t.estado = 'ok'))::int as ok,
             (count(*) filter (where t.estado = 'atascado'))::int as atascado,
             (count(*) filter (where t.estado = 'requiere_humano'))::int as requiere_humano,
             (count(*) filter (where t.estado = 'error_definitivo'))::int as error_definitivo,
             (avg(extract(epoch from (t.terminado_at - t.iniciado_at)))
                filter (where t.estado = 'ok' and t.iniciado_at is not null and t.terminado_at is not null and t.terminado_at >= t.iniciado_at))::float8 as seg_medio
        from seguros.tarificacion_trabajos t
        cross join (values (7), (30)) as v(dias)
       where t.correduria_id = ${correduriaId}::uuid
         and t.created_at > now() - make_interval(days => v.dias)
         and coalesce(to_jsonb(t)->>'modo', 'tarificar') = 'tarificar'
       group by 1, 2, 3, 4`,
    conAtascos
      ? prisma.$queryRaw<FilaClave[]>`
          select v.dias::int as dias, t.compania, t.ramo, to_jsonb(t)->>'bot_version' as bot_version, a.clave, count(*)::int as n
            from seguros.tarificador_atascos a
            join seguros.tarificacion_trabajos t on t.id = a.trabajo_id and t.correduria_id = a.correduria_id
            cross join (values (7), (30)) as v(dias)
           where a.correduria_id = ${correduriaId}::uuid
             and t.created_at > now() - make_interval(days => v.dias)
             and coalesce(to_jsonb(t)->>'modo', 'tarificar') = 'tarificar'
           group by 1, 2, 3, 4, 5`
      : Promise.resolve([] as FilaClave[]),
    // Madurez y coste por compañía × ramo (todas las versiones). `ok_siempre` sin ventana: «nunca ha dado precio» es histórico.
    prisma.$queryRaw<FilaPareja[]>`
      select t.compania, t.ramo,
             (count(*) filter (where t.estado = 'ok' and t.created_at > now() - interval '7 days'))::int as ok_7d,
             (count(*) filter (where t.estado in ('atascado', 'requiere_humano', 'error_definitivo') and t.created_at > now() - interval '7 days'))::int as fallos_7d,
             (count(*) filter (where t.estado = 'ok'))::int as ok_siempre,
             (count(*) filter (where t.created_at > now() - interval '30 days'))::int as trabajos_30d,
             (count(*) filter (where t.created_at > now() - interval '30 days' and t.iniciado_at is not null and t.terminado_at is not null and t.terminado_at >= t.iniciado_at))::int as medidos_30d,
             (coalesce(sum(extract(epoch from (t.terminado_at - t.iniciado_at))) filter (where t.created_at > now() - interval '30 days' and t.iniciado_at is not null and t.terminado_at is not null and t.terminado_at >= t.iniciado_at), 0))::float8 as seg_total_30d
        from seguros.tarificacion_trabajos t
       where t.correduria_id = ${correduriaId}::uuid
         and coalesce(to_jsonb(t)->>'modo', 'tarificar') = 'tarificar'
       group by 1, 2`,
  ])
  return { estado: 'ok', generadoEn: ahora.toISOString(), filas: proyectarEstadisticas(agregadas, claves), parejas: proyectarParejas(parejas), atascosDisponibles: conAtascos }
}
