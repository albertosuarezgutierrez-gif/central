// ────────────────────────────────────────────────────────────────────────────
// Aviso por Telegram de TODO lo que hace un cliente en el portal (Grupo
// ASegura). Pieza 1-7 de ASegura OS, dictado de Alberto (23/09/2026):
//
//   «Que cuando entre cliente me llegue aviso por Telegram; al principio hay
//    que hacer seguimiento de todo.»
//
// Hasta hoy lo que hacía un cliente en su intranet (entrar, no poder entrar,
// cambiar su dirección, dar un parte, pedir la supresión…) solo se veía si
// Alberto abría /correduria → Actividad. Esto lo empuja.
//
// Mismo patrón que `correduria-siniestros`, y por la misma razón: **la marca
// de agua NO avanza si el Telegram no ha salido.** La regla pura (qué es nuevo,
// la ventana para los accesos fallidos que aparecen tarde, qué dice el mensaje
// y qué NO) vive en `@central/module-seguros` (`actividad-aviso.ts`).
//
// Póliza declarada y sugerencia NO se repiten aquí: el portal ya las avisa al
// instante (decisión de Alberto, 23/09/2026).
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { cabecerasPuerto } from '../../../../lib/puerto-actor'

import { Prisma } from '@prisma/client'
import { tgSend } from '@/lib/telegram'
import { avisoPermitido, avisoEnviado } from '@/lib/telegram/avisos'
import { prisma } from '@/lib/db'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { urlFichaCliente } from '@/lib/leads-web'
import {
  decidirAvisosActividad,
  desdeConsulta,
  detalleActividad,
  leerMarcaActividad,
  mensajeActividad,
  serializarMarcaActividad,
  type EventoActividad,
  type MarcaActividad,
} from '@central/module-seguros'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AGENTE = 'correduria_actividad'
const LIMITE_LECTURA = 200

type Lectura =
  | { estado: 'ok'; eventos: EventoActividad[]; total: number }
  | { estado: 'sin_datos'; causa: string }

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/** Una fila del puerto, o `null` si no tiene forma (sin id, tipo o fecha no se puede deduplicar). */
function leerFila(v: unknown): EventoActividad | null {
  if (typeof v !== 'object' || v === null) return null
  const e = v as Record<string, unknown>
  const id = texto(e.id)
  const tipo = texto(e.tipo)
  const fecha = texto(e.fecha)
  if (id === null || tipo === null || fecha === null || Number.isNaN(new Date(fecha).getTime())) return null
  return { id, tipo, fecha, clienteId: texto(e.clienteId), cliente: texto(e.cliente), texto: null }
}

/**
 * Lee el puerto de `central-asegura`. CUALQUIER duda acaba en `sin_datos`,
 * nunca en una lista vacía: «nadie ha hecho nada» y «no se ha podido mirar»
 * no son lo mismo. El `texto` de cada evento ni se guarda: el mensaje no lo usa.
 */
async function leerPuerto(desde: string): Promise<Lectura> {
  const secreto = process.env.ASEGURA_OPERADOR_SECRET
  if (!secreto) return { estado: 'sin_datos', causa: 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)' }
  const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
  const q = new URLSearchParams({ desde, limite: String(LIMITE_LECTURA) })

  let status: number
  let json: unknown
  try {
    const res = await fetch(`${base}/api/operador/actividad-nueva?${q}`, {
      headers: { ...(await cabecerasPuerto(secreto)) },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    status = res.status
    json = await res.json().catch(() => null)
  } catch {
    return { estado: 'sin_datos', causa: 'no se pudo llegar a asegura (timeout, DNS o TLS)' }
  }

  if (status === 401 || status === 403) return { estado: 'sin_datos', causa: 'asegura rechaza el secreto' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_datos', causa: 'asegura sin base de datos configurada' }
  if (status === 404) return { estado: 'sin_datos', causa: 'asegura aún no tiene /api/operador/actividad-nueva desplegado' }
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.eventos)) {
    return { estado: 'sin_datos', causa: texto(o.causa) ?? texto(o.motivo) ?? `HTTP ${status}` }
  }
  const eventos: EventoActividad[] = []
  for (const fila of o.eventos) {
    const e = leerFila(fila)
    if (e === null) return { estado: 'sin_datos', causa: 'asegura devolvió un evento sin id, tipo o fecha' }
    eventos.push(e)
  }
  const total = typeof o.total === 'number' && Number.isFinite(o.total) ? o.total : eventos.length
  return { estado: 'ok', eventos, total }
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let detalleAnterior: string | null = null
  try {
    const filas = await prisma.$queryRaw<Array<{ detalle: string | null }>>(Prisma.sql`
      SELECT detalle FROM agente_latidos WHERE agente = ${AGENTE}`)
    detalleAnterior = filas[0]?.detalle ?? null
  } catch {
    // Sin poder leer la marca no se inventa una, y TAMPOCO se escribe el
    // latido: `registrarLatido` reescribe el `detalle` entero y borraría la
    // marca guardada, con lo que la pasada siguiente anclaría sin avisar de lo
    // pendiente. El silencio del latido (`ultimo_ok_at` que no avanza) ya lo
    // delata en la vigilancia diaria.
    console.error('[correduria-actividad] no se pudo leer la marca de agua del latido')
    return NextResponse.json({ ok: false, motivo: 'marca_ilegible' }, { status: 500 })
  }

  const ahora = new Date()
  const marca = leerMarcaActividad(detalleAnterior)
  const lectura = await leerPuerto(desdeConsulta(marca, ahora))

  if (lectura.estado === 'sin_datos') {
    const detalle = detalleActividad({ avisar: false, motivo: 'sin_datos', causa: lectura.causa })
    await registrarLatido(AGENTE, false, marca ? serializarMarcaActividad(marca, detalle) : detalle)
    return NextResponse.json({ ok: false, estado: 'sin_datos', causa: lectura.causa })
  }

  const decision = decidirAvisosActividad({
    marca,
    eventos: lectura.eventos,
    ahora,
    truncado: lectura.total > lectura.eventos.length,
  })

  if (decision.motivo === 'atascado') {
    // Se conserva la marca anterior y el latido sale en ROJO: esto no es «nada nuevo».
    const detalle = detalleActividad(decision)
    await registrarLatido(AGENTE, false, marca ? serializarMarcaActividad(marca, detalle) : detalle)
    return NextResponse.json({ ok: false, estado: 'atascado', causa: decision.causa })
  }

  if (decision.avisar === false) {
    const detalle = detalleActividad(decision)
    await registrarLatido(AGENTE, true, serializarMarcaActividad(decision.marca, detalle))
    return NextResponse.json({ ok: true, estado: decision.motivo, avisados: 0, detalle })
  }

  // Silencio DELIBERADO (interruptor apagado en /telegram) ≠ envío fallido: lo
  // primero avanza la marca; lo segundo reintenta en la próxima pasada.
  // ⚠️ Id LITERAL en las dos llamadas: `lib/telegram/catalogo.test.ts` lee el fuente.
  const permitido = await avisoPermitido('correduria.actividad-cliente')
  let salio = false
  if (permitido) {
    const messageId = await tgSend(mensajeActividad(decision.nuevos, id => urlFichaCliente(id))).catch(() => null)
    salio = messageId !== null
    if (salio) await avisoEnviado('correduria.actividad-cliente')
  }

  const avanza = salio || !permitido
  const detalle = avanza
    ? detalleActividad(decision) + (permitido ? '' : ' · aviso silenciado en /telegram')
    : `actividad del portal: ${decision.nuevos.length} evento(s) SIN avisar (el Telegram no salió) — se reintentan en la próxima pasada`
  const marcaFinal: MarcaActividad | null = avanza ? decision.marca : marca
  await registrarLatido(AGENTE, avanza, marcaFinal ? serializarMarcaActividad(marcaFinal, detalle) : detalle)

  return NextResponse.json({ ok: avanza, estado: 'avisado', avisados: avanza ? decision.nuevos.length : 0, silenciado: !permitido, detalle })
}
