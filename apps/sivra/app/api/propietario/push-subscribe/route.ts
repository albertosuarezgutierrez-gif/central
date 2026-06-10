import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"

export const dynamic = "force-dynamic"

// GET  /api/propietario/push-subscribe → { publicKey } para que el navegador se suscriba.
// POST /api/propietario/push-subscribe { endpoint, keys:{p256dh, auth} } → guarda la suscripción.
// Detrás del login admin (middleware); además exige sesión en el POST.

export async function GET() {
  return NextResponse.json({ ok: true, publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null })
}

export async function POST(req: NextRequest) {
  const session = await auth().catch(() => null)
  if (!session?.user) return NextResponse.json({ error: "no autorizado" }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }
  const endpoint = body?.endpoint as string | undefined
  const p256dh = body?.keys?.p256dh as string | undefined
  const auth_ = body?.keys?.auth as string | undefined
  if (!endpoint || !p256dh || !auth_) {
    return NextResponse.json({ error: "suscripción incompleta" }, { status: 400 })
  }

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO pricing_push_subs (endpoint, p256dh, auth, user_id)
    VALUES (${endpoint}, ${p256dh}, ${auth_}, 'alberto')
    ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`)

  return NextResponse.json({ ok: true })
}
