import { NextRequest, NextResponse } from 'next/server'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { generarRadarSemanal } from '@/lib/trading/radar'

// 🌎 Radar (Fase 1) — disparo MANUAL del ranking, fuera del lunes 09:00 del cron.
// Nació el 24/08/2026 al ampliar el universo 800→1000: sin esto, las ~200 empresas nuevas no
// puntuaban hasta el lunes siguiente aunque sus datos estuvieran completos un martes. Auth
// `isRoutineAuthorized` (ALERTA_TOKEN o CRON_SECRET) — el MISMO nivel de privilegio con el que las
// rutinas ya disparan la pasada paper (/analizar, /puntuar): medición + aviso Telegram, nunca dinero
// ni órdenes. Los tokens de `rutina_tokens` NO entran (solo abren /api/internal/alerta).
// Es seguro repetirlo: el snapshot es un upsert por fecha y el digest de Telegram sale en cada
// ejecución (quien lo dispara asume el mensaje extra). OJO: un snapshot entre semana pasa a ser la
// referencia del «cambios vs anterior» del lunes siguiente — es cosmético, el track record evalúa
// por fecha de snapshot y no se contamina.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const r = await generarRadarSemanal()
  return NextResponse.json(r)
}
