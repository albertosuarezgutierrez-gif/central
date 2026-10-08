// /api/cron/banca-alertas — Alerta de tesorería por cuenta. Si el saldo PROYECTADO
// a 30 días (saldo actual ± recurrentes detectados) baja de un umbral, avisa al dueño
// por email. Auth: Bearer CRON_SECRET (o ?secret= para disparo manual). Degrada limpio
// sin RESEND_API_KEY. Mismo patrón que /api/cron/briefing.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getTesoreria } from '@/lib/tesoreria'
import { fmtEur } from '@/lib/banca'
import { enviarAvisoEmail } from '@/lib/notificaciones'
import { Prisma } from '@prisma/client'
import { tgAviso } from '@/lib/telegram/avisos'
import { escapeHtml } from '@/lib/telegram'
import { frescuraCuentas, textoFrescura, picosGasto, fusionarPicos, textoPicos } from '@/lib/banca-vigilancia'
import { cuentasConUltimoMovimiento, cargosMovimientos, cargosGastos } from '@/lib/banca-vigilancia-datos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UMBRAL = Number(process.env.BANCA_ALERTA_UMBRAL ?? 0)   // avisa si proyectado < umbral

// Anti-spam: como mucho 1 aviso de cada tipo cada ~día (bitácora `telegram_avisos_log`, mismo
// patrón que canario-lead). Best-effort: si la consulta falla se avisa igual (mejor duplicado que silencio).
async function avisadoHacePoco(id: string): Promise<boolean> {
  try {
    const f = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS n FROM telegram_avisos_log
      WHERE aviso_id = ${id} AND estado = 'enviado' AND enviado_at > now() - interval '20 hours'`)
    return Number(f[0]?.n ?? 0) > 0
  } catch { return false }
}

const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())

/** Avisos Telegram de banca (frescura por cuenta + picos de gasto). Nunca rompe el cron. */
async function avisosTelegramBanca(): Promise<{ frescura: boolean; picos: boolean }> {
  const res = { frescura: false, picos: false }
  const hoy = hoyMadrid()
  try {
    const texto = textoFrescura(frescuraCuentas(await cuentasConUltimoMovimiento(), hoy), escapeHtml)
    if (texto && !(await avisadoHacePoco('finanzas.banca-frescura'))) {
      await tgAviso('finanzas.banca-frescura', texto, { html: true })
      res.frescura = true
    }
  } catch (e) { console.error('[banca-alertas] frescura:', e) }
  try {
    const [mov, gas] = await Promise.all([cargosMovimientos(), cargosGastos().catch(() => [])])
    const texto = textoPicos(fusionarPicos(picosGasto(mov, hoy), picosGasto(gas, hoy)), escapeHtml)
    if (texto && !(await avisadoHacePoco('finanzas.gasto-pico'))) {
      await tgAviso('finanzas.gasto-pico', texto, { html: true })
      res.picos = true
    }
  } catch (e) { console.error('[banca-alertas] picos:', e) }
  return res
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const isCron = !!secret && auth === `Bearer ${secret}`
  const isManual = !!secret && req.nextUrl.searchParams.get('secret') === secret
  if (!isCron && !isManual) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cuentas = await prisma.cuenta.findMany({ select: { id: true, nombre: true, email: true } })

  let avisados = 0
  for (const cuenta of cuentas) {
    const tes = await getTesoreria(cuenta.id).catch(() => null)
    if (!tes || tes.recurrentes.length === 0) continue
    const p30 = tes.proyecciones.find(p => p.dias === 30)
    if (!p30 || p30.proyectado >= UMBRAL) continue

    const asunto = `⚠️ Aviso de tesorería — ${cuenta.nombre}`
    const cuerpo = [
      `Hola ${cuenta.nombre}, atención a tu tesorería consolidada:`,
      '',
      `Saldo actual del grupo:   ${fmtEur(tes.saldoActual)}`,
      `Proyección a 30 días:     ${fmtEur(p30.proyectado)}  (entran ${fmtEur(p30.entradas)}, salen ${fmtEur(p30.salidas)})`,
      '',
      `Según tus movimientos recurrentes, el saldo proyectado baja de ${fmtEur(UMBRAL)}.`,
      // Sin esta línea, un saldo al que le faltan cuentas se lee como cifra
      // firme y puede disparar una alarma de tesorería que no existe.
      ...(tes.cuentasSinSaldo > 0
        ? [
            '',
            `⚠️ OJO: ${tes.cuentasSinSaldo} cuenta(s) no han devuelto saldo, así que la cifra de arriba es un MÍNIMO`,
            '   y esta alarma puede ser falsa. Revisa la sincronización bancaria antes de actuar.',
          ]
        : []),
    ].join('\n')
    await enviarAvisoEmail([cuenta.email], asunto, cuerpo)
    avisados += 1
  }

  const telegram = await avisosTelegramBanca()
  return NextResponse.json({ ok: true, cuentas: cuentas.length, avisados, telegram })
}
