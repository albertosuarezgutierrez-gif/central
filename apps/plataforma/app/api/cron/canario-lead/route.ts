import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { isCronAuthorized } from '@/lib/cron-auth'
import { tgAviso } from '@/lib/telegram/avisos'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { sondearFormularioLead, veredictoCanarioLead, WEB_PUBLICA_URL } from '@/lib/monitoring/canario-lead'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// El id va LITERAL en la llamada a `tgAviso` (abajo): el guardián del catálogo rastrea el
// fuente buscándolo, y escondido tras una constante quedaría catalogado como aviso sin emisor.
const AVISO_ID = 'correduria.canario-lead'

// Una avería del formulario dura hasta que alguien la arregla, y el canario corre cada hora: sin
// esto serían 24 mensajes idénticos al día, que es la forma más eficaz de que se dejen de leer.
const SILENCIO_HORAS = 6

/**
 * ¿Ya se avisó de esto hace poco? Se mira la bitácora de avisos en vez de una variable en
 * memoria porque en serverless cada pasada puede caer en una instancia nueva y el contador en
 * memoria no frenaría nada. Best-effort a propósito: si la consulta falla se avisa igual —
 * más vale un duplicado que un silencio.
 */
async function avisadoHacePoco(): Promise<boolean> {
  try {
    const filas = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS n FROM telegram_avisos_log
      WHERE aviso_id = ${AVISO_ID} AND estado = 'enviado'
        AND enviado_at > now() - (${SILENCIO_HORAS}::int * interval '1 hour')
    `)
    return Number(filas[0]?.n ?? 0) > 0
  } catch {
    return false
  }
}

// GET /api/cron/canario-lead — vigila que el formulario de `grupoasegura.es` sigue entregando.
//
// Lo dispara el manifiesto `lib/cron-dispatch.ts` cada hora. El porqué, la mecánica del ping y
// la razón de que un cuerpo vacío no ensucie nada están en `lib/monitoring/canario-lead.ts`.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sonda = await sondearFormularioLead()
  const veredicto = veredictoCanarioLead(sonda)

  // La huella se deja SIEMPRE, y `ok` solo cuando el canal está confirmado: un 'dudoso' no es una
  // pasada buena. Así, si el canario mismo se queda mudo o lleva días sin veredicto, el vigía de
  // latidos lo ve como «sin señal» en vez de darlo por sano.
  await registrarLatido('canario_lead_web', veredicto.estado === 'ok', veredicto.linea)

  if (veredicto.estado !== 'ok' && !(await avisadoHacePoco())) {
    await tgAviso(
      'correduria.canario-lead',
      [
        '📮 <b>Formulario público de la correduría</b>',
        '',
        veredicto.linea,
        '',
        `Comprobado en <code>${WEB_PUBLICA_URL}/api/lead</code> con un envío vacío (no crea ficha ni lead).`,
        `Siguiente aviso, como pronto, dentro de ${SILENCIO_HORAS} h.`,
      ].join('\n'),
      { html: true },
    )
  }

  return NextResponse.json({ estado: veredicto.estado, linea: veredicto.linea, status: sonda.status })
}
