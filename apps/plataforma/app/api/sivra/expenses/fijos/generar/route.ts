import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { generarGastosFijos } from '@/lib/sivra/gastos-fijos'
import { pisosCerrados } from '@/lib/cierre-mes-db'
import { unidadesDeGasto, lecturaCerradosFallidaBloquea, hoyMadrid } from '@/lib/cierre-mes'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  // Allow cron (CRON_SECRET Bearer) or logged-in session
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isCron) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }

  const sp = req.nextUrl.searchParams
  const now = new Date()
  const year  = parseInt(sp.get('year')  || '') || now.getFullYear()
  const month = parseInt(sp.get('month') || '') || now.getMonth() + 1
  const commit = sp.get('dryRun') !== '1'

  // Mes CERRADO de un piso (`cierres_mes`): sus fijos no se generan (se listan en `bloqueados`).
  let cerrados: Set<string>
  const mes = `${year}-${String(month).padStart(2, '0')}`
  try {
    cerrados = await pisosCerrados(mes)
  } catch {
    // Mes actual o futuro: no puede estar cerrado → se sigue sin bloqueados. Pasado: no se adivina.
    if (lecturaCerradosFallidaBloquea(mes, hoyMadrid())) {
      return NextResponse.json({ error: 'No se pudo comprobar si el mes está cerrado' }, { status: 503 })
    }
    cerrados = new Set<string>()
  }
  const bloqueado = (propiedad: string | null) => unidadesDeGasto(propiedad).some(u => cerrados.has(u))

  try {
    const res = await generarGastosFijos(year, month, { commit, bloqueado })
    return NextResponse.json({ ok: true, dryRun: !commit, ...res })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
