import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { tgSend } from '@central/core-telegram'
import { eur } from '@/lib/dinero'
import { evaluarWatchdog, seEsperaRefresco } from '@/lib/trading/watchdog'

// 🐕 Perro guardián de la pasada nocturna de trading (mar-sáb 06:30 UTC ≈ 08:30 CEST).
// Comprueba que la rutina `trading-analista` dejó "anoche" sus TRES huellas:
//   1) el NAV de IBKR en `broker_saldos` (la lectura del bróker),
//   2) las tesis en `trading_tesis` (la parte de análisis: /analizar), y
//   3) el latido `trading_puntuar` en `agente_latidos` (el CIERRE: /puntuar).
// Vigilar solo el NAV dejaba un hueco: si IBKR da el saldo pero /analizar peta, el NAV se
// refrescaría y el watchdog callaría, tapando el fallo del análisis. Ahora avisa si falta cualquiera.
// El 3er tramo cierra el último hueco (06/08/2026): la pasada dejó NAV y 64 tesis pero NUNCA llamó a
// /puntuar, así que ni los stops ni el walk-forward se actualizaron y el watchdog lo habría dado por
// bueno. `/puntuar` no escribe nada cuando no hay tesis vencidas ni stops, por eso su huella no puede
// ser una tabla de negocio: es un latido explícito (misma lección que `facturas-scan`, 31/07/2026).
// Si no —rutina borrada/pausada, IBKR caído, token 401, egress 403— avisa por Telegram.
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

  // 1) NAV de IBKR (lectura del bróker)
  const fila = await prisma.brokerSaldo.findFirst({
    where: { broker: 'Interactive Brokers' },
    orderBy: { actualizadoEn: 'desc' },
  })
  const evalNav = evaluarWatchdog({ ahora, ultimoRefresco: fila?.actualizadoEn ?? null })

  // 2) Tesis (parte de análisis) — la pasada escribe filas en `trading_tesis` cada noche
  const tesisRows = await prisma.$queryRaw<Array<{ ultimo: Date | null }>>(
    Prisma.sql`SELECT max(created_at) AS ultimo FROM trading_tesis`,
  )
  const evalTesis = evaluarWatchdog({
    ahora, ultimoRefresco: tesisRows[0]?.ultimo ?? null,
    huella: 'ninguna tesis (trading_tesis vacía)',
  })

  // 3) Cierre de la pasada (/puntuar): stops paper + walk-forward. Se mide sobre `ultimo_ok_at`, la
  // última pasada BUENA — si el endpoint revienta a media faena no deja huella y el reloj sigue.
  const puntuarRows = await prisma.$queryRaw<Array<{ ultimo: Date | null }>>(
    Prisma.sql`SELECT ultimo_ok_at AS ultimo FROM agente_latidos WHERE agente = 'trading_puntuar'`,
  )
  const evalPuntuar = evaluarWatchdog({
    ahora, ultimoRefresco: puntuarRows[0]?.ultimo ?? null,
    huella: 'ni una sola pasada buena de /puntuar (agente_latidos.trading_puntuar)',
  })

  const fallos: string[] = []
  if (evalNav.alerta) fallos.push(`• NAV/saldo IBKR: ${evalNav.motivo}`)
  if (evalTesis.alerta) fallos.push(`• Análisis/tesis: ${evalTesis.motivo}`)
  if (evalPuntuar.alerta) fallos.push(`• Cierre /puntuar (stops + walk-forward): ${evalPuntuar.motivo}`)

  if (fallos.length > 0) {
    const detalle = fila
      ? `Último NAV conocido: ${eur(Number(fila.saldo))} (${fila.actualizadoEn.toISOString().slice(0, 16).replace('T', ' ')} UTC).`
      : 'No hay ningún saldo de IBKR registrado todavía.'
    const msg =
      `🐕⚠️ <b>Pasada nocturna de trading incompleta</b>\n\n` +
      `${fallos.join('\n')}\n${detalle}\n\n` +
      `Revisa la rutina <b>trading-analista</b> en Claude Code → Rutinas: ¿sigue activa y con el ` +
      `conector IBKR encendido? Causas típicas: rutina borrada/pausada, IBKR caído, o ` +
      `<code>ALERTA_TOKEN</code> desincronizado (401) sin redeploy de plataforma.`
    await tgSend(msg, { html: true })
  }

  return NextResponse.json({
    ok: true,
    alerta: fallos.length > 0,
    nav: { alerta: evalNav.alerta, motivo: evalNav.motivo, horas: evalNav.horas },
    tesis: { alerta: evalTesis.alerta, motivo: evalTesis.motivo, horas: evalTesis.horas },
    puntuar: { alerta: evalPuntuar.alerta, motivo: evalPuntuar.motivo, horas: evalPuntuar.horas },
    ultimoNav: fila?.actualizadoEn?.toISOString() ?? null,
    ultimaTesis: tesisRows[0]?.ultimo?.toISOString() ?? null,
    ultimoPuntuar: puntuarRows[0]?.ultimo?.toISOString() ?? null,
  })
}

export { handler as GET, handler as POST }
