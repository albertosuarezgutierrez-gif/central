import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { tgSend } from '@central/core-telegram'
import { eur } from '@/lib/dinero'
import { evaluarWatchdog, seEsperaRefresco, diagnosticarPasada } from '@/lib/trading/watchdog'

// 🐕 Perro guardián de la pasada nocturna de trading (mar-sáb 06:30 UTC ≈ 08:30 CEST).
// Comprueba que la rutina `trading-analista` dejó "anoche" sus TRES huellas:
//   1) el NAV de IBKR en `broker_saldos` (la lectura del bróker),
//   2) el latido `trading_analizar` en `agente_latidos` (la parte de análisis: /analizar — con las
//      tesis de `trading_tesis` como huella de respaldo; ver el porqué en el tramo 2), y
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

  // 2) Análisis (/analizar). La huella BUENA es el latido `trading_analizar`, NO `max(created_at)` de
  // `trading_tesis`: esa tabla es idempotente (único `(simbolo,fecha,estrategia)` + `skipDuplicates`),
  // así que una segunda pasada del mismo día no inserta nada y su reloj se queda clavado en la PRIMERA.
  // Bug real del 07/08/2026: `/analizar` corrió a las 09:34 UTC (repaso manual) y otra vez esa noche;
  // la nocturna fue un no-op en datos y el watchdog avisó de «21 h sin refrescarse» una pasada completa.
  // Se toma el MÁS RECIENTE de ambas huellas (GREATEST ignora los NULL en Postgres): las tesis siguen
  // valiendo como prueba —y cubren el hueco hasta que la primera pasada nueva escriba el latido—, pero
  // ya no son la única. Solo si NINGUNA existe se declara «nunca».
  const analisisRows = await prisma.$queryRaw<Array<{ ultimo: Date | null }>>(
    Prisma.sql`SELECT GREATEST(
      (SELECT max(created_at) FROM trading_tesis),
      (SELECT ultimo_ok_at FROM agente_latidos WHERE agente = 'trading_analizar')
    ) AS ultimo`,
  )
  const evalTesis = evaluarWatchdog({
    ahora, ultimoRefresco: analisisRows[0]?.ultimo ?? null,
    huella: 'ninguna pasada de /analizar (ni tesis en trading_tesis ni latido trading_analizar)',
    etiqueta: 'el análisis de la pasada (/analizar)',
  })

  // 3) Cierre de la pasada (/puntuar): stops paper + walk-forward. Se mide sobre `ultimo_ok_at`, la
  // última pasada BUENA — si el endpoint revienta a media faena no deja huella y el reloj sigue.
  // Se trae también `ultimo_at` (el INTENTO): distingue «no arrancó» de «arrancó y murió», que es
  // lo que separa mirar el trigger/cupo de mirar el log de la sesión.
  const puntuarRows = await prisma.$queryRaw<Array<{ ultimo: Date | null; intento: Date | null }>>(
    Prisma.sql`SELECT ultimo_ok_at AS ultimo, ultimo_at AS intento FROM agente_latidos WHERE agente = 'trading_puntuar'`,
  )
  const evalPuntuar = evaluarWatchdog({
    ahora, ultimoRefresco: puntuarRows[0]?.ultimo ?? null,
    huella: 'ni una sola pasada buena de /puntuar (agente_latidos.trading_puntuar)',
    etiqueta: 'el cierre de la pasada (/puntuar)',
  })

  const fallos: string[] = []
  if (evalNav.alerta) fallos.push(`• NAV/saldo IBKR: ${evalNav.motivo}`)
  if (evalTesis.alerta) fallos.push(`• Análisis/tesis: ${evalTesis.motivo}`)
  if (evalPuntuar.alerta) fallos.push(`• Cierre /puntuar (stops + walk-forward): ${evalPuntuar.motivo}`)

  // Si fallan los TRES tramos, no es que se rompiera un paso: es que la pasada ENTERA no ocurrió, y
  // ahí el aviso viejo mandaba a «revisar la rutina» señalando una causa que no puede distinguir.
  // El 07/08/2026 la causa real fue quedarse sin CUPO de tokens y no aparecía en la lista.
  const pasadaEntera = evalNav.alerta && evalTesis.alerta && evalPuntuar.alerta
  const diag = pasadaEntera
    ? diagnosticarPasada({ ahora, ultimoIntento: puntuarRows[0]?.intento ?? null, ultimoOk: puntuarRows[0]?.ultimo ?? null })
    : null

  if (fallos.length > 0) {
    const detalle = fila
      ? `Último NAV conocido: ${eur(Number(fila.saldo))} (${fila.actualizadoEn.toISOString().slice(0, 16).replace('T', ' ')} UTC).`
      : 'No hay ningún saldo de IBKR registrado todavía.'
    const cierre = diag
      ? `<b>La pasada entera no ocurrió</b> — ${diag.motivo}.\nQué mirar, por orden:\n` +
        diag.candidatas.map((c, i) => `${i + 1}. ${c}`).join('\n') +
        `\n\n⚠️ Ningún tramo se puede recuperar solo: los tres reciben los datos de mercado de la ` +
        `sesión (el NAV solo existe en el MCP de IBKR). El día perdido NO se rellena hacia atrás.`
      : `Revisa la rutina <b>trading-analista</b> en Claude Code → Rutinas: ¿sigue activa y con el ` +
        `conector IBKR encendido? Causas típicas: rutina borrada/pausada, IBKR caído, o ` +
        `<code>ALERTA_TOKEN</code> desincronizado (401) sin redeploy de plataforma.`
    const msg =
      `🐕⚠️ <b>Pasada nocturna de trading incompleta</b>\n\n` +
      `${fallos.join('\n')}\n${detalle}\n\n${cierre}`
    await tgSend(msg, { html: true })
  }

  return NextResponse.json({
    ok: true,
    alerta: fallos.length > 0,
    nav: { alerta: evalNav.alerta, motivo: evalNav.motivo, horas: evalNav.horas },
    tesis: { alerta: evalTesis.alerta, motivo: evalTesis.motivo, horas: evalTesis.horas },
    puntuar: { alerta: evalPuntuar.alerta, motivo: evalPuntuar.motivo, horas: evalPuntuar.horas },
    ultimoNav: fila?.actualizadoEn?.toISOString() ?? null,
    ultimoAnalisis: analisisRows[0]?.ultimo?.toISOString() ?? null,
    ultimoPuntuar: puntuarRows[0]?.ultimo?.toISOString() ?? null,
    diagnostico: diag,
  })
}

export { handler as GET, handler as POST }
