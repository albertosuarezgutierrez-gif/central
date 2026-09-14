/**
 * El muro de actividad de TODA la cartera, y el embudo de la intranet.
 *
 * ─── Qué problema resuelve ───────────────────────────────────────────────────
 * El historial existía por ficha: para saber qué había hecho alguien había que
 * entrar en su ficha, y para saber qué había hecho *alguien* había que entrar en
 * las 80. Lo que hace un cliente en el portal se veía, pero solo si ya sabías a
 * quién mirar — o sea, no se veía.
 *
 * ─── De dónde sale cada evento ───────────────────────────────────────────────
 * De SEIS sitios, y ninguno es un registro nuevo: todos existían ya y nadie los
 * leía junta. Las cinco tablas `portal_*` las escribe el cliente usando la
 * intranet, así que de sus filas SÍ se puede decir «lo hizo él».
 * `historial_interno` es el sexto y es distinto: **no guarda el autor como
 * dato** (la columna `actor_user_id` no la escribe nadie; el autor va dentro del
 * texto), así que de sus filas solo se afirma lo que se puede demostrar —
 * excepto las dos que compuso el propio portal, que se reconocen por los
 * prefijos constantes de `@central/module-seguros-portal` y no por adivinar
 * sobre texto libre.
 *
 * ─── Lo que esta capa NO hace ────────────────────────────────────────────────
 * 🚨 No devuelve ni un dato personal de contacto: ni correo, ni teléfono, ni
 * dirección. El muro dice QUÉ pasó y de QUIÉN es la ficha (con su id, para
 * enlazar), y el dato nuevo se mira en la ficha, que es donde vive. Repetir el
 * domicilio de alguien en una lista cronológica sería regar la PII por una
 * pantalla que encima se va a mirar con gente delante.
 */
import {
  POR_PAGINA_ACTIVIDAD,
  POR_PAGINA_ACTIVIDAD_MAX,
  sqlCarteraViva,
  type EmbudoPortal,
  type EventoActividad,
  type FiltroActividad,
} from '@central/module-seguros'
import {
  PREFIJO_HISTORIAL_CONTACTO_PROPIO,
  PREFIJO_HISTORIAL_SUGERENCIA,
} from '@central/module-seguros-portal'

import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { registrarErrorCartera } from './error-cartera'

export type RespuestaActividad =
  | { estado: 'ok'; eventos: EventoActividad[]; total: number; embudo: EmbudoPortal }
  | { estado: 'error'; causa: string }

/**
 * Cuánto tiene que llevar un código sin canjear para contarlo como «pidió entrar
 * y no pudo».
 *
 * 🚨 El margen no es decorativo: sin él, el código que alguien acaba de pedir y
 * está tecleando ahora mismo saldría en la pantalla de Alberto como un fallo, y
 * la cola de «llamar a quien no puede entrar» se llenaría de gente que está
 * entrando bien. Una hora es de sobra: el código caduca antes.
 */
const MINUTOS_GRACIA_CODIGO = 60

type FilaEvento = {
  id: string
  tipo: string
  fecha: Date
  cliente_id: string | null
  nombre: string | null
  apellidos: string | null
  texto: string | null
  total: bigint
}

/**
 * La línea de tiempo. Un solo `UNION ALL` porque la alternativa —seis consultas
 * y ordenarlas en JavaScript— no sabe paginar: para dar la página 3 habría que
 * traerse las tres primeras de cada fuente y descartar la mayoría.
 */
function consultaEventos(correduriaId: string, filtro: FiltroActividad, porPagina: number, offset: number) {
  const desde = new Date(Date.now() - filtro.dias * 24 * 60 * 60 * 1000)
  const soloCliente = filtro.quien === 'cliente'
  const prefContacto = `${PREFIJO_HISTORIAL_CONTACTO_PROPIO}%`
  const prefSugerencia = `${PREFIJO_HISTORIAL_SUGERENCIA}%`

  return prismaAsegura().$queryRaw<FilaEvento[]>`
    with vinc as (
      -- Identidad del portal → ficha de la cartera. La más antigua cuando hay
      -- varias, que es la misma decisión que toma \`vinculos-portal.ts\`; aquí no
      -- se puede avisar por el log de cada fila, así que al menos no se elige
      -- una distinta según el orden en que la BD devuelva las filas.
      select distinct on (identidad_id) identidad_id, cliente_id
      from portal_vinculo
      where correduria_id = ${correduriaId}::uuid
      order by identidad_id, creado_en asc, id asc
    ),
    eventos as (
      -- 1. Entró en la intranet.
      select a.id::text as id, 'acceso' as tipo, a.creado_en as fecha,
             v.cliente_id as cliente_id, null::text as texto
      from portal_acceso a
      join vinc v on v.identidad_id = a.identidad_id
      where a.creado_en >= ${desde}

      union all

      -- 2. Pidió el código y no llegó a canjearlo.
      select c.id::text, 'acceso_fallido', c.creado_en, v.cliente_id, null::text
      from portal_codigo c
      join portal_canal ca on ca.valor_hash = c.valor_hash and ca.tipo = c.tipo
      join vinc v on v.identidad_id = ca.identidad_id
      where c.usado_en is null
        and c.creado_en >= ${desde}
        and c.creado_en < now() - (${MINUTOS_GRACIA_CODIGO} || ' minutes')::interval

      union all

      -- 3. Abrió un parte de siniestro.
      select p.id::text, 'parte', p.creado_en, v.cliente_id, p.descripcion
      from portal_parte_siniestro p
      join vinc v on v.identidad_id = p.identidad_id
      where p.creado_en >= ${desde}

      union all

      -- 4. Subió una póliza de otra compañía.
      select d.id::text, 'poliza_declarada', d.creada_en, v.cliente_id,
             nullif(concat_ws(' · ', d.compania, d.ramo), '')
      from portal_poliza_declarada d
      join vinc v on v.identidad_id = d.identidad_id
      where d.creada_en >= ${desde}

      union all

      -- 5. Pidió que se borren sus datos. Esta trae su propio \`cliente_id\`, así
      -- que no depende del vínculo: una supresión de alguien sin ficha casada
      -- sigue siendo una supresión con un reloj legal corriendo.
      select s.id::text, 'supresion', s.recibida_en, s.cliente_id, s.motivo
      from portal_supresion s
      where s.correduria_id = ${correduriaId}::uuid
        and s.recibida_en >= ${desde}

      ${
        soloCliente
          ? Prisma.empty
          : Prisma.sql`
      union all

      -- 6. Las anotaciones de la ficha. Las dos que compuso el portal se
      -- reconocen por su prefijo (constante compartida, no adivinanza); del
      -- resto NO se afirma autor: va el texto entero, que ya lo nombra.
      select h.id::text, 'ficha', h.created_at at time zone 'UTC', h.cliente_id, h.texto
      from historial_interno h
      where h.correduria_id = ${correduriaId}::uuid
        and h.deleted_at is null
        and h.created_at >= ${desde}
        and h.texto not like ${prefContacto}
        and h.texto not like ${prefSugerencia}`
      }

      union all

      -- 6b. Las dos del portal salen SIEMPRE, también con el filtro «solo el
      -- cliente»: las escribió él, aunque vivan en la tabla de la ficha.
      select h.id::text,
             case when h.texto like ${prefContacto} then 'direccion' else 'sugerencia' end,
             h.created_at at time zone 'UTC', h.cliente_id, h.texto
      from historial_interno h
      where h.correduria_id = ${correduriaId}::uuid
        and h.deleted_at is null
        and h.created_at >= ${desde}
        and (h.texto like ${prefContacto} or h.texto like ${prefSugerencia})
    )
    select e.id, e.tipo, e.fecha, e.cliente_id, e.texto,
           c.nombre, c.apellidos,
           count(*) over () as total
    from eventos e
    left join clientes c on c.id = e.cliente_id
    order by e.fecha desc, e.id asc
    limit ${porPagina} offset ${offset}`
}

/** Una cuenta del embudo. `null` si no se pudo hacer — nunca 0. */
async function contar(etiqueta: string, sql: Prisma.Sql): Promise<number | null> {
  try {
    const filas = await prismaAsegura().$queryRaw<{ n: bigint }[]>(sql)
    return filas.length > 0 ? Number(filas[0].n) : 0
  } catch (e) {
    // El embudo tiene cinco cuentas independientes: que una falle no puede
    // tumbar las otras cuatro ni, peor, devolver 0 y pintar un escalón vacío.
    console.error(`[actividad-cartera] no se pudo contar ${etiqueta}:`, e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * El embudo: de los clientes de la casa, cuántos llegan a cada escalón de la
 * intranet.
 *
 * «Cliente» es cartera viva y punto (`sqlCarteraViva`), no `clientes.tipo`: esa
 * columna dice 2.742 clientes cuando son 80, y cualquier pantalla que la lea
 * pinta un embudo precioso sobre fichas muertas.
 */
export async function embudoPortal(correduriaId: string): Promise<EmbudoPortal> {
  const viva = Prisma.raw(sqlCarteraViva('p'))
  const cid = correduriaId

  // El conjunto base, repetido en cada cuenta a propósito: una CTE compartida
  // obligaría a una sola consulta, y entonces un fallo las anularía las cinco.
  const clientesVivos = Prisma.sql`
    select distinct p.cliente_id
    from polizas p
    where p.correduria_id = ${cid}::uuid and ${viva}`

  const [clientes, conEmail, invitados, hanEntrado, activos30] = await Promise.all([
    contar('clientes', Prisma.sql`select count(*)::bigint as n from (${clientesVivos}) v`),
    contar(
      'conEmail',
      Prisma.sql`
        select count(*)::bigint as n
        from (${clientesVivos}) v
        where exists (select 1 from clientes c where c.id = v.cliente_id and c.email is not null and c.email <> '')
           or exists (select 1 from cliente_emails e where e.cliente_id = v.cliente_id)`,
    ),
    contar(
      'invitados',
      Prisma.sql`
        select count(*)::bigint as n
        from (${clientesVivos}) v
        where exists (
          select 1 from portal_vinculo pv
          where pv.cliente_id = v.cliente_id and pv.correduria_id = ${cid}::uuid)`,
    ),
    contar(
      'hanEntrado',
      Prisma.sql`
        select count(*)::bigint as n
        from (${clientesVivos}) v
        where exists (
          select 1 from portal_vinculo pv
          join portal_identidad pi on pi.id = pv.identidad_id
          where pv.cliente_id = v.cliente_id and pv.correduria_id = ${cid}::uuid
            and pi.ultimo_acceso_en is not null)`,
    ),
    contar(
      'activos30',
      Prisma.sql`
        select count(*)::bigint as n
        from (${clientesVivos}) v
        where exists (
          select 1 from portal_vinculo pv
          join portal_identidad pi on pi.id = pv.identidad_id
          where pv.cliente_id = v.cliente_id and pv.correduria_id = ${cid}::uuid
            and pi.ultimo_acceso_en >= now() - interval '30 days')`,
    ),
  ])

  return { clientes, conEmail, invitados, hanEntrado, activos30 }
}

/** El muro entero: eventos de la ventana pedida + el embudo. */
export async function actividadCartera(
  correduriaId: string,
  filtro: FiltroActividad,
): Promise<RespuestaActividad> {
  const porPagina = Math.min(POR_PAGINA_ACTIVIDAD, POR_PAGINA_ACTIVIDAD_MAX)
  const offset = (filtro.pagina - 1) * porPagina

  try {
    const [filas, embudo] = await Promise.all([
      consultaEventos(correduriaId, filtro, porPagina, offset),
      embudoPortal(correduriaId),
    ])

    const eventos: EventoActividad[] = filas.map((f) => ({
      id: f.id,
      tipo: f.tipo,
      fecha: f.fecha.toISOString(),
      clienteId: f.cliente_id,
      cliente: nombreFicha(f.nombre, f.apellidos),
      texto: f.texto,
    }))

    return {
      estado: 'ok',
      eventos,
      total: filas.length > 0 ? Number(filas[0].total) : 0,
      embudo,
    }
  } catch (e) {
    return { estado: 'error', causa: registrarErrorCartera('actividad-cartera', e) }
  }
}

/**
 * `null` cuando el evento no tiene ficha detrás. No cae a «Sin nombre» ni a una
 * cadena vacía: la pantalla necesita distinguir «esto lo hizo alguien que
 * todavía no está casado con ninguna ficha» de «esto lo hizo una ficha sin
 * nombre», porque lo primero es trabajo (identificarle) y lo segundo un dato
 * sucio.
 */
function nombreFicha(nombre: string | null, apellidos: string | null): string | null {
  const n = [nombre, apellidos].filter((x) => x != null && x.trim() !== '').join(' ').trim()
  return n === '' ? null : n
}
