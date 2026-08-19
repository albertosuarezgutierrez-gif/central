import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sondearEscritura } from '@/lib/seo-landing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/seo-token-check — gemelo del de plataforma, pero sobre el GITHUB_TOKEN de ESTA app.
//
// Importa tenerlo aquí y no solo en plataforma: el cron semanal `/api/seo-refresh` corre en el
// proyecto Vercel `sivra`, con su PROPIA copia de la variable. El panel /operador/secretos escribe
// el mismo valor en los dos proyectos y redespliega, pero ese redespliegue es best-effort y el
// Ignored Build Step puede cancelarlo → plataforma en verde y sivra todavía con el token viejo.
// Este endpoint es la única forma de comprobar el token que usará el lunes el cron.
//
// El sondeo NO escribe nada: ver `sondearEscritura` en lib/seo-landing.ts.
export async function GET(req: Request) {
  const cronOk = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!cronOk) {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const sondeo = await sondearEscritura()
  return NextResponse.json({ entorno: 'sivra', ...sondeo })
}
