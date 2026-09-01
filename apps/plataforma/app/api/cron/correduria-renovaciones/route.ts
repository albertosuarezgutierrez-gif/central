// ────────────────────────────────────────────────────────────────────────────
// Aviso diario de RENOVACIONES de la correduría (Grupo ASegura).
//
// Lee la cartera por el puerto HTTP de central-asegura y avisa por Telegram de
// las pólizas que entran en ventana. La ventana la marca la LCS art. 22, no un
// calendario redondo: a menos de un mes del vencimiento el tomador ya no puede
// oponerse a la prórroga, así que el aviso llega ANTES de que ese plazo pase.
//
// 🚨 Un fallo de lectura NUNCA se sirve como «hoy no vence nada». Son los dos
// silencios que hay que separar: si el puerto no responde, el latido se pone en
// rojo y el Telegram lo dice; solo un `ok` con lista vacía autoriza a callar.
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { tgAviso } from '@/lib/telegram'
import { prisma } from '@/lib/db'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { vencimientosAsegura } from '@/lib/cartera-asegura'
import {
  claveAviso, detalleRenovaciones, emisionesDeHoy, mensajeRenovaciones, type HitoId, type PolizaAviso,
} from '@/lib/correduria/renovaciones-aviso'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Horizonte de lectura: el hito más laxo son 60 días, se pide algo más para
 *  que una póliza no se cuele por el borde si el cron se salta un día. */
const DIAS_VENTANA = 70

const AGENTE = 'correduria_renovaciones'

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cartera = await vencimientosAsegura(DIAS_VENTANA)

  // «Sin configurar» no es un fallo: el puerto todavía no está conectado. Se
  // registra como pasada NO buena igualmente, para que el vigía no dé por
  // sano un agente que no puede leer nada.
  if (cartera.estado !== 'ok') {
    const motivo = cartera.estado === 'sin_configurar'
      ? 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)'
      : `no se pudo leer la cartera: ${cartera.motivo}`
    await registrarLatido(AGENTE, false, motivo)
    if (cartera.estado === 'error') {
      await tgAviso('correduria.renovaciones', 
        `🛡️ *Renovaciones · Grupo ASegura*\nNo he podido leer la cartera (${cartera.motivo}). ` +
        `Esto NO significa que no venza nada: hoy no se ha podido mirar.`,
      ).catch(() => {})
    }
    return NextResponse.json({ ok: false, motivo }, { status: 200 })
  }

  const polizas: PolizaAviso[] = cartera.polizas.map(p => ({
    id: p.id, cliente: p.cliente, tipo: p.tipo, aseguradora: p.aseguradora,
    numeroPoliza: p.numeroPoliza, fechaVencimiento: p.fechaVencimiento,
    dias: p.dias, prima: p.prima,
  }))

  // Qué avisos constan ya. Se consulta SOLO por las pólizas de la ventana: la
  // tabla crece con el tiempo y no hace falta traerla entera.
  const ids = polizas.map(p => p.id)
  const previos = ids.length
    ? await prisma.$queryRaw<Array<{ poliza_id: string; vencimiento: Date; hito: string }>>(Prisma.sql`
        SELECT poliza_id::text, vencimiento, hito
        FROM correduria_avisos_renovacion
        WHERE poliza_id = ANY(${ids}::uuid[])`)
    : []
  const yaAvisados = new Set(
    previos.map(r => `${r.poliza_id}|${r.vencimiento.toISOString().slice(0, 10)}|${r.hito}`),
  )

  const emisiones = emisionesDeHoy(polizas, yaAvisados)
  const mensaje = mensajeRenovaciones(emisiones)

  // El orden importa: primero se manda y solo se marca lo que se ha mandado.
  // Al revés, un fallo de Telegram dejaría avisos marcados que nadie ha visto
  // y esas pólizas no volverían a sonar nunca.
  let enviado = false
  if (mensaje) {
    try {
      await tgAviso('correduria.renovaciones', mensaje)
      enviado = true
    } catch (e) {
      await registrarLatido(AGENTE, false, `Telegram falló: ${String(e).slice(0, 120)}`)
      return NextResponse.json({ ok: false, motivo: 'telegram', emisiones: emisiones.length }, { status: 200 })
    }
  }

  if (enviado) {
    const filas = emisiones.flatMap(e =>
      e.consumidos.map((hito: HitoId) => ({ id: e.poliza.id, venc: e.poliza.fechaVencimiento, hito })),
    )
    for (const f of filas) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO correduria_avisos_renovacion (poliza_id, vencimiento, hito)
        VALUES (${f.id}::uuid, ${f.venc}::date, ${f.hito}::text)
        ON CONFLICT DO NOTHING`)
    }
  }

  const detalle = detalleRenovaciones(polizas.length, emisiones.length, DIAS_VENTANA)
  await registrarLatido(AGENTE, true, detalle)
  return NextResponse.json({
    ok: true, leidas: polizas.length, emitidas: emisiones.length, enviado,
    // La clave de cada aviso viaja en la respuesta para poder auditar a mano
    // qué se marcó sin abrir la BD.
    claves: emisiones.map(e => claveAviso(e.poliza, e.hito)),
  })
}
