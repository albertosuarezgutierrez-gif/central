// Estado del TARIFICADOR (04/11/2026): SQL agregado de SOLO LECTURA. Reglas puras en ./tarificador-estado-reglas.ts.
// Por `correduria_id`. Del riesgo y de las respuestas de las compañías solo se leen compañía, ramo, fecha y prima mínima;
// del `error` del trabajo solo tipo, clave de atasco y URL (que se redacta en las reglas antes de salir). La prueba de
// humo nocturna (`modo = 'humo'`) no cuenta: no es ni éxito ni fallo de tarificación.
import { prisma } from './tenant'
import { esquema } from './esquema-bd'
import {
  indicadores,
  parejaDeEntrada,
  proyectarAvant2,
  proyectarEstado,
  type Avant2Mes,
  type FilaActividad,
  type FilaAvant2,
  type FilaEstado,
  type FilaPrecio,
  type FilaTrabajos,
  type FilaUltimoError,
  type Indicadores,
} from './tarificador-estado-reglas'

export type EstadoTarificador = {
  estado: 'ok'
  generadoEn: string
  filas: FilaEstado[]
  indicadores: Indicadores
  /** `null` = no se pudo leer el libro de consumo (≠ 0 €). */
  avant2: Avant2Mes | null
  /** Fuentes que no existen en esta BD: su ausencia NO se lee como «no hay». */
  fuentesAusentes: string[]
}

const ESTADOS_ERROR = ['error_definitivo', 'requiere_humano', 'atascado']

export async function leerEstadoTarificador(correduriaId: string, ahora = new Date()): Promise<EstadoTarificador> {
  const [conExpl, conPil, conConsumo] = await Promise.all([
    esquema.existeTabla('tarificador_exploraciones'),
    esquema.existeTabla('tarificador_pilotaje_sesiones'),
    esquema.existeTabla('codeoscopic_consumo'),
  ])

  const [precios, trabajos, errores, actividadTrabajos, exploraciones, pilotajes, avant2] = await Promise.all([
    // Último precio por compañía × ramo y canal: RPA (`respuesta.ofertas[].primaAnualEur`) y Avant2 (`mainQuotes[].premium`
    // por `product.vendor.name`). Una fila por tarificación y compañía con su prima mínima; el «último» lo elige la regla.
    prisma.$queryRaw<FilaPrecio[]>`
      with p as (
        select coalesce(o->>'compania', t.respuesta->>'compania') as compania, t.ramo, 'rpa'::text as canal, t.creado_at,
               min((o->>'primaAnualEur')::numeric) as prima
          from seguros.tarificaciones t
          cross join lateral jsonb_array_elements(case when jsonb_typeof(t.respuesta->'ofertas') = 'array' then t.respuesta->'ofertas' else '[]'::jsonb end) o
         where t.correduria_id = ${correduriaId}::uuid and t.canal = 'rpa' and coalesce(t.simulado, false) = false
           and jsonb_typeof(o->'primaAnualEur') = 'number'
         group by t.id, 1, 2, 3, 4
        union all
        select q->'product'->'vendor'->>'name', t.ramo, 'codeoscopic', t.creado_at, min((q->>'premium')::numeric)
          from seguros.tarificaciones t
          cross join lateral jsonb_array_elements(case when jsonb_typeof(t.respuesta->'mainQuotes') = 'array' then t.respuesta->'mainQuotes' else '[]'::jsonb end) q
         where t.correduria_id = ${correduriaId}::uuid and t.canal = 'codeoscopic' and coalesce(t.simulado, false) = false
           and jsonb_typeof(q->'premium') = 'number'
         group by t.id, 1, 2, 3, 4
      )
      select distinct on (lower(compania), ramo, canal) compania, ramo, canal, creado_at, prima::float8 as prima
        from p where compania is not null and ramo is not null
       order by lower(compania), ramo, canal, creado_at desc`,
    prisma.$queryRaw<FilaTrabajos[]>`
      select t.compania, t.ramo,
             (count(*) filter (where t.estado = 'ok' and t.created_at > now() - interval '7 days'))::int as ok_7d,
             (count(*) filter (where t.estado = any(${ESTADOS_ERROR}::text[]) and t.created_at > now() - interval '7 days'))::int as error_7d,
             (count(*) filter (where t.estado = 'ok' and t.created_at > now() - interval '30 days'))::int as ok_30d,
             (count(*) filter (where t.estado = any(${ESTADOS_ERROR}::text[]) and t.created_at > now() - interval '30 days'))::int as error_30d,
             count(*)::int as tarificar_total
        from seguros.tarificacion_trabajos t
       where t.correduria_id = ${correduriaId}::uuid and coalesce(t.modo, 'tarificar') = 'tarificar'
       group by 1, 2`,
    // Último error por compañía × ramo (tarificar, pilotaje o exploración). Solo las tres claves que se redactan.
    prisma.$queryRaw<FilaUltimoError[]>`
      select distinct on (t.compania, t.ramo) t.compania, t.ramo, coalesce(t.modo, 'tarificar') as modo, t.created_at,
             jsonb_build_object('tipo', t.error->'tipo', 'atascoClave', t.error->'atascoClave', 'url', t.error->'url') as error
        from seguros.tarificacion_trabajos t
       where t.correduria_id = ${correduriaId}::uuid and coalesce(t.modo, 'tarificar') <> 'humo'
         and t.estado = any(${ESTADOS_ERROR}::text[]) and jsonb_typeof(t.error) = 'object'
       order by t.compania, t.ramo, t.created_at desc`,
    // Trabajos de exploración/pilotaje: también son señal de «en exploración / en pilotaje» aunque falten las tablas propias.
    prisma.$queryRaw<(FilaActividad & { modo: string })[]>`
      select t.modo, t.compania, t.ramo,
             (count(*) filter (where t.estado in ('pendiente', 'en_curso', 'error_reintentable')))::int as abiertas,
             (count(*) filter (where t.created_at > now() - interval '30 days'))::int as recientes,
             max(t.created_at) as ultima_at
        from seguros.tarificacion_trabajos t
       where t.correduria_id = ${correduriaId}::uuid and t.modo in ('exploracion', 'pilotaje')
       group by 1, 2, 3`,
    conExpl
      ? prisma.$queryRaw<FilaActividad[]>`
          select e.compania, e.producto as ramo,
                 (count(*) filter (where e.cerrada_at is null))::int as abiertas,
                 (count(*) filter (where e.created_at > now() - interval '30 days'))::int as recientes,
                 max(e.created_at) as ultima_at
            from seguros.tarificador_exploraciones e
           where e.correduria_id = ${correduriaId}::uuid
           group by 1, 2`
      : Promise.resolve(null),
    conPil
      ? prisma.$queryRaw<{ entrada: string | null; abiertas: unknown; recientes: unknown; ultima_at: Date | null }[]>`
          select s.entrada,
                 (count(*) filter (where s.cerrada_at is null))::int as abiertas,
                 (count(*) filter (where s.created_at > now() - interval '30 days'))::int as recientes,
                 max(s.created_at) as ultima_at
            from seguros.tarificador_pilotaje_sesiones s
           where s.correduria_id = ${correduriaId}::uuid
           group by 1`
      : Promise.resolve(null),
    // Gasto Avant2 del mes en curso (hora de Madrid): solo lo FACTURABLE, por el ramo de la tarificación que lo pidió.
    conConsumo
      ? prisma.$queryRaw<FilaAvant2[]>`
          select t.ramo, coalesce(sum(c.coste_cents), 0)::int as cents, count(*)::int as n
            from seguros.codeoscopic_consumo c
            left join lateral (
              select x.ramo from seguros.tarificaciones x
               where x.intento_id = c.intento_id and x.correduria_id = c.correduria_id
               limit 1
            ) t on true
           where c.correduria_id = ${correduriaId}::uuid and c.estado = 'facturable'
             and (c.creado_at at time zone 'Europe/Madrid') >= date_trunc('month', now() at time zone 'Europe/Madrid')
           group by 1`
      : Promise.resolve(null),
  ])

  const expl: FilaActividad[] = [...(exploraciones ?? []), ...actividadTrabajos.filter((a) => a.modo === 'exploracion')]
  const pil: FilaActividad[] = [
    ...(pilotajes ?? []).flatMap((s) => {
      const p = parejaDeEntrada(s.entrada)
      return p ? [{ compania: p.compania, ramo: p.ramo, abiertas: s.abiertas, recientes: s.recientes, ultima_at: s.ultima_at }] : []
    }),
    ...actividadTrabajos.filter((a) => a.modo === 'pilotaje'),
  ]
  const filas = proyectarEstado({ precios, trabajos, errores, exploraciones: expl, pilotajes: pil })
  const mes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' }).format(ahora)
  const fuentesAusentes = [
    ...(conExpl ? [] : ['tarificador_exploraciones']),
    ...(conPil ? [] : ['tarificador_pilotaje_sesiones']),
    ...(conConsumo ? [] : ['codeoscopic_consumo']),
  ]
  return {
    estado: 'ok',
    generadoEn: ahora.toISOString(),
    filas,
    indicadores: indicadores(filas),
    avant2: avant2 ? proyectarAvant2(mes, avant2) : null,
    fuentesAusentes,
  }
}
