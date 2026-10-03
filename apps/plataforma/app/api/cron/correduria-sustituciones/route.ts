// ────────────────────────────────────────────────────────────────────────────
// Aviso diario de SEGUIMIENTO de sustituciones (cambios de compañía).
//
// Lee la misma cola que pinta /correduria (`sustitucionesAsegura`) y avisa por
// Telegram si hay alguna sustitución que lleva ≥3 días sin que CIMA confirme
// la póliza nueva. Digest diario, sin dedupe por fila: mientras siga
// pendiente, sigue siendo la misma pregunta sin responder.
//
// Además vigila los DUPLICADOS VIVOS nuevos (`vigilarDuplicados`, 03/10/2026): solo avisa de los grupos
// que no estaban en el último aviso.
//
// 🚨 Un fallo de lectura NUNCA se sirve como «no hay nada pendiente»: si el
// puerto no responde, el latido se pone en rojo y no se manda nada (mandar un
// «0 pendientes» falso sería peor que no mandar).
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { tgAviso } from '@/lib/telegram'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { duplicadosAsegura, duplicadosVistosAsegura, guardarDuplicadosVistosAsegura, sustitucionesAsegura } from '@/lib/correduria-puerto'
import { claveGrupoDuplicado, gruposDuplicadosNuevos, mensajeDuplicadosNuevos } from '@/lib/correduria/duplicados-aviso'
import { enviarAvisosIndependientes, mensajeDobleSeguro, mensajeSustituciones } from '@/lib/correduria/sustituciones-aviso'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AGENTE = 'correduria_sustituciones'

/**
 * Vigilancia de DUPLICADOS VIVOS nuevos (03/10/2026): avisa solo de los grupos que no estaban en el último
 * aviso (`duplicados_vivos_visto`, vía el puerto de asegura). NUNCA lanza: un fallo aquí no puede impedir los
 * avisos de sustituciones. `error` = no se pudo leer/enviar/guardar (no es «no hay duplicados nuevos»).
 */
async function vigilarDuplicados(): Promise<{ nuevos: number | null; error?: string }> {
  try {
    const d = await duplicadosAsegura()
    if (d.estado === 'sin_configurar') return { nuevos: null }
    if (d.estado !== 'ok') return { nuevos: null, error: `duplicados sin leer: ${d.motivo}` }
    const v = await duplicadosVistosAsegura()
    // Sin poder leer lo ya visto se avisa igual: perder un aviso es peor que repetirlo.
    const vistos = v.estado === 'ok' ? v.claves : null
    const nuevos = gruposDuplicadosNuevos(d.muestra, vistos)
    const mensaje = mensajeDuplicadosNuevos(nuevos, d.total)
    const { errores } = await enviarAvisosIndependientes([
      { id: 'duplicados-nuevos', mensaje, enviar: (m) => tgAviso('correduria.duplicados-nuevos', m) },
    ])
    if (errores.length > 0) return { nuevos: nuevos.length, error: `Telegram duplicados: ${errores.join(' | ')}` }
    // Solo se recuerda lo visto si el aviso salió (o no había nada que decir): si no, mañana se repite.
    const actuales = d.muestra.map(claveGrupoDuplicado)
    const igual = vistos !== null && vistos.length === actuales.length && actuales.every((c) => vistos.includes(c))
    if (!igual && !(await guardarDuplicadosVistosAsegura(actuales))) {
      return { nuevos: nuevos.length, error: 'no se pudo guardar lo visto de duplicados' }
    }
    return { nuevos: nuevos.length }
  } catch (err) {
    return { nuevos: null, error: `duplicados: ${String(err).slice(0, 120)}` }
  }
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Primero y aparte: es independiente de las sustituciones (y no se pierde si estas no se pueden leer).
  const dup = await vigilarDuplicados()

  const r = await sustitucionesAsegura()

  if (r.estado !== 'ok') {
    const motivo = r.estado === 'sin_configurar'
      ? 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)'
      : `no se pudo leer: ${r.motivo}`
    await registrarLatido(AGENTE, false, dup.error ? `${motivo} · ${dup.error}` : motivo)
    return NextResponse.json({ ok: false, motivo, duplicadosNuevos: dup.nuevos }, { status: 200 })
  }

  const mensaje = mensajeSustituciones(
    r.filas.map((f) => ({
      cliente: f.cliente,
      diasSustituida: f.diasSustituida,
      polizaVieja: f.polizaVieja,
      polizaNueva: f.polizaNueva,
    })),
  )

  const mensajeDoble = r.dobleSeguro === null ? null : mensajeDobleSeguro(r.dobleSeguro)

  // Envíos independientes: un Telegram caído en uno no tapa el otro.
  const { enviados, errores } = await enviarAvisosIndependientes([
    { id: 'doble-seguro', mensaje: mensajeDoble, enviar: (m) => tgAviso('correduria.sustitucion-doble-seguro', m) },
    { id: 'seguimiento', mensaje, enviar: (m) => tgAviso('correduria.sustitucion-seguimiento', m) },
  ])
  const enviado = enviados > 0
  const nDoble = r.dobleSeguro?.length ?? 0
  const fallos = dup.error ? [...errores, dup.error] : errores
  if (fallos.length > 0) {
    await registrarLatido(AGENTE, false, `Telegram falló: ${fallos.join(' | ')}`)
    return NextResponse.json({ ok: false, motivo: 'telegram', errores: fallos, pendientes: r.filas.length, dobleSeguro: nDoble, duplicadosNuevos: dup.nuevos, enviado }, { status: 200 })
  }

  await registrarLatido(AGENTE, true, `${r.filas.length} sustitución(es) pendiente(s) de confirmar · ${r.dobleSeguro === null ? 'doble seguro sin leer' : `${nDoble} posible(s) doble seguro`} · ${dup.nuevos === null ? 'duplicados sin leer' : `${dup.nuevos} duplicado(s) nuevo(s)`}`)
  return NextResponse.json({ ok: true, pendientes: r.filas.length, dobleSeguro: r.dobleSeguro === null ? null : nDoble, duplicadosNuevos: dup.nuevos, enviado })
}
