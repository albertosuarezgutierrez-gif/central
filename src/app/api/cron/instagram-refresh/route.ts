export const maxDuration = 30
export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { renovarToken } from '@/lib/instagram'
import { tgAlert } from '@/lib/telegram'
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const nuevoToken = await renovarToken()
    const VERCEL_TOKEN = process.env.VERCEL_TOKEN||''
    const VERCEL_TEAM = process.env.VERCEL_TEAM_ID||''
    const VERCEL_PROJECT = process.env.VERCEL_PROJECT_ID||''
    if (VERCEL_TOKEN && VERCEL_TEAM && VERCEL_PROJECT) {
      const listRes = await fetch(`https://api.vercel.com/v10/projects/${VERCEL_PROJECT}/env?teamId=${VERCEL_TEAM}`, { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } })
      const listData = await listRes.json() as { envs?: Array<{ key: string; id: string }> }
      const envVar = listData.envs?.find((e) => e.key === 'INSTAGRAM_ACCESS_TOKEN')
      if (envVar) {
        await fetch(`https://api.vercel.com/v10/projects/${VERCEL_PROJECT}/env/${envVar.id}?teamId=${VERCEL_TEAM}`, {
          method: 'PATCH', headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: nuevoToken }),
        })
        await tgAlert('🔄 Token Instagram renovado automáticamente ✅', 'info')
      }
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    await tgAlert(`❌ Error renovando token Instagram: ${err.message}`, 'critico')
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
