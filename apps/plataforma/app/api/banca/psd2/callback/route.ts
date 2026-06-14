import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { sincronizarRequisition } from '@/lib/psd2'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/banca/psd2/callback — el banco redirige aquí tras el consentimiento. La
// petición lleva la cookie de sesión, así que sabemos la cuenta. Sincroniza la última
// conexión pendiente del dueño y vuelve a /banca.
export async function GET(req: NextRequest) {
  const session = await getSession()
  const origin = req.nextUrl.origin
  if (!session) return NextResponse.redirect(`${origin}/login`)

  const pend = await prisma.$queryRaw<Array<{ sociedad_id: string; requisition_id: string }>>`
    SELECT sociedad_id, requisition_id FROM conexiones_banco
    WHERE cuenta_id = ${session.id}::uuid AND estado = 'pendiente'
    ORDER BY created_at DESC LIMIT 1
  `
  const c = pend[0]
  if (c) {
    await sincronizarRequisition(session.id, c.sociedad_id, c.requisition_id).catch(async () => {
      await prisma.$executeRaw`UPDATE conexiones_banco SET estado='error' WHERE requisition_id=${c.requisition_id}`
    })
  }
  return NextResponse.redirect(`${origin}/banca?psd2=ok`)
}
