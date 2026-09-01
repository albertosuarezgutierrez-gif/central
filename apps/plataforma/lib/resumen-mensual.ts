import { prisma } from './db'
import { tgAviso } from '@/lib/telegram'
import { getResumenFinanciero } from './finanzas'
import { getPLMensual } from './sivra/pl-mensual'
import { eur } from './dinero'

// 📤 Cierre de mes narrado → Telegram (cron día 1). Por cada cuenta, recompone el resumen del MES
// ANTERIOR (mismas cifras que /banca — nunca inventa) + el P&L por piso, y manda un mensaje con el
// cierre. La narración de 1-2 frases es de la IA GRATIS y DEGRADA (si falla, van solo las cifras).
// Single-tenant en la práctica (la cuenta de Alberto), pero itera cuentas como contable-proactivo.

function mesAnterior(hoy: Date): { year: number; mes: string; desde: string; hasta: string; label: string } {
  const y = hoy.getFullYear(), m = hoy.getMonth() // 0-11
  const prev = new Date(y, m - 1, 1)               // primer día del mes anterior
  const py = prev.getFullYear(), pm = prev.getMonth()
  const mm = String(pm + 1).padStart(2, '0')
  const lastDay = new Date(py, pm + 1, 0).getDate()
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return { year: py, mes: `${py}-${mm}`, desde: `${py}-${mm}-01`, hasta: `${py}-${mm}-${lastDay}`, label: `${MESES[pm]} ${py}` }
}

async function narrar(datos: string): Promise<string> {
  try {
    const { aiComplete } = await import('./ai-client')
    const txt = await aiComplete([
      { role: 'system', content: 'Eres el analista financiero de Alberto (persona física, España). Recibes las CIFRAS ya calculadas del cierre de un mes. Escribe 1-2 frases en español, cercanas y accionables, resumiendo cómo fue el mes. NO inventes ni recalcules cifras. Sin markdown.' },
      { role: 'user', content: datos },
    ], { timeoutMs: 15_000 })
    return (txt || '').trim()
  } catch { return '' }
}

async function resumenDeCuenta(cuentaId: string, per: ReturnType<typeof mesAnterior>): Promise<string | null> {
  const resumen = await getResumenFinanciero(cuentaId, per.year, 0, per.desde, per.hasta).catch(() => null)
  if (!resumen) return null

  const ingresosNeg = resumen.correduria.cobradoNeto + resumen.pisos.total.ingresos
  const gastoNeg = resumen.correduria.gastosDeducibles + resumen.pisos.total.gastos
  const gastoPersonal = resumen.personal.total
  const gastoTotal = gastoNeg + gastoPersonal
  const resultado = ingresosNeg - gastoTotal
  const ant = resumen.anterior
  const deltaGasto = ant && ant.gastos > 0 ? Math.round(((gastoTotal - ant.gastos) / ant.gastos) * 100) : null

  const pl = await getPLMensual(per.mes).catch(() => null)
  const pisosOrden = pl?.pisos.slice().sort((a, b) => b.margen - a.margen) ?? []
  const lider = pisosOrden[0]
  const rezagado = pisosOrden.length > 1 ? pisosOrden[pisosOrden.length - 1] : null

  const narracion = await narrar([
    `Cierre de ${per.label}:`,
    `Ingresos negocio ${eur(ingresosNeg)}, gasto total ${eur(gastoTotal)} (negocio ${eur(gastoNeg)}, personal ${eur(gastoPersonal)}), resultado ${eur(resultado)}.`,
    deltaGasto !== null ? `Gasto vs mismo mes del año anterior: ${deltaGasto >= 0 ? '+' : ''}${deltaGasto}%.` : '',
    lider ? `Piso líder ${lider.nombre} (${lider.margen.toFixed(0)}% margen)${rezagado ? `, arrastra ${rezagado.nombre} (${rezagado.margen.toFixed(0)}%)` : ''}.` : '',
    `Tramo IRPF marginal estimado ${(resumen.fiscal.tramoActual.tipo * 100).toFixed(0)}%.`,
  ].filter(Boolean).join('\n'))

  const lineas = [
    `📤 *Cierre de ${per.label}*`,
    '',
    `💶 Ingresos negocio:  ${eur(ingresosNeg)}`,
    `🧾 Gasto total:       ${eur(gastoTotal)}${deltaGasto !== null ? ` (${deltaGasto >= 0 ? '+' : ''}${deltaGasto}% vs año ant.)` : ''}`,
    `   · negocio ${eur(gastoNeg)} · personal ${eur(gastoPersonal)}`,
    `${resultado >= 0 ? '🟢' : '🔴'} Resultado:         ${eur(resultado)}`,
  ]
  if (lider) {
    lineas.push('', `🏖️ Piso líder: ${lider.nombre} (${lider.margen.toFixed(0)}%)`)
    if (rezagado) lineas.push(`🐢 Arrastra: ${rezagado.nombre} (${rezagado.margen.toFixed(0)}%)`)
  }
  lineas.push('', `🏷️ Tramo IRPF marginal ~${(resumen.fiscal.tramoActual.tipo * 100).toFixed(0)}%`)
  if (narracion) lineas.push('', `🤖 ${narracion}`)

  return lineas.join('\n')
}

export async function enviarResumenMensual(): Promise<{ cuentas: number; enviados: number }> {
  const per = mesAnterior(new Date())
  const cuentas = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM cuentas`.catch(() => [])
  let enviados = 0
  for (const c of cuentas) {
    const msg = await resumenDeCuenta(c.id, per).catch(() => null)
    if (msg) { await tgAviso('finanzas.resumen-mensual', msg).catch(() => {}); enviados++ }
  }
  return { cuentas: cuentas.length, enviados }
}
