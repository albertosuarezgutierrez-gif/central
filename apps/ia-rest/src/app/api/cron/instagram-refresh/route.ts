export const maxDuration = 30
export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { renovarToken } from '@/lib/instagram'
import { tgAlert } from '@/lib/telegram'

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const nuevoToken = await renovarToken()

    const VERCEL_TOKEN = process.env.VERCEL_TOKEN || ''
    const VERCEL_TEAM = process.env.VERCEL_TEAM_ID || ''
    const VERCEL_PROJECT = process.env.VERCEL_PROJECT_ID || ''
    if (!VERCEL_TOKEN || !VERCEL_TEAM || !VERCEL_PROJECT) {
      await tgAlert('⚠️ Token Instagram renovado pero faltan VERCEL_TOKEN/TEAM/PROJECT — no se pudo persistir', 'aviso')
      return NextResponse.json({ ok: true, persistido: false })
    }

    const listRes = await fetch(`https://api.vercel.com/v10/projects/${VERCEL_PROJECT}/env?teamId=${VERCEL_TEAM}`, { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } })
    const listData = await listRes.json() as { envs?: Array<{ key: string; id: string }> }
    const envVar = listData.envs?.find((e) => e.key === 'INSTAGRAM_ACCESS_TOKEN')
    if (!envVar) {
      await tgAlert('⚠️ Token Instagram renovado pero no existe la env INSTAGRAM_ACCESS_TOKEN en Vercel — no persistido', 'aviso')
      return NextResponse.json({ ok: true, persistido: false })
    }

    const patchRes = await fetch(`https://api.vercel.com/v10/projects/${VERCEL_PROJECT}/env/${envVar.id}?teamId=${VERCEL_TEAM}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: nuevoToken }),
    })
    if (!patchRes.ok) {
      const txt = await patchRes.text()
      throw new Error(`PATCH env Vercel falló (HTTP ${patchRes.status}): ${txt.slice(0, 200)}`)
    }

    await tgAlert('🔄 Token Instagram renovado automáticamente ✅', 'info')
    return NextResponse.json({ ok: true, persistido: true })
  } catch (err: any) {
    await tgAlert(`❌ Error renovando token Instagram: ${err.message}`, 'critico')
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
