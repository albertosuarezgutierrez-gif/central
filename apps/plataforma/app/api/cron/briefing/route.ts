// /api/cron/briefing — Briefing semanal consolidado por cuenta.
// Para cada cuenta: agrega ingresos/gastos/resultado YTD de TODOS sus negocios
// (ialimp+sivra por BD compartida, ia-rest por puerto HTTP — vía getResumenNegocio)
// y envía un email al dueño (Resend, vía enviarAvisoEmail). Auth: Bearer CRON_SECRET
// (o ?secret= para disparo manual). Degrada limpio sin RESEND_API_KEY.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getResumenNegocio } from '@/lib/financiero'
import { enviarAvisoEmail } from '@/lib/notificaciones'
import { agregarBriefing, formatBriefingTexto, type NegocioResumen } from '@/lib/briefing'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const isCron = !!secret && auth === `Bearer ${secret}`
  const isManual = !!secret && req.nextUrl.searchParams.get('secret') === secret
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const anio = new Date().getFullYear()
  const cuentas = await prisma.cuenta.findMany({
    include: { sociedades: { include: { negocios: true } } },
  })

  let enviados = 0
  for (const cuenta of cuentas) {
    const negocios = cuenta.sociedades.flatMap(s => s.negocios)
    if (negocios.length === 0) continue

    const items: NegocioResumen[] = await Promise.all(
      negocios.map(async (n): Promise<NegocioResumen> => {
        const r = await getResumenNegocio(n.app, n.refExt, anio)
        return {
          nombre: n.nombre,
          sector: n.sector,
          ingresosYtd: r.ingresosYtd,
          gastosYtd: r.gastosYtd,
          resultadoYtd: r.resultadoYtd,
          disponible: r.disponible,
          nota: r.nota,
        }
      }),
    )

    const totales = agregarBriefing(items)
    const { asunto, cuerpo } = formatBriefingTexto(cuenta.nombre, items, totales, anio)
    await enviarAvisoEmail([cuenta.email], asunto, cuerpo)
    enviados += 1
  }

  return NextResponse.json({ ok: true, cuentas: cuentas.length, enviados, anio })
}
