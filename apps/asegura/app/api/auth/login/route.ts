import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyPassword, createSessionToken, COOKIE_NAME, COOKIE_OPTS } from '@/lib/auth'
import { rateLimit, getIp } from '@/lib/rate-limit'

const Body = z.object({ email: z.string().email(), password: z.string().min(1) })

/**
 * Hash de DESCARTE: un bcrypt válido de cost 12 que no es de nadie.
 *
 * 🚨 Para qué: hasta el 20/09/2026, si el email NO existía esta ruta contestaba
 * sin llegar a `verifyPassword`, y si existía se comía los ~200 ms de bcrypt.
 * Esa diferencia es un ORÁCULO: se enumeran los correos que tienen cuenta en la
 * casa de marcas cronometrando 401s, sin acertar ni una contraseña. Comparando
 * siempre contra algo, los dos caminos cuestan lo mismo.
 *
 * El valor da igual (la comparación falla siempre); lo que importa es que sea
 * un bcrypt bien formado del MISMO coste que los reales, o el trabajo no
 * coincide y el oráculo vuelve.
 */
const HASH_DESCARTE = '$2a$12$Z6c25/8smgcsh2xE88/yxeCfraKJSb8h7Lkg7u0HrzqTVZ4poj3.6'

export async function POST(req: NextRequest) {
  const body = Body.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { email, password } = body.data

  // Doble llave, la misma que `apps/plataforma/app/api/auth/login/route.ts`: por
  // IP (frena un bot torpe) y por email (frena la fuerza bruta dirigida a UNA
  // cuenta desde varias IPs). Best-effort por instancia, ver `lib/rate-limit.ts`.
  //
  // Va ANTES de tocar la base y antes del bcrypt: los dos son caros, y sin tope
  // esta ruta era un ariete gratis contra `public.cuentas`, que es la tabla de
  // TODA la casa de marcas, no solo de la correduría.
  const ip = getIp(req)
  const porIp = rateLimit(`login:ip:${ip}`, 20, 15 * 60 * 1000)
  const porEmail = rateLimit(`login:email:${email.toLowerCase()}`, 5, 15 * 60 * 1000)
  if (!porIp.allowed || !porEmail.allowed) {
    const retryAfter = Math.max(porIp.retryAfter || 0, porEmail.retryAfter || 0)
    return NextResponse.json(
      { error: 'Demasiados intentos. Inténtalo más tarde.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  const cuenta = await prisma.cuenta.findFirst({
    where: { email: { equals: email.toLowerCase(), mode: 'insensitive' } },
    select: { id: true, nombre: true, email: true, passwordHash: true },
  })

  // Se compara SIEMPRE, exista la cuenta o no (ver `HASH_DESCARTE`). El `&&` de
  // antes cortocircuitaba y ahí estaba el oráculo de tiempo.
  const passwordOk = await verifyPassword(password, cuenta?.passwordHash || HASH_DESCARTE)
  if (!cuenta || !cuenta.passwordHash || !passwordOk) {
    return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 })
  }

  // ⚠️ Entrar NO es ver la cartera. Esta cookie solo acredita «tengo cuenta en la
  // casa de marcas» — `public.cuentas` es compartida—, y quién es de ESTA
  // correduría lo decide `exigirAccesoCartera()` en el layout y en cada ruta de
  // `/api/cartera/*`. Aquí no se filtra a propósito: un login que dijera «ese
  // email no es de la correduría» sería otro oráculo, y encima sobre una tabla
  // que no es nuestra.
  //
  // Sesión STATELESS y por tanto NO revocable: `prisma_seguros` solo tiene
  // SELECT sobre `public.cuentas` y no puede escribir `session_jtis`. Lo que la
  // acota es la caducidad de 12 h de `lib/auth.ts` — ver su cabecera.
  const { token } = await createSessionToken(cuenta.id, cuenta.email)
  const res = NextResponse.json({ ok: true, nombre: cuenta.nombre })
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS)
  return res
}
