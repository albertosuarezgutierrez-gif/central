import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { tgAviso, tgAvisoBotones } from '@/lib/telegram/avisos'
import { calcularCierre, cuentaDeLosPisos, estadosCierre, persistirCierre } from '@/lib/cierre-mes-db'
import {
  callbackCerrar, faseDelDia, formatearResumenCierre, hoyMadrid, mesACerrar, ofrecerCierre, type Fase,
} from '@/lib/cierre-mes'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// 📒 Cierre contable MENSUAL por piso (lib/cierre-mes.ts). Cron días 5 (pre-cierre) y 15 (cierre) del mes
// ANTERIOR (lib/cron-dispatch.ts). Calcula los checks por unidad, los guarda en `cierres_mes` y manda UN
// Telegram a Alberto con el resumen; el día 15, si todo cuadra, con botón ✅ Cerrar mes (`cmes_cerrar:<mes>`).
// Nada sale a terceros.
//
// Disparo manual: ?mes=AAAA-MM&fase=pre|cierre&dryRun=1 (dryRun = ni guarda ni envía; devuelve el texto).
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const hoy = hoyMadrid()
  const mesParam = sp.get('mes')
  const mes = mesParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesParam) ? mesParam : mesACerrar(hoy)
  const faseParam = sp.get('fase')
  const fase: Fase = faseParam === 'pre' || faseParam === 'cierre' ? faseParam : faseDelDia(Number(hoy.slice(8, 10)))
  const dryRun = sp.get('dryRun') === '1'

  const cuentaId = await cuentaDeLosPisos().catch(() => null)
  if (!cuentaId) {
    // Sin cuenta inequívoca no se mezclan datos: se dice y se para.
    return NextResponse.json({ ok: false, error: 'No se pudo determinar una única cuenta dueña de los pisos' }, { status: 500 })
  }

  const resultados = await calcularCierre(cuentaId, mes, hoy)
  if (!dryRun) await persistirCierre(cuentaId, mes, resultados)
  const estados = dryRun ? {} : await estadosCierre(cuentaId, mes).catch(() => ({} as Record<string, string>))
  const texto = formatearResumenCierre({ mes, fase, resultados, estados })
  const boton = ofrecerCierre(fase, resultados.map(r => ({ veredicto: r.veredicto, estado: estados[r.unidad] ?? null })))

  if (!dryRun) {
    if (boton) await tgAvisoBotones('finanzas.cierre-mes', texto, [[{ texto: '✅ Cerrar mes', callback: callbackCerrar(mes) }]])
    else await tgAviso('finanzas.cierre-mes', texto)
  }

  return NextResponse.json({
    ok: true, mes, fase, hoy, dryRun, boton,
    unidades: resultados.map(r => ({ unidad: r.unidad, veredicto: r.veredicto, estado: estados[r.unidad] ?? null })),
    ...(dryRun ? { texto } : {}),
  })
}

export { GET as POST }
