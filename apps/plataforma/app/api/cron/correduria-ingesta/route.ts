// ────────────────────────────────────────────────────────────────────────────
// Vigía de la INGESTA de CIMA (Grupo ASegura).
//
// 🚨 Existe por una avería real: del 24/06 al 30/08/2026 se quedaron 42 ficheros
// de CIMA sin procesar —23 recibos por 7.721,71€ de prima y 20 siniestros, casi
// todos de Occident— y NADIE se enteró en más de dos meses. No por falta de
// vigilancia: el health-check del CRM de origen corría a diario y su propio parte
// decía `cuarentenaTotal: 41`, subiendo 39 → 40 → 41 en seis días. Sus señales de
// alarma eran `ficherosError` y `ficherosDeferred`, que valían cero, así que
// estuvo en VERDE todo el tiempo. Midió lo que no era.
//
// Este vigía mide lo que se PIERDE. Y no se calla cuando no puede mirar: un
// fallo de lectura es un aviso, no un silencio.
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { tgAviso } from '@/lib/telegram'
import { prisma } from '@/lib/db'
import { eur } from '@/lib/dinero'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { leerIngestaCima, saludDesdeRespuesta } from '@/lib/correduria/ingesta-cima'
import { detalleSalud } from '@central/module-seguros'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AGENTE = 'correduria_ingesta'

/**
 * Firma de lo que se ha visto hoy. Sirve para no repetir el MISMO aviso cada
 * mañana mientras la avería sigue abierta: el estado vive en el latido y en la
 * pantalla; el Telegram suena cuando algo CAMBIA (entra un fichero nuevo, o
 * aparece otra póliza huérfana). Si empeora, vuelve a sonar.
 *
 * ⚠️ Esto silencia la REPETICIÓN, no el aviso: la primera vez siempre suena.
 */
function firma(estado: string, recientes: number, huerfanas: number | null): string {
  return `${estado}:${recientes}:${huerfanas ?? '?'}`
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const respuesta = await leerIngestaCima()
  const salud = saludDesdeRespuesta(respuesta)
  const detalle = detalleSalud(salud)

  // Qué se dijo la última vez, para no repetirse. Si no se puede leer, se avisa
  // igual: perder un aviso es peor que duplicarlo.
  let anterior: string | null = null
  try {
    const filas = await prisma.$queryRaw<Array<{ detalle: string | null }>>(Prisma.sql`
      SELECT detalle FROM agente_latidos WHERE agente = ${AGENTE}`)
    anterior = filas[0]?.detalle ?? null
  } catch { anterior = null }

  const actual = firma(salud.estado, salud.recientes, salud.huerfanas)
  const cambio = anterior === null || !anterior.startsWith(actual)
  // El detalle guarda la firma delante para poder compararla mañana.
  const detalleGuardado = `${actual} · ${detalle}`

  if (salud.estado === 'sin_datos') {
    await registrarLatido(AGENTE, false, detalleGuardado)
    if (cambio) {
      await tgAviso('correduria.ingesta',
        '🛡️ <b>Ingesta de CIMA</b>\nNo he podido comprobar si están entrando los datos de las compañías. ' +
        'Esto NO significa que vayan bien: significa que hoy no se ha podido mirar.' +
        (respuesta.estado === 'error' ? `\nMotivo: <code>${respuesta.motivo}</code>` : ''),
      ).catch(() => {})
    }
    return NextResponse.json({ ok: false, estado: salud.estado, detalle })
  }

  if (salud.estado === 'degradada' && cambio) {
    const prima = salud.primaPerdida !== null && salud.primaPerdida > 0
      ? `\n💶 Prima en los recibos sin guardar: <b>${eur(salud.primaPerdida)}</b>`
      : ''
    const entidades = salud.porEntidad.length
      ? `\nPor compañía: ${salud.porEntidad.map(e => `${e.entidad} (${e.n})`).join(' · ')}`
      : ''
    await tgAviso('correduria.ingesta',
      '🛡️ <b>Se están perdiendo datos de CIMA</b>\n' +
      salud.motivos.map(m => `• ${m}`).join('\n') +
      prima + entidades +
      '\n\nUn recibo o un siniestro que no entra no aparece en ninguna pantalla, ' +
      'y su comisión tampoco.',
    ).catch(() => {})
  }

  await registrarLatido(AGENTE, true, detalleGuardado)
  return NextResponse.json({
    ok: true,
    estado: salud.estado,
    total: salud.total,
    recientes: salud.recientes,
    huerfanas: salud.huerfanas,
    avisado: cambio && salud.estado === 'degradada',
    detalle,
  })
}
