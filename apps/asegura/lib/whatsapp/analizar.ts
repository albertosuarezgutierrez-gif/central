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
import { recibosPendientesDe, salienteVinculadoDe, type ReciboParaAnalisis, type SalienteParaAnalisis } from './salientes'
import { aplicarSiAutonoma, avisarTelegram, crearPropuesta, type ContextoAprendizaje } from './propuestas'
import { casosResueltos } from './aprendizaje'
import { casoParaIA, elegirCasos, extractoRedactado } from './aprendizaje-reglas'
import { respuestaIaActiva } from './config'
import { avisoVencimientoDisponible } from './aviso-vencimiento-reglas'
import { decidirRespuesta, esBaja, puedeResponder, sistemaRespuesta, TEXTO_MOTIVO, type Pre } from './respuesta-reglas'
import { enviarRespuesta, leerEstadoRespuesta, type ResultadoRespuesta } from './respuesta'
import { redactarPii } from '@central/module-seguros'

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

type Reclamada = { opt_out_conv?: boolean; id: string; estado: string; cliente_id: string | null; clientes_candidatos: number | null; perfil: string | null; telefono: string | null; intentos: number; telefono_hash?: string | null }

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
              c.wa_opt_out_at is not null as opt_out_conv, c.wa_telefono_hash as telefono_hash`)
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

  // El historial importado (Coexistence) solo sirve de contexto en una conversación con UNA ficha exacta.
  const fichaUnicaConv = cliente !== null && c.clientes_candidatos === 1
  const filas = await db.$queryRaw<{ direccion: 'entrante' | 'saliente'; contenido: string; enviado_at: Date; tipo: string | null }[]>(Prisma.sql`
    select direccion, contenido, enviado_at, tipo from mensajes
     where conversacion_id = ${c.id}::uuid and direccion is not null and texto_purgado_at is null and enviado_at is not null
       and (${fichaUnicaConv} or coalesce(metadata->>'origen', '') <> 'historial')
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

  // La respuesta que se interpreta = el último mensaje ENTRANTE (los saliente vinculados se buscan antes de ella).
  const ultimaEntrante = filas.find((f) => f.direccion === 'entrante')?.enviado_at ?? null

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

  // D4: «en vigor» = alguna póliza `esCarteraEnVigor` de la ficha (los ramos de arriba). null = no se pudo leer.
  const enVigor = cliente ? (ramos === null ? null : ramos.length > 0) : false
  // Una ficha exacta o nada: sin ella ni saliente ni recibos (no se le atribuye nada a nadie).
  const fichaUnica = cliente !== null && c.clientes_candidatos === 1
  const [saliente, recibos]: [SalienteParaAnalisis | null, ReciboParaAnalisis[] | null] = fichaUnica && cliente && c.telefono_hash && ultimaEntrante
    ? await Promise.all([
        salienteVinculadoDe(correduriaId, c.telefono_hash, ultimaEntrante).catch(() => null),
        enVigor === true ? recibosPendientesDe(correduriaId, cliente.id) : Promise.resolve<ReciboParaAnalisis[] | null>([]),
      ])
    : [null, null]

  // Aprendizaje: el último mensaje del cliente, REDACTADO (para el registro y para buscar casos parecidos), y los casos
  // que Alberto ya resolvió que más se le parecen. Solo cuando puede haber propuestas (ficha única y póliza en vigor).
  const textoUltimaEntrante = (() => {
    const f = filas.find((x) => x.direccion === 'entrante')
    return f ? descifrar(f.contenido) : null
  })()
  const extracto = extractoRedactado(textoUltimaEntrante, [perfil, cliente?.nombre, cliente?.apellidos])
  const contextoAprendizaje: ContextoAprendizaje = { origenSaliente: saliente?.origen ?? null, extracto }
  // Puede haber propuestas con póliza en vigor (recibos) o con una oportunidad abierta (vencimiento de un lead: D4 ajustada).
  const casos = fichaUnica && (enVigor === true || oportunidades.length > 0) ? await casosResueltos(correduriaId) : undefined

  // Respuesta automática (ASEGURA_WHATSAPP_RESPUESTA_ACTIVA=1). Con el flag apagado no se lee nada más ni cambia el prompt.
  const flagRespuesta = respuestaIaActiva()
  // La respuesta solo promete avisos si el aviso de vencimiento por plantilla está de verdad disponible.
  const promesaAviso = avisoVencimientoDisponible()
  let pre: Pre = { ok: false, motivo: 'flag_apagado' }
  let entranteId: string | null = null
  let tipoEntrante = 'text'
  if (flagRespuesta && cliente) {
    const est = await leerEstadoRespuesta(correduriaId, c.id, {
      flag: true, tipoFicha: cliente.tipo, clientesCandidatos: c.clientes_candidatos, estadoConversacion: c.estado, optOut: false,
    }).catch((e) => {
      console.error('[whatsapp-ia] estado de respuesta no leído:', e instanceof Error ? e.name : 'error')
      return null
    })
    if (est && est !== 'sin_migracion') {
      pre = puedeResponder(est)
      entranteId = est.ultimaEntrante?.id ?? null
      tipoEntrante = est.ultimaEntrante?.tipo ?? 'text'
    } else pre = { ok: false, motivo: 'sin_migracion' }
  }

  const contextoIA: ContextoParaIA = {
    tiene_ficha: cliente !== null,
    tipo_ficha: cliente?.tipo ?? null,
    lead_estado: cliente?.tipo === 'lead' ? cliente.leadEstado : null,
    ramos_contratados: cliente ? ramos : null,
    oportunidades_abiertas: oportunidades.map((o) => ({ ramo: o.ramo, estado: o.estado, vencimiento: o.fecha })),
    // Sin ids ni datos personales: de qué iba lo último que se le mandó, y los recibos por ramo/fecha/importe.
    ultimo_saliente: saliente ? { origen: saliente.origen, ramo: saliente.ramo, fecha: saliente.fecha, importe: saliente.importe } : null,
    recibos_pendientes: recibos ? recibos.map((r) => ({ ramo: r.ramo, estado: r.situacion, efecto: r.efecto, importe: r.importe })) : null,
    // null = no se pudo leer el registro (≠ «no hay casos»); ausente = aquí no puede haber propuestas.
    ...(casos === undefined ? {} : { casos_previos: casos === null ? null : elegirCasos(casos, contextoAprendizaje).map(casoParaIA) }),
  }

  let crudo: string
  try {
    crudo = await iaTexto(construirPrompt(contextoIA, transcripcion), {
      system: pre.ok ? SISTEMA + sistemaRespuesta({ promesaAviso }) : SISTEMA,
      maxTokens: pre.ok ? 1100 : 900,
      timeoutMs: 45_000,
      privado: true,
    })
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
    enVigor,
    recibosPendientes: recibos ? recibos.map((r) => ({ id: r.id, ramo: r.ramo, situacion: r.situacion })) : null,
    saliente: saliente ? { origen: saliente.origen, reciboId: saliente.reciboId, oportunidadId: saliente.oportunidadId } : null,
  }
  const plan = planificar(analisis, ctx)
  const { resultados, clienteId: clienteFinal } = await ejecutar(plan, ctx, depsBd(correduriaId, c, contextoAprendizaje))

  // Respuesta automática: solo si `pre.ok` (todas las guardas previas) y la decisión posterior lo permite.
  const descartaPersonal = plan.pasos.some((x) => x.tipo === 'descartarPersonal')
  const baja = flagRespuesta && fichaUnica && analisis.es_comercial && esBaja(analisis.intencion, textoUltimaEntrante)
  let respuestaAviso: { estado: ResultadoRespuesta | 'no_enviada'; texto?: string; motivo?: string } | undefined
  if (pre.ok && entranteId) {
    const d = decidirRespuesta({
      esComercial: analisis.es_comercial, descartaPersonal, baja, tipoEntrante, respuestaIA: analisis.respuesta, promesaAviso,
      redactar: (t) => redactarPii(t),
    })
    if (d.enviar) {
      const r = await enviarRespuesta(correduriaId, { conversacionId: c.id, entranteId, telefonoCifrado: c.telefono, texto: d.texto, clase: d.clase }).catch((e) => {
        console.error('[whatsapp-ia] respuesta:', e instanceof Error ? e.name : 'error')
        return 'fallida' as const
      })
      respuestaAviso = r === 'enviada' || r === 'fallida' ? { estado: r, texto: d.texto } : { estado: r }
    } else {
      respuestaAviso = { estado: 'no_enviada', motivo: TEXTO_MOTIVO[d.motivo] ?? d.motivo }
    }
  }
  const urgente = baja
    ? 'Pide la BAJA / no renovar. La IA NO ha cambiado nada: la oposición a la prórroga exige escrito del tomador al menos 1 mes antes del vencimiento (art. 22 LCS).'
    : undefined

  // Siempre aviso a Alberto (spec §1) de lo hecho y lo propuesto, con botones ✅/❌ por propuesta. Best effort.
  if (clienteFinal && (plan.pasos.length > 0 || respuestaAviso || urgente)) {
    const hechos = resultados.filter((x) => x.resultado === 'hecho' && x.tipo !== 'proponer').map((x) => ETIQUETA_HECHO[x.tipo] ?? x.tipo)
    const creadas = resultados.filter((x) => x.tipo === 'proponer' && x.resultado === 'hecho' && x.id).map((x) => x.id as string)
    // Modo autónomo (apagado por defecto): solo con el flag y la racha del TIPO ≥ umbral; si no, quedan con sus botones.
    const propuestas: { id: string; autonoma: boolean }[] = []
    for (const id of creadas) propuestas.push({ id, autonoma: await aplicarSiAutonoma(correduriaId, id) })
    const nombrePila = (cliente?.nombre ?? '').trim().split(/\s+/)[0] || null
    await avisarTelegram(correduriaId, {
      clienteId: clienteFinal, nombrePila, hechos, propuestas,
      ...(respuestaAviso ? { respuesta: respuestaAviso, conversacionId: c.id } : {}),
      ...(urgente ? { urgente } : {}),
    })
  }

  // Una conversación personal no guarda ni el resumen: solo que se clasificó así. La `respuesta` propuesta por la IA no
  // se guarda aquí (la enviada ya está, cifrada, en `mensajes`).
  const { respuesta: _respuesta, ...sinRespuesta } = analisis
  const guardado = descartaPersonal
    ? { es_comercial: false, acciones: resultados }
    : { ...sinRespuesta, acciones: resultados }
  await cerrar(Prisma.sql`, analisis = ${JSON.stringify(guardado)}::jsonb, analizada_at = now(), analisis_modelo = ${`${viaIA()}:asegura`},
                             analisis_intentos = 0, analisis_error = null`)
  return resultados.filter((x: ResultadoPaso) => x.resultado === 'hecho').length
}

const ETIQUETA_HECHO: Record<string, string> = {
  crearLead: 'Lead nuevo creado',
  updateLead: 'Lead avanzado',
  createOpportunity: 'Oportunidad abierta',
  updateOpportunity: 'Oportunidad completada',
  createTask: 'Tarea creada',
  updateContact: 'Nombre rellenado',
  addConversationNote: 'Nota en la ficha',
}

// ── Las escrituras reales del ejecutor ─────────────────────────────────────────

function depsBd(correduriaId: string, c: Reclamada, aprendizaje: ContextoAprendizaje): DepsEjecutor {
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
        { origen: 'whatsapp_ia' },
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

    async crearPropuesta(clienteId, p) {
      // SOLO la propuesta: nada de la cartera se toca hasta que Alberto pulse ✅ (resolverPropuesta).
      const r = await crearPropuesta(correduriaId, { clienteId, conversacionId: c.id, tipo: p.propuesta, reciboId: p.reciboId, oportunidadId: p.oportunidadId, fecha: p.fecha }, aprendizaje)
      return r.ok ? { ok: true, id: r.id } : { ok: false, motivo: r.motivo }
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
