import { NextResponse } from 'next/server'
import { COOKIE_REF_CAMPANA, DIAS_COOKIE_REF, esRefValido } from '@central/module-seguros'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { registrarVisita } from '@/lib/presentacion-app'

export const runtime = 'nodejs'

/**
 * POST /api/campana/visita `{ r }` — la entrada se abrió con el `?r=` de un correo de campaña. Un POST
 * desde el navegador y no el GET de la página, para que los escáneres de correo que precargan el enlace
 * no cuenten como visitas. Respuesta ÚNICA (`ok`): quien llama no aprende si el ref existía. Si existe,
 * deja una cookie httpOnly con él para que `verificar` atribuya el alta si se registra (aunque sea días
 * después, desde este navegador).
 */
export async function POST(req: Request) {
  if (!rateLimit(`campana-visita:${getIp(req)}`, 20, 15 * 60 * 1000).allowed) return NextResponse.json({ ok: true })
  const cuerpo = (await req.json().catch(() => null)) as { r?: unknown } | null
  const r = cuerpo?.r
  if (!esRefValido(r)) return NextResponse.json({ ok: true })
  const res = NextResponse.json({ ok: true })
  if ((await registrarVisita(r)) !== null) {
    res.cookies.set(COOKIE_REF_CAMPANA, r, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * DIAS_COOKIE_REF })
  }
  return res
}
