// SEGUIMIENTO de un lead en su hilo (19/10/2026, spec lead → propuesta F5). Puerto
// `POST /api/operador/correo/seguimiento-lead`; lo llama el cron del triaje de plataforma.
//
//   · pendientes:     los hilos vivos con lo que hace falta para decidir el hito (`hitoSeguimientoLead`). SIN email ni
//                     texto: ids, Message-ID raíz (para el asunto que ya guarda el triaje), nombre de pila, ramos, fechas
//                     y las HUELLAS de sus direcciones (`remitentes`, para el «¿ha escrito después?» de plataforma).
//   · recordar:       envía UN recordatorio en el hilo, por el mismo camino que la petición de F1 (copia oculta a hola@,
//                     clave de idempotencia). Antes de mandar, vuelve a decidir el hito con la BD de AHORA: si el cliente
//                     ha contestado, se cerró o ya salió otro envío, `ya_no_toca` y no sale nada. El destinatario es
//                     SOLO la dirección de la ficha con la que abrió el hilo (índice ciego); plataforma no la conoce.
//   · cerrar_perdida: las oportunidades abiertas del hilo pasan a `perdida` (motivo `sin_respuesta`) por
//                     `cambiarEstadoOportunidad` (historial incluido) y el hilo queda cerrado. No se borra nada.
//   · La propuesta (F4) la anota `marcarHiloPropuesta` de `lib/propuesta-lead.ts` en las MISMAS columnas que lee esto
//     (`presupuesto_id` + `propuesta_enviada_at`, SQL 2026-10-19e): una sola fuente de verdad, sin enganche aparte.
// Toda consulta a `seguros` lleva `correduria_id` (puerta única `lib/tenant`). Nada de emails ni textos en logs.
import { prisma } from './tenant'
import { prismaAsegura } from './asegura-db'
import { MEDIADOR, hitoSeguimientoLead, mismoHito, nombreDePila, type HiloSeguimiento } from '@central/module-seguros'
import { huellaRemitente } from '@central/module-seguros/huella-remitente'
import {
  DETALLE_PERDIDA_SEGUIMIENTO, TIPO_CORREO_RECORDATORIO_LEAD, elegirDestinoHilo, textoHistorialRecordatorio, type Recordar,
} from './correo-seguimiento-lead-puro'

export { validarCerrar, validarRecordar } from './correo-seguimiento-lead-puro'

const errCode = (err: unknown) => (err as { code?: string; meta?: { code?: string } })?.meta?.code ?? (err as { code?: string })?.code
/** Tabla (F1) o columnas (F5) sin crear: `sin_migracion`, nunca «no hay nada que recordar». */
const sinMigracion = (err: unknown) => {
  const c = errCode(err)
  return c === '42P01' || c === '42703' || /does not exist|no existe/i.test(String((err as Error)?.message))
}

export type GrupoHilo = {
  /** El id más bajo del grupo (un grupo = mismo cliente y misma raíz; una fila por oportunidad). */
  hiloId: string
  clienteId: string
  raiz: string
  emailCiego: string | null
  oportunidadIds: string[]
  ramos: string[]
  /** `false` = tiene oportunidades y ninguna sigue abierta: no se recuerda. `null` = hilo sin oportunidad. */
  oportunidadAbierta: boolean | null
  seguimiento: HiloSeguimiento
}

type FilaGrupo = {
  id: bigint; cliente_id: string; raiz: string; email_ciego: string | null; ops: string[] | null; ramos: string[] | null
  abiertas: boolean | null; esperando: boolean | null; estado_datos: string | null
  ultima_peticion_at: Date | null; ultimo_recordatorio_at: Date | null; recordatorios: number | null; ultimo_contacto_at: Date | null
  cerrado_at: Date | null; propuesta_at: Date | null; presupuesto_id: string | null; propuesta_cerrada: boolean | null
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)

function aGrupo(f: FilaGrupo): GrupoHilo {
  return {
    hiloId: String(f.id), clienteId: f.cliente_id, raiz: f.raiz, emailCiego: f.email_ciego,
    oportunidadIds: f.ops ?? [], ramos: f.ramos ?? [], oportunidadAbierta: f.ops?.length ? f.abiertas === true : null,
    seguimiento: {
      estadoDatos: f.esperando ? 'incompleta' : (f.estado_datos ?? 'sin_pedir'),
      ultimaPeticionAt: iso(f.ultima_peticion_at),
      ultimoRecordatorioAt: iso(f.ultimo_recordatorio_at),
      recordatoriosEnviados: f.recordatorios === null ? null : Number(f.recordatorios),
      ultimoContactoClienteAt: iso(f.ultimo_contacto_at),
      cerradoPerdidoAt: iso(f.cerrado_at),
      propuestaEnviadaAt: iso(f.propuesta_at),
      // Propuesta sin fila de presupuesto legible = no se sabe (`null`): no se recuerda.
      propuestaCerrada: f.propuesta_at === null ? null : f.presupuesto_id === null ? null : f.propuesta_cerrada,
    },
  }
}

/** Grupos de hilo (uno o todos los vivos). Lanza `sin_migracion` hacia arriba como error con `code`. */
async function leerGrupos(correduriaId: string, hiloId: string | null, limite = 100): Promise<GrupoHilo[]> {
  const filas = await prisma.$queryRaw<FilaGrupo[]>`
    with g as (
      select h.cliente_id, h.message_id_raiz
      from seguros.correduria_hilo h
      where h.correduria_id = ${correduriaId}::uuid
        and (${hiloId}::bigint is null or h.id = ${hiloId}::bigint)
        and (${hiloId}::bigint is not null or (h.cerrado_perdido_at is null
             and greatest(h.ultima_peticion_at, h.propuesta_enviada_at, h.ultimo_recordatorio_at) > now() - interval '30 days'))
      group by h.cliente_id, h.message_id_raiz
      limit ${limite}
    )
    select min(h.id) as id, h.cliente_id::text as cliente_id, h.message_id_raiz as raiz, max(h.email_cliente_ciego) as email_ciego,
           array_remove(array_agg(h.oportunidad_id::text), null) as ops,
           array_remove(array_agg(distinct o.tipo::text), null) as ramos,
           bool_or(o.estado::text not in ('ganada', 'perdida')) as abiertas,
           bool_or(h.estado_datos in ('pedida', 'incompleta')) as esperando,
           min(h.estado_datos) as estado_datos,
           max(h.ultima_peticion_at) as ultima_peticion_at, max(h.ultimo_recordatorio_at) as ultimo_recordatorio_at,
           max(h.recordatorios_enviados)::int as recordatorios, max(h.ultimo_contacto_cliente_at) as ultimo_contacto_at,
           max(h.cerrado_perdido_at) as cerrado_at, max(h.propuesta_enviada_at) as propuesta_at,
           (array_agg(h.presupuesto_id::text order by h.propuesta_enviada_at desc nulls last))[1] as presupuesto_id,
           -- Solo cuenta el presupuesto de la ÚLTIMA propuesta; si no se puede leer (otra correduría, borrado) = null.
           (array_agg(case when p.id is null then null
                           else (p.aceptado_at is not null or p.emitido_at is not null or p.retirado_at is not null) end
                      order by h.propuesta_enviada_at desc nulls last))[1] as propuesta_cerrada
    from seguros.correduria_hilo h
    join g on g.cliente_id = h.cliente_id and g.message_id_raiz = h.message_id_raiz
    left join seguros.oportunidades o on o.id = h.oportunidad_id and o.correduria_id = h.correduria_id
    left join seguros.presupuesto p on p.id = h.presupuesto_id and p.correduria_id = h.correduria_id
    where h.correduria_id = ${correduriaId}::uuid
    group by h.cliente_id, h.message_id_raiz`
  return filas.map(aGrupo)
}

// ─── pendientes ──────────────────────────────────────────────────────────────

export type ResultadoPendientes =
  | { estado: 'sin_migracion' }
  | {
      estado: 'ok'
      /**
       * `remitentes`: huellas (`huellaRemitente`) de TODAS las direcciones de la ficha, para que plataforma compruebe en
       * `correo_triaje` si el cliente ha escrito después del último envío aunque el triaje no casara su correo con el
       * hilo. `null` = ninguna dirección legible: no se sabe → plataforma no recuerda nada.
       */
      hilos: (Omit<GrupoHilo, 'emailCiego'> & { pila: string | null; remitentes: string[] | null })[]
    }

export async function pendientesSeguimiento(correduriaId: string): Promise<ResultadoPendientes> {
  let grupos: GrupoHilo[]
  try { grupos = await leerGrupos(correduriaId, null) } catch (e) {
    if (sinMigracion(e)) return { estado: 'sin_migracion' }
    throw e
  }
  const vivos = grupos.filter((g) => g.oportunidadAbierta !== false)
  const fichas = vivos.length
    ? await prismaAsegura().cliente.findMany({
        where: { correduriaId, id: { in: [...new Set(vivos.map((g) => g.clienteId))] }, mergedIntoClienteId: null },
        select: { id: true, nombre: true, email: true, emails: { select: { email: true } } },
      })
    : []
  const pila = new Map(fichas.map((f) => [f.id, nombreDePila(f.nombre)]))
  const { decryptField } = await import('@central/module-seguros-pii')
  const claro = (v: string | null) => { try { return v ? decryptField(v) : null } catch { return null } }
  const remitentes = new Map(fichas.map((f) => {
    const h = [...new Set([f.email, ...f.emails.map((e) => e.email)].map((v) => huellaRemitente(claro(v))).filter((x): x is string => !!x))]
    return [f.id, h.length ? h : null] as const
  }))
  return {
    estado: 'ok',
    // Una ficha fusionada o borrada no tiene a quién escribir: fuera.
    hilos: vivos.filter((g) => pila.has(g.clienteId)).map(({ emailCiego: _e, ...g }) => ({
      ...g, pila: pila.get(g.clienteId) ?? null, remitentes: remitentes.get(g.clienteId) ?? null,
    })),
  }
}

// ─── recordar ────────────────────────────────────────────────────────────────

export type ResultadoRecordar =
  | { estado: 'enviado'; historial: boolean; repetido?: true }
  | { estado: 'no_encontrado' | 'ya_no_toca' | 'email_no_es_de_la_ficha' | 'baja_de_correos' | 'sin_proveedor' | 'sin_migracion' }
  | { estado: 'rechazado'; motivo: string }

export async function recordarSeguimiento(correduriaId: string, r: Recordar, ahora = new Date()): Promise<ResultadoRecordar> {
  let grupo: GrupoHilo | undefined
  try { grupo = (await leerGrupos(correduriaId, r.hiloId, 1))[0] } catch (e) {
    if (sinMigracion(e)) return { estado: 'sin_migracion' }
    throw e
  }
  if (!grupo) return { estado: 'no_encontrado' }
  // El hito se vuelve a decidir con la BD de AHORA: si contestó, se cerró o salió otro envío, ya no es el aprobado.
  const hito = hitoSeguimientoLead(grupo.seguimiento, ahora)
  if (grupo.oportunidadAbierta === false || !mismoHito(hito, r.etapa, r.ancla) || !hito) return { estado: 'ya_no_toca' }

  const db = prismaAsegura()
  const cli = await db.cliente.findFirst({
    where: { id: grupo.clienteId, correduriaId, mergedIntoClienteId: null },
    select: { email: true, emailLookupHash: true, emailOptOutAt: true, emails: { select: { email: true, emailLookupHash: true } } },
  })
  if (!cli) return { estado: 'no_encontrado' }
  if (cli.emailOptOutAt) return { estado: 'baja_de_correos' }
  const { decryptField } = await import('@central/module-seguros-pii')
  const claro = (v: string | null) => { try { return v ? decryptField(v) : null } catch { return null } }
  const to = elegirDestinoHilo(
    [{ claro: claro(cli.email), hash: cli.emailLookupHash }, ...cli.emails.map((e) => ({ claro: claro(e.email), hash: e.emailLookupHash }))],
    grupo.emailCiego,
  )
  if (!to) return { estado: 'email_no_es_de_la_ficha' }

  const { enviarCorreoSeguido } = await import('./correo-envio')
  const env = await enviarCorreoSeguido({
    correduriaId, clienteId: grupo.clienteId, tipo: TIPO_CORREO_RECORDATORIO_LEAD, to, asunto: r.asunto, texto: r.texto,
    enRespuestaA: { messageId: grupo.raiz, references: [] }, copiaOculta: MEDIADOR.identidad.email, idempotencia: r.idempotencia,
  })
  if (env.resultado === 'sin_proveedor') return { estado: 'sin_proveedor' }
  if (env.resultado !== 'enviado') return { estado: 'rechazado', motivo: (env.motivo ?? 'el proveedor lo rechazó').slice(0, 200) }

  // El correo YA salió: nada de aquí abajo lo convierte en fallo (un reintento lo mandaría dos veces).
  try {
    await prisma.$executeRaw`
      update seguros.correduria_hilo
      set ultimo_recordatorio_at = now(), recordatorios_enviados = ${hito.recordatoriosTrasEnvio}
      where correduria_id = ${correduriaId}::uuid and cliente_id = ${grupo.clienteId}::uuid and message_id_raiz = ${grupo.raiz}`
  } catch (e) {
    console.error('[seguimiento-lead] hilo sin anotar:', e instanceof Error ? e.name : 'error')
  }
  if (env.repetido) return { estado: 'enviado', historial: false, repetido: true }
  let historial = false
  try {
    await prisma.$executeRaw`
      insert into seguros.historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${grupo.clienteId}::uuid, cast('contacto' as seguros.tipo_historial_interno),
              ${textoHistorialRecordatorio(r.etapa, r.asunto, r.actor)})`
    historial = true
  } catch (e) {
    console.error('[seguimiento-lead] historial no anotado:', e instanceof Error ? e.name : 'error')
  }
  return { estado: 'enviado', historial }
}

// ─── cerrar como perdida ─────────────────────────────────────────────────────

export type ResultadoCerrar =
  | { estado: 'cerrado'; perdidas: number; fallidas: number }
  | { estado: 'ya_cerrado' | 'no_encontrado' | 'sin_migracion' }

export async function cerrarPerdidaSeguimiento(correduriaId: string, c: { hiloId: string; actor: string }): Promise<ResultadoCerrar> {
  let grupo: GrupoHilo | undefined
  try { grupo = (await leerGrupos(correduriaId, c.hiloId, 1))[0] } catch (e) {
    if (sinMigracion(e)) return { estado: 'sin_migracion' }
    throw e
  }
  if (!grupo) return { estado: 'no_encontrado' }
  // Un solo cierre: la fila del hilo se marca ANTES (y solo si no lo estaba); dos pulsaciones = una gana.
  const n = await prisma.$executeRaw`
    update seguros.correduria_hilo set cerrado_perdido_at = now(), cerrado_por = ${c.actor}
    where correduria_id = ${correduriaId}::uuid and cliente_id = ${grupo.clienteId}::uuid and message_id_raiz = ${grupo.raiz}
      and cerrado_perdido_at is null`
  if (!n) return { estado: 'ya_cerrado' }
  const { cambiarEstadoOportunidad } = await import('./oportunidad-seguimiento')
  let perdidas = 0
  let fallidas = 0
  for (const id of grupo.oportunidadIds) {
    const r = await cambiarEstadoOportunidad(correduriaId, id, { accion: 'perder', motivo: 'sin_respuesta', detalle: DETALLE_PERDIDA_SEGUIMIENTO }, c.actor)
      .catch(() => ({ ok: false as const }))
    if (r.ok) perdidas++
    else fallidas++ // ya cerrada (ganada/perdida) o ilegible: se queda como estaba y se dice
  }
  if (!grupo.oportunidadIds.length) {
    await prisma.$executeRaw`
      insert into seguros.historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${grupo.clienteId}::uuid, cast('contacto' as seguros.tipo_historial_interno),
              ${`Lead por correo cerrado como perdido (sin respuesta al seguimiento) por ${c.actor}.`})`.catch(() => 0)
  }
  return { estado: 'cerrado', perdidas, fallidas }
}
