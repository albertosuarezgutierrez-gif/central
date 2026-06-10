import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { loginAdmin, createAdminToken, ADMIN_COOKIE, ADMIN_COOKIE_OPTS } from '@/lib/superadmin'

const Body = z.object({ email: z.string().email(), password: z.string().min(1) })

export async function POST(req: NextRequest) {
  const body = Body.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const sa = await loginAdmin(body.data.email, body.data.password)
  if (!sa) return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 })

  const token = await createAdminToken(sa.id, sa.email)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, token, ADMIN_COOKIE_OPTS)
  return res
}
