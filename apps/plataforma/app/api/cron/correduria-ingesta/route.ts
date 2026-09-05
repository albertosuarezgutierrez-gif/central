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
import { detalleSalud, type SaludIngesta } from '@central/module-seguros'

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
function firma(salud: SaludIngesta): string {
  // 🚨 Las compañías MUDAS van en la firma. Sin ellas, con Mapfre ya callada la
  // firma se queda en `degradada:0:0` para siempre y el día que enmudezca
  // ADEMÁS Allianz no sonaría nada — que es justo el «si empeora, vuelve a
  // sonar» que este dedupe promete. Van ordenadas para que el mismo conjunto
  // produzca siempre la misma cadena.
  const mudas = (salud.silencio ?? [])
    .filter(e => e.veredicto === 'silencio')
    .map(e => e.entidad)
    .sort()
    .join(',')
  // `null` (no comprobado) y `[]` (comprobado, ninguna) no pueden dar la misma
  // firma: si ayer no se pudo mirar y hoy sí, eso es un cambio que hay que ver.
  const silencio = salud.silencio === null ? '?' : mudas || '-'
  return `${salud.estado}:${salud.recientes}:${salud.huerfanas ?? '?'}:${silencio}`
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

  const actual = firma(salud)
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
    // Se reparte por CLAVE DE MEDIADOR, no solo por compañía: Occident manda
    // por tres claves distintas y el atasco puede estar en una sola de ellas.
    // Decir «Occident» mandaría a revisar una cartera entera que va bien.
    const entidades = salud.porClave.length
      ? `\nPor clave de mediador: ${salud.porClave
          .map(e => `${e.entidad}/${e.clave ?? 'sin clave legible'} (${e.n})`)
          .join(' · ')}`
      : ''
    // Una compañía que deja de mandar no se arregla igual que un fichero
    // atascado: aquí no hay nada que reprocesar, hay que llamar a la compañía o
    // mirar el adaptador. Por eso lleva su propio titular y su propio recado.
    const mudas = (salud.silencio ?? []).filter(e => e.veredicto === 'silencio')
    const titular = mudas.length
      ? `🛡️ <b>${mudas.map(m => m.entidad).join(', ')} ha(n) dejado de mandar datos</b>`
      : '🛡️ <b>Se están perdiendo datos de CIMA</b>'
    const recado = mudas.length
      ? '\n\nNo hay nada atascado que reprocesar: sencillamente no llega. ' +
        'Compruébalo en CIMA/Codeoscopic desde fuera y mira si el adaptador sigue vivo.'
      : '\n\nUn recibo o un siniestro que no entra no aparece en ninguna pantalla, ' +
        'y su comisión tampoco.'
    await tgAviso('correduria.ingesta',
      titular + '\n' +
      salud.motivos.map(m => `• ${m}`).join('\n') +
      prima + entidades + recado,
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
