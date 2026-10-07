// Fase 2 del canal WhatsApp: análisis con IA de las conversaciones con mensajes nuevos y ≥10 min
// de silencio, y ejecución de las acciones (lista blanca, `ejecutor.ts`). Lo llama el cron
// `whatsapp-analizar` con ASEGURA_WHATSAPP_IA_ACTIVO=1.
//
// Idempotente aunque el cron corra dos veces: cada conversación se RECLAMA (`analisis_reclamado_at`,
// `for update skip locked`) y `analizada_hasta` solo avanza al terminar. Las acciones, además, se
// deduplican en BD (oportunidad abierta del ramo, tarea pendiente de la IA del mismo tipo).
// Un fallo de la IA no avanza `analizada_hasta`; al tercero seguido se salta ese tramo (y se dice).

import { cleanJSON } from '@central/core-ai'
import { WHERE_CARTERA_EN_VIGOR, telefonoParaFicha } from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'
import { Prisma } from '../generated/asegura-client'
import { prismaAsegura } from '../asegura-db'
import { iaTexto, viaIA } from '../ia'
import { altaCliente } from '../cartera-edicion'
import { crearOportunidad } from '../oportunidad-seguimiento'
import { SISTEMA, construirPrompt, construirTranscripcion, parsearAnalisis, type ContextoParaIA, type MensajeTranscripcion } from './analisis'
import { ACTOR_IA, ORIGEN_TAREA_IA, ejecutar, planificar, type ClienteContexto, type ContextoEjecucion, type DepsEjecutor, type ResultadoPaso } from './ejecutor'
import { purgarTextoConversacion } from './retencion'
import { excluidaPorOptOut } from './optout'

const ESTADOS_ABIERTOS = ['competencia', 'en_negociacion', 'pendiente_cliente']
const MAX_INTENTOS = 3

export function hoyMadrid(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

function descifrar(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || v === '') return null
  if (!v.startsWith('v1:')) return v
  try {
    return decryptField(v)
  } catch {
    return null
  }
}

type Reclamada = { opt_out_conv?: boolean; id: string; estado: string; cliente_id: string | null; clientes_candidatos: number | null; perfil: string | null; telefono: string | null; intentos: number }

export type ResumenAnalisis = { analizadas: number; fallidas: number; saltadas: number; acciones: number }

export async function analizarPendientes(correduriaId: string, limite = 10): Promise<ResumenAnalisis> {
  const db = prismaAsegura()
  const reclamadas = await db.$queryRaw<Reclamada[]>(Prisma.sql`
    update conversaciones c set analisis_reclamado_at = now()
     where c.correduria_id = ${correduriaId}::uuid and c.id in (
       select id from conversaciones
        where correduria_id = ${correduriaId}::uuid and wa_telefono_hash is not null
          and estado in ('abierta', 'pendiente_clasificar')
          and ultimo_mensaje_at is not null
          and wa_opt_out_at is null
          and not exists (select 1 from clientes cl where cl.id = conversaciones.cliente_id and cl.wa_opt_out_at is not null)
          and ultimo_mensaje_at > coalesce(analizada_hasta, '-infinity'::timestamptz)
          and ultimo_mensaje_at < now() - interval '10 minutes'
          and (analisis_reclamado_at is null or analisis_reclamado_at < now() - interval '30 minutes')
        order by ultimo_mensaje_at asc
        limit ${limite}
        for update skip locked)
    returning c.id::text as id, c.estado, c.cliente_id::text as cliente_id, c.clientes_candidatos,
              c.wa_perfil_nombre_cifrado as perfil, c.wa_telefono_cifrado as telefono, c.analisis_intentos as intentos,
              c.wa_opt_out_at is not null as opt_out_conv`)
  const r: ResumenAnalisis = { analizadas: 0, fallidas: 0, saltadas: 0, acciones: 0 }
  for (const c of reclamadas) {
    try {
      const x = await analizarUna(correduriaId, c)
      if (x === 'saltada') r.saltadas++
      else if (x === 'fallida') r.fallidas++
      else {
        r.analizadas++
        r.acciones += x
      }
    } catch (e) {
      r.fallidas++
      console.error('[whatsapp-ia] conversación no analizada:', e instanceof Error ? e.name : 'error')
      await fallo(correduriaId, c, null, 'excepcion').catch(() => {})
    }
  }
  return r
}

async function hastaDe(conversacionId: string): Promise<Date | null> {
  const [f] = await prismaAsegura().$queryRaw<{ hasta: Date | null }[]>(Prisma.sql`
    select max(enviado_at) as hasta from mensajes where conversacion_id = ${conversacionId}::uuid and direccion is not null`)
  return f?.hasta ?? null
}

async function fallo(correduriaId: string, c: Reclamada, hasta: Date | null, motivo: string): Promise<void> {
  // Al tercer fallo seguido se salta el tramo: si no, una conversación que la IA no sabe leer se
  // pagaría cada 15 minutos para siempre. Queda dicho en `analisis_error`.
  const saltar = c.intentos + 1 >= MAX_INTENTOS
  const h = saltar ? hasta ?? (await hastaDe(c.id)) : null
  await prismaAsegura().$executeRaw(Prisma.sql`
    update conversaciones
       set analisis_reclamado_at = null,
           analisis_intentos = case when ${saltar} then 0 else analisis_intentos + 1 end,
           analizada_hasta = case when ${saltar} then coalesce(${h}::timestamptz, analizada_hasta) else analizada_hasta end,
           analisis_error = ${saltar ? `${motivo} (tramo saltado tras ${MAX_INTENTOS} intentos)` : motivo}
     where id = ${c.id}::uuid and correduria_id = ${correduriaId}::uuid`)
}

type FilaCliente = { id: string; tipo: string; lead_estado: string | null; fuente: string | null; nombre: string | null; apellidos: string | null; fusionada_en: string | null; opt_out: boolean }

async function clienteVivo(correduriaId: string, clienteId: string): Promise<(ClienteContexto & { apellidos: string | null; optOut: boolean }) | null> {
  let id: string | null = clienteId
  for (let salto = 0; salto < 5 && id; salto++) {
    const filas: FilaCliente[] = await prismaAsegura().$queryRaw<FilaCliente[]>(Prisma.sql`
      select id::text as id, tipo::text as tipo, lead_estado::text as lead_estado, fuente::text as fuente, nombre, apellidos,
             merged_into_cliente_id::text as fusionada_en, wa_opt_out_at is not null as opt_out
        from clientes where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`)
    const f = filas[0]
    if (!f) return null
    if (f.fusionada_en === null) {
      const tipo = f.tipo === 'lead' || f.tipo === 'beneficiario' ? f.tipo : 'cliente'
      return { id: f.id, tipo, leadEstado: f.lead_estado, fuente: f.fuente, nombre: f.nombre, apellidos: f.apellidos, optOut: f.opt_out }
    }
    id = f.fusionada_en
  }
  return null
}

async function analizarUna(correduriaId: string, c: Reclamada): Promise<number | 'saltada' | 'fallida'> {
  const db = prismaAsegura()
  const hasta = await hastaDe(c.id)
  const cerrar = (extra: Prisma.Sql = Prisma.empty) =>
    db.$executeRaw(Prisma.sql`
      update conversaciones set analisis_reclamado_at = null, analizada_hasta = coalesce(${hasta}::timestamptz, analizada_hasta) ${extra}
       where id = ${c.id}::uuid and correduria_id = ${correduriaId}::uuid`)

  const cliente = c.cliente_id ? await clienteVivo(correduriaId, c.cliente_id) : null
  // Opt-out (conversación o ficha, también tras fusiones): ni IA ni acciones.
  if (excluidaPorOptOut(c, cliente)) {
    await cerrar()
    return 'saltada'
  }

  const filas = await db.$queryRaw<{ direccion: 'entrante' | 'saliente'; contenido: string; enviado_at: Date }[]>(Prisma.sql`
    select direccion, contenido, enviado_at from mensajes
     where conversacion_id = ${c.id}::uuid and direccion is not null and texto_purgado_at is null and enviado_at is not null
     order by enviado_at desc limit 40`)
  const mensajes: MensajeTranscripcion[] = []
  for (const f of filas) {
    const texto = descifrar(f.contenido)
    if (texto) mensajes.push({ direccion: f.direccion, texto, fecha: f.enviado_at })
  }
  if (mensajes.length === 0) {
    await cerrar()
    return 'saltada'
  }

  const perfil = descifrar(c.perfil)
  const transcripcion = construirTranscripcion(mensajes, { nombres: [perfil, cliente?.nombre, cliente?.apellidos] })

  const [oportunidades, tareas, ramos] = cliente
    ? await Promise.all([
        db.$queryRaw<{ id: string; ramo: string; estado: string; fecha: string | null }[]>(Prisma.sql`
          select id::text as id, tipo::text as ramo, estado::text as estado, to_char(fecha_fin_vigencia, 'YYYY-MM-DD') as fecha
            from oportunidades
           where correduria_id = ${correduriaId}::uuid and cliente_id = ${cliente.id}::uuid and estado::text = any(${ESTADOS_ABIERTOS}::text[])`),
        db.$queryRaw<{ tipo: string }[]>(Prisma.sql`
          select tipo::text as tipo from gestiones
           where correduria_id = ${correduriaId}::uuid and cliente_id = ${cliente.id}::uuid
             and origen_trigger = ${ORIGEN_TAREA_IA} and estado::text in ('pendiente', 'en_curso')`),
        db.poliza
          .findMany({ where: { AND: [{ correduriaId, clienteId: cliente.id }, WHERE_CARTERA_EN_VIGOR] }, select: { tipo: true } })
          .then((ps) => [...new Set(ps.map((p) => String(p.tipo)))])
          // «No se pudo leer» no es «no tiene seguros»: null.
          .catch(() => null),
      ])
    : [[], [], null]

  const contextoIA: ContextoParaIA = {
    tiene_ficha: cliente !== null,
    tipo_ficha: cliente?.tipo ?? null,
    lead_estado: cliente?.tipo === 'lead' ? cliente.leadEstado : null,
    ramos_contratados: cliente ? ramos : null,
    oportunidades_abiertas: oportunidades.map((o) => ({ ramo: o.ramo, estado: o.estado, vencimiento: o.fecha })),
  }

  let crudo: string
  try {
    crudo = await iaTexto(construirPrompt(contextoIA, transcripcion), { system: SISTEMA, maxTokens: 900, timeoutMs: 45_000, privado: true })
  } catch {
    await fallo(correduriaId, c, hasta, 'ia_no_responde')
    return 'fallida'
  }
  const p = parsearAnalisis(crudo, cleanJSON)
  if (!p.ok) {
    await fallo(correduriaId, c, hasta, p.motivo.slice(0, 200))
    return 'fallida'
  }
  const analisis = p.analisis

  const ctx: ContextoEjecucion = {
    correduriaId,
    conversacionId: c.id,
    estadoConversacion: c.estado,
    clientesCandidatos: c.clientes_candidatos,
    cliente,
    oportunidadesAbiertas: oportunidades.map((o) => ({ id: o.id, ramo: o.ramo, estado: o.estado, fechaFinVigencia: o.fecha })),
    tareasIaPendientes: tareas,
    perfilNombre: perfil,
    hoy: hoyMadrid(),
  }
  const plan = planificar(analisis, ctx)
  const { resultados } = await ejecutar(plan, ctx, depsBd(correduriaId, c))

  const descartada = plan.pasos.some((x) => x.tipo === 'descartarPersonal')
  // Una conversación personal no guarda ni el resumen: solo que se clasificó así.
  const guardado = descartada
    ? { es_comercial: false, acciones: resultados }
    : { ...analisis, acciones: resultados }
  await cerrar(Prisma.sql`, analisis = ${JSON.stringify(guardado)}::jsonb, analizada_at = now(), analisis_modelo = ${`${viaIA()}:asegura`},
                             analisis_intentos = 0, analisis_error = null`)
  return resultados.filter((x: ResultadoPaso) => x.resultado === 'hecho').length
}

// ── Las escrituras reales del ejecutor ─────────────────────────────────────────

function depsBd(correduriaId: string, c: Reclamada): DepsEjecutor {
  const db = prismaAsegura()
  const historial = (clienteId: string, texto: string) =>
    db.$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('contacto' as tipo_historial_interno), ${texto.slice(0, 2000)})`)

  return {
    async descartarPersonal(conversacionId) {
      await purgarTextoConversacion(correduriaId, conversacionId, { descartar: true })
    },

    async crearLead(nombre) {
      const e164 = descifrar(c.telefono)
      const telefono = telefonoParaFicha(e164)
      if (!telefono) return { ok: false, motivo: 'telefono_ilegible' }
      // La misma alta que plataforma (`altaCliente`): busca por teléfono antes de crear y no duplica.
      const r = await altaCliente(correduriaId, { nombre, telefono, fuente: 'whatsapp', notas: 'primer contacto por WhatsApp, clasificado como comercial por la IA' }, ACTOR_IA)
      let clienteId: string | null = null
      let existente = false
      if (r.ok) clienteId = r.id
      else if (r.estado === 'conflicto' && r.coincidencias?.length === 1) {
        clienteId = r.coincidencias[0].id
        existente = true
      } else return { ok: false, motivo: r.estado === 'conflicto' ? 'telefono_compartido' : r.estado }
      await db.$executeRaw(Prisma.sql`
        update conversaciones set cliente_id = ${clienteId}::uuid, estado = 'abierta', clientes_candidatos = 1, clasificada_at = now(), updated_at = now()
         where id = ${c.id}::uuid and correduria_id = ${correduriaId}::uuid and cliente_id is null`)
      return { ok: true, clienteId, existente }
    },

    async actualizarLead(clienteId, p) {
      const anteriores = p.leadEstado ? ['nuevo', 'contactado', 'cualificado', 'propuesta'].slice(0, ['nuevo', 'contactado', 'cualificado', 'propuesta'].indexOf(p.leadEstado)) : null
      const n = await db.$executeRaw(Prisma.sql`
        update clientes set
          lead_estado = case when ${p.leadEstado}::text is not null and lead_estado::text = any(${anteriores ?? []}::text[])
                             then cast(${p.leadEstado} as lead_estado) else lead_estado end,
          fuente = case when ${p.fuenteWhatsapp} and fuente is null then cast('whatsapp' as fuente_origen) else fuente end,
          updated_at = now()
         where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid and merged_into_cliente_id is null and tipo::text = 'lead'
           and ((${p.leadEstado}::text is not null and lead_estado::text = any(${anteriores ?? []}::text[]))
                or (${p.fuenteWhatsapp} and fuente is null))`)
      if (n > 0 && p.leadEstado) await historial(clienteId, `Lead → ${p.leadEstado} por la conversación de WhatsApp — por ${ACTOR_IA}`)
      return n > 0
    },

    async crearOportunidad(clienteId, p) {
      const r = await crearOportunidad(
        correduriaId,
        clienteId,
        { ramo: p.ramo, fechaFinVigencia: p.fechaFinVigencia ?? undefined, aseguradora: p.aseguradora ?? undefined, tipoTarea: 'llamada', fechaTarea: p.fechaTarea, nota: p.nota ?? `WhatsApp: interés en ${p.ramo.replace('_', ' ')}` },
        ACTOR_IA,
        undefined,
        'whatsapp_ia',
      )
      if (r.ok) return { ok: true, id: r.id }
      return { ok: false, motivo: r.estado === 'duplicada' ? 'ya_hay_abierta' : r.estado }
    },

    async actualizarOportunidad(clienteId, p) {
      return db.$transaction(async (tx) => {
        const [o] = await tx.$queryRaw<{ estado: string }[]>(Prisma.sql`
          select estado::text as estado from oportunidades
           where id = ${p.oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid and cliente_id = ${clienteId}::uuid
             and estado::text = any(${ESTADOS_ABIERTOS}::text[])
           for update`)
        if (!o) return false
        const estadoNuevo = p.estado && o.estado === p.estado.antes ? p.estado.despues : null
        const riesgo = p.infoRiesgo ? JSON.stringify(p.infoRiesgo) : null
        const n = await tx.$executeRaw(Prisma.sql`
          update oportunidades set
            estado = coalesce(cast(${estadoNuevo} as estado_comercial), estado),
            fecha_fin_vigencia = coalesce(fecha_fin_vigencia, ${p.fechaFinVigencia}::date),
            info_riesgo = case when ${riesgo}::jsonb is null then info_riesgo
                          else jsonb_set(coalesce(info_riesgo, '{}'::jsonb), '{whatsapp_ia}',
                                         coalesce(info_riesgo->'whatsapp_ia', '{}'::jsonb) || ${riesgo}::jsonb) end
           where id = ${p.oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`)
        if (n === 0) return false
        // Historial append-only: qué campos, sin texto libre ni valores del riesgo.
        await tx.$executeRaw(Prisma.sql`
          insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
          values (${correduriaId}::uuid, ${p.oportunidadId}::uuid, 'whatsapp_ia', cast(${o.estado} as estado_comercial),
                  cast(${estadoNuevo ?? o.estado} as estado_comercial),
                  ${JSON.stringify({ fechaFinVigencia: p.fechaFinVigencia, riesgo: p.infoRiesgo ? Object.keys(p.infoRiesgo) : [] })}::jsonb, ${ACTOR_IA})`)
        return true
      })
    },

    async crearTarea(clienteId, p) {
      const id = await db.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${`whatsapp_ia:${clienteId}:${p.tipoTarea}`}))`)
        const [ya] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          select id::text as id from gestiones
           where correduria_id = ${correduriaId}::uuid and cliente_id = ${clienteId}::uuid and origen_trigger = ${ORIGEN_TAREA_IA}
             and tipo::text = ${p.tipoTarea} and estado::text in ('pendiente', 'en_curso') limit 1`)
        if (ya) return null
        const [nueva] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, origen_trigger)
          values (${correduriaId}::uuid, cast(${p.tipoTarea} as gestion_tipo), cast(${p.prioridad} as gestion_prioridad), 'pendiente',
                  ${`WhatsApp (IA): ${p.descripcion}`.slice(0, 2000)}, (${p.fechaLimite}::date + time '23:59:59') at time zone 'Europe/Madrid',
                  ${clienteId}::uuid, ${ORIGEN_TAREA_IA})
          returning id::text as id`)
        return nueva.id
      })
      return id ? { ok: true, id } : { ok: false, motivo: 'ya_existe' }
    },

    async rellenarNombre(clienteId, nombre) {
      // El guardián está en el WHERE: solo si la ficha sigue sin nombre. Nunca se pisa uno puesto.
      const n = await db.$executeRaw(Prisma.sql`
        update clientes set nombre = ${nombre}, updated_at = now()
         where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid and merged_into_cliente_id is null
           and (trim(nombre) = '' or lower(regexp_replace(trim(nombre), '\\s+', ' ', 'g')) in ('(sin nombre)', 'sin nombre'))`)
      if (n > 0) await historial(clienteId, `Nombre tomado de la conversación de WhatsApp (la ficha no tenía) — por ${ACTOR_IA}`)
      return n > 0
    },

    async anotarNota(clienteId, texto) {
      await historial(clienteId, `WhatsApp (resumen IA): ${texto}`)
    },

    async auditar(e) {
      const estado = e.resultado === 'hecho' ? 200 : e.resultado === 'omitido' ? 409 : e.resultado === 'rechazado' ? 422 : 500
      const cambios = [{ entidad: 'whatsapp_ia', id: c.id, campo: e.accion, antes: null, despues: e.motivo ? `${e.resultado}:${e.motivo}` : e.resultado }]
      try {
        await db.$executeRaw(Prisma.sql`
          insert into auditoria (actor_tipo, actor_id, metodo, ruta, estado_http, ids, cambios)
          values ('agente', 'whatsapp-ia', 'IA', '/api/cron/whatsapp-analizar', ${estado}, ${JSON.stringify(e.ids)}::jsonb, ${JSON.stringify(cambios)}::jsonb)`)
      } catch (err) {
        console.error('[auditoria] no se pudo registrar la acción de la IA de WhatsApp', e.accion, err instanceof Error ? err.name : err)
      }
    },
  }
}
