import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { sondearEscritura } from '@/lib/sivra/seo-landing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/sivra/seo-token-check — ¿puede GITHUB_TOKEN commitear la landing de housesevillana?
//
// Existe porque el fallo de este agente es SIEMPRE el mismo y era invisible hasta el último paso:
// la landing se LEE sin permisos (el repo `central` es público), así que un PAT sin
// `contents:write` pasa desapercibido hasta que el PUT devuelve 403 — o el lunes por la mañana,
// cuando el cron ya ha gastado el análisis entero (incidente 17/08/2026).
//
// El sondeo NO escribe nada: ver `sondearEscritura` en lib/sivra/seo-landing.ts.
//
// ⚠️ Comprueba el GITHUB_TOKEN del entorno de PLATAFORMA. El cron semanal corre en el proyecto
// Vercel `sivra`, que tiene su propia copia de la variable (el panel /operador/secretos escribe
// el mismo valor en los dos). Para comprobar ESA, la app sivra expone su propio
// /api/seo-token-check.
export async function GET(req: Request) {
  const cronOk = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!cronOk) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const sondeo = await sondearEscritura()
  return NextResponse.json({ entorno: 'plataforma', ...sondeo })
}
