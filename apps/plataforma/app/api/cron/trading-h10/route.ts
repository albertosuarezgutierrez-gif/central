import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { tgAviso } from '@/lib/telegram'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { decidir, parteH10, BATACAZO, type VeredictoVariante } from '@/lib/trading/h10'
import { evaluarTodas, parteHipotesis, detalleHipotesis, type Hipotesis } from '@/lib/trading/hipotesis'

// 🔬 H10 — evaluador SEMANAL de las reglas de salida (pre-registro, firmado 28/08/2026).
// Lee el corpus del retrovisor (`trading_backtest`, que rellena el cron `trading-backtest`),
// aplica el criterio FIRMADO —que vive en `lib/trading/h10.ts`, no aquí— y avisa por Telegram.
//
// 🚨 Este cron NO cablea nada: si una variante cumple, lo DICE y el cambio de política entra por PR.
// La regla meta del pre-registro es explícita — «los agentes tienen prohibido cambiar el modelo por
// su cuenta». Aquí solo se mide y se transporta el veredicto.
export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Las cuatro variantes de H10 + las tres de H9 (se siguen midiendo: el corpus crece y una conclusión
// vieja sobre menos muestra no es una conclusión permanente).
const VARIANTES = [
  'salidaTrail25', 'salidaCoste10', 'salidaSma50', 'salidaSma200',
  'salidaStop10', 'salidaStop20', 'salidaTrail15',
] as const

async function handler(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // 🚨 Se agrega EN SQL a propósito. Traerse las observaciones sueltas serían ~1,3 M de filas
    // (183.093 snapshots × 7 variantes) dentro de una función serverless. La mediana de Postgres
    // (`percentile_cont`) interpola igual que la del módulo puro, así que el criterio no cambia.
    // La lista de variantes es una CONSTANTE del código (no entra nada del exterior), pero se
    // valida igualmente antes de interpolarla: una lista literal en SQL sin guarda es la puerta por
    // la que un día entra algo que no es una constante.
    if (VARIANTES.some(v => !/^[a-zA-Z0-9_]+$/.test(v))) throw new Error('variante con nombre no válido')
    const lista = Prisma.raw(VARIANTES.map(v => `('${v}')`).join(','))
    const agregados = await prisma.$queryRaw<Array<{
      variante: string; n: bigint
      mediana_tiempo: number; mediana_variante: number
      bat_tiempo: number; bat_variante: number
    }>>`
      WITH obs AS (
        SELECT k.variante,
               (v.value->>'ret91')::float8      AS tiempo,
               (v.value->>k.variante)::float8   AS valor
        FROM trading_backtest b,
             LATERAL jsonb_each(b.datos->'porFecha') v,
             (VALUES ${lista}) AS k(variante)
        WHERE b.error IS NULL
          AND v.value->>'ret91' IS NOT NULL
          AND v.value->>k.variante IS NOT NULL
      )
      SELECT variante, COUNT(*) AS n,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY tiempo) AS mediana_tiempo,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY valor)  AS mediana_variante,
             (COUNT(*) FILTER (WHERE tiempo <= ${BATACAZO}))::float8 / COUNT(*) AS bat_tiempo,
             (COUNT(*) FILTER (WHERE valor  <= ${BATACAZO}))::float8 / COUNT(*) AS bat_variante
      FROM obs GROUP BY variante
    `
    const porVariante = new Map(agregados.map(a => [a.variante, a]))
    const veredictos: VeredictoVariante[] = VARIANTES.map(v => {
      const a = porVariante.get(v)
      // Sin fila = la variante todavía no se ha recolectado en ningún snapshot. n=0 → `sin_muestra`,
      // que es «no se puede saber», nunca «no sirve».
      return decidir(a
        ? { variante: v, n: Number(a.n),
            medianaTiempo: a.mediana_tiempo, medianaVariante: a.mediana_variante,
            batacazosTiempo: a.bat_tiempo, batacazosVariante: a.bat_variante }
        : { variante: v, n: 0, medianaTiempo: NaN, medianaVariante: NaN, batacazosTiempo: NaN, batacazosVariante: NaN })
    })

    const parte = parteH10(veredictos)
    const cableables = veredictos.filter(v => v.veredicto.startsWith('cablear'))
    // Telegram SOLO si alguna variante pasa a CUMPLIR el criterio: H10 se cerró el 31/08/2026 (PR,
    // ninguna cumplía) y re-avisar ese cierre cada lunes sería ruido — la lección del aviso ℹ️ de
    // Kutxabank. Las variantes se siguen midiendo (el corpus crece): si con datos nuevos alguna
    // cruzara el umbral firmado, ESO sí es noticia (re-abre el debate) y se canta.
    if (parte && cableables.length) await tgAviso('trading.h10', parte).catch(() => {})

    // ── VIGÍA DE LAS HIPÓTESIS ABIERTAS (28/08/2026).
    //
    // H10 tenía evaluador; las demás decían «se evalúa cuando la tabla llegue a X» y ese «cuando» no lo
    // miraba nadie — dependía de acordarse, en un contenedor que se borra al acabar la sesión. Aquí solo
    // se comprueba si YA hay muestra para resolverlas: el veredicto sigue siendo un PR con su criterio
    // firmado delante, y este cron NO cablea nada.
    //
    // 📭 Lista VACÍA desde el 31/08/2026: H11…H15 se resolvieron por PR (ver «✅ RESOLUCIÓN de
    // H11…H15» en docs/TRADING-HIPOTESIS-PREREGISTRO.md). La tubería se queda montada a propósito —
    // al firmar la próxima hipótesis, su entrada va aquí con su consulta de muestra en su propio
    // try/catch (`hay: null` = «no se pudo mirar», nunca «todavía no hay muestra»).
    const hipotesis: Hipotesis[] = []
    const vs = evaluarTodas(hipotesis)
    const parteHip = parteHipotesis(vs)
    if (parteHip) await tgAviso('trading.h10', parteHip).catch(() => {})

    const detalleHip = detalleHipotesis(vs)
    const detalle = veredictos
      .map(v => `${v.variante}:${v.veredicto}(n=${v.n})`).join(' · ') + (detalleHip ? ` · ${detalleHip}` : '')
    await registrarLatido('trading_h10', true, detalle).catch(() => {})
    return NextResponse.json({ ok: true, veredictos, hipotesis: vs, avisado: Boolean(parte && cableables.length) || Boolean(parteHip) })
  } catch (e) {
    // Un evaluador que revienta en silencio deja la hipótesis colgada para siempre: se canta.
    const msg = e instanceof Error ? e.message : 'error'
    await registrarLatido('trading_h10', false, msg.slice(0, 200)).catch(() => {})
    await tgAviso('trading.h10', `🔬 H10 (salidas): el evaluador falló — ${msg.slice(0, 200)}`).catch(() => {})
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export { handler as GET, handler as POST }
