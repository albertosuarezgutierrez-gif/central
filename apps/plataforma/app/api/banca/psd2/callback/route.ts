import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { crearSesion } from '@/lib/enablebanking'
import { sincronizarSesion } from '@/lib/psd2'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// GET /api/banca/psd2/callback?code=... — el banco redirige aquí tras el consentimiento.
// La petición lleva la cookie de sesión, así que sabemos la cuenta. Canjeamos el `code`
// por una sesión de Enable Banking, lo asociamos a la última conexión pendiente del dueño,
// sincronizamos y volvemos a /banca.
export async function GET(req: NextRequest) {
  const session = await getSession()
  const origin = req.nextUrl.origin
  // Los console.error de esta ruta son la ÚNICA traza del canje: el 17/08/2026 dos re-vínculos
  // de Kutxabank fallaron y no quedó NADA en los logs (los catch tragaban el motivo) — la
  // conexión quedaba 'pendiente' para siempre y el porqué era inaveriguable a posteriori.
  if (!session) {
    console.error('[psd2-callback] sin sesión de plataforma — redirect a /login (cookie ausente en el retorno del banco)')
    return NextResponse.redirect(`${origin}/login`)
  }

  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    const params = Object.fromEntries(req.nextUrl.searchParams)
    console.error('[psd2-callback] retorno sin ?code — el banco canceló o denegó:', JSON.stringify(params).slice(0, 300))
    return NextResponse.redirect(`${origin}/banca?psd2=cancel`)
  }

  try {
    const ses = await crearSesion(code)
    const pend = await prisma.$queryRaw<Array<{ id: string; sociedad_id: string }>>`
      SELECT id, sociedad_id FROM conexiones_banco
      WHERE cuenta_id = ${session.id}::uuid AND estado = 'pendiente'
      ORDER BY created_at DESC LIMIT 1
    `
    const c = pend[0]
    if (!c) console.error('[psd2-callback] sesión EB creada pero SIN conexión pendiente que asociar — cuenta', session.id)
    if (c) {
      // Persistimos el session_id como referencia reutilizable por el re-sync diario.
      await prisma.$executeRaw`UPDATE conexiones_banco SET requisition_id = ${ses.session_id} WHERE id = ${c.id}::uuid`
      // Retira las conexiones ANTERIORES del mismo banco: el banco invalida el consentimiento
      // viejo al autorizar el nuevo (una re-vinculación Kutxabank del 16/08/2026 dejó TRES
      // conexiones 'vinculada' a la vez — el cron machacaba consentimientos muertos y sus
      // avisos tapaban a la única sesión viva). Solo las más antiguas que la recién vinculada:
      // una 'pendiente' más nueva sería otro intento en curso y no se toca.
      await prisma.$executeRaw`
        UPDATE conexiones_banco SET estado = 'sustituida'
        WHERE cuenta_id = ${session.id}::uuid
          AND institution_id = (SELECT institution_id FROM conexiones_banco WHERE id = ${c.id}::uuid)
          AND id <> ${c.id}::uuid
          AND estado IN ('vinculada', 'pendiente', 'error')
          AND created_at < (SELECT created_at FROM conexiones_banco WHERE id = ${c.id}::uuid)
      `
      await sincronizarSesion(session.id, c.sociedad_id, ses.session_id).catch(async (e: unknown) => {
        console.error('[psd2-callback] sync inicial falló:', e)
        await prisma.$executeRaw`UPDATE conexiones_banco SET estado='error' WHERE id=${c.id}::uuid`
      })
    }
    return NextResponse.redirect(`${origin}/banca?psd2=ok`)
  } catch (e) {
    // Aquí cae el canje del code (POST /sessions de Enable Banking). El motivo (HTTP + cuerpo)
    // es el diagnóstico entero — sin este log el fallo es invisible.
    console.error('[psd2-callback] canje del code falló:', e)
    return NextResponse.redirect(`${origin}/banca?psd2=error`)
  }
}
