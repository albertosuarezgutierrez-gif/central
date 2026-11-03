import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { tgAviso } from '@/lib/telegram/avisos'
import { cuentaDeLosPisos } from '@/lib/cierre-mes-db'
import { hoyMadrid } from '@/lib/cierre-mes'
import { calcularAlertas, enviosPrevios, registrarEnvio } from '@/lib/fiscal-alertas-db'
import { decidirEnvios, hashTexto } from '@/lib/fiscal-alertas'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// 🧾 Avisos fiscales a Alberto (lib/fiscal-alertas.ts): umbral de 60.000€, cuentas paradas, meses cerrados sin
// factura y recordatorio de diciembre. Lunes + días 5 y 15. Un Telegram por aviso, sin repetir el mismo
// contenido en 7 días (`fiscal_avisos_enviados`). Solo a Alberto. Manual: ?dryRun=1 (ni envía ni registra).
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'
  const hoy = hoyMadrid()
  const anio = Number(hoy.slice(0, 4))

  const cuentaId = await cuentaDeLosPisos().catch(() => null)
  if (!cuentaId) return NextResponse.json({ ok: false, error: 'No se pudo determinar una única cuenta dueña de los pisos' }, { status: 500 })

  let alertas
  try {
    alertas = await calcularAlertas(cuentaId, anio, hoy)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'fallo al calcular' }, { status: 500 })
  }
  const nuevas = decidirEnvios(alertas, await enviosPrevios(cuentaId), new Date())

  if (!dryRun) {
    for (const a of nuevas) {
      const id = await tgAviso('finanzas.fiscal-avisos', a.texto)
      if (id != null) await registrarEnvio(cuentaId, a.clave, hashTexto(a.texto))
    }
  }
  return NextResponse.json({
    ok: true, hoy, dryRun, vigentes: alertas.map(a => a.clave), enviados: nuevas.map(a => a.clave),
    ...(dryRun ? { textos: nuevas.map(a => a.texto) } : {}),
  })
}

export { GET as POST }
