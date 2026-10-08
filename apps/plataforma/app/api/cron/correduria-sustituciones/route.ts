// ────────────────────────────────────────────────────────────────────────────
// Aviso diario de SEGUIMIENTO de sustituciones (cambios de compañía).
//
// Lee la misma cola que pinta /correduria (`sustitucionesAsegura`) y avisa por
// Telegram si hay alguna sustitución que lleva ≥3 días sin que CIMA confirme
// la póliza nueva. Digest diario, sin dedupe por fila: mientras siga
// pendiente, sigue siendo la misma pregunta sin responder.
//
// 🚨 Un fallo de lectura NUNCA se sirve como «no hay nada pendiente»: si el
// puerto no responde, el latido se pone en rojo y no se manda nada (mandar un
// «0 pendientes» falso sería peor que no mandar).
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { tgAviso } from '@/lib/telegram'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { sustitucionesAsegura } from '@/lib/correduria-puerto'
import { enviarAvisosIndependientes, mensajeDobleSeguro, mensajeSustituciones } from '@/lib/correduria/sustituciones-aviso'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AGENTE = 'correduria_sustituciones'

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const r = await sustitucionesAsegura()

  if (r.estado !== 'ok') {
    const motivo = r.estado === 'sin_configurar'
      ? 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)'
      : `no se pudo leer: ${r.motivo}`
    await registrarLatido(AGENTE, false, motivo)
    return NextResponse.json({ ok: false, motivo }, { status: 200 })
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
  if (errores.length > 0) {
    await registrarLatido(AGENTE, false, `Telegram falló: ${errores.join(' | ')}`)
    return NextResponse.json({ ok: false, motivo: 'telegram', errores, pendientes: r.filas.length, dobleSeguro: nDoble, enviado }, { status: 200 })
  }

  await registrarLatido(AGENTE, true, `${r.filas.length} sustitución(es) pendiente(s) de confirmar · ${r.dobleSeguro === null ? 'doble seguro sin leer' : `${nDoble} posible(s) doble seguro`}`)
  return NextResponse.json({ ok: true, pendientes: r.filas.length, dobleSeguro: r.dobleSeguro === null ? null : nDoble, enviado })
}
