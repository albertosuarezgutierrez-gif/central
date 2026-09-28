// Asistente de la correduría por Telegram — parte con BD, red e IA. La lógica que se puede probar
// vive en `correduria-asistente.ts` (pura, con tests); aquí solo se cablea.
//
// Privacidad (decisión 26/09/2026): los datos de clientes solo van a OpenRouter con
// `data_collection: 'deny'` y `zdr: true`. Si eso falla NO se cae a la cadena gratis
// (NIM/Groq/Cerebras/Kimi), que no garantiza que el proveedor no guarde lo que le mandas: se dice
// «no disponible» y ya.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { openrouterChatEx, openrouterChatTools, type NimToolMessage } from '@central/core-ai'
import { tgSend, tgSendButtons, tgAskForReply, escapeHtml } from '@central/core-telegram'
import { eur } from '@/lib/dinero'
import { openrouterConfigPasarela, modelosPorDefecto, getDirectorEstado } from '@/lib/ia-director'
import { registrarUso, dentroDePresupuestoDiario, estimarTokens, costePorUso } from '@/lib/ai-gateway'
import { buscarAsegura, impagadosAsegura, sustitucionesAsegura } from '@/lib/correduria-puerto'
import { fichaAsegura } from '@/lib/ficha-asegura'
import { polizaAsegura } from '@/lib/poliza-asegura'
import { vencimientosAsegura } from '@/lib/cartera-asegura'
import { emitirAsegura, importarProyectoAsegura, tarificacionNuevaGuardadaAsegura, vistaImportacionAsegura } from '@/lib/retarificar-asegura'
import { interpretarPreparado, prepararPresupuestoAsegura, retirarPresupuestoAsegura, textoAviso } from '@/lib/presupuesto-asegura'
import { editarClienteAsegura, interpretarEscritura } from '@/lib/cliente-edicion-asegura'
import { documentosAsegura, leerDocumentoOportunidadAsegura, subirDocumentoAsegura } from '@/lib/documentos-asegura'
import {
  accionOportunidadAsegura, colaLlamadas, interpretarLeads, interpretarLecturaOportunidad, interpretarOportunidadesCliente,
  interpretarTareasHoy, leadsCompetenciaAsegura, oportunidadesClienteAsegura, tareasHoyAsegura, type LecturaDocumentoOportunidad,
} from '@/lib/seguimiento-asegura'
import { carteraAsegura } from '@/lib/cartera-asegura'
import { crearTareaAsegura, registrarLlamadaAsegura, oportunidadAsegura, interpretarOportunidad, rotuloRamo } from '@/lib/seguimiento-asegura'
import { altaClienteAsegura, historialClienteAsegura } from '@/lib/cliente-edicion-asegura'
import { abrirSiniestroAsegura } from '@/lib/siniestros-asegura'
import { explicarPortal, interpretarPortal, invitarPortalAsegura, portalAsegura } from '@/lib/portal-cliente-asegura'
import { prepararAccion, resultadoAccion, textoAccion, type TipoAccion } from './correduria-acciones-tg'
import { descargarTelegram, getCuentaTelegram, manejarDocumentoTg } from '@/lib/contable/telegram'
import { avisoDocumentosPendientes, cambiosSobreExistente, mismaPoliza, cuerpoAlta, cuerpoEdicion, explicarQuien, resultadoEdicion, textoCambios, MINUTOS_DOCUMENTO_RECIENTE, prepararAlta, quienEsDelDocumento, resultadoAlta, enlaceTarificar, polizaYaNuestra, resultadoAltaLead, textoAlta, textoAltaLead, type Alta } from './correduria-oportunidad-tg'
import {
  documentoQueAcredita, edicionDeCambios, faltaValorActual, huellaAntes, prepararCorreccion, resultadoCorreccion, textoCorreccion,
  urlCliente, type Cambio, type FichaActual,
} from './correduria-correccion-tg'
import {
  ACTOR_EMISION_TG, emisionTgActiva, huellaResumen, MINUTOS_PROPUESTA, prepararResumen, proyectoValido, resultadoEmision,
  textoResumen, urlPoliza, type ResumenEmision,
} from './correduria-emision-tg'
import {
  apagado, clasificarDestino, costeConservador, ERROR_NO_UUID, hoyMadrid, memoriaIds, DIAS_RETENCION_TEXTO, rastroArgs, tienePrefijo, diasValidos, enmascarar, HERRAMIENTAS, idValido,
  leerArgumentos, leerClasificacion, MAX_TURNOS_DIA, MAX_VUELTAS, paraIA, preguntaNota, reglaConDatoPersonal,
  sinPrefijo, SYSTEM_CLASIFICADOR, systemAsistente,
} from './correduria-asistente'

const APP = 'correduria-asistente'
/** Proveedores que no guardan ni entrenan con lo que se les manda. */
const PROVEEDOR_PRIVADO = { zdr: true }

type Rastro = { nombre: string; args: Record<string, unknown>; ok: boolean }

// ── Reparto ──────────────────────────────────────────────────────────────────────────────────────

/**
 * ¿Este texto libre es para el asistente de la correduría? Determinista primero; lo dudoso lo
 * decide una IA con las mismas garantías de privacidad. Cualquier fallo → contable (lo de siempre).
 */
export async function esParaCorreduria(texto: string): Promise<boolean> {
  // El atajo explícito va siempre al asistente, también apagado: así contesta que lo está en vez
  // de que el contable razone sobre «/seguros impagados».
  if (tienePrefijo(texto)) return true
  if (apagado(process.env.CORREDURIA_ASISTENTE_APAGADO)) return false
  const d = clasificarDestino(texto)
  if (d !== 'dudoso') return d === 'correduria'
  // Seguimiento de una conversación («¿y su mujer?»): si el asistente contestó hace poco, sigue él.
  const reciente = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
    SELECT count(*) AS n FROM correduria_asistente_turno WHERE creado_at >= now() - interval '10 minutes' AND ok`)
    .then((r) => Number(r[0]?.n ?? 0) > 0).catch(() => false)
  if (reciente) return true
  const or = openrouterConfigPasarela()
  if (!or || !(await dentroDePresupuestoDiario(APP)).ok) return false
  const t0 = Date.now()
  const { model } = modelosPorDefecto()
  try {
    const r = await openrouterChatEx(or, [{ role: 'user', content: texto.slice(0, 500) }], {
      system: SYSTEM_CLASIFICADOR, models: [model], maxTokens: 5, temperature: 0,
      privacidad: true, provider: PROVEEDOR_PRIVADO, signal: AbortSignal.timeout(5_000),
    })
    await registrarUso({ app: APP, endpoint: 'clasificar', proveedor: 'openrouter', modelo: r.model, ok: true, ms: Date.now() - t0, tokens: r.usage?.total_tokens ?? 0, costeEur: await coste(r.model, r.usage) })
    return leerClasificacion(r.text) === 'correduria'
  } catch (e) {
    await registrarUso({ app: APP, endpoint: 'clasificar', proveedor: 'openrouter', modelo: model, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 200) : 'fallo' })
    // Sin respuesta privada, al contable: es lo que pasaba con todo el texto libre hasta hoy.
    return false
  }
}

/** Coste real por catálogo; si el catálogo no conoce el modelo, una estimación ALTA, nunca 0. */
async function coste(modelo: string, usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined): Promise<number> {
  const modelos = (await getDirectorEstado().catch(() => null))?.modelos ?? []
  const c = costePorUso(modelo, usage, modelos)
  return c > 0 || modelo.endsWith(':free') ? c : costeConservador(usage?.total_tokens ?? 0)
}

// ── Reglas aprendidas ────────────────────────────────────────────────────────────────────────────

/** `null` = no se han podido leer (≠ `[]`, «todavía no hay»): no se dice que no hay reglas. */
async function reglasActivas(): Promise<{ id: number; texto: string }[] | null> {
  return prisma.$queryRaw<{ id: bigint; texto: string }[]>(Prisma.sql`
    SELECT id, texto FROM correduria_asistente_regla WHERE estado = 'activa' ORDER BY id`)
    .then((rs) => rs.map((r) => ({ id: Number(r.id), texto: r.texto })))
    .catch(() => null)
}

// ── Herramientas ─────────────────────────────────────────────────────────────────────────────────

/** Ejecuta una herramienta. Devuelve el texto que verá la IA (ya enmascarado) y si fue bien. */
async function ejecutar(
  nombre: string, args: Record<string, unknown> | null, ctx: { turnoId: number; reglas: { id: number; texto: string }[] | null },
): Promise<{ texto: string; ok: boolean }> {
  if (args === null) return { texto: 'ERROR: argumentos ilegibles. Repite la llamada con JSON válido.', ok: false }
  const fallo = (r: { estado: string; motivo?: unknown }) =>
    ({ texto: `ERROR: no se ha podido leer (${r.estado}${r.motivo ? `: ${String(r.motivo)}` : ''}). NO digas que no hay datos.`, ok: false })

  switch (nombre) {
    case 'buscar': {
      const q = String(args.q ?? '').trim().slice(0, 120)
      if (q.length < 3) return { texto: 'ERROR: término demasiado corto (mínimo 3 caracteres).', ok: false }
      const r = await buscarAsegura(q)
      if (r.estado !== 'ok') return fallo(r)
      return {
        ok: true,
        texto: paraIA({
          buscable: r.buscable, avisos: r.avisos,
          bloques: r.bloques.map((b) => ({
            tipo: b.tipo, cobertura: b.cobertura, explicacion: b.explicacion,
            total: b.hallazgos.length,
            clientes: b.hallazgos.slice(0, 8).map((h) => ({
              clienteId: h.clienteId, nombre: h.nombre, tipo: h.tipo, polizas: h.polizas,
              porque: h.porque, ultimoVencimiento: h.ultimoVencimiento, vitalidad: h.vitalidad,
            })),
          })),
        }),
      }
    }
    case 'ficha_cliente': {
      const id = idValido(args.clienteId)
      if (!id) return { texto: ERROR_NO_UUID, ok: false }
      const r = await fichaAsegura(id)
      if (r.estado === 'no_encontrado') return { texto: 'No existe ninguna ficha con ese id.', ok: true }
      if (r.estado !== 'ok') return fallo(r)
      return { texto: paraIA(r.ficha, 14000), ok: true }
    }
    case 'ficha_poliza': {
      const id = idValido(args.polizaId)
      if (!id) return { texto: ERROR_NO_UUID, ok: false }
      const r = await polizaAsegura(id)
      if (r.estado === 'no_encontrado') return { texto: 'No existe ninguna póliza con ese id.', ok: true }
      if (r.estado !== 'ok') return fallo(r)
      return { texto: paraIA(r.poliza, 14000), ok: true }
    }
    case 'vencimientos': {
      const r = await vencimientosAsegura(diasValidos(args.dias), 12_000)
      if (r.estado !== 'ok') return fallo(r)
      return { texto: paraIA(r), ok: true }
    }
    case 'mi_dia': {
      const hoy = hoyMadrid()
      const [rT, rL, cartera] = await Promise.all([
        tareasHoyAsegura().catch(() => ({ status: 502, json: null })),
        leadsCompetenciaAsegura(90).catch(() => ({ status: 502, json: null })),
        carteraAsegura().catch(() => null),
      ])
      const tareas = interpretarTareasHoy(rT.status, rT.json)
      const leads = interpretarLeads(rL.status, rL.json)
      return {
        ok: tareas.estado === 'ok' || leads.estado === 'ok',
        texto: paraIA({
          hoy,
          tareas: tareas.estado === 'ok'
            ? { total: tareas.tareas.length, truncado: tareas.truncado, filas: tareas.tareas.slice(0, 30).map((t) => ({ ...t, vencida: t.fechaLimite < hoy })) }
            : `ERROR: no se han podido leer (${tareas.estado === 'error' ? tareas.motivo : tareas.estado}). NO digas que no hay tareas.`,
          llamadasRenovacion: leads.estado === 'ok'
            ? (() => { const c = colaLlamadas(leads.leads); return { total: c.length, filas: c.slice(0, 20) } })()
            : `ERROR: no se han podido leer (${leads.estado === 'error' ? leads.motivo : leads.estado}).`,
          siniestrosAbiertos: cartera?.estado === 'ok' ? cartera.siniestrosAbiertos : 'no se ha podido leer',
        }, 10000),
      }
    }
    case 'oportunidades_cliente': {
      const id = idValido(args.clienteId)
      if (!id) return { texto: ERROR_NO_UUID, ok: false }
      const r = await oportunidadesClienteAsegura(id).catch(() => ({ status: 502, json: null }))
      const l = interpretarOportunidadesCliente(r.status, r.json)
      if (l.estado !== 'ok') return fallo(l as { estado: string; motivo?: unknown })
      return { texto: paraIA({ total: l.oportunidades.length, truncado: l.truncado, oportunidades: l.oportunidades }), ok: true }
    }
    case 'impagados': {
      const r = await impagadosAsegura()
      if (r.estado !== 'ok') return fallo(r)
      // -1 es el «no lo informa» del lector: a la IA le llega como null, no como un número.
      const n = (v: number) => (v < 0 ? null : v)
      return {
        ok: true,
        texto: paraIA({
          resumen: r.resumen, truncado: r.truncado, sinRecibosInformados: n(r.sinRecibosInformados),
          pendientesSinJuzgar: n(r.pendientesSinJuzgar), total: r.filas.length, filas: r.filas.slice(0, 25),
        }),
      }
    }
    case 'anulaciones_pendientes': {
      const r = await sustitucionesAsegura()
      if (r.estado !== 'ok') return fallo(r)
      return { texto: paraIA({ total: r.filas.length, filas: r.filas.slice(0, 25) }), ok: true }
    }
    case 'proponer_regla': {
      const regla = String(args.regla ?? '').trim().slice(0, 300)
      if (!regla) return { texto: 'ERROR: regla vacía.', ok: false }
      if (reglaConDatoPersonal(regla)) {
        return { texto: 'RECHAZADA: contiene un dato de cliente. Dile a Alberto que ese dato se cambia en la ficha del cliente, no como regla.', ok: true }
      }
      const [fila] = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
        INSERT INTO correduria_asistente_regla (texto, origen_turno) VALUES (${regla}, ${ctx.turnoId}) RETURNING id`)
      const enviado = await tgSendButtons(`🧠 ¿Apunto esta regla para siempre?\n<i>${escapeHtml(regla)}</i>`, [[
        { texto: '✅ Apúntala', callback: `cas_regla:${fila.id}` },
        { texto: '✖️ No', callback: `cas_reglano:${fila.id}` },
      ]]).catch(() => null)
      if (enviado === null) return { texto: 'ERROR: no he podido mandar la propuesta con el botón. Díselo a Alberto; no está guardada.', ok: false }
      return { texto: 'Propuesta enviada; Alberto la confirmará con un botón. No digas que ya está guardada.', ok: true }
    }
    case 'listar_reglas':
      if (ctx.reglas === null) return { texto: 'ERROR: no he podido leer las reglas ahora mismo. NO digas que no hay.', ok: false }
      return { texto: ctx.reglas.length ? ctx.reglas.map((r, i) => `${i + 1}. ${r.texto}`).join('\n') : 'Todavía no hay reglas aprendidas.', ok: true }
    case 'olvidar_regla': {
      const n = Math.round(Number(args.numero))
      if (ctx.reglas === null) return { texto: 'ERROR: no he podido leer las reglas ahora mismo. No olvides nada todavía.', ok: false }
      const regla = ctx.reglas[n - 1]
      if (!regla) return { texto: `No hay regla número ${args.numero}.`, ok: true }
      await prisma.$executeRaw(Prisma.sql`
        UPDATE correduria_asistente_regla SET estado = 'olvidada', olvidada_at = now() WHERE id = ${regla.id}`)
      return { texto: `Olvidada: «${regla.texto}».`, ok: true }
    }
    case 'preparar_emision':
      return prepararEmision(args, ctx.turnoId)
    case 'proponer_correccion':
      return proponerCorreccion(args, ctx.turnoId)
    case 'proponer_oportunidad':
      return proponerOportunidad(args, ctx.turnoId)
    case 'proponer_tarea':
      return proponerAccion('tarea', args, ctx.turnoId)
    case 'registrar_llamada':
      return proponerAccion('llamada', args, ctx.turnoId)
    case 'anotar_nota':
      return proponerAccion('nota', args, ctx.turnoId)
    case 'abrir_siniestro':
      return proponerAccion('siniestro', args, ctx.turnoId)
    case 'invitar_portal':
      return proponerAccion('portal', args, ctx.turnoId)
    case 'enviar_presupuesto':
      return proponerAccion('presupuesto', args, ctx.turnoId)
    default:
      return { texto: `ERROR: herramienta desconocida ${nombre}.`, ok: false }
  }
}

// ── Emisión (fase 3a): la IA prepara, el servidor resume, Alberto pulsa ───────────────────────────

const INTERRUPTOR_EMISION = 'CORREDURIA_ASISTENTE_EMISION_ACTIVA'

async function prepararEmision(args: Record<string, unknown>, turnoId: number): Promise<{ texto: string; ok: boolean }> {
  const polizaId = idValido(args.polizaId)
  if (!emisionTgActiva(process.env[INTERRUPTOR_EMISION])) {
    return {
      texto: `NO DISPONIBLE: la emisión por Telegram está apagada (${INTERRUPTOR_EMISION}). Dile a Alberto que emita desde la intranet${polizaId ? `: ${urlPoliza(polizaId)}` : ' (/correduria)'}.`,
      ok: true,
    }
  }
  if (!polizaId) return { texto: ERROR_NO_UUID, ok: false }
  const projectId = proyectoValido(args.projectId)
  if (!projectId) return { texto: 'ERROR: projectId tiene que ser el número del proyecto de Avant2 (solo cifras). Pídeselo a Alberto.', ok: false }
  const q = typeof args.quoteId === 'string' ? args.quoteId.trim() : ''
  const quoteId = /^[A-Za-z0-9_-]{1,40}$/.test(q) ? q : null

  const prep = prepararResumen(polizaId, await vistaImportacionAsegura(projectId, polizaId), quoteId)
  if (prep.tipo === 'no') return { texto: `NO SE PUEDE EMITIR: ${prep.motivo}. Díselo a Alberto tal cual.`, ok: true }
  if (prep.tipo === 'elegir') {
    return {
      ok: true,
      texto: `Hay varios precios emitibles; pregúntale a Alberto cuál y vuelve a llamar con su quoteId: ${paraIA(prep.ofertas.map((o) => ({
        quoteId: o.quoteId, compania: o.compania, categoria: o.categoria ?? o.modalidad, primaEur: o.primaEur, primerReciboEur: o.primerReciboEur, pago: o.pago, caduca: o.caduca,
      })))}`,
    }
  }

  const r = prep.resumen
  // Un envío anterior de esta póliza que no acabó claro (se cortó, o quedó «incierto») frena el
  // botón: antes de preparar otro, se mira en la intranet si aquel llegó a emitir.
  const dudoso = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
    SELECT count(*) AS n FROM correduria_asistente_emision
    WHERE poliza_id = ${r.polizaId}::uuid AND estado IN ('emitiendo', 'incierta')
      AND creada_at > now() - interval '7 days'`).then((f) => Number(f[0]?.n ?? 0)).catch(() => null)
  if (dudoso !== 0) {
    return {
      texto: `NO SE PUEDE EMITIR: ${dudoso === null ? 'no he podido comprobar los envíos anteriores de esta póliza' : 'hay un envío anterior de esta póliza sin aclarar (puede haberse emitido)'}. Díselo a Alberto y que lo mire en la intranet: ${urlPoliza(r.polizaId)}`,
      ok: true,
    }
  }
  // Un solo resumen vivo por póliza: el anterior deja de valer aunque no haya caducado.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_asistente_emision SET estado = 'caducada', decidida_at = now()
    WHERE poliza_id = ${r.polizaId}::uuid AND estado = 'propuesta'`).catch(() => {})
  const [fila] = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
    INSERT INTO correduria_asistente_emision (turno_id, poliza_id, project_id, offer_id, resumen, huella, caduca_at)
    VALUES (${turnoId}, ${r.polizaId}::uuid, ${r.projectId}, ${r.quoteId}, ${JSON.stringify(r)}::jsonb, ${huellaResumen(r)},
            now() + make_interval(mins => ${MINUTOS_PROPUESTA}::int))
    RETURNING id`)
  const enviado = await tgSendButtons(textoResumen(r), [[
    { texto: '🚀 Emitir', callback: `cas_emitir:${fila.id}` },
    { texto: '✖️ No', callback: `cas_emitirno:${fila.id}` },
  ]]).catch(() => null)
  if (enviado === null) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_asistente_emision SET estado = 'descartada', decidida_at = now() WHERE id = ${fila.id}`).catch(() => {})
    return { texto: 'ERROR: no he podido mandar el resumen con el botón a Telegram. Dile que lo intente otra vez o emita desde la intranet.', ok: false }
  }
  return {
    texto: 'Resumen enviado a Alberto con el botón «Emitir» (15 minutos, un solo uso). NO digas que está emitida: dile que revise el resumen y pulse solo si todo cuadra.',
    ok: true,
  }
}

type FilaEmision = { poliza_id: string; project_id: string; offer_id: string; resumen: ResumenEmision; huella: string }

async function cerrarEmision(id: number, estado: string, resultado: Record<string, unknown>): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_asistente_emision SET estado = ${estado}, resultado = ${JSON.stringify(resultado)}::jsonb
    WHERE id = ${id}`).catch((e) => console.error('[correduria-emision-tg] no se pudo cerrar la fila', id, e))
}

/**
 * Botón «Emitir». Corre DESPUÉS de contestar a Telegram (`after()` en el webhook): el Submit puede
 * tardar minutos. Nunca lanza y nunca reintenta. Cada salida manda un mensaje: un botón que se pulsa
 * y no contesta es indistinguible de uno que ha emitido.
 */
export async function emitirDesdeBoton(arg: string): Promise<void> {
  const id = Number(arg)
  if (!Number.isInteger(id) || id <= 0) return
  const decir = (t: string) => tgSend(t).catch(() => {})
  if (!emisionTgActiva(process.env[INTERRUPTOR_EMISION])) {
    await decir(`🛡️ La emisión por Telegram está apagada (${INTERRUPTOR_EMISION}): no se ha emitido nada.`)
    return
  }

  // Un solo uso: dos toques, o un reenvío del webhook, solo pasan una vez por aquí.
  const [fila] = await prisma.$queryRaw<FilaEmision[]>(Prisma.sql`
    UPDATE correduria_asistente_emision SET estado = 'emitiendo', decidida_at = now()
    WHERE id = ${id} AND estado = 'propuesta' AND caduca_at > now()
    RETURNING poliza_id::text AS poliza_id, project_id, offer_id, resumen, huella`).catch(() => [] as FilaEmision[])
  if (!fila) {
    const [actual] = await prisma.$queryRaw<{ estado: string; caducado: boolean }[]>(Prisma.sql`
      SELECT estado, caduca_at <= now() AS caducado FROM correduria_asistente_emision WHERE id = ${id}`).catch(() => [])
    if (actual?.estado === 'propuesta' && actual.caducado) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE correduria_asistente_emision SET estado = 'caducada', decidida_at = now() WHERE id = ${id} AND estado = 'propuesta'`).catch(() => {})
      await decir(`⏱️ Ese resumen ha caducado (${MINUTOS_PROPUESTA} min): no se ha emitido nada. Pídeme el resumen otra vez.`)
    } else if (actual) {
      await decir(`🛡️ Ese botón ya se usó (estado: ${escapeHtml(actual.estado)}): no se emite otra vez.`)
    } else {
      await decir('🛡️ No encuentro ese resumen: no se ha emitido nada.')
    }
    return
  }

  const url = urlPoliza(fila.poliza_id)
  let enviado = false
  try {
    // Se rehace la MISMA lectura del resumen: si algo cambió desde que Alberto lo leyó, no se emite.
    const prep = prepararResumen(fila.poliza_id, await vistaImportacionAsegura(fila.project_id, fila.poliza_id), fila.offer_id)
    if (prep.tipo !== 'resumen' || huellaResumen(prep.resumen) !== fila.huella) {
      const motivo = prep.tipo === 'no' ? prep.motivo : 'el precio, las fechas, el tomador o la cuenta han cambiado'
      await cerrarEmision(id, 'caducada', { motivo })
      await decir(`✋ No he emitido: ${escapeHtml(motivo)} desde que te mandé el resumen. Pídemelo otra vez.`)
      return
    }
    const imp = await importarProyectoAsegura({ projectId: fila.project_id, polizaId: fila.poliza_id, quoteId: fila.offer_id })
    if (imp.estado !== 'ok') {
      const mensaje = 'mensaje' in imp ? String(imp.mensaje) : 'asegura no dice por qué'
      await cerrarEmision(id, 'rechazada', { paso: 'enlazar', mensaje })
      await decir(`✖️ No se ha emitido nada: no he podido enlazar el proyecto a la póliza (${escapeHtml(mensaje)}).`)
      return
    }
    if (imp.cuenta?.enmascarada !== fila.resumen.cuenta.enmascarada) {
      await cerrarEmision(id, 'caducada', { paso: 'enlazar', motivo: 'cuenta distinta' })
      await decir('✋ No he emitido: la cuenta de cargo no es la del resumen. Pídeme el resumen otra vez.')
      return
    }
    enviado = true
    const res = await emitirAsegura({
      projectId: fila.project_id,
      campos: {},
      actor: ACTOR_EMISION_TG,
      primaAnual: fila.resumen.primaEur,
      cuentaConfirmada: fila.resumen.cuenta.enmascarada,
    })
    const fin = resultadoEmision(res, url)
    await cerrarEmision(id, fin.estado, {
      estado: res.estado,
      ...('referenciaVendor' in res ? { referenciaVendor: res.referenciaVendor ?? null } : {}),
      ...('mensaje' in res ? { mensaje: res.mensaje } : {}),
    })
    await decir(fin.texto)
  } catch (e) {
    const detalle = e instanceof Error ? e.message.slice(0, 200) : 'fallo'
    await cerrarEmision(id, enviado ? 'incierta' : 'rechazada', { error: detalle })
    await decir(enviado
      ? `⚠️ Error inesperado durante el envío (${escapeHtml(detalle)}). Puede haberse emitido: NO lo repitas. Míralo en la intranet: ${url}`
      : `✖️ No se ha emitido nada: error antes de enviar (${escapeHtml(detalle)}).`)
  }
}

// ── Correcciones de la ficha (fase 3b): la IA propone, el servidor valida, Alberto pulsa ─────────

async function proponerCorreccion(args: Record<string, unknown>, turnoId: number): Promise<{ texto: string; ok: boolean }> {
  const clienteId = idValido(args.clienteId)
  // Mismo interruptor que la emisión: es UN solo «¿escribe el asistente en la cartera?».
  if (!emisionTgActiva(process.env[INTERRUPTOR_EMISION])) {
    return {
      texto: `NO DISPONIBLE: las escrituras del asistente están apagadas (${INTERRUPTOR_EMISION}). Dile a Alberto que lo corrija en la ficha${clienteId ? `: ${urlCliente(clienteId)}` : ' (/correduria)'}.`,
      ok: true,
    }
  }
  if (!clienteId) return { texto: 'ERROR: clienteId no válido. Usa buscar para obtenerlo.', ok: false }
  const prep = prepararCorreccion(args)
  if (!prep.ok) return { texto: `NO SE PUEDE PROPONER: ${prep.motivo}. Díselo a Alberto.`, ok: true }

  const actual = await fichaActual(clienteId)
  if (actual === 'no_encontrado') return { texto: 'No existe ninguna ficha con ese id.', ok: true }
  if (typeof actual === 'string') return { texto: `ERROR: no he podido leer la ficha (${actual}). No propongas nada todavía.`, ok: false }
  const falta = faltaValorActual(actual, prep.cambios)
  if (falta) return { texto: `NO SE PUEDE PROPONER: ${falta}. Dile a Alberto que lo corrija en la ficha: ${urlCliente(clienteId)}`, ok: true }

  let documento = null
  if (prep.tocaIdentidad) {
    const docs = await documentosAsegura({ clienteId })
    if (docs.estado !== 'ok') {
      return { texto: `ERROR: no he podido comprobar si la ficha tiene el DNI archivado (${docs.estado}). No propongas el cambio de nombre todavía.`, ok: false }
    }
    documento = documentoQueAcredita(docs.documentos)
    if (!documento) {
      return {
        texto: `NO SE PUEDE PROPONER: cambiar nombre o apellidos exige el DNI archivado en la ficha y no hay ninguno recibido. Dile a Alberto que lo suba en 📎 Documentos: ${urlCliente(clienteId)}`,
        ok: true,
      }
    }
  }

  // Un solo cambio vivo por ficha, y lo que caducó sin pulsarse suelta sus valores.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_asistente_correccion SET estado = 'caducada', decidida_at = now(), ${SOLO_CAMPOS}
    WHERE estado = 'propuesta' AND (cliente_id = ${clienteId}::uuid OR caduca_at <= now())`).catch(() => {})
  const [fila] = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
    INSERT INTO correduria_asistente_correccion (turno_id, cliente_id, cambios, documento_id, huella, caduca_at)
    VALUES (${turnoId}, ${clienteId}::uuid, ${JSON.stringify(prep.cambios)}::jsonb, ${documento?.id ?? null}::uuid,
            ${huellaAntes(actual, prep.cambios)}, now() + make_interval(mins => ${MINUTOS_PROPUESTA}::int))
    RETURNING id`)
  const enviado = await tgSendButtons(textoCorreccion(actual, prep.cambios, documento), [[
    { texto: '✏️ Corregir', callback: `cas_corregir:${fila.id}` },
    { texto: '✖️ No', callback: `cas_corregirno:${fila.id}` },
  ]]).catch(() => null)
  if (enviado === null) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_asistente_correccion SET estado = 'descartada', decidida_at = now(), ${SOLO_CAMPOS} WHERE id = ${fila.id}`).catch(() => {})
    return { texto: 'ERROR: no he podido mandar el cambio con el botón a Telegram. Dile que lo intente otra vez o lo corrija en la ficha.', ok: false }
  }
  return {
    texto: 'Cambio enviado a Alberto con el botón «Corregir» (15 minutos, un solo uso). NO digas que la ficha está corregida: dile que revise cada letra y pulse.',
    ok: true,
  }
}

type FilaCorreccion = { cliente_id: string; cambios: Cambio[]; documento_id: string | null; huella: string }

/**
 * Al cerrar una fila solo quedan los NOMBRES de los campos: la dirección y el nombre ya viven (cifrados)
 * en la ficha, y el rastro de quién y cuándo queda en la auditoría de asegura.
 */
const SOLO_CAMPOS = Prisma.sql`cambios = COALESCE((SELECT jsonb_agg(e -> 'campo') FROM jsonb_array_elements(cambios) e), '[]'::jsonb), huella = NULL`

/** La ficha tal como está, en la forma que compara la huella. Un string = por qué no se pudo leer. */
async function fichaActual(clienteId: string): Promise<FichaActual | string> {
  const r = await fichaAsegura(clienteId)
  if (r.estado !== 'ok') return r.estado === 'error' ? `error: ${r.motivo}` : r.estado
  const f = r.ficha
  return {
    nombre: f.nombre,
    dniEnmascarado: f.identidad?.dniEnmascarado ?? null,
    identidad: f.identidad ? { nombre: f.identidad.nombre, apellidos: f.identidad.apellidos } : null,
    contacto: {
      direccion: f.contacto.direccion, direccionIlegible: f.contacto.direccionIlegible,
      codigoPostal: f.contacto.codigoPostal, ciudad: f.contacto.ciudad, provincia: f.contacto.provincia,
    },
  }
}

/** Botón «Corregir». Escribe por el puerto auditado de asegura. Nunca lanza; cada salida deja mensaje. */
async function aplicarCorreccion(id: number): Promise<string> {
  const decir = (t: string) => tgSend(t).catch(() => {})
  if (!emisionTgActiva(process.env[INTERRUPTOR_EMISION])) {
    await decir(`🛡️ Las escrituras del asistente están apagadas (${INTERRUPTOR_EMISION}): no se ha cambiado nada.`)
    return 'Apagado: no se cambia nada'
  }
  // Un solo uso: dos toques, o un reenvío del webhook, solo pasan una vez por aquí.
  const [fila] = await prisma.$queryRaw<FilaCorreccion[]>(Prisma.sql`
    UPDATE correduria_asistente_correccion SET estado = 'aplicando', decidida_at = now()
    WHERE id = ${id} AND estado = 'propuesta' AND caduca_at > now()
    RETURNING cliente_id::text AS cliente_id, cambios, documento_id::text AS documento_id, huella`).catch(() => [] as FilaCorreccion[])
  if (!fila) {
    const [actual] = await prisma.$queryRaw<{ estado: string; caducado: boolean }[]>(Prisma.sql`
      SELECT estado, caduca_at <= now() AS caducado FROM correduria_asistente_correccion WHERE id = ${id}`).catch(() => [])
    if (actual?.estado === 'propuesta' && actual.caducado) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE correduria_asistente_correccion SET estado = 'caducada', decidida_at = now(), ${SOLO_CAMPOS} WHERE id = ${id} AND estado = 'propuesta'`).catch(() => {})
      return `Caducado (${MINUTOS_PROPUESTA} min): no se cambia nada`
    }
    return actual ? 'Ya estaba decidida' : 'No encuentro ese cambio'
  }

  const url = urlCliente(fila.cliente_id)
  const cerrar = (estado: string, resultado: Record<string, unknown>) => prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_asistente_correccion SET estado = ${estado}, resultado = ${JSON.stringify(resultado)}::jsonb, ${SOLO_CAMPOS}
    WHERE id = ${id}`).catch((e) => console.error('[correduria-correccion-tg] no se pudo cerrar la fila', id, e))

  // Se relee la ficha: si alguien la cambió desde que Alberto vio el «antes», no se pisa lo nuevo.
  const ahora = await fichaActual(fila.cliente_id)
  if (typeof ahora === 'string' || huellaAntes(ahora, fila.cambios) !== fila.huella) {
    const motivo = typeof ahora === 'string' ? `no he podido releer la ficha (${ahora})` : 'la ficha ha cambiado desde que te lo enseñé'
    await cerrar('caducada', { motivo })
    await decir(`✋ No he cambiado nada: ${escapeHtml(motivo)}. Pídemelo otra vez.`)
    return 'No se ha aplicado'
  }
  const edicion = edicionDeCambios(fila.cambios, fila.documento_id)
  const r = await editarClienteAsegura({ id: fila.cliente_id, ...edicion, actor: ACTOR_EMISION_TG }, ACTOR_EMISION_TG)
    .then((x) => interpretarEscritura(x.status, x.json))
    .catch((e): ReturnType<typeof interpretarEscritura> => ({ estado: 'error', motivo: e instanceof Error ? e.message.slice(0, 120) : 'fallo' }))
  const fin = resultadoCorreccion(r, url)
  // Solo el desenlace: un `conflicto` trae nombres de otras fichas y aquí no hacen falta.
  await cerrar(fin.estado, { estado: r.estado, ...('motivo' in r ? { motivo: r.motivo } : {}) })
  await decir(fin.texto)
  return fin.estado === 'aplicada' ? 'Ficha corregida ✏️' : 'No se ha aplicado'
}

// ── Oportunidades (27/09/2026): documentos recientes + dictado → botón «Abrir» ───────────────────

/**
 * Apunta un documento que Alberto ha subido al chat (solo su `file_id`: el fichero sigue en Telegram).
 * `destino` = quién lo atendió. Nunca lanza: sin apunte, el asistente dirá que no ve documentos.
 */
export async function registrarDocumentoTg(
  d: { fileId: string; nombre: string; mime: string; mediaGroupId: string | null; destino: 'contable' | 'correduria' },
): Promise<number | null> {
  const [fila] = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
    INSERT INTO correduria_asistente_documento (file_id, nombre, mime, media_group_id, destino)
    VALUES (${d.fileId}, ${d.nombre.slice(0, 200)}, ${d.mime.slice(0, 100)}, ${d.mediaGroupId}, ${d.destino})
    RETURNING id`)
    .catch((e) => { console.error('[correduria-oportunidad-tg] no se pudo apuntar el documento', e); return [] as { id: bigint }[] })
  return fila ? Number(fila.id) : null
}

/**
 * Botones `cdoc_*` del documento de aseguradora. «Es mío» → lo procesa el contable como siempre (archiva
 * y contabiliza); «De un cliente» → queda para la correduría y no se toca como gasto. Nunca lanza.
 */
export async function resolverDocumentoDudoso(accion: string, arg: string): Promise<string> {
  const id = Number(arg)
  if (!Number.isInteger(id) || id <= 0) return 'Botón no válido'
  if (accion !== 'cli' && accion !== 'gasto') return 'Botón no válido'
  // Un solo uso: dos pulsaciones (o un reintento de Telegram) no procesan el gasto dos veces.
  const decision = accion === 'cli' ? 'cliente' : 'gasto'
  const [doc] = await prisma.$queryRaw<{ file_id: string; nombre: string | null; mime: string | null }[]>(Prisma.sql`
    UPDATE correduria_asistente_documento SET decision = ${decision}
    WHERE id = ${id} AND decision IS NULL RETURNING file_id, nombre, mime`).catch(() => [])
  if (!doc) return 'Ya estaba decidido (o no lo encuentro)'
  if (accion === 'cli') {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_asistente_documento SET destino = 'correduria', usado_at = NULL, creado_at = now() WHERE id = ${id}`).catch(() => {})
    // No se le pregunta «¿qué hago?»: el asistente lee el documento y propone él (con botón; nada se escribe
    // sin que Alberto pulse). Si ya es nuestra o de otro seguro, lo dice.
    await tgSend('🛡️ Vale, es de la correduría: no lo toco como gasto. Lo leo y te propongo qué hacer.').catch(() => {})
    await manejarCorreduriaTg(ORDEN_DOCUMENTO_CLIENTE).catch(() => tgSend('⚠️ No he podido leerlo ahora. Dime «ábrele una oportunidad» y lo intento otra vez.').catch(() => {}))
    return 'Apartado para la correduría'
  }
  if (accion === 'gasto') {
    const cuentaId = await getCuentaTelegram()
    if (!cuentaId) return 'Sin cuenta'
    const file = await descargarTelegram(doc.file_id, doc.mime ?? '', doc.nombre ?? '')
    if (!file) { await tgSend('No he podido volver a bajar el documento de Telegram. Mándamelo otra vez.').catch(() => {}); return 'No se pudo descargar' }
    await manejarDocumentoTg(cuentaId, file.buffer, file.mimeType, file.fileName)
    return 'Lo proceso como gasto'
  }
  return 'Botón no válido'
}

/** Lo que «dice» Alberto al marcar un documento como de un cliente: el asistente propone sin preguntar. */
export const ORDEN_DOCUMENTO_CLIENTE = 'Te acabo de pasar el documento de un cliente: léelo y propónme la oportunidad (usa el documento; no me preguntes lo que ya pone).'

/** ¿Otro documento del mismo álbum ya se fue a la correduría? (El pie solo viaja en el primero.) */
export async function albumDeCorreduria(mediaGroupId: string | null): Promise<boolean> {
  if (!mediaGroupId) return false
  return prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
    SELECT count(*) AS n FROM correduria_asistente_documento
    WHERE media_group_id = ${mediaGroupId} AND destino = 'correduria' AND creado_at >= now() - interval '10 minutes'`)
    .then((r) => Number(r[0]?.n ?? 0) > 0).catch(() => false)
}

/** Lee los documentos de la última hora. `null` = no se ha podido mirar (≠ `[]`, «no subió nada»). */
async function lecturasRecientes(opts: { tomador?: boolean } = {}, usados?: number[]): Promise<LecturaDocumentoOportunidad[] | null> {
  // Solo el ÚLTIMO documento (o su álbum): con todo lo de la última hora, dos subidas de la misma póliza
  // sumaban o mezclaban datos (27/09/2026: prima 374,90€ con una póliza de 192,19€).
  const filas = await prisma.$queryRaw<{ id: bigint; file_id: string; nombre: string | null; mime: string | null }[]>(Prisma.sql`
    WITH cand AS (
      SELECT id, file_id, nombre, mime, media_group_id FROM correduria_asistente_documento
      WHERE creado_at >= now() - make_interval(mins => ${MINUTOS_DOCUMENTO_RECIENTE}::int)
        AND (usado_at IS NULL OR usado_at >= now() - interval '15 minutes')
        AND (destino = 'correduria' OR NOT EXISTS (
          SELECT 1 FROM correduria_asistente_documento d2
          WHERE d2.destino = 'correduria' AND d2.creado_at >= now() - make_interval(mins => ${MINUTOS_DOCUMENTO_RECIENTE}::int)))
    ), ultimo AS (SELECT id, media_group_id FROM cand ORDER BY id DESC LIMIT 1)
    SELECT c.id, c.file_id, c.nombre, c.mime FROM cand c, ultimo u
    WHERE c.id = u.id OR (u.media_group_id IS NOT NULL AND c.media_group_id = u.media_group_id)
    ORDER BY c.id DESC LIMIT 4`).catch(() => null)
  if (filas === null) return null
  const out: LecturaDocumentoOportunidad[] = []
  for (const f of filas.reverse()) {
    const file = await descargarTelegram(f.file_id, f.mime ?? '', f.nombre ?? '')
    if (!file) { out.push({ estado: 'error', motivo: 'no he podido bajarlo de Telegram' }); continue }
    const l = await leerDocumentoOportunidadAsegura({ contenido: file.buffer, mimeType: file.mimeType, nombre: file.fileName }, opts)
      .then((r) => interpretarLecturaOportunidad(r.status, r.json))
      .catch((e): LecturaDocumentoOportunidad => ({ estado: 'error', motivo: e instanceof Error && e.name === 'TimeoutError' ? 'la lectura ha tardado demasiado' : 'fallo al leerlo' }))
    out.push(l)
    if (l.estado === 'ok') usados?.push(Number(f.id))
    // Si el contable preguntó «¿gasto o cliente?» y nadie contestó, ya está contestado: es de la correduría.
    await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_asistente_documento SET usado_at = now(), decision = COALESCE(decision, 'cliente') WHERE id = ${f.id}`).catch(() => {})
  }
  return out
}

async function proponerOportunidad(args: Record<string, unknown>, turnoId: number): Promise<{ texto: string; ok: boolean }> {
  let clienteId = idValido(args.clienteId)
  // Mismo interruptor que la emisión y la corrección: UN solo «¿escribe el asistente en la cartera?».
  if (!emisionTgActiva(process.env[INTERRUPTOR_EMISION])) {
    return {
      texto: `NO DISPONIBLE: las escrituras del asistente están apagadas (${INTERRUPTOR_EMISION}). Dile a Alberto que la abra en la ficha${clienteId ? `: ${urlCliente(clienteId)}` : ' (/correduria)'} → Oportunidades, donde también puede subir el documento.`,
      ok: true,
    }
  }
  const usarDocumentos = args.usarDocumentos === true
  if (!clienteId && args.clienteId !== undefined && args.clienteId !== null && args.clienteId !== '') {
    return { texto: 'ERROR: clienteId no válido. Usa buscar para obtenerlo, o no lo pases y usa usarDocumentos=true para que lo busque por el documento.', ok: false }
  }
  if (!clienteId && !usarDocumentos) {
    return { texto: 'ERROR: sin clienteId hace falta usarDocumentos=true (lo busco por el tomador del documento). Si no hay documento, pregúntale el nombre y búscalo.', ok: false }
  }
  let nombre: string | null = null
  if (clienteId) {
    const ficha = await fichaAsegura(clienteId)
    if (ficha.estado === 'no_encontrado') return { texto: 'No existe ninguna ficha con ese id.', ok: true }
    if (ficha.estado !== 'ok') return { texto: `ERROR: no he podido leer la ficha (${ficha.estado}). No propongas nada todavía.`, ok: false }
    nombre = ficha.ficha.nombre ?? 'este cliente'
  }

  let lecturas: LecturaDocumentoOportunidad[] | null = null
  const documentos: number[] = []
  if (usarDocumentos) {
    lecturas = await lecturasRecientes({ tomador: !clienteId }, documentos)
    if (lecturas === null) return { texto: 'ERROR: no he podido mirar qué documentos ha subido. Pídele los datos o que lo abra en la ficha.', ok: false }
    if (lecturas.length === 0) {
      return { texto: `NO VEO DOCUMENTOS: no ha subido ninguno en los últimos ${MINUTOS_DOCUMENTO_RECIENTE} minutos. Pídele que lo vuelva a mandar o que te dicte de quién es, ramo, compañía, vencimiento y prima.`, ok: true }
    }
  }

  // Sin ficha dicha: de quién es lo dice el documento (asegura busca el DNI; aquí no llega).
  let lead: { nombre: string; sello: string } | null = null
  let delDocumento = ''
  if (!clienteId) {
    const q = quienEsDelDocumento(lecturas ?? [], args.leadNuevo === true)
    const porQue = explicarQuien(q)
    if (porQue) return { texto: porQue, ok: true }
    if (q.tipo === 'existe') { clienteId = q.id; nombre = q.nombre; delDocumento = ` El documento es de ${q.nombre}, que YA tiene ficha (por su DNI).` }
    else if (q.tipo === 'nuevo') { lead = { nombre: q.nombre, sello: q.sello }; nombre = q.nombre }
    else return { texto: 'ERROR: no he sabido de quién es el documento. Pregúntale el nombre.', ok: false }
  }

  // La póliza ya es NUESTRA (cartera en vigor): no hay nada que vender.
  const nuestra = polizaYaNuestra(lecturas)
  if (nuestra) {
    return {
      texto: `YA ES NUESTRA: la póliza${nuestra.numero ? ` nº ${nuestra.numero}` : ''}${nuestra.aseguradora ? ` (${nuestra.aseguradora})` : ''} está en nuestra cartera en vigor, así que NO es una oportunidad y no propongo abrirla. Díselo a Alberto con el enlace a la ficha del cliente: ${urlCliente(nuestra.clienteId)}`,
      ok: true,
    }
  }

  const prep = prepararAlta(args, lecturas, hoyMadrid())
  if (!prep.ok) return { texto: `NO SE PUEDE PROPONER: ${prep.motivo}.`, ok: true }

  // Una propuesta viva por ficha, y UN lead nuevo a la vez: dos botones «crear lead» abiertos son dos
  // documentos distintos y es fácil pulsar el que no era.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_asistente_oportunidad SET estado = 'caducada', decidida_at = now(), alta = NULL, lead = NULL
    WHERE estado = 'propuesta' AND (cliente_id = ${clienteId}::uuid OR lead IS NOT NULL OR caduca_at <= now())`).catch(() => {})
  const [fila] = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
    INSERT INTO correduria_asistente_oportunidad (turno_id, cliente_id, alta, lead, documentos, caduca_at)
    VALUES (${turnoId}, ${clienteId}::uuid, ${JSON.stringify(prep.alta)}::jsonb, ${lead ? JSON.stringify(lead) : null}::jsonb,
            ${documentos}::bigint[], now() + make_interval(mins => ${MINUTOS_PROPUESTA}::int))
    RETURNING id`)
  const texto = lead ? textoAltaLead(lead.nombre, prep.alta) : textoAlta(nombre ?? 'este cliente', prep.alta)
  const enviado = await tgSendButtons(texto, [[
    { texto: lead ? '🎯 Crear lead y abrir' : '🎯 Abrir', callback: `cas_oport:${fila.id}` },
    { texto: '✖️ No', callback: `cas_oportno:${fila.id}` },
  ]]).catch(() => null)
  if (enviado === null) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_asistente_oportunidad SET estado = 'descartada', decidida_at = now(), alta = NULL, lead = NULL WHERE id = ${fila.id}`).catch(() => {})
    return { texto: 'ERROR: no he podido mandar la propuesta con el botón a Telegram. Dile que lo intente otra vez o la abra en la ficha.', ok: false }
  }
  if (lead) {
    return {
      texto: `Propuesta enviada: ${lead.nombre} NO está en la cartera (su DNI no aparece), así que el botón crea el lead y le abre la oportunidad (${MINUTOS_PROPUESTA} minutos, un solo uso). NO digas que está hecho: dile que revise y pulse.`,
      ok: true,
    }
  }
  return {
    texto: `Propuesta enviada a Alberto con el botón «Abrir» (${MINUTOS_PROPUESTA} minutos, un solo uso).${delDocumento} NO digas que está abierta: dile que revise los datos y pulse.`,
    ok: true,
  }
}

/** Botón «Abrir». Escribe por el mismo puerto que la ficha. Nunca lanza; cada salida deja mensaje. */
async function abrirOportunidad(id: number): Promise<string> {
  const decir = (t: string) => tgSend(t, { html: true }).catch(() => {})
  if (!emisionTgActiva(process.env[INTERRUPTOR_EMISION])) {
    await decir(`🛡️ Las escrituras del asistente están apagadas (${INTERRUPTOR_EMISION}): no se ha abierto nada.`)
    return 'Apagado: no se abre nada'
  }
  type Fila = { cliente_id: string | null; alta: Alta; lead: { nombre: string; sello: string } | null; documentos: bigint[] | null }
  const [fila] = await prisma.$queryRaw<Fila[]>(Prisma.sql`
    UPDATE correduria_asistente_oportunidad SET estado = 'aplicando', decidida_at = now()
    WHERE id = ${id} AND estado = 'propuesta' AND caduca_at > now()
    RETURNING cliente_id::text AS cliente_id, alta, lead, documentos`).catch(() => [] as Fila[])
  if (!fila) {
    const [actual] = await prisma.$queryRaw<{ estado: string; caducado: boolean }[]>(Prisma.sql`
      SELECT estado, caduca_at <= now() AS caducado FROM correduria_asistente_oportunidad WHERE id = ${id}`).catch(() => [])
    if (actual?.estado === 'propuesta' && actual.caducado) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE correduria_asistente_oportunidad SET estado = 'caducada', decidida_at = now(), alta = NULL WHERE id = ${id} AND estado = 'propuesta'`).catch(() => {})
      return `Caducado (${MINUTOS_PROPUESTA} min): no se abre nada`
    }
    return actual ? 'Ya estaba decidida' : 'No encuentro esa propuesta'
  }
  let clienteId = fila.cliente_id
  if (!clienteId) {
    // Lead nuevo: primero la ficha (con el sello de asegura: el DNI no pasa por aquí), luego la oportunidad.
    const r0 = fila.lead
      ? await altaClienteAsegura({ sello: fila.lead.sello, actor: ACTOR_EMISION_TG }, ACTOR_EMISION_TG)
      : { status: 422, json: { motivo: 'la propuesta no trae ni ficha ni lead' } }
    const a = resultadoAltaLead(r0.status, r0.json)
    if (a.estado !== 'creado') {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE correduria_asistente_oportunidad
        SET estado = ${a.estado === 'incierto' ? 'incierta' : a.estado === 'duplicado' ? 'duplicada' : 'rechazada'}, alta = NULL, lead = NULL,
            resultado = ${JSON.stringify({ paso: 'alta_ficha', status: r0.status })}::jsonb
        WHERE id = ${id}`).catch((e) => console.error('[correduria-oportunidad-tg] no se pudo cerrar la fila', id, e))
      await decir(a.texto)
      return a.estado === 'incierto' ? 'No sé si se ha creado la ficha' : 'No se ha creado la ficha'
    }
    clienteId = a.id
    await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_asistente_oportunidad SET cliente_id = ${clienteId}::uuid, lead = NULL WHERE id = ${id}`).catch(() => {})
    await decir(`👤 Lead creado: <b>${escapeHtml(fila.lead?.nombre ?? '')}</b>\n${urlCliente(clienteId)}`)
  }
  const r = await accionOportunidadAsegura(cuerpoAlta(clienteId, fila.alta, ACTOR_EMISION_TG))
    .catch((e) => ({ status: 0, json: { motivo: e instanceof Error ? e.message.slice(0, 120) : 'fallo' } }))
  const fin = resultadoAlta(r.status, r.json, urlCliente(clienteId))
  const json = r.json as { id?: unknown; motivo?: unknown } | null
  const existenteId = fin.estado === 'duplicada' && typeof json?.id === 'string' ? json.id : null
  // Con una duplicada se guarda `alta` un rato: es lo que «Actualizar la existente» escribirá.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_asistente_oportunidad
    SET estado = ${fin.estado}, alta = ${existenteId ? JSON.stringify(fila.alta) : null}::jsonb, lead = NULL, cliente_id = ${clienteId}::uuid,
        resultado = ${JSON.stringify({ status: r.status, id: json?.id ?? null, motivo: json?.motivo ?? null })}::jsonb
    WHERE id = ${id}`).catch((e) => console.error('[correduria-oportunidad-tg] no se pudo cerrar la fila', id, e))
  await decir(fin.texto)
  if (fin.estado === 'abierta') await ofrecerSiguientes(id, clienteId, fila.alta, (fila.documentos ?? []).map(Number)).catch(() => {})
  if (existenteId) await ofrecerSobreExistente(id, clienteId, existenteId, fila.alta, (fila.documentos ?? []).map(Number)).catch(() => {})
  return fin.estado === 'abierta' ? 'Oportunidad abierta 🎯' : fin.estado === 'incierta' ? 'No sé si se ha abierto' : 'No se ha abierto'
}

// ── Acciones del día a día (27/09/2026): tarea, llamada, nota, siniestro, portal → botón «Hacer» ──

/**
 * De quién es y la ficha a la que enlazar, leído del puerto (no de lo que diga la IA). Un string = por
 * qué no se pudo leer, y entonces no se propone: un botón sobre una ficha que no se ha podido mirar es
 * una apuesta.
 */
async function contextoAccion(tipo: TipoAccion, args: Record<string, unknown>): Promise<{ quien: string; clienteId: string } | string> {
  if (tipo === 'tarea' || tipo === 'llamada') {
    const id = idValido(args.oportunidadId)
    if (!id) return ERROR_NO_UUID
    const r = await oportunidadAsegura(id).then((x) => interpretarOportunidad(x.status, x.json)).catch(() => null)
    if (!r) return 'no he podido leer la oportunidad'
    if (r.estado === 'no_encontrado') return 'no existe esa oportunidad (búscala con oportunidades_cliente)'
    if (r.estado !== 'ok') return `no he podido leer la oportunidad (${r.estado === 'error' ? r.motivo : r.estado})`
    return { quien: `${r.cliente ?? 'cliente'} · oportunidad de ${rotuloRamo(r.oportunidad.ramo)}`, clienteId: r.oportunidad.clienteId }
  }
  if (tipo === 'siniestro') {
    const id = idValido(args.polizaId)
    if (!id) return ERROR_NO_UUID
    const r = await polizaAsegura(id).catch(() => null)
    if (!r) return 'no he podido leer la póliza'
    if (r.estado === 'no_encontrado') return 'no existe esa póliza'
    if (r.estado !== 'ok') return `no he podido leer la póliza (${r.estado})`
    const p = r.poliza
    return { quien: `${p.cliente.nombre} · ${p.aseguradora} ${p.numeroPoliza ?? ''}`.trim(), clienteId: p.cliente.id }
  }
  const id = idValido(args.clienteId)
  if (!id) return ERROR_NO_UUID
  const r = await fichaAsegura(id).catch(() => null)
  if (!r) return 'no he podido leer la ficha'
  if (r.estado === 'no_encontrado') return 'no existe esa ficha'
  if (r.estado !== 'ok') return `no he podido leer la ficha (${r.estado})`
  return { quien: r.ficha.nombre ?? 'cliente', clienteId: id }
}

async function proponerAccion(tipo: TipoAccion, args: Record<string, unknown>, turnoId: number): Promise<{ texto: string; ok: boolean }> {
  if (!emisionTgActiva(process.env[INTERRUPTOR_EMISION])) {
    return { texto: `NO DISPONIBLE: las escrituras del asistente están apagadas (${INTERRUPTOR_EMISION}). Dile a Alberto que lo haga en la ficha (/correduria).`, ok: true }
  }
  const ctx = await contextoAccion(tipo, args)
  if (typeof ctx === 'string') return { texto: `NO SE PUEDE PROPONER: ${ctx}.`, ok: false }
  if (tipo === 'presupuesto') {
    const guardada = await tarificacionPresupuesto(ctx.clienteId, args.ramo)
    if (typeof guardada === 'string') return { texto: `NO SE PUEDE PROPONER: ${guardada}.`, ok: true }
    args = { ...args, tarificacionId: guardada.tarificacionId, resumen: guardada.resumen }
  }
  const prep = prepararAccion(tipo, args, hoyMadrid())
  if (!prep.ok) return { texto: `NO SE PUEDE PROPONER: ${prep.motivo}. Pregúntaselo a Alberto.`, ok: true }

  // El portal manda un correo real: antes de ofrecer el botón se pregunta si esa ficha puede entrar.
  // El presupuesto también: el cliente elige en el portal, así que tiene que poder entrar o ser invitable.
  if (tipo === 'portal' || tipo === 'presupuesto') {
    const e = await portalAsegura(ctx.clienteId).then((x) => interpretarPortal(x.status, x.json)).catch(() => null)
    if (!e || e.estado !== 'ok') return { texto: `ERROR: no he podido comprobar si puede entrar al portal${e && 'motivo' in e ? ` (${e.motivo})` : ''}. No propongas el envío todavía.`, ok: false }
    const vale = tipo === 'portal' ? e.portal.estado === 'invitable' : e.portal.estado === 'invitable' || e.portal.estado === 'ya_entra'
    if (!vale) {
      const f = explicarPortal(e.portal)
      return { texto: `NO SE PUEDE INVITAR: ${f.titulo}. ${f.queHacer}`, ok: true }
    }
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_asistente_accion SET estado = 'caducada', decidida_at = now(), cuerpo = NULL
    WHERE estado = 'propuesta' AND caduca_at <= now()`).catch(() => {})
  const [fila] = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
    INSERT INTO correduria_asistente_accion (turno_id, tipo, cliente_id, cuerpo, caduca_at)
    VALUES (${turnoId}, ${tipo}, ${ctx.clienteId}::uuid, ${JSON.stringify(prep.accion.cuerpo)}::jsonb,
            now() + make_interval(mins => ${MINUTOS_PROPUESTA}::int))
    RETURNING id`)
  const enviado = await tgSendButtons(textoAccion(ctx.quien, prep.accion), [[
    { texto: tipo === 'portal' || tipo === 'presupuesto' ? '📧 Enviar' : '✅ Hacer', callback: `cas_acc:${fila.id}` },
    { texto: '✖️ No', callback: `cas_accno:${fila.id}` },
  ]]).catch(() => null)
  if (enviado === null) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_asistente_accion SET estado = 'descartada', decidida_at = now(), cuerpo = NULL WHERE id = ${fila.id}`).catch(() => {})
    return { texto: 'ERROR: no he podido mandar la propuesta con el botón a Telegram. Dile que lo intente otra vez o lo haga en la ficha.', ok: false }
  }
  return { texto: `Propuesta enviada a Alberto con su botón (${MINUTOS_PROPUESTA} minutos, un solo uso). NO digas que está hecho: dile que revise y pulse.`, ok: true }
}

/**
 * La última tarificación guardada de un cliente nuevo, lista para presupuestar. Solo con precios
 * reales y efecto vigente; si no, la frase de por qué no (nunca un «no hay» por un fallo de lectura).
 */
async function tarificacionPresupuesto(clienteId: string, ramoArg: unknown): Promise<{ tarificacionId: string; resumen: string } | string> {
  const ramo = ramoArg === 'auto' || ramoArg === 'moto' || ramoArg === 'hogar' ? ramoArg : null
  if (!ramo) return 'ramo no válido (auto, moto u hogar)'
  const r = await tarificacionNuevaGuardadaAsegura(clienteId, ramo)
  if (r.estado === 'ninguna') return `no hay ninguna tarificación de ${ramo} guardada para este cliente sin póliza: hay que tarificar primero en su ficha`
  if (r.estado !== 'ok') return `no he podido leer la tarificación guardada (${r.mensaje})`
  const g = r.guardada
  if (g.caducada) return `la tarificación guardada tiene el efecto ya pasado (${g.fechaEfecto ?? 'sin fecha'}): hay que volver a tarificar`
  const primas = g.precios.map((p) => p.primaEur).filter((n): n is number => typeof n === 'number' && n > 0)
  if (primas.length === 0) return 'la tarificación guardada no tiene ningún precio con prima: no hay nada que enviar'
  const fecha = g.creadaEn ? g.creadaEn.slice(0, 10).split('-').reverse().join('/') : 'fecha desconocida'
  const efecto = g.fechaEfecto ? g.fechaEfecto.slice(0, 10).split('-').reverse().join('/') : 'sin efecto'
  return {
    tarificacionId: g.cotizacionId,
    resumen: `Tarificación de ${ramo} del ${fecha}: ${primas.length} precio(s), desde ${eur(Math.min(...primas))} · efecto ${efecto}`,
  }
}

/**
 * Prepara el presupuesto, anota las necesidades y avisa por email. Tres llamadas: si una falla, se dice
 * en qué paso se quedó. Solo el aviso puede quedar incierto (el correo pudo salir).
 */
async function enviarPresupuesto(cuerpo: Record<string, unknown>, url: string): Promise<{ estado: 'hecha' | 'rechazada' | 'incierta'; texto: string; resultado: Record<string, unknown> }> {
  const actor = String(cuerpo.actor)
  const fallo = (paso: string, detalle: string) => ({
    estado: 'rechazada' as const,
    texto: `🛡️ ❌ No se ha enviado el presupuesto (${paso}): ${escapeHtml(detalle)}. <a href="${url}">Ficha</a>`,
    resultado: { paso, detalle: detalle.slice(0, 200) },
  })
  const pr = await prepararPresupuestoAsegura({ tarificacionId: cuerpo.tarificacionId, actor })
    .then((x) => interpretarPreparado(x.status, x.json))
    .catch((e) => ({ estado: 'error' as const, motivo: 'red', detalle: e instanceof Error ? e.message : 'fallo' }))
  if (pr.estado === 'sin_configurar') return fallo('preparar', 'el puerto con asegura no está configurado')
  if (pr.estado === 'error') return fallo('preparar', pr.detalle ?? pr.motivo)
  const id = pr.presupuesto.id
  if (pr.presupuesto.simulado) return fallo('preparar', 'los precios son simulados, no los ha dado ninguna compañía')
  const nec = await retirarPresupuestoAsegura({ id, accion: 'necesidades', texto: cuerpo.necesidades, actor }).catch(() => null)
  if (!nec || nec.status !== 200) {
    const d = (nec?.json as { detalle?: unknown; motivo?: unknown } | null)
    return fallo('anotar necesidades', String(d?.detalle ?? d?.motivo ?? 'sin respuesta de asegura'))
  }
  const av = await retirarPresupuestoAsegura({ id, accion: 'avisar', canal: 'email', actor }).catch(() => null)
  if (!av) {
    return { estado: 'incierta', texto: `🛡️ ⚠️ Presupuesto preparado, pero no sé si el correo ha salido (no respondió asegura). Míralo en la <a href="${url}">ficha</a> antes de repetir.`, resultado: { paso: 'avisar', presupuestoId: id } }
  }
  const t = textoAviso(av.status, av.json)
  if (!t.ok) return fallo('avisar', t.texto)
  return {
    estado: 'hecha',
    texto: `🛡️ ✅ Presupuesto enviado (${pr.presupuesto.opciones.length} opciones). ${escapeHtml(t.texto)} Cuando elija y firme en su portal te llega el aviso. <a href="${url}">Ficha</a>`,
    resultado: { paso: 'avisar', presupuestoId: id, status: av.status },
  }
}

/** Botón «Hacer». Escribe por el mismo puerto que la ficha. Nunca lanza; cada salida deja mensaje. */
async function hacerAccion(id: number): Promise<string> {
  const decir = (t: string) => tgSend(t, { html: true }).catch(() => {})
  if (!emisionTgActiva(process.env[INTERRUPTOR_EMISION])) {
    await decir(`🛡️ Las escrituras del asistente están apagadas (${INTERRUPTOR_EMISION}): no se ha hecho nada.`)
    return 'Apagado: no se hace nada'
  }
  const [fila] = await prisma.$queryRaw<{ tipo: TipoAccion; cliente_id: string | null; cuerpo: Record<string, unknown> }[]>(Prisma.sql`
    UPDATE correduria_asistente_accion SET estado = 'aplicando', decidida_at = now()
    WHERE id = ${id} AND estado = 'propuesta' AND caduca_at > now()
    RETURNING tipo, cliente_id::text AS cliente_id, cuerpo`).catch(() => [] as { tipo: TipoAccion; cliente_id: string | null; cuerpo: Record<string, unknown> }[])
  if (!fila) {
    const [actual] = await prisma.$queryRaw<{ estado: string; caducado: boolean }[]>(Prisma.sql`
      SELECT estado, caduca_at <= now() AS caducado FROM correduria_asistente_accion WHERE id = ${id}`).catch(() => [])
    if (actual?.estado === 'propuesta' && actual.caducado) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE correduria_asistente_accion SET estado = 'caducada', decidida_at = now(), cuerpo = NULL WHERE id = ${id} AND estado = 'propuesta'`).catch(() => {})
      return `Caducado (${MINUTOS_PROPUESTA} min): no se hace nada`
    }
    return actual ? 'Ya estaba decidida' : 'No encuentro esa propuesta'
  }
  const cuerpo = { ...fila.cuerpo, actor: ACTOR_EMISION_TG }
  if (fila.tipo === 'presupuesto') {
    const fin = await enviarPresupuesto(cuerpo, fila.cliente_id ? urlCliente(fila.cliente_id) : '/correduria')
    await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_asistente_accion SET estado = ${fin.estado}, cuerpo = NULL, resultado = ${JSON.stringify(fin.resultado)}::jsonb
      WHERE id = ${id}`).catch((e) => console.error('[correduria-acciones-tg] no se pudo cerrar la fila', id, e))
    await decir(fin.texto)
    return fin.estado === 'hecha' ? 'Enviado ✅' : fin.estado === 'incierta' ? 'No sé si ha salido' : 'No se ha enviado'
  }
  const llamada = fila.tipo === 'tarea' ? crearTareaAsegura(cuerpo)
    : fila.tipo === 'llamada' ? registrarLlamadaAsegura(cuerpo)
    : fila.tipo === 'nota' ? historialClienteAsegura(cuerpo)
    : fila.tipo === 'siniestro' ? abrirSiniestroAsegura(cuerpo)
    : invitarPortalAsegura(cuerpo)
  const r = await llamada.catch((e) => ({ status: 0, json: { motivo: e instanceof Error ? e.message.slice(0, 120) : 'fallo' } }))
  const fin = resultadoAccion(fila.tipo, r.status, r.json, fila.cliente_id ? urlCliente(fila.cliente_id) : '/correduria')
  const json = r.json as { motivo?: unknown; estado?: unknown } | null
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_asistente_accion
    SET estado = ${fin.estado}, cuerpo = NULL,
        resultado = ${JSON.stringify({ status: r.status, estado: json?.estado ?? null, motivo: json?.motivo ?? null })}::jsonb
    WHERE id = ${id}`).catch((e) => console.error('[correduria-acciones-tg] no se pudo cerrar la fila', id, e))
  await decir(fin.texto)
  return fin.estado === 'hecha' ? 'Hecho ✅' : fin.estado === 'incierta' ? 'No sé si se ha hecho' : 'No se ha hecho'
}

// ── Un turno ─────────────────────────────────────────────────────────────────────────────────────

async function turnosDeHoy(): Promise<number | null> {
  return prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
    SELECT count(*) AS n FROM correduria_asistente_turno WHERE creado_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid')`)
    .then((r) => Number(r[0]?.n ?? 0)).catch(() => null)
}

/**
 * Las cuatro últimas preguntas de la última media hora (contexto para «¿y su mujer?», «la Mapfre», «1»)
 * y los ids que ya salieron en ellas, para no volver a buscar al cliente en cada mensaje.
 */
async function historialReciente(): Promise<{ mensajes: NimToolMessage[]; memoria: string | null }> {
  const filas = await prisma.$queryRaw<{ pregunta: string | null; respuesta: string | null; herramientas: unknown }[]>(Prisma.sql`
    SELECT pregunta, respuesta, herramientas FROM correduria_asistente_turno
    WHERE creado_at >= now() - interval '30 minutes' AND ok AND pregunta IS NOT NULL AND respuesta IS NOT NULL
    ORDER BY id DESC LIMIT 4`).catch(() => [])
  const orden = filas.reverse()
  return {
    mensajes: orden.flatMap((f) => [
      { role: 'user' as const, content: f.pregunta },
      { role: 'assistant' as const, content: f.respuesta },
    ]),
    memoria: memoriaIds(orden.map((f) => f.herramientas)),
  }
}

/** Documentos de la correduría de la última hora sin usar. `null` = no se ha podido mirar. */
async function documentosPendientes(): Promise<number | null> {
  return prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
    SELECT count(*) AS n FROM correduria_asistente_documento
    WHERE destino = 'correduria' AND usado_at IS NULL
      AND creado_at >= now() - make_interval(mins => ${MINUTOS_DOCUMENTO_RECIENTE}::int)`)
    .then((r) => Number(r[0]?.n ?? 0)).catch(() => null)
}

/** Texto libre de Alberto para la correduría → contesta por Telegram. Nunca lanza. */
export async function manejarCorreduriaTg(textoOriginal: string): Promise<void> {
  const pregunta = sinPrefijo(textoOriginal) || textoOriginal.trim()
  if (apagado(process.env.CORREDURIA_ASISTENTE_APAGADO)) {
    await tgSend('🛡️ El asistente de la correduría está apagado ahora mismo.').catch(() => {})
    return
  }
  const or = openrouterConfigPasarela()
  if (!or) { await tgSend('🛡️ El asistente de la correduría no está configurado (falta la clave de IA).').catch(() => {}); return }

  const hoy = await turnosDeHoy()
  if (hoy !== null && hoy >= MAX_TURNOS_DIA) {
    await tgSend(`🛡️ He llegado al tope de ${MAX_TURNOS_DIA} preguntas de hoy. Mañana sigo; mientras, la cartera está en /correduria.`).catch(() => {})
    return
  }
  const presupuesto = await dentroDePresupuestoDiario(APP)
  if (!presupuesto.ok) {
    await tgSend(`🛡️ Tope de gasto de IA alcanzado (${escapeHtml(presupuesto.motivo ?? 'presupuesto')}). No uso otra IA más barata porque no garantiza la privacidad de tus clientes.`).catch(() => {})
    return
  }

  // Retención: el texto se borra a los 90 días; el rastro de acceso (herramientas) se queda.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_asistente_turno SET pregunta = NULL, respuesta = NULL, nota = NULL
    WHERE creado_at < now() - make_interval(days => ${DIAS_RETENCION_TEXTO}::int) AND pregunta IS NOT NULL`).catch(() => {})
  // Propuestas que nadie pulsó y documentos subidos hace más de un mes: fuera.
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM correduria_asistente_accion WHERE estado = 'propuesta' AND caduca_at < now() - interval '1 day'`).catch(() => {})
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM correduria_asistente_oportunidad WHERE estado = 'propuesta' AND caduca_at < now() - interval '1 day'`).catch(() => {})
  // El sello del lead (DNI cifrado) no se queda en filas que ya no van a usarlo.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_asistente_oportunidad
    SET lead = NULL, estado = CASE estado WHEN 'propuesta' THEN 'caducada' WHEN 'aplicando' THEN 'incierta' ELSE estado END
    WHERE lead IS NOT NULL AND (estado <> 'propuesta' OR caduca_at <= now())
      AND (estado <> 'aplicando' OR decidida_at < now() - interval '1 hour')`).catch(() => {})
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_asistente_oportunidad SET alta = NULL
    WHERE estado = 'duplicada' AND alta IS NOT NULL AND decidida_at < now() - make_interval(mins => ${MINUTOS_PROPUESTA}::int)`).catch(() => {})
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM correduria_asistente_documento WHERE creado_at < now() - interval '30 days'`).catch(() => {})

  const [turno] = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
    INSERT INTO correduria_asistente_turno (pregunta) VALUES (${enmascarar(pregunta)}) RETURNING id`)
    .catch(() => [] as { id: bigint }[])
  if (!turno) { await tgSend('🛡️ No he podido registrar la pregunta, así que no la contesto (sin registro no hay rastro de acceso). Reinténtalo.').catch(() => {}); return }
  const turnoId = Number(turno.id)

  const reglas = await reglasActivas()
  const [historial, pendientes] = await Promise.all([historialReciente(), documentosPendientes()])
  const system = [systemAsistente((reglas ?? []).map((r) => r.texto), hoyMadrid()), historial.memoria, avisoDocumentosPendientes(pendientes)]
    .concat(reglas === null ? ['(No se han podido leer las preferencias aprendidas: si Alberto pregunta por ellas, dilo.)'] : [])
    .filter(Boolean).join('\n\n')
  // A la IA va la pregunta TAL CUAL (si Alberto busca por DNI, la IA necesita el DNI para buscarlo;
  // el proveedor es de retención cero). Enmascarada queda solo en el registro y en Telegram.
  const mensajes: NimToolMessage[] = [...historial.mensajes, { role: 'user', content: pregunta }]
  const rastro: Rastro[] = []
  const t0 = Date.now()
  const { model, fallbacks } = modelosPorDefecto()
  let respuesta = ''
  let modelo: string | null = null
  let error: string | null = null

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const r = await openrouterChatTools(or, mensajes, HERRAMIENTAS as unknown as unknown[], {
        // OpenRouter rechaza con 400 un `models` de más de 3 (ver lib/pasarela.ts).
        system, models: [model, ...fallbacks].slice(0, 3), maxTokens: 900, temperature: 0.2,
        privacidad: true, provider: PROVEEDOR_PRIVADO, signal: AbortSignal.timeout(40_000),
      })
      modelo = r.model
      const tokens = r.usage?.total_tokens ?? estimarTokens(system, JSON.stringify(mensajes), r.content, JSON.stringify(r.tool_calls ?? ''))
      await registrarUso({ app: APP, endpoint: 'tools', proveedor: 'openrouter', modelo: r.model, ok: true, ms: Date.now() - t0, tokens, costeEur: await coste(r.model, r.usage ?? { total_tokens: tokens }) })
      if (!r.tool_calls?.length) { respuesta = (r.content ?? '').trim(); break }
      mensajes.push({ role: 'assistant', content: r.content ?? null, tool_calls: r.tool_calls })
      for (const c of r.tool_calls) {
        const args = leerArgumentos(c.function?.arguments)
        const res = await ejecutar(c.function?.name ?? '', args, { turnoId, reglas }).catch((e) => ({ texto: `ERROR: ${e instanceof Error ? e.message : 'fallo'}. NO digas que no hay datos.`, ok: false }))
        rastro.push({ nombre: c.function?.name ?? '?', args: rastroArgs(c.function?.name ?? '', args), ok: res.ok })
        mensajes.push({ role: 'tool', tool_call_id: c.id, content: res.texto })
      }
    }
    if (!respuesta) respuesta = 'No he llegado a una respuesta con las consultas que me permito por pregunta. Hazme la pregunta más concreta (un cliente o una póliza).'
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 300) : 'fallo'
    await registrarUso({ app: APP, endpoint: 'tools', proveedor: 'openrouter', modelo, ok: false, ms: Date.now() - t0, error })
    respuesta = '🛡️ Ahora mismo no puedo consultar la IA con garantías de privacidad. Inténtalo en un rato; la cartera está en /correduria.'
  }

  respuesta = enmascarar(respuesta).slice(0, 3800)
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_asistente_turno
    SET respuesta = ${respuesta}, herramientas = ${JSON.stringify(rastro)}::jsonb, modelo = ${modelo},
        ms = ${Date.now() - t0}, ok = ${error === null}, error = ${error}
    WHERE id = ${turnoId}`).catch(() => {})

  const enviado = await tgSendButtons(`🛡️ ${escapeHtml(respuesta)}`, [[
    { texto: '👍', callback: `cas_bien:${turnoId}` },
    { texto: '👎', callback: `cas_mal:${turnoId}` },
  ]]).catch(() => null)
  if (enviado === null) await tgSend(`🛡️ ${escapeHtml(respuesta)}`).catch(() => {})
}

// ── Botones y notas ──────────────────────────────────────────────────────────────────────────────

/** Callback `cas_*`. Devuelve el texto del toast. */
/**
 * Tras abrir la oportunidad: guardar en la ficha la póliza que se leyó (antes había que volver a subirla
 * en /correduria) y el enlace para tarificar ese ramo. Tarificar gasta dinero, así que es un ENLACE a la
 * pantalla que lo hace con su propia confirmación, nunca un botón que cotice desde aquí.
 */
async function ofrecerSiguientes(oportId: number, clienteId: string, alta: Alta, docIds: number[]): Promise<void> {
  const tarificar = enlaceTarificar(urlCliente(clienteId), alta)
  const lineas = [tarificar ? `💶 Para pedir precio: ${tarificar}` : null].filter(Boolean) as string[]
  // Se nombran los ficheros: entre lo leído puede haber algo que no es de este cliente (una factura, la
  // póliza de otro subida en la misma hora) y el botón no puede guardarlo a ciegas.
  const nombres = docIds.length === 0 ? [] : await prisma.$queryRaw<{ nombre: string | null }[]>(Prisma.sql`
    SELECT nombre FROM correduria_asistente_documento WHERE id = ANY(${docIds}::bigint[]) ORDER BY id`).catch(() => null)
  if (docIds.length > 0 && nombres !== null) {
    const lista = nombres.map((n) => `• ${escapeHtml(n.nombre ?? 'documento sin nombre')}`)
    await tgSendButtons(
      [`📎 ¿Guardo en su ficha ${docIds.length === 1 ? 'este documento' : `estos ${docIds.length} documentos`}?`, ...lista, ...lineas].join('\n'),
      [[{ texto: '📎 Guardar en la ficha', callback: `cas_guardar:${oportId}` }]],
    )
  } else if (lineas.length) {
    await tgSend(lineas.join('\n'))
  }
}

/**
 * Ya tenía una abierta del mismo ramo: se ofrece actualizarla con lo leído (antes → después) y guardar el
 * documento en su ficha. Sin poder leer la existente no se ofrece actualizar: sin el «antes» sería a ciegas.
 */
async function ofrecerSobreExistente(oportId: number, clienteId: string, existenteId: string, alta: Alta, docIds: number[]): Promise<void> {
  const r = await oportunidadesClienteAsegura(clienteId).catch(() => ({ status: 0, json: null }))
  const lista = interpretarOportunidadesCliente(r.status, r.json)
  const e = lista.estado === 'ok' ? lista.oportunidades.find((o) => o.id === existenteId) ?? null : null
  const cambios = e ? cambiosSobreExistente(alta, { aseguradora: e.aseguradora, prima: e.prima, fechaFinVigencia: e.fechaFinVigencia }) : []
  const nombres = docIds.length === 0 ? [] : await prisma.$queryRaw<{ nombre: string | null }[]>(Prisma.sql`
    SELECT nombre FROM correduria_asistente_documento WHERE id = ANY(${docIds}::bigint[]) ORDER BY id`).catch(() => null)
  const lineas: string[] = []
  const botones: { texto: string; callback: string }[] = []
  const misma = e ? mismaPoliza(alta, e) : 'no_se'
  if (!e) lineas.push('No he podido leer la que ya tiene, así que no te propongo cambiarla: revísala en la ficha.')
  else if (misma === 'otra') {
    // Otro seguro del mismo ramo (otro coche): actualizar pisaría la oportunidad que ya tiene.
    lineas.push(`🚗 Es OTRO seguro (${alta.numeroPoliza && e.numeroPoliza ? `póliza nº ${escapeHtml(alta.numeroPoliza)}, la que ya tiene es la nº ${escapeHtml(e.numeroPoliza)}` : `${escapeHtml(alta.aseguradora ?? '')}, la que ya tiene es de ${escapeHtml(e.aseguradora ?? '')}`}): no lo mezclo con ella.`)
  } else if (cambios.length === 0) lineas.push('La que ya tiene coincide con el documento: no hay nada que actualizar.')
  else {
    lineas.push('✏️ ¿Actualizo la que ya tiene con lo leído del documento?', textoCambios(cambios))
    if (misma === 'no_se') lineas.push('⚠️ No consta ni el nº de póliza ni la compañía en los dos lados: actualiza SOLO si es este mismo seguro (no otro vehículo).')
    botones.push({ texto: '✏️ Actualizar la existente', callback: `cas_actualizar:${oportId}` })
  }
  if (docIds.length > 0 && nombres !== null && nombres.length > 0) {
    lineas.push(`📎 ¿Guardo en su ficha ${nombres.length === 1 ? 'este documento' : `estos ${nombres.length} documentos`}?`, ...nombres.map((n) => `• ${escapeHtml(n.nombre ?? 'documento sin nombre')}`))
    botones.push({ texto: '📎 Guardar en la ficha', callback: `cas_guardar:${oportId}` })
  }
  if (botones.length) await tgSendButtons(lineas.join('\n'), [botones])
  else await tgSend(lineas.join('\n'), { html: true })
}

/** Botón «Actualizar la existente». Un solo uso (`actualizada_at`) y con caducidad. Nunca lanza. */
async function actualizarExistente(oportId: number): Promise<string> {
  const decir = (t: string) => tgSend(t, { html: true }).catch(() => {})
  if (!emisionTgActiva(process.env[INTERRUPTOR_EMISION])) {
    await decir(`🛡️ Las escrituras del asistente están apagadas (${INTERRUPTOR_EMISION}): no se ha cambiado nada.`)
    return 'Apagado: no se cambia nada'
  }
  const [fila] = await prisma.$queryRaw<{ cliente_id: string | null; alta: Alta | null; existente: string | null }[]>(Prisma.sql`
    UPDATE correduria_asistente_oportunidad SET actualizada_at = now()
    WHERE id = ${oportId} AND estado = 'duplicada' AND actualizada_at IS NULL AND alta IS NOT NULL
      AND decidida_at > now() - make_interval(mins => ${MINUTOS_PROPUESTA}::int)
    RETURNING cliente_id::text AS cliente_id, alta, resultado->>'id' AS existente`).catch(() => [])
  if (!fila || !fila.cliente_id || !fila.alta || !fila.existente) return 'Ya estaba hecho o ha caducado'
  // El «antes» se vuelve a leer ahora: entre el mensaje y el clic alguien pudo tocarla en la ficha.
  const r0 = await oportunidadesClienteAsegura(fila.cliente_id).catch(() => ({ status: 0, json: null }))
  const lista = interpretarOportunidadesCliente(r0.status, r0.json)
  const e = lista.estado === 'ok' ? lista.oportunidades.find((o) => o.id === fila.existente) ?? null : null
  const url = `${urlCliente(fila.cliente_id)}?tab=oportunidades&op=${encodeURIComponent(fila.existente)}`
  const cerrar = () => prisma.$executeRaw(Prisma.sql`UPDATE correduria_asistente_oportunidad SET alta = NULL WHERE id = ${oportId}`).catch(() => {})
  if (!e) { await cerrar(); await decir(`✋ No he podido leer la oportunidad ahora: no la toco.\n${url}`); return 'No se ha actualizado' }
  if (mismaPoliza(fila.alta, e) === 'otra') {
    await cerrar(); await decir(`✋ Es otro seguro (otra póliza o compañía) que la oportunidad que ya tiene: no la piso.\n${url}`); return 'No se actualiza: otro seguro'
  }
  const cambios = cambiosSobreExistente(fila.alta, { aseguradora: e.aseguradora, prima: e.prima, fechaFinVigencia: e.fechaFinVigencia })
  if (cambios.length === 0) { await cerrar(); await decir(`ℹ️ Ya coincide con el documento: nada que cambiar.\n${url}`); return 'Sin cambios' }
  const r = await accionOportunidadAsegura(cuerpoEdicion(fila.existente, cambios, ACTOR_EMISION_TG))
    .catch(() => ({ status: 0, json: null }))
  const fin = resultadoEdicion(r.status, r.json, url)
  await cerrar()
  await decir(fin.estado === 'hecha' ? `${fin.texto.split('\n')[0]}\n${textoCambios(cambios)}\n${url}` : fin.texto)
  return fin.estado === 'hecha' ? 'Actualizada ✏️' : fin.estado === 'incierta' ? 'No sé si se ha actualizado' : 'No se ha actualizado'
}

/** Botón «Guardar en la ficha». Un solo uso (`documentos_guardados_at`). Nunca lanza. */
async function guardarDocumentosEnFicha(oportId: number): Promise<string> {
  const decir = (t: string) => tgSend(t, { html: true }).catch(() => {})
  const [fila] = await prisma.$queryRaw<{ cliente_id: string | null; documentos: bigint[] | null }[]>(Prisma.sql`
    UPDATE correduria_asistente_oportunidad SET documentos_guardados_at = now()
    WHERE id = ${oportId} AND estado IN ('abierta', 'duplicada') AND documentos_guardados_at IS NULL
    RETURNING cliente_id::text AS cliente_id, documentos`).catch(() => [])
  if (!fila || !fila.cliente_id) return 'Ya estaba hecho (o no encuentro la oportunidad)'
  const ids = (fila.documentos ?? []).map(Number)
  const docs = ids.length === 0 ? [] : await prisma.$queryRaw<{ id: bigint; file_id: string; nombre: string | null; mime: string | null }[]>(Prisma.sql`
    SELECT id, file_id, nombre, mime FROM correduria_asistente_documento WHERE id = ANY(${ids}::bigint[])`).catch(() => null)
  if (docs === null || docs.length === 0) {
    await decir('✋ No he podido recuperar los documentos (se borran a los 30 días). Súbelos en la ficha → 📎 Documentos.')
    return 'Sin documentos'
  }
  let bien = 0
  const fallos: string[] = []
  for (const d of docs) {
    const file = await descargarTelegram(d.file_id, d.mime ?? '', d.nombre ?? '')
    if (!file) { fallos.push(`${d.nombre ?? 'documento'}: no se pudo bajar de Telegram`); continue }
    const form = new FormData()
    form.set('fichero', new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }), file.fileName)
    form.set('clienteId', fila.cliente_id)
    form.set('tipo', 'otro')
    form.set('notas', 'Póliza que tiene con otra compañía (subida por Telegram para abrir la oportunidad)')
    const r = await subirDocumentoAsegura(form, ACTOR_EMISION_TG).catch(() => ({ status: 0, json: null }))
    if (r.status >= 200 && r.status < 300) bien++
    else fallos.push(`${d.nombre ?? 'documento'}: ${r.status === 0 || r.status >= 500 ? 'no sé si se ha guardado, míralo en la ficha' : `rechazado (HTTP ${r.status})`}`)
  }
  const partes = [bien > 0 ? `✅ ${bien} documento${bien === 1 ? '' : 's'} guardado${bien === 1 ? '' : 's'} en la ficha.` : null, ...fallos.map((f) => `⚠️ ${escapeHtml(f)}`)]
  await decir([...partes.filter(Boolean), urlCliente(fila.cliente_id)].join('\n'))
  return bien > 0 ? 'Guardado 📎' : 'No se ha guardado'
}

export async function resolverBotonCorreduria(accion: string, arg: string): Promise<string> {
  const id = Number(arg)
  if (!Number.isInteger(id) || id <= 0) return 'Botón no válido'
  if (accion === 'bien' || accion === 'mal') {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_asistente_turno SET valoracion = ${accion === 'bien' ? 1 : -1} WHERE id = ${id}`).catch(() => {})
    if (accion === 'mal') await tgAskForReply(preguntaNota(id)).catch(() => {})
    return accion === 'bien' ? 'Gracias 👍' : 'Apuntado 👎'
  }
  if (accion === 'corregir') return aplicarCorreccion(id)
  if (accion === 'oport') return abrirOportunidad(id)
  if (accion === 'guardar') return guardarDocumentosEnFicha(id)
  if (accion === 'actualizar') return actualizarExistente(id)
  if (accion === 'acc') return hacerAccion(id)
  if (accion === 'accno') {
    const n = await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_asistente_accion SET estado = 'descartada', decidida_at = now(), cuerpo = NULL
      WHERE id = ${id} AND estado = 'propuesta'`).catch(() => 0)
    return n ? 'Descartado: no se hace nada' : 'Ya estaba decidido'
  }
  if (accion === 'oportno') {
    const n = await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_asistente_oportunidad SET estado = 'descartada', decidida_at = now(), alta = NULL, lead = NULL
      WHERE id = ${id} AND estado = 'propuesta'`).catch(() => 0)
    return n ? 'Descartada: no se abre nada' : 'Ya estaba decidida'
  }
  if (accion === 'corregirno') {
    const n = await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_asistente_correccion SET estado = 'descartada', decidida_at = now(), ${SOLO_CAMPOS}
      WHERE id = ${id} AND estado = 'propuesta'`).catch(() => 0)
    return n ? 'Descartado: no se cambia nada' : 'Ya estaba decidido'
  }
  if (accion === 'emitirno') {
    const n = await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_asistente_emision SET estado = 'descartada', decidida_at = now()
      WHERE id = ${id} AND estado = 'propuesta'`).catch(() => 0)
    return n ? 'Descartada: no se emite' : 'Ya estaba decidida'
  }
  if (accion === 'regla' || accion === 'reglano') {
    const n = await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_asistente_regla
      SET estado = ${accion === 'regla' ? 'activa' : 'olvidada'},
          confirmada_at = CASE WHEN ${accion === 'regla'} THEN now() ELSE confirmada_at END,
          olvidada_at = CASE WHEN ${accion === 'reglano'} THEN now() ELSE olvidada_at END
      WHERE id = ${id} AND estado = 'propuesta'`).catch(() => 0)
    if (!n) return 'Ya estaba decidida'
    return accion === 'regla' ? 'Regla apuntada 🧠' : 'Descartada'
  }
  return 'Botón no válido'
}

/** Respuesta de Alberto al «¿qué ha fallado?» de un 👎. */
export async function guardarNotaCorreduria(turnoId: number, nota: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_asistente_turno SET nota = ${enmascarar(nota).slice(0, 1000)}, valoracion = -1 WHERE id = ${turnoId}`).catch(() => {})
  await tgSend('📝 Apuntado. Lo reviso en la mejora semanal del asistente.').catch(() => {})
}
