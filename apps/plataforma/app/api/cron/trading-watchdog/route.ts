import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { isCronAuthorized } from '@/lib/cron-auth'
import { tgSend } from '@central/core-telegram'
import { eur } from '@/lib/dinero'
import { evaluarWatchdog, seEsperaRefresco } from '@/lib/trading/watchdog'

// 🐕 Perro guardián de la pasada nocturna de trading (mar-sáb 06:30 UTC ≈ 08:30 CEST).
// Comprueba que la rutina `trading-analista` refrescó el NAV de IBKR "anoche" (broker_saldos).
// Si no —rutina borrada/pausada, IBKR caído, token 401, egress 403— avisa por Telegram.
// Es el vigía que faltaba: sin él, un fallo silencioso solo se nota por el saldo viejo en /banca.
// Auth Bearer CRON_SECRET. Ver lib/trading/watchdog.ts para la lógica pura (testeada).
export const dynamic = 'force-dynamic'
export const maxDuration = 30

async function handler(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ahora = new Date()

  // Dom/lun no se espera pasada la noche anterior (sáb/dom noche no corre) → no alarmar.
  if (!seEsperaRefresco(ahora)) {
    return NextResponse.json({ ok: true, saltado: 'dia_sin_pasada_esperada', dow: ahora.getUTCDay() })
  }

  const fila = await prisma.brokerSaldo.findFirst({
    where: { broker: 'Interactive Brokers' },
    orderBy: { actualizadoEn: 'desc' },
  })

  const evalr = evaluarWatchdog({ ahora, ultimoRefresco: fila?.actualizadoEn ?? null })

  if (evalr.alerta) {
    const detalle = fila
      ? `Último NAV conocido: ${eur(Number(fila.saldo))} (${fila.actualizadoEn.toISOString().slice(0, 16).replace('T', ' ')} UTC).`
      : 'No hay ningún saldo de IBKR registrado todavía.'
    const msg =
      `🐕⚠️ <b>Pasada nocturna de trading NO refrescada</b>\n\n` +
      `${evalr.motivo}.\n${detalle}\n\n` +
      `Revisa la rutina <b>trading-analista</b> en Claude Code → Rutinas: ¿sigue activa y con el ` +
      `conector IBKR encendido? Causas típicas: rutina borrada/pausada, IBKR caído, o ` +
      `<code>ALERTA_TOKEN</code> desincronizado (401) sin redeploy de plataforma.`
    await tgSend(msg, { html: true })
  }

  return NextResponse.json({
    ok: true,
    alerta: evalr.alerta,
    motivo: evalr.motivo,
    horas: evalr.horas,
    ultimoRefresco: fila?.actualizadoEn?.toISOString() ?? null,
  })
}

export { handler as GET, handler as POST }
