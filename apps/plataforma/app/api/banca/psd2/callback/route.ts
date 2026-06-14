import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { crearSesion } from '@/lib/enablebanking'
import { sincronizarSesion } from '@/lib/psd2'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/banca/psd2/callback?code=... — el banco redirige aquí tras el consentimiento.
// La petición lleva la cookie de sesión, así que sabemos la cuenta. Canjeamos el `code`
// por una sesión de Enable Banking, lo asociamos a la última conexión pendiente del dueño,
// sincronizamos y volvemos a /banca.
export async function GET(req: NextRequest) {
  const session = await getSession()
  const origin = req.nextUrl.origin
  if (!session) return NextResponse.redirect(`${origin}/login`)

  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(`${origin}/banca?psd2=cancel`)

  try {
    const ses = await crearSesion(code)
    const pend = await prisma.$queryRaw<Array<{ id: string; sociedad_id: string }>>`
      SELECT id, sociedad_id FROM conexiones_banco
      WHERE cuenta_id = ${session.id}::uuid AND estado = 'pendiente'
      ORDER BY created_at DESC LIMIT 1
    `
    const c = pend[0]
    if (c) {
      // Persistimos el session_id como referencia reutilizable por el re-sync diario.
      await prisma.$executeRaw`UPDATE conexiones_banco SET requisition_id = ${ses.session_id} WHERE id = ${c.id}::uuid`
      await sincronizarSesion(session.id, c.sociedad_id, ses.session_id).catch(async () => {
        await prisma.$executeRaw`UPDATE conexiones_banco SET estado='error' WHERE id=${c.id}::uuid`
      })
    }
    return NextResponse.redirect(`${origin}/banca?psd2=ok`)
  } catch {
    return NextResponse.redirect(`${origin}/banca?psd2=error`)
  }
}
