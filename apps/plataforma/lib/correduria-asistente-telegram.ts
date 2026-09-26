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
import { openrouterConfigPasarela, modelosPorDefecto, getDirectorEstado } from '@/lib/ia-director'
import { registrarUso, dentroDePresupuestoDiario, estimarTokens, costePorUso } from '@/lib/ai-gateway'
import { buscarAsegura, impagadosAsegura, sustitucionesAsegura } from '@/lib/correduria-puerto'
import { fichaAsegura } from '@/lib/ficha-asegura'
import { polizaAsegura } from '@/lib/poliza-asegura'
import { vencimientosAsegura } from '@/lib/cartera-asegura'
import { emitirAsegura, importarProyectoAsegura, vistaImportacionAsegura } from '@/lib/retarificar-asegura'
import {
  ACTOR_EMISION_TG, emisionTgActiva, huellaResumen, MINUTOS_PROPUESTA, prepararResumen, proyectoValido, resultadoEmision,
  textoResumen, urlPoliza, type ResumenEmision,
} from './correduria-emision-tg'
import {
  apagado, clasificarDestino, costeConservador, DIAS_RETENCION_TEXTO, rastroArgs, tienePrefijo, diasValidos, enmascarar, HERRAMIENTAS, idValido,
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
    SELECT count(*) AS n FROM correduria_asistente_turno WHERE creado_at >= now() - interval '10 minutes'`)
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

async function reglasActivas(): Promise<{ id: number; texto: string }[]> {
  return prisma.$queryRaw<{ id: bigint; texto: string }[]>(Prisma.sql`
    SELECT id, texto FROM correduria_asistente_regla WHERE estado = 'activa' ORDER BY id`)
    .then((rs) => rs.map((r) => ({ id: Number(r.id), texto: r.texto })))
    .catch(() => [])
}

// ── Herramientas ─────────────────────────────────────────────────────────────────────────────────

/** Ejecuta una herramienta. Devuelve el texto que verá la IA (ya enmascarado) y si fue bien. */
async function ejecutar(
  nombre: string, args: Record<string, unknown> | null, ctx: { turnoId: number; reglas: { id: number; texto: string }[] },
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
      if (!id) return { texto: 'ERROR: clienteId no válido. Usa buscar para obtenerlo.', ok: false }
      const r = await fichaAsegura(id)
      if (r.estado === 'no_encontrado') return { texto: 'No existe ninguna ficha con ese id.', ok: true }
      if (r.estado !== 'ok') return fallo(r)
      return { texto: paraIA(r.ficha), ok: true }
    }
    case 'ficha_poliza': {
      const id = idValido(args.polizaId)
      if (!id) return { texto: 'ERROR: polizaId no válido. Sácalo de ficha_cliente.', ok: false }
      const r = await polizaAsegura(id)
      if (r.estado === 'no_encontrado') return { texto: 'No existe ninguna póliza con ese id.', ok: true }
      if (r.estado !== 'ok') return fallo(r)
      return { texto: paraIA(r.poliza), ok: true }
    }
    case 'vencimientos': {
      const r = await vencimientosAsegura(diasValidos(args.dias), 12_000)
      if (r.estado !== 'ok') return fallo(r)
      return { texto: paraIA(r), ok: true }
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
      await tgSendButtons(`🧠 ¿Apunto esta regla para siempre?\n<i>${escapeHtml(regla)}</i>`, [[
        { texto: '✅ Apúntala', callback: `cas_regla:${fila.id}` },
        { texto: '✖️ No', callback: `cas_reglano:${fila.id}` },
      ]]).catch(() => {})
      return { texto: 'Propuesta enviada; Alberto la confirmará con un botón. No digas que ya está guardada.', ok: true }
    }
    case 'listar_reglas':
      return { texto: ctx.reglas.length ? ctx.reglas.map((r, i) => `${i + 1}. ${r.texto}`).join('\n') : 'Todavía no hay reglas aprendidas.', ok: true }
    case 'olvidar_regla': {
      const n = Math.round(Number(args.numero))
      const regla = ctx.reglas[n - 1]
      if (!regla) return { texto: `No hay regla número ${args.numero}.`, ok: true }
      await prisma.$executeRaw(Prisma.sql`
        UPDATE correduria_asistente_regla SET estado = 'olvidada', olvidada_at = now() WHERE id = ${regla.id}`)
      return { texto: `Olvidada: «${regla.texto}».`, ok: true }
    }
    case 'preparar_emision':
      return prepararEmision(args, ctx.turnoId)
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
  if (!polizaId) return { texto: 'ERROR: polizaId no válido. Sácalo de ficha_cliente.', ok: false }
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

// ── Un turno ─────────────────────────────────────────────────────────────────────────────────────

async function turnosDeHoy(): Promise<number | null> {
  return prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
    SELECT count(*) AS n FROM correduria_asistente_turno WHERE creado_at >= date_trunc('day', now())`)
    .then((r) => Number(r[0]?.n ?? 0)).catch(() => null)
}

/** Las dos últimas preguntas de la última media hora: contexto para «¿y su mujer?». */
async function historialReciente(): Promise<NimToolMessage[]> {
  const filas = await prisma.$queryRaw<{ pregunta: string | null; respuesta: string | null }[]>(Prisma.sql`
    SELECT pregunta, respuesta FROM correduria_asistente_turno
    WHERE creado_at >= now() - interval '30 minutes' AND ok AND pregunta IS NOT NULL AND respuesta IS NOT NULL
    ORDER BY id DESC LIMIT 2`).catch(() => [])
  return filas.reverse().flatMap((f) => [
    { role: 'user' as const, content: f.pregunta },
    { role: 'assistant' as const, content: f.respuesta },
  ])
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

  const [turno] = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
    INSERT INTO correduria_asistente_turno (pregunta) VALUES (${enmascarar(pregunta)}) RETURNING id`)
    .catch(() => [] as { id: bigint }[])
  if (!turno) { await tgSend('🛡️ No he podido registrar la pregunta, así que no la contesto (sin registro no hay rastro de acceso). Reinténtalo.').catch(() => {}); return }
  const turnoId = Number(turno.id)

  const reglas = await reglasActivas()
  const system = systemAsistente(reglas.map((r) => r.texto), new Date().toISOString().slice(0, 10))
  // A la IA va la pregunta TAL CUAL (si Alberto busca por DNI, la IA necesita el DNI para buscarlo;
  // el proveedor es de retención cero). Enmascarada queda solo en el registro y en Telegram.
  const mensajes: NimToolMessage[] = [...(await historialReciente()), { role: 'user', content: pregunta }]
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
export async function resolverBotonCorreduria(accion: string, arg: string): Promise<string> {
  const id = Number(arg)
  if (!Number.isInteger(id) || id <= 0) return 'Botón no válido'
  if (accion === 'bien' || accion === 'mal') {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_asistente_turno SET valoracion = ${accion === 'bien' ? 1 : -1} WHERE id = ${id}`).catch(() => {})
    if (accion === 'mal') await tgAskForReply(preguntaNota(id)).catch(() => {})
    return accion === 'bien' ? 'Gracias 👍' : 'Apuntado 👎'
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
