import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { tgAviso } from '@/lib/telegram'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { leerCreditosOpenRouter } from '@/lib/ia-creditos'
import { previsionSaldo, avisosTopeMensual, mensajeAviso, detalleLatido, type FotoSaldo } from '@/lib/ia-saldo'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// 💳 Control diario del gasto de IA (pieza 1-6 de ASegura OS). Job en lib/cron-dispatch.ts.
// 1) Foto del saldo de OpenRouter en `ia_saldo_diario` → gasto medio de 7 días y días de saldo.
// 2) Gasto del mes por app contra `ia_presupuestos.limite_mensual_eur` (aviso al 80 %; el bloqueo
//    al 100 % lo hace la pasarela en cada llamada).
// 3) Cuánto del gasto real de OpenRouter NO pasó por la pasarela (va al detalle del latido).
// Un solo Telegram por pasada y solo si hay algo que hacer.
async function handler(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await registrarLatido('ia_saldo', false, 'pasada en curso')
  try {
    const { creditos, motivo } = await leerCreditosOpenRouter()
    if (!creditos) {
      // Sin key no hay gasto de pago que vigilar: no es una avería. Cualquier otro motivo sí.
      const sinKey = motivo === 'sin OPENROUTER_API_KEY'
      await registrarLatido('ia_saldo', sinKey, `no se pudo leer el saldo: ${motivo}`)
      return NextResponse.json({ ok: sinKey, motivo }, { status: sinKey ? 200 : 502 })
    }

    // Foto anterior (de otro día): el tramo entre ella y ahora es el que se compara con ai_usos.
    const previa = await prisma.$queryRaw<Array<{ usado: number; leido_at: Date }>>`
      SELECT usado_usd::float AS usado, leido_at FROM ia_saldo_diario
      WHERE fecha < current_date ORDER BY fecha DESC LIMIT 1`.then(r => r[0] ?? null)
    // Gasto que la pasarela anotó para OpenRouter en ese mismo tramo. null = no se pudo sumar.
    const registrado = previa
      ? await prisma.$queryRaw<Array<{ c: number | null }>>`
          SELECT COALESCE(sum(coste_eur), 0)::float AS c FROM ai_usos
          WHERE creada_at >= ${previa.leido_at} AND proveedor = 'openrouter'`
          .then(r => Number(r[0]?.c ?? 0)).catch(() => null)
      : null

    await prisma.$executeRaw`
      INSERT INTO ia_saldo_diario (fecha, total_usd, usado_usd, restante_usd, gasto_registrado_eur)
      VALUES (current_date, ${creditos.total}, ${creditos.usado}, ${creditos.restante}, ${registrado})
      ON CONFLICT (fecha) DO UPDATE SET total_usd = EXCLUDED.total_usd, usado_usd = EXCLUDED.usado_usd,
        restante_usd = EXCLUDED.restante_usd, gasto_registrado_eur = EXCLUDED.gasto_registrado_eur, leido_at = now()`

    const filas = await prisma.$queryRaw<Array<{ fecha: string; usado: number }>>`
      SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, usado_usd::float AS usado
      FROM ia_saldo_diario WHERE fecha >= current_date - 8 ORDER BY fecha`
    const fotos: FotoSaldo[] = filas.map(f => ({ fecha: f.fecha, usadoUsd: f.usado }))
    const prevision = previsionSaldo(fotos, creditos.restante)

    const usdPorEur = 1 / Number(process.env.AI_USD_EUR ?? 0.9)
    const gastoRealUsd = previa ? +(creditos.usado - previa.usado).toFixed(4) : null
    const registradoUsd = registrado === null ? null : +(registrado * usdPorEur).toFixed(4)

    const apps = await prisma.$queryRaw<Array<{ app: string; gasto: number; limite: number | null }>>`
      SELECT p.ref AS app, p.limite_mensual_eur::float AS limite,
        COALESCE((SELECT sum(u.coste_eur) FROM ai_usos u
                  WHERE u.app = p.ref AND u.creada_at >= date_trunc('month', now())), 0)::float AS gasto
      FROM ia_presupuestos p WHERE p.ambito = 'app' AND p.limite_mensual_eur > 0`
    const topes = avisosTopeMensual(apps.map(a => ({ app: a.app, gastoEur: a.gasto, limiteEur: a.limite })))

    const umbralUsd = Number(process.env.AI_CREDITOS_UMBRAL ?? 5)
    const aviso = mensajeAviso({ restanteUsd: creditos.restante, umbralUsd, prevision, topes })
    if (aviso) await tgAviso('sistema.ia-creditos', aviso).catch(() => {})

    const detalle = detalleLatido({ restanteUsd: creditos.restante, prevision, gastoRealUsd, registradoUsd })
    await registrarLatido('ia_saldo', true, detalle)
    return NextResponse.json({ ok: true, creditos, prevision, topes, avisado: aviso !== null, detalle })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await registrarLatido('ia_saldo', false, `error: ${msg}`.slice(0, 500))
    console.error('[ia-saldo]', err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export { handler as GET, handler as POST }
